// Almanac honesty: recap halt lines, live embers, LOG buckets, star chips.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeNode, FakeText } from './helpers/fake-node.mjs';

globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => new FakeText(s),
  addEventListener() {},
  removeEventListener() {},
};
globalThis.requestAnimationFrame = (fn) => 0;
try { globalThis.navigator = {}; } catch { /* node ≥21 read-only */ }

import { createState, pushLog } from '../src/game/state.js';
const { createRng } = await import('../src/core/rng.js');
const runner = await import('../src/game/systems/action-runner.js');
const { unlockPerk } = await import('../src/game/systems/radiance.js');
const { ensureDailies, claimDaily } = await import('../src/game/systems/dailies.js');
const { renderSkillDetail } = await import('../src/ui/screens/skills.js');
const { renderAlmanacScreen } = await import('../src/ui/screens/meta.js');
const { showOfflineModal, openModal } = await import('../src/ui/modals.js');
const { computeOfflineProgress, formatRecapLine } = await import('../src/core/offline.js');
const { ACTIONS_BY_ID } = await import('../src/game/data/actions.js');
const { logCategoryStats, totalCompletion, trueCompletion, COMPLETION_HONESTY_RULE, liveMasteryTracks } = await import('../src/game/systems/completion.js');
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
    equipTitle(t) {
      state.cosmetics ??= { titles: [], frames: ['plain'], lanternFrame: 'plain', activeTitle: null };
      state.cosmetics.activeTitle = t;
    },
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
  assert.equal(rows.find((r) => r.id === 'items').done, 6, 'starter Times Found is known, not occupancy-zero');
  assert.equal(rows.find((r) => r.id === 'mastery').done, 0, 'fresh mastery is 0');
  assert.ok(totalCompletion(state).pct < 0.08);
  assert.match(COMPLETION_HONESTY_RULE, /True completion must not move when you open the Almanac/i);
});

test('tap Skills / Mastery / Items / Feats opens drill-down tiles and keeps %', () => {
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
    'log-mastery': { name: 'Tend the Flame', frac: '0/99' },
    'log-items': { name: 'Fogwort', frac: '×4' },
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

  const skills = renderAlmanacScreen(almanacCtx(state, 'log-skills'));
  assert.ok(skills.node.querySelector('[data-log-drill="skills"]'));
  assert.equal(skills.node.textContent.includes('Almanac'), false,
    'the Almanac tab is not a craft inside the Almanac');
  assert.match(skills.node.textContent ?? '', /Locked/);
  const skillNames = [...skills.node.querySelectorAll('.log-tile-name')].map((n) => n.textContent);
  assert.deepEqual(skillNames.slice(0, 3), ['Emberkeeping', 'Foraging', 'Combat']);

  const mastery = renderAlmanacScreen(almanacCtx(state, 'log-mastery'));
  assert.ok(mastery.node.querySelector('[data-log-drill="mastery"]'));
  assert.match(mastery.node.textContent ?? '', /Pale Moth/);
  assert.equal((mastery.node.textContent ?? '').includes('1/99'), false,
    'unpracticed rows must not show 1/99');
  const tracks = liveMasteryTracks(state);
  assert.ok(tracks.some((t) => t.id === 'tend-flame'));
  assert.ok(tracks.some((t) => t.id === 'pale-moth'));
  assert.equal(tracks.some((t) => t.id.includes('mine') || t.name === 'Mining'), false);

  const items = renderAlmanacScreen(almanacCtx(state, 'log-items'));
  assert.match(items.node.textContent ?? '', /Fogwort/);
  assert.match(items.node.textContent ?? '', /Found · /);
  const fogTile = items.node.querySelector('[data-log-row="fogwort"]');
  assert.equal(fogTile?.querySelector('.log-tile-times')?.textContent, '×4');
  assert.doesNotMatch(fogTile?.querySelector('.log-tile-frac')?.textContent ?? '', /^Found$/);
  const missing = items.node.querySelector('[data-log-drill="items-missing"]');
  assert.ok(missing);
  assert.equal((missing.textContent ?? '').includes('Tinderscrap'), false,
    'unfound rows are mysteries, not spoiler names');
  assert.match(missing.textContent ?? '', /\?/);
});

test('opening Almanac tab-open feats does not move the CAMP headline', () => {
  const state = createState({ nowMs: 0, rngSeed: 9 });
  cascadeAchievements(state);
  const camp = totalCompletion(state);
  const identity = trueCompletion(state);
  state.stats.almanacOpens = 1;
  state.stats.mapOpens = 1;
  state.stats.starsOpens = 1;
  state.stats.settingsOpens = 1;
  cascadeAchievements(state, {
    onUnlock() {},
  });
  const after = totalCompletion(state);
  assert.equal(after.label, camp.label);
  assert.equal(after.pct, camp.pct);
  assert.equal(trueCompletion(state).label, identity.label,
    'catalogue True Completion must not move when you open the Almanac');
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

test('offline recap modal names leftover Tinderscrap ×0 and ×1', () => {
  const state = createState({ nowMs: 0, rngSeed: 1 });
  state.bank.tinderscrap = 0;
  state.actions.active['tend-flame'] = { progressMs: 0 };
  const res = computeOfflineProgress({
    state,
    nowMs: 3 * 3_600_000,
    lastSavedAt: 0,
    actionsById: ACTIONS_BY_ID,
  });
  assert.equal(res.idleNotes[0].remainingQty, 0);
  assert.equal(formatRecapLine(res.recapLines[0], () => 'Tinderscrap'),
    'Tend the Flame ×0 — out of Tinderscrap ×0');
  const mount = new FakeNode('div');
  showOfflineModal(mount, { ...res, featPreview: { feats: [], lumen: 0, radiance: 0 } }, {
    onClaim() {},
  });
  assert.match(mount.textContent ?? '', /Tend the Flame ×0 — out of Tinderscrap ×0/);
  const recapClose = mount.querySelectorAll('button')
    .filter((b) => b.getAttribute('aria-label') === 'Close');
  assert.equal(recapClose.length, 0, 'persistent recap has no dismiss ×');
  assert.ok(mount.querySelectorAll('button').some((b) => b.textContent === 'Claim'));
  mount.querySelector('.modal-overlay')?.click();
  assert.equal(mount.querySelector('.modal-title')?.textContent, 'While You Were Away…',
    'overlay tap must not dismiss an unclaimed recap');

  const one = createState({ nowMs: 0, rngSeed: 1 });
  one.bank.tinderscrap = 1;
  one.actions.active['fan-the-coals'] = { progressMs: 0 };
  one.skills.emberkeeping.level = 10;
  const last = computeOfflineProgress({
    state: one,
    nowMs: 3_600_000,
    lastSavedAt: 0,
    actionsById: ACTIONS_BY_ID,
  });
  assert.equal(last.idleNotes[0].remainingQty, 1);
  assert.equal(formatRecapLine(last.recapLines[0], () => 'Tinderscrap'),
    'Fan the Coals ×0 — out of Tinderscrap ×1');
});

test('recap modal freezes the live runner until Claim', () => {
  const src = readFileSync(new URL('../src/ui/app.js', import.meta.url), 'utf8');
  assert.match(src, /let recapOpen = false/);
  assert.match(src, /recapOpen = true;\s*freezeRunner\(\)/);
  assert.match(src, /if \(runnerFrozen\(\)\) return;/);
  assert.match(src, /if \(!runnerFrozen\(\)\) loop\.start\(\)/);
  assert.match(src, /if \(stamp && !recapOpen\)/,
    'persist must not restamp savedAt while recap is unclaimed');
  assert.match(src, /shouldOfferOfflineRecap\(res\)/);
  assert.match(src, /holdRunnerAfterClaim\(\)/);
  assert.doesNotMatch(src, /extraLive/,
    'recap-open wall time must not merge into Time by the Flame');
  assert.doesNotMatch(src, /t-off-1/,
    'idle recap must not be swallowed for the claimed-once feat');
});

test('persistent modal has no Close; dismissible modal keeps it', () => {
  const locked = new FakeNode('div');
  openModal(locked, { title: 'Stay', body: 'must act', persistent: true });
  assert.equal(
    locked.querySelectorAll('button').filter((b) => b.getAttribute('aria-label') === 'Close').length,
    0,
  );

  const free = new FakeNode('div');
  openModal(free, { title: 'Go', body: 'may leave' });
  assert.equal(
    free.querySelectorAll('button').filter((b) => b.getAttribute('aria-label') === 'Close').length,
    1,
  );
});

test('journal halt uses the same leftover chip as recap', () => {
  const empty = createState({ nowMs: 0, rngSeed: 1 });
  empty.bank.tinderscrap = 0;
  const none = runner.completeCycle(empty, ACTIONS_BY_ID['tend-flame'], createRng(1));
  assert.equal(none.halted, true);
  assert.equal(none.reason, 'out of Tinderscrap ×0');
  pushLog(empty, `Tend the Flame halted: ${none.reason}.`, 0);
  const scr = renderAlmanacScreen({
    state: empty,
    almanacView: () => 'overview',
    openAlmanac() {},
    toast() {},
  });
  assert.match(scr.node.textContent ?? '', /out of Tinderscrap ×0/);
  assert.doesNotMatch(scr.node.textContent ?? '', /halted: out of Tinderscrap\./);

  const one = createState({ nowMs: 0, rngSeed: 1 });
  one.bank.tinderscrap = 1;
  one.skills.emberkeeping.level = 10;
  const last = runner.completeCycle(one, ACTIONS_BY_ID['fan-the-coals'], createRng(1));
  assert.equal(last.reason, 'out of Tinderscrap ×1');
});

const EARNED_TITLES = [
  'Last Ember', 'Unscathed', 'Long-Sitter', 'Star-Pinned', 'Vigilant',
  'Forgot the Fuel', 'Returned', 'Pockets Out', 'Fog-Walker',
];

function fireChange(node) {
  for (const fn of node._listeners.change ?? []) fn({ target: node });
}

test('Stats titles is one native dropdown of earned names, not a button stack', () => {
  const state = createState({ nowMs: 0, rngSeed: 1 });
  state.cosmetics.titles = [...EARNED_TITLES];
  state.cosmetics.activeTitle = 'Last Ember';
  const equipped = [];
  const ctx = almanacCtx(state, 'stats');
  ctx.equipTitle = (t) => {
    equipped.push(t);
    state.cosmetics.activeTitle = t;
  };

  const scr = renderAlmanacScreen(ctx);
  const pickers = scr.node.querySelectorAll('select[aria-label=Titles]');
  assert.equal(pickers.length, 1, 'exactly one Titles picker');
  const wrap = scr.node.querySelector('.title-pick');
  assert.ok(wrap, 'titles section present');
  assert.match(wrap.querySelector('.section-title')?.textContent ?? '', /^Titles$/);
  assert.equal(wrap.querySelectorAll('button').length, 0, 'no stacked title buttons');
  assert.equal(wrap.querySelectorAll('.btn').length, 0);

  const picker = pickers[0];
  const opts = picker.querySelectorAll('option').map((o) => o.getAttribute('value'));
  assert.deepEqual(opts, EARNED_TITLES);
  assert.ok(!opts.includes('Cataloguer'), 'unearned titles stay out');
  assert.equal(picker.value, 'Last Ember');
  assert.match(scr.node.querySelector('.screen-sub')?.textContent ?? '', /As Last Ember/);

  picker.value = 'Unscathed';
  fireChange(picker);
  assert.deepEqual(equipped, ['Unscathed']);
  assert.equal(state.cosmetics.activeTitle, 'Unscathed');
});

test('Stats with no titles shows the earn-feats footnote and no picker', () => {
  const state = createState({ nowMs: 0, rngSeed: 1 });
  assert.deepEqual(state.cosmetics.titles, []);
  const scr = renderAlmanacScreen(almanacCtx(state, 'stats'));
  assert.equal(scr.node.querySelectorAll('select').length, 0, 'no empty select');
  assert.equal(scr.node.querySelector('.title-pick'), null);
  assert.match(scr.node.textContent ?? '', /Earn feats to wear a title/);
  assert.equal(scr.node.querySelector('.screen-sub')?.textContent, 'Honest counts. Nothing hidden.');
});

test('title select chrome is a 44px lantern-gold control', () => {
  const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.title-select\s*\{[^}]*min-height:\s*44px/s);
  assert.doesNotMatch(css, /\.title-pick\s+button/);
});

