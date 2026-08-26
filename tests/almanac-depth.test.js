// Almanac honesty: recap halt lines, live embers, LOG buckets, star chips.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeNode, FakeText } from './helpers/fake-node.mjs';

globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => new FakeText(s),
};
globalThis.requestAnimationFrame = (fn) => 0;
try { globalThis.navigator = {}; } catch { /* node ≥21 read-only */ }

const { createState } = await import('../src/game/state.js');
const { createRng } = await import('../src/core/rng.js');
const runner = await import('../src/game/systems/action-runner.js');
const { unlockPerk } = await import('../src/game/systems/radiance.js');
const { ensureDailies, claimDaily } = await import('../src/game/systems/dailies.js');
const { renderSkillDetail } = await import('../src/ui/screens/skills.js');
const { renderAlmanacScreen } = await import('../src/ui/screens/meta.js');
const { showOfflineModal } = await import('../src/ui/modals.js');
const { computeOfflineProgress, formatRecapLine } = await import('../src/core/offline.js');
const { ACTIONS_BY_ID } = await import('../src/game/data/actions.js');
const { logCategoryStats, totalCompletion } = await import('../src/game/systems/completion.js');
const { cascadeAchievements } = await import('../src/game/systems/achievements.js');
const { shouldRebuildScreen } = await import('../src/ui/live-paint.js');
const { readFileSync } = await import('node:fs');

function skillCtx(state) {
  return {
    state,
    toast() {},
    openSkill() {},
    openSkillsList() {},
    actionStatus: (id) => runner.actionStatus(state, id),
  };
}

function almanacCtx(state, view = 'dailies') {
  const ctx = {
    state,
    toast() {},
    almanacView: () => view,
    openAlmanac(next) { view = next; },
    ensureDailies: () => ensureDailies(state, Date.UTC(2026, 7, 25)),
    rerollDailies() {},
    claimDaily: (id) => claimDaily(state, id),
  };
  return ctx;
}

test('running Tend card shows remaining time and / cycle together', () => {
  const state = createState({ nowMs: 0, rngSeed: 3 });
  runner.startAction(state, 'tend-flame');
  runner.tickActions(state, 1900, createRng(3));
  const scr = renderSkillDetail(skillCtx(state), 'emberkeeping');
  const time = scr.node.querySelector('.bar-time');
  assert.match(time.textContent ?? '', /2\.1s left/);
  assert.match(time.textContent ?? '', /4\.0s \/ cycle/);
});

test('buying Drawn Wick rewrites the duration chip without remounting', () => {
  const state = createState({ nowMs: 0, rngSeed: 7 });
  state.radiance = 10;
  runner.startAction(state, 'tend-flame');
  const scr = renderSkillDetail(skillCtx(state), 'emberkeeping');
  assert.match(scr.node.querySelector('.chip-time').textContent ?? '', /4\.0s \/ cycle/);
  assert.equal(unlockPerk(state, 'kindling').ok, true);
  assert.equal(unlockPerk(state, 'wick-1').ok, true);
  scr.update();
  assert.match(scr.node.querySelector('.chip-time').textContent ?? '', /3\.9s \/ cycle · Wick/);
  assert.match(scr.node.querySelector('.bar-time').textContent ?? '', /3\.9s \/ cycle · Wick/);
});

test('Embers re-render progress on update; claimed button stays disabled', () => {
  const state = createState({ nowMs: 0, rngSeed: 4 });
  const noon = Date.UTC(2026, 7, 25, 12, 0, 0);
  ensureDailies(state, noon);
  state.dailies.tasks = [
    { id: 'sit-10', need: 10, reward: 2, claimed: false, baseline: 0 },
    { id: 'tend-8', need: 8, reward: 2, claimed: true, baseline: 0 },
    { id: 'herbs-10', need: 10, reward: 2, claimed: false, baseline: 0 },
  ];
  const scr = renderAlmanacScreen(almanacCtx(state, 'dailies'));
  assert.match(scr.node.textContent ?? '', /0 \/ 10/);
  const claimedBtn = scr.node.querySelectorAll('.daily-claim')
    .find((b) => (b.textContent ?? '') === 'Claimed');
  assert.ok(claimedBtn, 'claimed ember still on the board');
  assert.equal(claimedBtn.getAttribute('disabled'), 'true');
  assert.equal(claimedBtn.getAttribute('aria-disabled'), 'true');

  const claims = scr.node.querySelectorAll('.daily-claim');
  const reroll = scr.node.querySelector('.daily-reroll');
  const sitProg = scr.node.querySelectorAll('.daily-progress')[0];
  state.stats.playtimeMs = 5 * 60_000;
  for (let i = 0; i < 12; i++) scr.update();
  assert.equal(sitProg.textContent, '5 / 10');
  assert.equal(scr.node.querySelectorAll('.daily-claim')[0], claims[0],
    'Claim node identity survives ticks');
  assert.equal(scr.node.querySelectorAll('.daily-claim')[1], claims[1]);
  assert.equal(scr.node.querySelector('.daily-reroll'), reroll,
    'Reroll node identity survives ticks');
  assert.equal(claims[1].getAttribute('disabled'), 'true');
  assert.equal(claims[1].textContent, 'Claimed');
});

test('Embers remount Claim buttons only when the task id set changes', () => {
  const state = createState({ nowMs: 0, rngSeed: 4 });
  const noon = Date.UTC(2026, 7, 25, 12, 0, 0);
  ensureDailies(state, noon);
  state.dailies.tasks = [
    { id: 'sit-10', need: 10, reward: 2, claimed: false, baseline: 0 },
    { id: 'tend-8', need: 8, reward: 2, claimed: true, baseline: 0 },
    { id: 'herbs-10', need: 10, reward: 2, claimed: false, baseline: 0 },
  ];
  const scr = renderAlmanacScreen(almanacCtx(state, 'dailies'));
  const before = scr.node.querySelectorAll('.daily-claim');
  const reroll = scr.node.querySelector('.daily-reroll');
  state.dailies.tasks = [
    { id: 'sit-10', need: 10, reward: 2, claimed: false, baseline: 0 },
    { id: 'any-15', need: 15, reward: 2, claimed: false, baseline: 0 },
    { id: 'lumen-25', need: 25, reward: 2, claimed: false, baseline: 0 },
  ];
  scr.update();
  const after = scr.node.querySelectorAll('.daily-claim');
  assert.notEqual(after[1], before[1], 'new task id replaces that card');
  assert.equal(after[0], before[0], 'unchanged id keeps its Claim node');
  assert.equal(scr.node.querySelector('.daily-reroll'), reroll);
});

test('LOG screen lists Skills / Mastery / Items / Feats rows', () => {
  const state = createState({ nowMs: 0, rngSeed: 9 });
  const ctx = almanacCtx(state, 'overview');
  const scr = renderAlmanacScreen(ctx);
  const names = scr.node.querySelectorAll('.cat-name').map((n) => n.textContent);
  assert.deepEqual(names, ['Skills', 'Mastery', 'Items', 'Feats']);
  const rows = logCategoryStats(state);
  assert.equal(rows.length, 4);
  assert.equal(rows.find((r) => r.id === 'items').done, 0, 'starter pack is not 4% of the book');
  assert.ok(totalCompletion(state).pct < 0.08);
});

test('tap Skills / Mastery / Items / Feats opens drill-down rows and keeps %', () => {
  const state = createState({ nowMs: 0, rngSeed: 9 });
  state.discovered = { fogwort: true };
  const ctx = almanacCtx(state, 'overview');
  const overview = renderAlmanacScreen(ctx);
  const buckets = overview.node.querySelectorAll('.cat-row');
  assert.equal(buckets.length, 4);
  buckets[0].click();
  assert.equal(ctx.almanacView(), 'log-skills');

  const drills = {
    'log-skills': { name: 'Emberkeeping', frac: '1/99' },
    'log-mastery': { name: 'Tend the Flame', frac: '1/99' },
    'log-items': { name: 'Fogwort', frac: 'Found' },
    'log-feats': { name: 'First Kindling', frac: null },
  };
  for (const [view, expect] of Object.entries(drills)) {
    const host = almanacCtx(state, view);
    const scr = renderAlmanacScreen(host);
    assert.match(scr.node.textContent ?? '', /%/);
    assert.match(scr.node.textContent ?? '', new RegExp(expect.name));
    if (expect.frac) assert.match(scr.node.textContent ?? '', new RegExp(expect.frac));
    assert.ok(scr.node.querySelector('.log-back'), `${view} keeps a way back`);
  }
  const items = renderAlmanacScreen(almanacCtx(state, 'log-items'));
  assert.match(items.node.textContent ?? '', /Tinderscrap/);
  assert.match(items.node.textContent ?? '', /Missing/);
  assert.match(items.node.textContent ?? '', /Found/);
});

test('Claim on an open Embers tab keeps the same article and button node', () => {
  const src = readFileSync(new URL('../src/ui/app.js', import.meta.url), 'utf8');
  assert.match(src, /shouldRebuildScreen/, 'app.js must use the in-place paint gate');

  const state = createState({ nowMs: 0, rngSeed: 4 });
  const noon = Date.UTC(2026, 7, 25, 12, 0, 0);
  ensureDailies(state, noon);
  state.dailies.tasks = [
    { id: 'sit-10', need: 10, reward: 2, claimed: false, baseline: 0 },
    { id: 'ek-3', need: 3, reward: 3, claimed: false, baseline: 0 },
    { id: 'herbs-10', need: 10, reward: 2, claimed: false, baseline: 0 },
  ];
  state.stats.playtimeMs = 12 * 60_000;
  state.skills.emberkeeping.level = 3;

  const ui = { tab: 'journal', almanac: 'dailies' };
  let scr;
  const ctx = {
    state,
    toast() {},
    almanacView: () => ui.almanac,
    openAlmanac(v) { ui.almanac = v; remount(); },
    ensureDailies: () => ensureDailies(state, noon),
    rerollDailies() {},
    claimDaily(id) {
      const res = claimDaily(state, id);
      const newly = cascadeAchievements(state);
      if (shouldRebuildScreen(ui, { redraw: true, featUnlocks: newly.length })) remount();
      else scr.update();
      return res;
    },
  };
  function remount() { scr = renderAlmanacScreen(ctx); }
  remount();

  const card = scr.node.querySelector('article[data-ember-id="sit-10"]');
  const btn = card.querySelector('.daily-claim');
  assert.ok(card && btn);
  card.dataset.s4dMarker = 'keep';
  btn.dataset.s4dMarker = 'keep';
  assert.equal(btn.textContent, 'Claim sparks');
  btn.click();

  const afterCard = scr.node.querySelector('article[data-ember-id="sit-10"]');
  const afterBtn = afterCard.querySelector('.daily-claim');
  assert.equal(afterCard, card, 'parent remount is a fail');
  assert.equal(afterBtn, btn);
  assert.equal(card.dataset.s4dMarker, 'keep');
  assert.equal(afterBtn.dataset.s4dMarker, 'keep');
  assert.equal(afterBtn.textContent, 'Claimed');
  assert.equal(afterBtn.getAttribute('disabled'), 'true');
});

test('offline recap modal names a ×0 Tinderscrap halt', () => {
  const state = createState({ nowMs: 0, rngSeed: 1 });
  state.bank.tinderscrap = 0;
  state.actions.active['tend-flame'] = { progressMs: 0 };
  const res = computeOfflineProgress({
    state,
    nowMs: 3 * 3_600_000,
    lastSavedAt: 0,
    actionsById: ACTIONS_BY_ID,
  });
  assert.equal(formatRecapLine(res.recapLines[0], () => 'Tinderscrap'),
    'Tend the Flame ×0 — out of Tinderscrap');
  const mount = new FakeNode('div');
  showOfflineModal(mount, { ...res, featPreview: { feats: [], lumen: 0, radiance: 0 } }, {
    onClaim() {},
  });
  assert.match(mount.textContent ?? '', /Tend the Flame ×0 — out of Tinderscrap/);
});
