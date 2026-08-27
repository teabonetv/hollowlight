// Headless UI render smoke: a minimal DOM shim sufficient for our render()
// functions, so every screen's code path executes under node:test. This
// catches broken selectors, undefined property access, and bad data wiring —
// everything short of pixel-perfect layout.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeNode, FakeText } from './helpers/fake-node.mjs';

// ── mini DOM ───────────────────────────────────────────────────────
// (FakeNode/FakeText live in tests/helpers/fake-node.mjs)

globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => new FakeText(s),
};
globalThis.requestAnimationFrame = (fn) => 0;
try { globalThis.navigator = {}; } catch { /* node ≥21 exposes a read-only navigator */ }

// ── imports AFTER the shim exists ──────────────────────────────────
const { createState } = await import('../src/game/state.js');
const runner = await import('../src/game/systems/action-runner.js');
const { renderSkillsScreen, renderSkillDetail } = await import('../src/ui/screens/skills.js');
const tabs = await import('../src/ui/screens/tabs.js');

function makeCtx(state) {
  return {
    state,
    toast() {},
    openSkill() {},
    openSkillsList() {},
    actionStatus: (id) => runner.actionStatus(state, id),
  };
}

test('skills list renders all eight registry rows', () => {
  const state = createState({ nowMs: 0, rngSeed: 2 });
  const scr = renderSkillsScreen(makeCtx(state));
  const rows = scr.node.querySelectorAll('.skill-row');
  assert.equal(rows.length, 8, 'one row per charter skill');
  assert.equal(rows.filter((r) => r.matchesSelector('.skill-row-future')).length, 5,
    'five skills marked future once combat is live');
});

test('playable skill detail renders action cards with live controls', () => {
  const state = createState({ nowMs: 0, rngSeed: 3 });
  runner.startAction(state, 'tend-flame');
  const ctx = makeCtx(state);
  const scr = renderSkillDetail(ctx, 'emberkeeping');

  const cards = scr.node.querySelectorAll('.action-card');
  assert.equal(cards.length, 2, 'two emberkeeping actions');

  // start/stop button reflects the running action
  const stopBtn = cards[0].querySelectorAll('button').find((b) =>
    (b.textContent ?? '').startsWith('Stop'));
  assert.ok(stopBtn, 'running action shows Stop');

  // progress fill exists and update() runs without throwing
  scr.update();
  const fill = cards[0].querySelector('.bar-fill');
  assert.ok(fill, 'progress bar fill present');
  const time = cards[0].querySelector('.bar-time');
  assert.match(time.textContent ?? '', /left/, 'running action ticks remaining time');
  assert.match(time.textContent ?? '', /\/ cycle/, 'and still names cycle length');
});

test('locked action card communicates its level gate', () => {
  const state = createState({ nowMs: 0, rngSeed: 4 });
  const scr = renderSkillDetail(makeCtx(state), 'emberkeeping');
  const cards = scr.node.querySelectorAll('.action-card');
  const fanCard = cards[1];
  const lockBtn = fanCard.querySelectorAll('button').find((b) => /Locked/.test(b.textContent ?? ''));
  assert.ok(lockBtn, 'Fan the Coals shows Locked · Level 10 at skill level 1');
});

test('foraging detail includes both gathering actions and mastery badge', () => {
  const state = createState({ nowMs: 0, rngSeed: 5 });
  const scr = renderSkillDetail(makeCtx(state), 'foraging');
  assert.equal(scr.node.querySelectorAll('.action-card').length, 2);
  assert.equal(scr.node.querySelectorAll('.mastery-badge').length, 2);
});

test('skill detail craft subnav switches Emberkeeping / Foraging / Combat', () => {
  const state = createState({ nowMs: 0, rngSeed: 11 });
  const opened = [];
  const ctx = { ...makeCtx(state), openSkill(id) { opened.push(id); } };
  const scr = renderSkillDetail(ctx, 'emberkeeping');
  const nav = scr.node.querySelectorAll('.craft-tab');
  assert.ok(nav.length >= 3, 'live crafts are tabs');
  const names = nav.map((t) => t.textContent ?? '');
  assert.ok(names.includes('Emberkeeping'));
  assert.ok(names.includes('Foraging'));
  assert.ok(names.includes('Combat'));
  const foraging = nav.find((t) => t.getAttribute('data-skill') === 'foraging');
  foraging.click();
  assert.deepEqual(opened, ['foraging']);
  const combat = nav.find((t) => t.getAttribute('data-skill') === 'combat');
  combat.click();
  assert.deepEqual(opened, ['foraging', 'combat']);
});

test('future skill detail renders a designed coming-soon empty state', () => {
  const state = createState({ nowMs: 0, rngSeed: 6 });
  const scr = renderSkillDetail(makeCtx(state), 'mining');
  const empty = scr.node.querySelector('.empty-state');
  assert.ok(empty, 'coming-soon panel present');
  assert.match(empty.textContent ?? '', /Wave 1/i);
});

test('camp renders stats and hearth, not a five-button sitemap', () => {
  const state = createState({ nowMs: 0, rngSeed: 7 });
  state.flame = 42;
  const scr = tabs.renderCampScreen(makeCtx(state));
  const cells = scr.node.querySelectorAll('.stat-cell');
  assert.equal(cells.length, 6);
  assert.match(scr.node.textContent ?? '', /42/);
  assert.match(scr.node.textContent ?? '', /Waiting for you/);
  assert.match(scr.node.textContent ?? '', /Keeper's Camp/);
  assert.equal(scr.node.querySelector('.camp-actions'), null);
  const labels = scr.node.querySelectorAll('button').map((b) => b.textContent ?? '');
  for (const name of [
    'Tend the Flame',
    'Walk the fog-line',
    'The General Store',
    'Face the pale-things',
    'Open the constellation',
  ]) {
    assert.equal(labels.includes(name), false, `Camp must not host “${name}”`);
  }
});

test('bank defaults to Owned — only carried stacks fill the working grid', () => {
  const state = createState({ nowMs: 0, rngSeed: 8 }); // starter gathering + combat provisions
  const scr = tabs.renderBankScreen(makeCtx(state));
  const owned = scr.node.querySelectorAll('.bank-tile.owned');
  assert.equal(owned.length, 6, 'starter stacks lit (gathering + combat provisions)');
  assert.equal(scr.node.querySelectorAll('.bank-tile').length, 6, 'unowned ghosts stay out of the working pack');
  assert.equal(scr.node.querySelectorAll('.bank-tile.unowned').length, 0);
  const active = scr.node.querySelectorAll('.bank-tab').find((t) => /\bactive\b/.test(t.className));
  assert.match(active?.textContent ?? '', /Owned/);
});

test('map lists twelve beacons with only the first kindled', () => {
  const state = createState({ nowMs: 0, rngSeed: 9 });
  const scr = tabs.renderMapScreen(makeCtx(state));
  const nodes = scr.node.querySelectorAll('.map-node');
  assert.equal(nodes.length, 12);
  assert.equal(nodes.filter((n) => n.matchesSelector('.lit')).length, 1);
});

test('journal renders entries newest-first and an empty state when blank', () => {
  const state = createState({ nowMs: 0, rngSeed: 10 });
  const emptyScr = tabs.renderJournalScreen(makeCtx(state));
  assert.ok(emptyScr.node.querySelector('.empty-state'), 'designed empty journal');

  state.log.push(
    { t: 100, text: 'first entry' },
    { t: 200, text: 'second entry' },
  );
  const scr = tabs.renderJournalScreen(makeCtx(state));
  const entries = scr.node.querySelectorAll('.journal-entry');
  assert.equal(entries.length, 2);
  assert.match(entries[0].textContent ?? '', /second entry/, 'newest first');
});

test('toaster queues, caps at three live toasts, fades the rest', async () => {
  const { createToaster } = await import('../src/ui/toast.js');
  const host = new FakeNode('div');
  const toaster = createToaster(host);
  toaster.push('a'); toaster.push('b'); toaster.push('c'); toaster.push('d');
  const all = host.querySelectorAll('.toast');
  const live = all.filter((t) => !t.matchesSelector('.toast-out'));
  const fading = all.filter((t) => t.matchesSelector('.toast-out'));
  assert.equal(live.length, 3, 'three live toasts');
  assert.equal(fading.length, 1, 'oldest is fading out');
});
