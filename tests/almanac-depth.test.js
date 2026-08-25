// Almanac honesty: recap halt lines, live embers, LOG buckets, star chips.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeNode } from './helpers/fake-node.mjs';

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
  return {
    state,
    toast() {},
    almanacView: () => view,
    openAlmanac() {},
    ensureDailies: () => ensureDailies(state, Date.UTC(2026, 7, 25)),
    rerollDailies() {},
    claimDaily: (id) => claimDaily(state, id),
  };
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
  assert.match(scr.node.querySelector('.chip-time').textContent ?? '', /3\.9s \/ cycle/);
  assert.match(scr.node.querySelector('.bar-time').textContent ?? '', /3\.9s \/ cycle/);
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
  const claimedBtn = scr.node.querySelectorAll('button')
    .find((b) => (b.textContent ?? '') === 'Claimed');
  assert.ok(claimedBtn, 'claimed ember still on the board');
  assert.equal(claimedBtn.getAttribute('disabled'), 'true');
  assert.equal(claimedBtn.getAttribute('aria-disabled'), 'true');

  state.stats.playtimeMs = 5 * 60_000;
  scr.update();
  assert.match(scr.node.textContent ?? '', /5 \/ 10/);
  const stillClaimed = scr.node.querySelectorAll('button')
    .find((b) => (b.textContent ?? '') === 'Claimed');
  assert.ok(stillClaimed);
  assert.equal(stillClaimed.getAttribute('disabled'), 'true');
});

test('LOG screen lists Skills / Mastery / Items / Feats rows', () => {
  const state = createState({ nowMs: 0, rngSeed: 9 });
  const ctx = almanacCtx(state, 'overview');
  const scr = renderAlmanacScreen(ctx);
  const names = scr.node.querySelectorAll('.cat-name').map((n) => n.textContent);
  assert.deepEqual(names, ['Skills', 'Mastery', 'Items', 'Feats']);
  const rows = logCategoryStats(state);
  assert.equal(rows.length, 4);
  assert.ok(totalCompletion(state).pct < 0.08);
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
