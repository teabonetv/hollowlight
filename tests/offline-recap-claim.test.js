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
import {
  computeOfflineProgress, previewOfflineClaim, recapWalletDelta,
  formatLevelUpLine, formatMasteryUpLine, formatOfflineCapNote, formatIdleRecapLine,
  formatOfflineHourRate, shouldOfferOfflineRecap, OFFLINE_CAP_HOURS, OFFLINE_MIN_AWAY_MS,
} from '../src/core/offline.js';

const { showOfflineModal } = await import('../src/ui/modals.js');

const H = 3_600_000;

function gatheringState({ radiance = 12 } = {}) {
  const s = createState({ nowMs: 0, rngSeed: 1 });
  s.radiance = radiance;
  s.radianceEarned = radiance;
  s.stats.radianceEarned = radiance;
  s.actions.active['gather-herbs'] = { progressMs: 0 };
  return s;
}

/** Claim path: adopt nextState, credit claims only when work ran, cascade feats. */
function applyClaim(res) {
  const game = hydrateState(structuredClone(res.nextState));
  if (res.hasGains) {
    game.stats.offlineClaims = (game.stats.offlineClaims ?? 0) + 1;
  }
  cascadeAchievements(game);
  return game;
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
  const fogRate = formatOfflineHourRate(fogwort.qty, res.creditedMs);
  assert.match(text, new RegExp(fogRate.replace('/', '\\/')));
  assert.match(text, /\/h/);
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
  assert.equal(formatIdleRecapLine(none, idlePreview), 'Nothing ran.');
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
  assert.ok(mount.querySelector('.offline-feat-list'), 'feat names scroll in their own list');
  assert.equal(mount.querySelectorAll('.offline-feat').length, feats.length);
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
  assert.equal(
    mount.querySelectorAll('button').filter((b) => b.getAttribute('aria-label') === 'Close').length,
    0,
  );
  mount.querySelector('.modal-overlay')?.click();
  assert.equal(mount.querySelector('.modal-title')?.textContent, 'While You Were Away…');
});

