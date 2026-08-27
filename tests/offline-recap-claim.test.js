// S4h: recap preview == Claim.
// Radiance from offline XP is a recap line; after Claim, recap arithmetic
// matches HUD. Idle rewind with zero cycles does not stuff playtime or
// light "The Work Went On". Every recap prints the 12h cap.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeNode, FakeText } from './helpers/fake-node.mjs';

globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => new FakeText(s),
  addEventListener() {},
  removeEventListener() {},
};
globalThis.requestAnimationFrame = () => 0;
try { globalThis.navigator = {}; } catch { /* node ≥21 read-only */ }

import { createState } from '../src/game/state.js';
import { ACTIONS_BY_ID } from '../src/game/data/actions.js';
import { SKILL_BY_ID } from '../src/game/data/skills.js';
import { formatNumber } from '../src/core/format.js';
import { isUnlocked } from '../src/game/systems/achievements.js';
import { cascadeAchievements } from '../src/game/systems/achievements.js';
import { hydrateState } from '../src/game/hydrate.js';
import { createRng } from '../src/core/rng.js';
import { SAVE_VERSION } from '../src/core/save.js';
import { actionStatus, tickActions } from '../src/game/systems/action-runner.js';
import {
  computeOfflineProgress, previewOfflineClaim, recapWalletDelta,
  formatLevelUpLine, formatMasteryUpLine, formatOfflineCapNote, formatIdleRecapLine,
  formatIdleRecapStillness, IDLE_RECAP_STILLNESS, formatRecapLine,
  formatOfflineHourRate, shouldOfferOfflineRecap, OFFLINE_CAP_HOURS, OFFLINE_MIN_AWAY_MS,
  formatOfflineAwayLine, IDLE_RECAP_FLAME_UNCHANGED, haltedEarly, formatHaltCoda,
  creditsOfflineLabour,
} from '../src/core/offline.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { showOfflineModal, recapFeatExpandVsClaim, layoutOfflineFeatList, RECAP_360 } =
  await import('../src/ui/modals.js');
const { renderSkillsScreen, renderSkillDetail } = await import('../src/ui/screens/skills.js');
const here = dirname(fileURLToPath(import.meta.url));

const H = 3_600_000;

function gatheringState({ radiance = 12 } = {}) {
  const s = createState({ nowMs: 0, rngSeed: 1 });
  s.radiance = radiance;
  s.radianceEarned = radiance;
  s.stats.radianceEarned = radiance;
  s.actions.active['gather-herbs'] = { progressMs: 0 };
  return s;
}

/** Claim path: adopt nextState, credit claims only for full-span labour, cascade feats. */
function applyClaim(res) {
  const game = hydrateState(structuredClone(res.nextState));
  if (creditsOfflineLabour(res)) {
    game.stats.offlineClaims = (game.stats.offlineClaims ?? 0) + 1;
  }
  cascadeAchievements(game);
  return game;
}

function uiCtx(state) {
  return {
    state,
    toast() {},
    openSkill() {},
    openSkillsList() {},
    actionStatus: (id) => actionStatus(state, id),
    ensureDailies() {},
  };
}

test('recap preview Radiance equals post-Claim HUD Radiance for an offline gather', () => {
  const startRadiance = 12;
  const s = gatheringState({ radiance: startRadiance });
  const res = computeOfflineProgress({
    state: s,
    nowMs: 3 * H,
    lastSavedAt: 0,
    actionsById: ACTIONS_BY_ID,
  });
  assert.ok(res.hasGains);
  assert.ok(res.gains.radiance > 100, 'XP conversion is not a small feat grant');

  const featPreview = previewOfflineClaim(res);
  const wallet = recapWalletDelta(res, featPreview);
  const claimed = applyClaim(res);

  assert.equal(
    wallet.radiance,
    claimed.radiance - startRadiance,
    'recap Radiance (XP + feats) must equal HUD delta',
  );
  assert.equal(featPreview.state.radiance, claimed.radiance);
  assert.ok(
    res.gains.radiance !== featPreview.radiance
      || featPreview.radiance === 0,
    'XP Radiance must not be reported only as the feats line',
  );
  assert.ok(
    res.gains.radiance > (featPreview.radiance ?? 0),
    'do not hide XP Radiance behind Feats on Claim',
  );

  const mount = new FakeNode('div');
  showOfflineModal(mount, { ...res, featPreview }, { onClaim() {} });
  const text = mount.textContent ?? '';
  assert.ok(text.includes('Radiance'), 'dedicated Radiance line');
  assert.ok(text.includes(`+${formatNumber(res.gains.radiance)}`),
    `XP Radiance +${formatNumber(res.gains.radiance)} on the recap`);
  if (featPreview.radiance > 0) {
    assert.ok(text.includes('Feats on Claim'));
    assert.ok(text.includes(`+${formatNumber(featPreview.radiance)} Radiance`));
  }
  const foraging = res.levelUps.find((l) => l.skillId === 'foraging');
  assert.ok(foraging, '3h gather must level Foraging');
  const foragingLine = formatLevelUpLine(foraging, (id) => SKILL_BY_ID[id]?.name ?? id);
  assert.ok(res.masteryUps.length > 0);
  const masteryLine = formatMasteryUpLine(res.masteryUps[0]);
  assert.ok(text.includes(foragingLine), `recap names ${foragingLine}`);
  assert.ok(text.includes(masteryLine), `recap names ${masteryLine}`);
  assert.ok(text.includes(formatOfflineCapNote()), 'uncapped recap still prints Cap 12h');
  assert.equal(shouldOfferOfflineRecap(res), true);
  const fogwort = res.gains.items.find((i) => i.id === 'fogwort');
  assert.ok(fogwort, 'Fogwort EV line');
  assert.equal(res.workedMs, res.creditedMs, 'full-window gather bills the credited span');
  const fogRate = formatOfflineHourRate(fogwort.qty, res.workedMs);
  assert.match(text, new RegExp(fogRate.replace('/', '\\/')));
  assert.match(text, /\/h/);
});

test('Tend fuel-halt recap /h uses run-until-halt, not the 3h tail', () => {
  const play = (2 * H) - 90_000;
  const s = createState({ nowMs: 0, rngSeed: 11 });
  s.stats.playtimeMs = play;
  s.bank.tinderscrap = 20;
  s.actions.active['tend-flame'] = { progressMs: 0 };
  const res = computeOfflineProgress({
    state: s, nowMs: 3 * H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  const runMs = 20 * ACTIONS_BY_ID['tend-flame'].durationMs;
  assert.equal(res.gains.actions[0].completions, 20);
  assert.equal(res.workedMs, runMs);
  assert.equal(res.nextState.stats.playtimeMs, play + runMs);

  const honest = formatOfflineHourRate(20, runMs);
  const stuffed = formatOfflineHourRate(20, res.creditedMs);
  assert.equal(honest, '900/h');
  assert.equal(stuffed, '7/h');

  const names = (id) => id === 'tinderscrap' ? 'Tinderscrap' : id;
  const recap = formatRecapLine(res.recapLines[0], names);
  assert.match(recap, /Tend the Flame ×20/);
  assert.match(recap, /900\/h for 1m 20s/);
  assert.doesNotMatch(recap, /7\/h/);
  assert.match(recap, /out of Tinderscrap/);

  const featPreview = previewOfflineClaim(res);
  assert.equal(isUnlocked(featPreview.state, 't-2h'), false,
    'The Long Sit must not light from the stuffed halt tail');
  assert.ok(!(featPreview.feats ?? []).some((a) => a.id === 't-2h'));
  const claimed = applyClaim(res);
  assert.equal(isUnlocked(claimed, 't-2h'), false);
  assert.equal(claimed.stats.playtimeMs, play + runMs);

  const mount = new FakeNode('div');
  showOfflineModal(mount, { ...res, featPreview }, { onClaim() {} });
  const text = mount.textContent ?? '';
  assert.match(text, /900\/h for 1m 20s/);
  assert.doesNotMatch(text, /7\/h/);
  assert.match(text, /Tend the Flame ×20/);
});

test('S4m: Tend ×20 then 3h recap names the halt clock; idle has no work copy; ample fuel bills the span', () => {
  const play = (2 * H) - 90_000;
  const halt = createState({ nowMs: 0, rngSeed: 21 });
  halt.stats.playtimeMs = play;
  halt.bank.tinderscrap = 20;
  halt.actions.active['tend-flame'] = { progressMs: 0 };
  const haltRes = computeOfflineProgress({
    state: halt, nowMs: 3 * H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  assert.equal(haltRes.gains.actions[0].completions, 20);
  assert.equal(haltRes.workedMs, 80_000);
  assert.equal(haltRes.nextState.stats.playtimeMs, play + 80_000,
    'playtime bills run-until-halt, not the 3h tail');
  assert.equal(
    formatOfflineAwayLine(haltRes),
    '3h 00m away · worked 1m 20s. Cap 12h.',
  );
  const haltPreview = previewOfflineClaim(haltRes);
  assert.equal(isUnlocked(haltPreview.state, 't-2h'), false,
    'The Long Sit stays dark');
  const haltClaimed = applyClaim(haltRes);
  assert.equal(isUnlocked(haltClaimed, 't-2h'), false);
  assert.equal(haltClaimed.stats.playtimeMs, play + 80_000);

  const haltMount = new FakeNode('div');
  showOfflineModal(haltMount, { ...haltRes, featPreview: haltPreview }, { onClaim() {} });
  const haltAway = haltMount.querySelector('.offline-away')?.textContent ?? '';
  assert.match(haltAway, /3h 00m away · worked 1m 20s/);
  assert.match(haltAway, /Cap 12h/);
  assert.doesNotMatch(haltAway, /hours of work/);
  assert.match(haltMount.textContent ?? '', /Then the flame sat still for 2h 58m/);
  assert.doesNotMatch(haltMount.textContent ?? '', /The Work Went On/);

  const idlePlay = 90_000;
  const idle = createState({ nowMs: 0, rngSeed: 22 });
  idle.stats.playtimeMs = idlePlay;
  idle.actions.active = {};
  const idleRes = computeOfflineProgress({
    state: idle, nowMs: 3 * H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  assert.equal(idleRes.hasGains, false);
  assert.equal(idleRes.workedMs, 0);
  assert.equal(idleRes.nextState.stats.playtimeMs, idlePlay,
    'idle playtime stays unpadded');
  assert.equal(
    formatOfflineAwayLine(idleRes),
    `3h 00m away. ${IDLE_RECAP_FLAME_UNCHANGED} Cap 12h.`,
  );
  const idlePreview = previewOfflineClaim(idleRes);
  const idleMount = new FakeNode('div');
  showOfflineModal(idleMount, { ...idleRes, featPreview: idlePreview }, { onClaim() {} });
  const idleText = idleMount.textContent ?? '';
  const idleAway = idleMount.querySelector('.offline-away')?.textContent ?? '';
  assert.match(idleText, /Nothing ran/);
  assert.match(idleText, /With nothing queued, Time by the Flame and the dailies sat still/);
  assert.match(idleAway, /Time by the Flame unchanged/);
  assert.match(idleAway, /Cap 12h/);
  assert.doesNotMatch(idleAway, / · worked/);
  assert.doesNotMatch(idleText, /hours of work/);
  assert.doesNotMatch(idleText, /Credited/);

  const fullPlay = 19 * 60_000 + 18_000;
  const full = createState({ nowMs: 0, rngSeed: 23 });
  full.stats.playtimeMs = fullPlay;
  full.bank.tinderscrap = 10_000;
  full.actions.active['tend-flame'] = { progressMs: 0 };
  const fullRes = computeOfflineProgress({
    state: full, nowMs: 3 * H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  assert.equal(fullRes.hasGains, true);
  assert.equal(fullRes.workedMs, fullRes.creditedMs);
  assert.equal(fullRes.creditedMs, 3 * H);
  assert.equal(fullRes.nextState.stats.playtimeMs, fullPlay + 3 * H,
    'ample fuel still bills the credited span');
  assert.equal(formatOfflineAwayLine(fullRes), '3h 00m away. Cap 12h.');
  const fullMount = new FakeNode('div');
  showOfflineModal(fullMount, {
    ...fullRes, featPreview: previewOfflineClaim(fullRes),
  }, { onClaim() {} });
  const fullAway = fullMount.querySelector('.offline-away')?.textContent ?? '';
  assert.match(fullAway, /3h 00m away\./);
  assert.doesNotMatch(fullAway, / · worked/);
  assert.match(fullAway, /Cap 12h/);
});

test('S4n: Tend dry 3h recap sits still; Work Went On stays dark', () => {
  const play = (2 * H) - 90_000;
  const tendMs = ACTIONS_BY_ID['tend-flame'].durationMs;
  const halt = createState({ nowMs: 0, rngSeed: 31 });
  halt.stats.playtimeMs = play;
  halt.stats.offlineClaims = 0;
  halt.bank.tinderscrap = 10;
  halt.actions.active['tend-flame'] = { progressMs: 0 };
  const haltRes = computeOfflineProgress({
    state: halt, nowMs: 3 * H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  assert.equal(haltRes.gains.actions[0].completions, 10);
  assert.equal(haltRes.workedMs, 10 * tendMs, 'playtime bills run-until-halt, not the 3h tail');
  assert.equal(haltRes.workedMs, 40_000);
  assert.equal(haltRes.nextState.stats.playtimeMs, play + 40_000);
  assert.equal(haltedEarly(haltRes), true);
  assert.equal(creditsOfflineLabour(haltRes), false,
    'fuel-halt sliver is not hours-of-work labour');
  assert.equal(
    formatHaltCoda(haltRes),
    'Then the flame sat still for 2h 59m.',
  );
  assert.equal(
    formatOfflineAwayLine(haltRes),
    '3h 00m away · worked 40s. Cap 12h.',
  );

  const names = (id) => id === 'tinderscrap' ? 'Tinderscrap' : id;
  const recap = formatRecapLine(haltRes.recapLines[0], names);
  assert.match(recap, /Tend the Flame ×10/);
  assert.match(recap, /out of Tinderscrap/);
  assert.match(recap, /900\/h for 40s/);
  assert.doesNotMatch(recap, /7\/h/);

  const haltPreview = previewOfflineClaim(haltRes);
  assert.equal(haltPreview.state.stats.offlineClaims ?? 0, 0);
  assert.equal(isUnlocked(haltPreview.state, 't-off-1'), false,
    'The Work Went On must not light from a fuel-halt sliver');
  assert.ok(!(haltPreview.feats ?? []).some((a) => a.id === 't-off-1'));
  assert.ok(!(haltPreview.feats ?? []).some((a) => a.name === 'The Work Went On'));
  assert.equal(isUnlocked(haltPreview.state, 't-2h'), false,
    'The Long Sit stays dark');
  const haltClaimed = applyClaim(haltRes);
  assert.equal(haltClaimed.stats.offlineClaims ?? 0, 0);
  assert.equal(isUnlocked(haltClaimed, 't-off-1'), false);
  assert.equal(haltClaimed.stats.playtimeMs, play + 40_000);

  const haltMount = new FakeNode('div');
  showOfflineModal(haltMount, { ...haltRes, featPreview: haltPreview }, { onClaim() {} });
  const haltText = haltMount.textContent ?? '';
  const haltAway = haltMount.querySelector('.offline-away')?.textContent ?? '';
  const coda = haltMount.querySelector('.offline-halt-coda');
  const featList = haltMount.querySelector('.offline-feat-list');
  assert.match(haltAway, /3h 00m away · worked 40s/);
  assert.match(haltAway, /Cap 12h/);
  assert.ok(coda, 'sat-still coda sits above the list, not behind feats');
  assert.equal(coda.textContent, 'Then the flame sat still for 2h 59m.');
  assert.match(haltText, /Then the flame sat still for 2h 59m/);
  assert.ok(!featList || !featList.contains(coda),
    'coda is visible without expanding feats');
  if (featList) {
    assert.ok(featList.classList.contains('is-collapsed'),
      'feats stay collapsed; coda must not require Hide feats');
  }
  assert.doesNotMatch(haltText, /The Work Went On/);
  assert.match(haltText, /900\/h for 40s/);
  assert.doesNotMatch(haltText, /7\/h/);
  assert.doesNotMatch(haltAway, /hours of work/);

  const idlePlay = 90_000;
  const idle = createState({ nowMs: 0, rngSeed: 32 });
  idle.stats.playtimeMs = idlePlay;
  idle.actions.active = {};
  const idleRes = computeOfflineProgress({
    state: idle, nowMs: 3 * H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  assert.equal(idleRes.hasGains, false);
  assert.equal(idleRes.workedMs, 0);
  assert.equal(idleRes.nextState.stats.playtimeMs, idlePlay,
    'idle playtime stays unpadded');
  assert.equal(formatHaltCoda(idleRes), null);
  assert.equal(creditsOfflineLabour(idleRes), false);
  const idlePreview = previewOfflineClaim(idleRes);
  assert.equal(isUnlocked(idlePreview.state, 't-off-1'), false);
  const idleMount = new FakeNode('div');
  showOfflineModal(idleMount, { ...idleRes, featPreview: idlePreview }, { onClaim() {} });
  const idleText = idleMount.textContent ?? '';
  const idleAway = idleMount.querySelector('.offline-away')?.textContent ?? '';
  assert.equal(idleMount.querySelector('.offline-halt-coda'), null);
  assert.match(idleText, /Nothing ran/);
  assert.match(idleText, /With nothing queued, Time by the Flame and the dailies sat still/);
  assert.match(idleAway, /Time by the Flame unchanged/);
  assert.doesNotMatch(idleAway, / · worked/);
  assert.doesNotMatch(idleText, /Then the flame sat still/);
  assert.doesNotMatch(idleText, /hours of work/);
  assert.doesNotMatch(idleText, / · worked/);

  const fullPlay = 19 * 60_000 + 18_000;
  const full = createState({ nowMs: 0, rngSeed: 33 });
  full.stats.playtimeMs = fullPlay;
  full.stats.offlineClaims = 0;
  full.bank.tinderscrap = 10_000;
  full.actions.active['tend-flame'] = { progressMs: 0 };
  const fullRes = computeOfflineProgress({
    state: full, nowMs: 3 * H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  assert.equal(fullRes.hasGains, true);
  assert.equal(fullRes.workedMs, fullRes.creditedMs);
  assert.equal(fullRes.creditedMs, 3 * H);
  assert.equal(fullRes.nextState.stats.playtimeMs, fullPlay + 3 * H,
    'ample fuel still bills the credited span');
  assert.equal(haltedEarly(fullRes), false);
  assert.equal(formatHaltCoda(fullRes), null, 'ample fuel has no sat-still coda');
  assert.equal(creditsOfflineLabour(fullRes), true);
  const fullPreview = previewOfflineClaim(fullRes);
  assert.ok((fullPreview.state.stats.offlineClaims ?? 0) >= 1);
  assert.equal(isUnlocked(fullPreview.state, 't-off-1'), true,
    'full-span labour still lights The Work Went On');
  const fullMount = new FakeNode('div');
  showOfflineModal(fullMount, { ...fullRes, featPreview: fullPreview }, { onClaim() {} });
  const fullText = fullMount.textContent ?? '';
  const fullAway = fullMount.querySelector('.offline-away')?.textContent ?? '';
  assert.equal(fullMount.querySelector('.offline-halt-coda'), null);
  assert.match(fullAway, /3h 00m away\./);
  assert.doesNotMatch(fullAway, / · worked/);
  assert.doesNotMatch(fullText, /Then the flame sat still/);
  assert.doesNotMatch(fullText, / for 3h/);
  assert.match(fullText, /\/h/);

  const appSrc = readFileSync(join(here, '../src/ui/app.js'), 'utf8');
  assert.match(appSrc, /creditsOfflineLabour\(res\)/,
    'Claim must use the same labour gate as preview');
});

test('S4o: Claim after fuel-halt kills Tend; coda still on recap; idle stays idle; ample fuel keeps it', () => {
  assert.equal(SAVE_VERSION, 5, 'no SAVE_VERSION bump');
  const play = (2 * H) - 90_000;
  const tendMs = ACTIONS_BY_ID['tend-flame'].durationMs;

  const halt = createState({ nowMs: 0, rngSeed: 41 });
  halt.stats.playtimeMs = play;
  halt.stats.offlineClaims = 0;
  halt.bank.tinderscrap = 10;
  halt.actions.active['tend-flame'] = { progressMs: 0 };
  const haltRes = computeOfflineProgress({
    state: halt, nowMs: 3 * H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  assert.equal(haltRes.gains.actions[0].completions, 10);
  assert.equal(haltRes.workedMs, 10 * tendMs);
  assert.equal(haltedEarly(haltRes), true);
  assert.equal(
    formatHaltCoda(haltRes),
    'Then the flame sat still for 2h 59m.',
    'sat-still coda still present before Claim',
  );
  assert.ok(halt.actions.active['tend-flame'], 'pre-Claim save still queues Tend');
  assert.equal(creditsOfflineLabour(haltRes), false);

  const haltPreview = previewOfflineClaim(haltRes);
  const haltMount = new FakeNode('div');
  showOfflineModal(haltMount, { ...haltRes, featPreview: haltPreview }, { onClaim() {} });
  const coda = haltMount.querySelector('.offline-halt-coda');
  assert.ok(coda, 'sat-still coda sits on the recap before Claim');
  assert.equal(coda.textContent, 'Then the flame sat still for 2h 59m.');
  assert.match(haltMount.textContent ?? '', /900\/h for 40s/);
  assert.doesNotMatch(haltMount.textContent ?? '', /The Work Went On/);

  const haltClaimed = applyClaim(haltRes);
  assert.equal(haltClaimed.actions.active['tend-flame'], undefined,
    'Claim of a fuel-halt recap must kill Tend (Melvor isActive false)');
  assert.equal(actionStatus(haltClaimed, 'tend-flame').running, false);
  assert.equal(Object.keys(haltClaimed.actions.active).length, 0);
  const haltSkills = renderSkillsScreen(uiCtx(haltClaimed));
  const haltEmber = haltSkills.node.querySelectorAll('.skill-row')
    .find((r) => (r.textContent ?? '').includes('Emberkeeping'));
  assert.ok(haltEmber, 'Emberkeeping row after halt Claim');
  assert.equal(haltEmber.querySelector('.live-dot'), null,
    'Skills must not show Tend running after halt Claim');
  const haltDetail = renderSkillDetail(uiCtx(haltClaimed), 'emberkeeping');
  const haltRun = haltDetail.node.querySelector('.btn-run');
  assert.notEqual(haltRun?.textContent, 'Stop');
  assert.doesNotMatch(haltRun?.className ?? '', /btn-stop/);
  assert.match(haltRun?.textContent ?? '', /Need materials|Start/);
  const postClaimEvents = tickActions(haltClaimed, 5_000, createRng(41));
  assert.ok(!postClaimEvents.some((e) => e.type === 'halted'),
    'dead action is killed on Claim, not the next failed tick');
  assert.equal(haltClaimed.actions.active['tend-flame'], undefined);

  const idlePlay = 90_000;
  const idle = createState({ nowMs: 0, rngSeed: 42 });
  idle.stats.playtimeMs = idlePlay;
  idle.actions.active = {};
  const idleRes = computeOfflineProgress({
    state: idle, nowMs: 3 * H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  assert.equal(idleRes.hasGains, false);
  assert.equal(formatHaltCoda(idleRes), null, 'idle has no sat-still coda');
  const idleMount = new FakeNode('div');
  showOfflineModal(idleMount, {
    ...idleRes, featPreview: previewOfflineClaim(idleRes),
  }, { onClaim() {} });
  assert.equal(idleMount.querySelector('.offline-halt-coda'), null);
  assert.match(idleMount.textContent ?? '', /Nothing ran/);
  const idleClaimed = applyClaim(idleRes);
  assert.deepEqual(idleClaimed.actions.active, {});
  assert.equal(idleClaimed.stats.playtimeMs, idlePlay);

  const fullPlay = 19 * 60_000 + 18_000;
  const full = createState({ nowMs: 0, rngSeed: 43 });
  full.stats.playtimeMs = fullPlay;
  full.bank.tinderscrap = 10_000;
  full.actions.active['tend-flame'] = { progressMs: 0 };
  const fullRes = computeOfflineProgress({
    state: full, nowMs: 3 * H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  assert.equal(fullRes.hasGains, true);
  assert.equal(haltedEarly(fullRes), false);
  assert.equal(formatHaltCoda(fullRes), null, 'ample fuel has no sat-still coda');
  const fullClaimed = applyClaim(fullRes);
  assert.ok(fullClaimed.actions.active['tend-flame'],
    'ample-fuel Claim may keep the action if it did not halt');
  assert.equal(actionStatus(fullClaimed, 'tend-flame').running, true);
  const fullSkills = renderSkillsScreen(uiCtx(fullClaimed));
  const fullEmber = fullSkills.node.querySelectorAll('.skill-row')
    .find((r) => (r.textContent ?? '').includes('Emberkeeping'));
  assert.ok(fullEmber?.querySelector('.live-dot'),
    'ample-fuel Claim may keep Tend marked running');

  const dry = createState({ nowMs: 0, rngSeed: 44 });
  dry.bank.tinderscrap = 0;
  dry.actions.active['tend-flame'] = { progressMs: 0 };
  const dryRes = computeOfflineProgress({
    state: dry, nowMs: 3 * H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  assert.equal(dryRes.hasGains, false);
  assert.equal(formatHaltCoda(dryRes), null, '×0 halt has no sat-still coda');
  assert.ok(dry.actions.active['tend-flame'], '×0 pre-Claim save still queues Tend');
  const dryClaimed = applyClaim(dryRes);
  assert.equal(dryClaimed.actions.active['tend-flame'], undefined,
    '×0 fuel-halt Claim also kills the dead workstation');
});

test('idle rewind does not inflate playtime or grant Work Went On with zero cycles', () => {
  const play = 90_000;
  const s = createState({ nowMs: 0, rngSeed: 2 });
  s.stats.playtimeMs = play;
  s.stats.offlineClaims = 0;
  s.bank.tinderscrap = 0;
  s.actions.active['tend-flame'] = { progressMs: 0 };

  const res = computeOfflineProgress({
    state: s,
    nowMs: 3 * H,
    lastSavedAt: 0,
    actionsById: ACTIONS_BY_ID,
  });
  assert.equal(res.hasGains, false);
  assert.equal(res.nextState.stats.playtimeMs, play);

  const featPreview = previewOfflineClaim(res);
  assert.equal(featPreview.state.stats.playtimeMs, play);
  assert.equal(featPreview.state.stats.offlineClaims ?? 0, 0);
  assert.equal(isUnlocked(featPreview.state, 't-off-1'), false);
  assert.ok(!(featPreview.feats ?? []).some((a) => a.id === 't-off-1'));

  const claimed = applyClaim(res);
  assert.equal(claimed.stats.playtimeMs, play);
  assert.equal(claimed.stats.offlineClaims ?? 0, 0);
  assert.equal(isUnlocked(claimed, 't-off-1'), false);

  const idle = createState({ nowMs: 0, rngSeed: 3 });
  idle.stats.playtimeMs = play;
  const none = computeOfflineProgress({
    state: idle,
    nowMs: 3 * H,
    lastSavedAt: 0,
    actionsById: ACTIONS_BY_ID,
  });
  assert.equal(none.hasGains, false);
  assert.equal(none.nextState.stats.playtimeMs, play);
  const idlePreview = previewOfflineClaim(none);
  assert.equal(isUnlocked(idlePreview.state, 't-off-1'), false);
  assert.equal(shouldOfferOfflineRecap(none), true,
    'idle 3h with active {} still opens the recap');
  assert.equal(formatIdleRecapLine(none, idlePreview), 'Nothing ran.',
    'idle headline stays Nothing ran.');
  assert.equal(formatIdleRecapStillness(none), IDLE_RECAP_STILLNESS);
  assert.doesNotMatch(IDLE_RECAP_STILLNESS, /stuffed/i);
  assert.match(IDLE_RECAP_STILLNESS, /Time by the Flame/);
  assert.match(IDLE_RECAP_STILLNESS, /dailies/i);
  assert.match(IDLE_RECAP_STILLNESS, /queued/i);
});

test('recap names every feat Claim will light, not a sliced four', () => {
  const feats = [
    { id: 'a', name: 'First Kindling' },
    { id: 'b', name: 'First Sprig' },
    { id: 'c', name: 'Five Minutes by the Flame' },
    { id: 'd', name: 'A Watch' },
    { id: 'e', name: 'The Long Sit' },
    { id: 'f', name: 'Unscathed' },
    { id: 'g', name: 'First Spark' },
    { id: 'h', name: 'Wear a Name' },
    { id: 'i', name: 'Write It Down' },
    { id: 'j', name: 'Cataloguer' },
    { id: 'k', name: 'Five and Alive' },
    { id: 'l', name: 'Calloused' },
  ];
  const s = gatheringState();
  const res = computeOfflineProgress({
    state: s, nowMs: H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  const mount = new FakeNode('div');
  showOfflineModal(mount, {
    ...res,
    featPreview: { feats, lumen: 98, radiance: 11 },
  }, { onClaim() {} });
  const text = mount.textContent ?? '';
  const block = mount.querySelector('.offline-feat-block');
  assert.ok(block, 'feat names live in a block above Claim');
  assert.ok(mount.querySelector('.offline-feat-list'), 'feat names live in their own list');
  assert.ok(mount.querySelector('.offline-feat-list').classList.contains('is-collapsed'),
    'names start collapsed so Claim stays pinned');
  assert.equal(mount.querySelectorAll('.offline-feat').length, feats.length);
  const toggle = mount.querySelector('.offline-feat-toggle');
  assert.ok(toggle, 'N feats toggle');
  assert.match(toggle.textContent ?? '', /12 feats/);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  const list = mount.querySelector('.offline-feat-list');
  assert.equal(block.children[0], list, 'names sit above the toggle (and Claim)');
  assert.equal(block.children[1], toggle);
  assert.ok(mount.querySelector('.modal-body').contains(list),
    'feat list is in the scroll region above Claim');
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.ok(!list.classList.contains('is-collapsed'), 'tapping N feats is not a no-op');
  assert.match(toggle.textContent ?? '', /Hide feats/);
  for (const a of feats) {
    assert.ok(text.includes(a.name), `recap names ${a.name}`);
  }
  assert.match(text, /\+98 Lumen/);
  assert.match(text, /\+11 Radiance/);
});

test('every recap prints the 12h cap, including uncapped windows', () => {
  assert.equal(formatOfflineCapNote(), `Cap ${OFFLINE_CAP_HOURS}h.`);
  const s = gatheringState();
  const res = computeOfflineProgress({
    state: s,
    nowMs: H,
    lastSavedAt: 0,
    actionsById: ACTIONS_BY_ID,
  });
  assert.equal(res.capped, false);
  const mount = new FakeNode('div');
  showOfflineModal(mount, {
    ...res,
    featPreview: previewOfflineClaim(res),
  }, { onClaim() {} });
  assert.match(mount.textContent ?? '', /Cap 12h/);
});

test('absences below the min threshold do not offer a recap', () => {
  const s = createState({ nowMs: 0, rngSeed: 4 });
  const res = computeOfflineProgress({
    state: s,
    nowMs: OFFLINE_MIN_AWAY_MS - 1,
    lastSavedAt: 0,
    actionsById: ACTIONS_BY_ID,
  });
  assert.equal(shouldOfferOfflineRecap(res), false);
});

test('capped idle recap does not call the still window work', () => {
  const idle = createState({ nowMs: 0, rngSeed: 8 });
  idle.actions.active = {};
  const res = computeOfflineProgress({
    state: idle,
    nowMs: 13 * H,
    lastSavedAt: 0,
    actionsById: ACTIONS_BY_ID,
  });
  assert.equal(res.capped, true);
  assert.equal(res.hasGains, false);
  assert.equal(res.nextState.stats.playtimeMs, idle.stats.playtimeMs);
  const featPreview = previewOfflineClaim(res);
  const mount = new FakeNode('div');
  showOfflineModal(mount, { ...res, featPreview }, { onClaim() {} });
  const text = mount.textContent ?? '';
  assert.match(text, /Nothing ran/);
  assert.match(text, /With nothing queued, Time by the Flame and the dailies sat still/);
  assert.match(text, /Cap 12h/);
  assert.doesNotMatch(text, /hours of work/);
  assert.doesNotMatch(text, /Credited/);
  const away = mount.querySelector('.offline-away')?.textContent ?? '';
  assert.match(away, /Time by the Flame unchanged/);
  assert.doesNotMatch(away, / · worked/);
});

test('idle recap modal prints time away, Cap 12h, and Nothing ran', () => {
  const idle = createState({ nowMs: 0, rngSeed: 5 });
  idle.actions.active = {};
  const res = computeOfflineProgress({
    state: idle,
    nowMs: 3 * H,
    lastSavedAt: 0,
    actionsById: ACTIONS_BY_ID,
  });
  const featPreview = previewOfflineClaim(res);
  const mount = new FakeNode('div');
  showOfflineModal(mount, { ...res, featPreview }, { onClaim() {} });
  const text = mount.textContent ?? '';
  assert.equal(mount.querySelector('.modal-title')?.textContent, 'While You Were Away…');
  assert.match(text, /Cap 12h/);
  assert.match(text, /Nothing ran/);
  assert.match(text, /With nothing queued/);
  assert.match(text, /Time by the Flame/);
  assert.match(text, /dailies sat still/);
  assert.doesNotMatch(text, /stuffed/i);
  assert.ok(mount.querySelector('.offline-idle'), 'Nothing ran. stays the headline');
  assert.ok(mount.querySelector('.offline-idle-still'), 'stillness line is present');
  assert.equal(
    mount.querySelector('.offline-idle-still')?.textContent,
    IDLE_RECAP_STILLNESS,
  );
  const away = mount.querySelector('.offline-away')?.textContent ?? '';
  assert.match(away, /Time by the Flame unchanged/);
  assert.doesNotMatch(away, / · worked/);
  assert.equal(
    mount.querySelectorAll('button').filter((b) => b.getAttribute('aria-label') === 'Close').length,
    0,
  );
  mount.querySelector('.modal-overlay')?.click();
  assert.equal(mount.querySelector('.modal-title')?.textContent, 'While You Were Away…');
});

test('halted recap keeps its chip and does not use the idle stillness line', () => {
  const s = createState({ nowMs: 0, rngSeed: 6 });
  s.bank.tinderscrap = 0;
  s.actions.active['tend-flame'] = { progressMs: 0 };
  const res = computeOfflineProgress({
    state: s, nowMs: 3 * H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  assert.equal(formatIdleRecapLine(res), null);
  assert.equal(formatIdleRecapStillness(res), null);
  const mount = new FakeNode('div');
  showOfflineModal(mount, { ...res, featPreview: { feats: [], lumen: 0, radiance: 0 } }, {
    onClaim() {},
  });
  const text = mount.textContent ?? '';
  assert.match(text, /out of Tinderscrap/);
  assert.doesNotMatch(text, /nothing queued/);
  assert.doesNotMatch(text, /Nothing ran/);
  assert.doesNotMatch(text, /sat still/);
  assert.doesNotMatch(text, /Time by the Flame unchanged/);
  assert.doesNotMatch(text, / · worked/);
});

test('idle recap stillness copy has no stuffed', () => {
  assert.doesNotMatch(IDLE_RECAP_STILLNESS, /stuffed/i);
  assert.match(IDLE_RECAP_STILLNESS, /With nothing queued/);
  assert.match(IDLE_RECAP_STILLNESS, /Time by the Flame and the dailies sat still/);
  assert.equal(IDLE_RECAP_STILLNESS.includes('.'), true);
  assert.equal(IDLE_RECAP_STILLNESS.replace(/[^.!?]/g, '').length, 1, 'one sentence');
  const idle = createState({ nowMs: 0, rngSeed: 7 });
  idle.actions.active = {};
  const res = computeOfflineProgress({
    state: idle, nowMs: 3 * H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  assert.equal(formatIdleRecapStillness(res), IDLE_RECAP_STILLNESS);
});

test('360 feat expand keeps feat names above Claim', () => {
  const feats = Array.from({ length: 25 }, (_, i) => ({
    id: `feat-${i}`,
    name: `Feat Name ${i + 1}`,
  }));
  const s = gatheringState();
  const res = computeOfflineProgress({
    state: s, nowMs: H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  const mount = new FakeNode('div');
  showOfflineModal(mount, {
    ...res,
    featPreview: { feats, lumen: 98, radiance: 11 },
  }, { onClaim() {} });

  const box = recapFeatExpandVsClaim({ viewportH: RECAP_360.viewportH, featCount: 25 });
  assert.equal(box.viewportH, 640);
  assert.ok(box.listBottom <= box.claimTop,
    `listBottom ${box.listBottom} must sit above Claim ${box.claimTop}`);
  assert.ok(box.listBottom <= box.bodyBottom,
    'list stays in the body scrollport, not under Claim');
  assert.ok(box.listTop >= box.bodyTop);
  assert.ok(box.namesVisible >= RECAP_360.minVisibleNames,
    `at least ${RECAP_360.minVisibleNames} names visible above Claim, got ${box.namesVisible}`);
  assert.ok(box.claimBottom <= 640, `Claim ${box.claimTop}–${box.claimBottom} in the 360 viewport`);
  assert.equal(box.fits, true);

  const block = mount.querySelector('.offline-feat-block');
  const list = mount.querySelector('.offline-feat-list');
  const toggle = mount.querySelector('.offline-feat-toggle');
  const body = mount.querySelector('.modal-body');
  const claim = mount.querySelector('.modal-actions');
  assert.ok(block && list && toggle && body && claim);
  assert.match(toggle.textContent ?? '', /25 feats/);
  assert.equal(block.children[0], list, 'DOM order: names above the toggle');
  assert.equal(block.children[1], toggle);
  assert.ok(body.contains(block), 'feat block is in the scroll region above Claim');
  assert.equal(claim.contains(list), false, 'names must not live under Claim');
  assert.equal(list.classList.contains('is-collapsed'), true);

  body.clientHeight = box.bodyBottom - box.bodyTop;
  toggle.offsetHeight = RECAP_360.featToggle;
  block.offsetTop = 80;
  block.offsetHeight = box.listH + RECAP_360.featToggle + RECAP_360.listGap;
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(list.classList.contains('is-collapsed'), false, 'tapping 25 feats is not a no-op');
  const cap = parseInt(list.style.maxHeight, 10);
  assert.ok(Number.isFinite(cap), 'expand caps list height to the body');
  assert.ok(cap <= body.clientHeight - RECAP_360.featToggle,
    `cap ${cap} must leave room for the toggle above Claim`);
  assert.ok(cap >= RECAP_360.minVisibleNames * RECAP_360.featRow);
  assert.equal(mount.querySelectorAll('.offline-feat').length, 25);

  layoutOfflineFeatList(list, { expanded: false, toggle });
  assert.equal(list.style.maxHeight, '');

  const css = readFileSync(join(here, '../src/ui/styles.css'), 'utf8');
  assert.match(css, /\.offline-feat-block\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(css, /\.offline-feat-list\s*\{[^}]*max-height:\s*min\(36vh,\s*220px\)/s);
  assert.match(css, /\.modal-panel\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.modal-panel:not\(\.sheet-panel\)\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/s);
  assert.match(css, /\.modal-actions\s*\{[^}]*z-index:\s*1/s);
});

