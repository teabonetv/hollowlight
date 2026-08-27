import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, pushLog, STARTER_BANK } from '../src/game/state.js';
import { createRng } from '../src/core/rng.js';
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID } from '../src/game/data/achievements.js';
import { PERKS } from '../src/game/data/perks.js';
import { RADIANCE_PER_XP } from '../src/game/data/perks.js';
import {
  applyStackedBonuses, EFFECT_APPLY_ORDER, xpGrantMultiplier,
} from '../src/game/systems/modifiers.js';
import {
  unlockPerk, grantRadianceFromXp, respecPerks, canUnlock, perkBonus,
} from '../src/game/systems/radiance.js';
import {
  evaluateAchievements, triggerMet, isUnlocked, cascadeAchievements,
  featToastMessage, actionFeatToast,
} from '../src/game/systems/achievements.js';
import {
  ensureDailies, rerollDailies, canReroll, claimDaily, taskProgress, utcDayKey,
  isDailyProgressable,
} from '../src/game/systems/dailies.js';
import { DAILY_TASK_COUNT, DAILY_POOL } from '../src/game/data/dailies.js';
import { statsRows, totalCycles, recordCycle } from '../src/game/systems/stats.js';
import { completeCycle, startAction, tickActions, actionStatus } from '../src/game/systems/action-runner.js';
import { ACTIONS_BY_ID } from '../src/game/data/actions.js';
import { computeOfflineProgress } from '../src/core/offline.js';
import { nextWants, totalCompletion, trueCompletion, logCategoryStats, formatCompletionPct } from '../src/game/systems/completion.js';
import { TAB_OPEN_FEAT_IDS } from '../src/game/data/achievements.js';
import { serializeSave, deserializeSave, SAVE_VERSION } from '../src/core/save.js';
import { markDiscovered } from '../src/game/systems/discovered.js';
import { bankPay } from '../src/game/systems/bank.js';

test('S4 content volume: ≥60 achievements and 40 constellation perks', () => {
  assert.ok(ACHIEVEMENTS.length >= 60, `have ${ACHIEVEMENTS.length}`);
  assert.equal(PERKS.length, 40);
  assert.ok(DAILY_POOL.length > DAILY_TASK_COUNT);
});

test('perk effect application order is mastery → camp → radiance → achievement → hooks', () => {
  assert.deepEqual([...EFFECT_APPLY_ORDER], ['mastery', 'camp', 'radiance', 'achievement', 'hooks']);
  const stacked = applyStackedBonuses({
    mastery: 0.20, camp: 0.03, radiance: 0.05, achievement: 0.01, hooks: 0.02,
  });
  const expected = 1.20 * 1.03 * 1.05 * 1.01 * 1.02;
  assert.ok(Math.abs(stacked - expected) < 1e-12, `got ${stacked} vs ${expected}`);
  const added = 1 + 0.20 + 0.03 + 0.05 + 0.01 + 0.02;
  assert.ok(Math.abs(stacked - added) > 0.01, 'must not collapse to a single sum');
});

test('xpGrantMultiplier uses that order against a real save', () => {
  const s = createState({ nowMs: 0, rngSeed: 1 });
  s.skills.foraging.mastery['gather-herbs'] = { xp: 0, level: 20 };
  s.campUpgrades = { 'ember-altar': 1 }; // +3% XP
  s.perks.owned = ['kindling']; // +5% XP
  s.achievements.unlocked = { 'ek-25': { atMs: 0 } }; // +1% XP perk reward
  const m = xpGrantMultiplier(s, 20);
  // mastery 20%, camp 3%, radiance 5%, achievement 1%, hooks 0
  const expect = 1.20 * 1.03 * 1.05 * 1.01 * 1;
  assert.ok(Math.abs(m - expect) < 1e-12, `got ${m}`);
});

test('achievement triggers evaluate; rewards apply once', () => {
  const s = createState({ nowMs: 0, rngSeed: 2 });
  assert.equal(triggerMet(s, { type: 'skillLevel', skill: 'foraging', level: 5 }), false);
  s.skills.foraging.level = 5;
  assert.equal(triggerMet(s, { type: 'skillLevel', skill: 'foraging', level: 5 }), true);

  const beforeLumen = s.lumen;
  const newly = evaluateAchievements(s);
  assert.ok(newly.some((a) => a.id === 'fo-5'));
  assert.equal(isUnlocked(s, 'fo-5'), true);
  assert.ok(s.cosmetics.titles.includes('Fog-Walker'));

  const lumenAfter = s.lumen;
  evaluateAchievements(s); // second pass is a no-op for fo-5
  assert.equal(s.lumen, lumenAfter);
  assert.ok(s.lumen >= beforeLumen);
});

test('daily embers: 3 tasks, one reroll, second reroll refused, new UTC day refreshes', () => {
  const s = createState({ nowMs: 0, rngSeed: 3 });
  const noon = Date.UTC(2026, 7, 25, 12, 0, 0);
  ensureDailies(s, noon);
  assert.equal(utcDayKey(noon), '2026-08-25');
  assert.equal(s.dailies.tasks.length, DAILY_TASK_COUNT);
  assert.equal(canReroll(s), true);
  const firstIds = s.dailies.tasks.map((t) => t.id).join(',');

  const reroll = rerollDailies(s, noon);
  assert.equal(reroll.ok, true);
  assert.equal(canReroll(s), false);
  const secondIds = s.dailies.tasks.map((t) => t.id).join(',');
  assert.notEqual(secondIds, firstIds, 'reroll draws a different set when the pool allows');

  const again = rerollDailies(s, noon);
  assert.equal(again.ok, false);

  // New day restores the reroll; claimed ids must survive a same-day reroll.
  const claimedSave = createState({ nowMs: 0, rngSeed: 3 });
  ensureDailies(claimedSave, noon);
  const keepId = claimedSave.dailies.tasks[0].id;
  claimedSave.dailies.tasks[0].claimed = true;
  const kept = rerollDailies(claimedSave, noon);
  assert.equal(kept.ok, true);
  assert.ok(claimedSave.dailies.tasks.some((t) => t.id === keepId && t.claimed),
    'reroll must not wipe a claimed ember off today’s board');

  const nextDay = Date.UTC(2026, 7, 26, 12, 0, 0);
  ensureDailies(s, nextDay);
  assert.equal(s.dailies.dayKey, '2026-08-26');
  assert.equal(s.dailies.rerollsUsed, 0, 'a new day restores the reroll; no streak punishment');
});

test('daily claim pays whole Radiance sparks when the task is met', () => {
  const s = createState({ nowMs: 0, rngSeed: 4 });
  const t0 = Date.UTC(2026, 7, 25, 0, 0, 0);
  ensureDailies(s, t0);
  const task = s.dailies.tasks[0];
  // Force completion by stuffing the matching counter far above need.
  s.actions.completed['tend-flame'] = 999;
  s.actions.completed['gather-herbs'] = 999;
  s.stats.lumenEarned = 999;
  s.stats.itemsGathered = 999;
  s.stats.playtimeMs = 999 * 60_000;
  s.skills.emberkeeping.level = 99;
  s.skills.foraging.level = 99;
  const p = taskProgress(s, task);
  assert.equal(p.done, true);
  const before = s.radiance;
  const claim = claimDaily(s, task.id);
  assert.equal(claim.ok, true);
  assert.equal(s.radiance, before + task.reward);
  assert.equal(claimDaily(s, task.id).ok, false, 'no double claim');
});

test('stats aggregation: cycles, items, lumen from a real completeCycle', () => {
  const s = createState({ nowMs: 0, rngSeed: 5 });
  const action = ACTIONS_BY_ID['tend-flame'];
  completeCycle(s, action, createRng(1));
  assert.equal(s.stats.actionsDone, 1);
  assert.equal(s.stats.lumenEarned, 1);
  assert.equal(totalCycles(s), 0, 'completed map is updated by the runner, not completeCycle');
  recordCycle(s, [{ kind: 'item', id: 'fogwort', qty: 2 }]);
  assert.equal(s.stats.itemsGathered, 2);
  const rows = statsRows(s);
  assert.ok(rows.some(([label]) => /Time by the flame/i.test(label)));
  assert.ok(rows.some(([label]) => /Deaths/i.test(label)));
  assert.ok(rows.some(([label]) => /Distance walked/i.test(label)));
});

test('startAction writes autoRestart=true when the UI default is on', () => {
  const s = createState({ nowMs: 0, rngSeed: 6 });
  delete s.actions.autoRestart['tend-flame'];
  startAction(s, 'tend-flame');
  assert.equal(s.actions.autoRestart['tend-flame'], true);
});

test('Radiance accrues from XP and can buy Kindling without wiping progress', () => {
  const s = createState({ nowMs: 0, rngSeed: 7 });
  const bankBefore = { ...s.bank };
  const xpBefore = s.skills.emberkeeping.xp;
  grantRadianceFromXp(s, 1 / RADIANCE_PER_XP, 1); // exactly 1 spark
  assert.equal(s.radiance, 1);
  const gate = canUnlock(s, 'kindling');
  assert.equal(gate.ok, true);
  assert.equal(unlockPerk(s, 'kindling').ok, true);
  assert.ok(s.perks.owned.includes('kindling'));
  assert.equal(perkBonus(s, 'xp'), 0.05);
  assert.deepEqual(s.bank, bankBefore, 'no progress wipe');
  assert.equal(s.skills.emberkeeping.xp, xpBefore);
  s.lumen = 100;
  const res = respecPerks(s);
  assert.equal(res.ok, true);
  assert.deepEqual(s.perks.owned, []);
  assert.equal(s.radiance, 1, 'cost refunded, 1-node respec fee in Lumen not Radiance');
});

test('offline Claim absorbs full-window work into playtimeMs', () => {
  const s = createState({ nowMs: 0, rngSeed: 8 });
  s.stats.playtimeMs = 19 * 60_000 + 18_000; // 19m 18s
  s.bank.tinderscrap = 10_000;
  s.actions.active['tend-flame'] = { progressMs: 0 };
  const threeH = 3 * 3_600_000;
  const res = computeOfflineProgress({
    state: s,
    nowMs: threeH,
    lastSavedAt: 0,
    actionsById: ACTIONS_BY_ID,
  });
  assert.equal(res.hasGains, true);
  assert.equal(res.creditedMs, threeH);
  assert.equal(res.nextState.stats.playtimeMs, s.stats.playtimeMs + threeH);
  assert.ok(res.nextState.stats.playtimeMs > s.stats.playtimeMs, 'must not go backwards');
});

test('idle rewind with zero cycles does not inflate playtimeMs', () => {
  const s = createState({ nowMs: 0, rngSeed: 8 });
  s.stats.playtimeMs = 19 * 60_000 + 18_000;
  s.bank.tinderscrap = 0;
  s.actions.active['tend-flame'] = { progressMs: 0 };
  const threeH = 3 * 3_600_000;
  const res = computeOfflineProgress({
    state: s,
    nowMs: threeH,
    lastSavedAt: 0,
    actionsById: ACTIONS_BY_ID,
  });
  assert.equal(res.hasGains, false);
  assert.equal(res.nextState.stats.playtimeMs, s.stats.playtimeMs);
});

test('nextWants always offers three concrete pulls; camp completion is defined', () => {
  const s = createState({ nowMs: 0, rngSeed: 9 });
  ensureDailies(s, Date.UTC(2026, 7, 25));
  const wants = nextWants(s);
  assert.equal(wants.length, 3);
  assert.ok(totalCompletion(s).pct >= 0);
  assert.equal(trueCompletion(s).label, formatCompletionPct(trueCompletion(s).pct));
});

test('old saves migrate v1→v4 and hydrate S2+S1+S4 fields', () => {
  const json = JSON.stringify({
    version: 1,
    savedAt: 1,
    state: { lumen: 20, bank: {}, skills: {}, actions: { active: {}, autoRestart: {}, completed: {} } },
  });
  const { state } = deserializeSave(json);
  assert.equal(state.radiance, 0);
  assert.ok(state.perks);
  assert.deepEqual(state.bankPins, []);
  assert.ok(state.store.pressure);
  assert.equal(state.lanternIntegrity, 100);
  assert.ok(state.combat);
  assert.equal(state.souls, 0);
  assert.equal(state.actions.autoRestart['tend-flame'], true);
  assert.equal(state.stats.beaconsKindled, 1);
});

test('schema v2 saves keep the stall and gain combat + S4 fields', () => {
  const json = JSON.stringify({
    version: 2,
    savedAt: 1,
    state: {
      lumen: 50,
      bankPins: ['fogwort'],
      store: { pressure: { fogwort: 3 }, pressureAt: {} },
      lanternIntegrity: 88,
      cosmetics: { bankTheme: 'dusk', unlocked: ['default', 'dusk'] },
    },
  });
  const { state } = deserializeSave(json);
  assert.equal(state.radiance, 0);
  assert.ok(state.perks);
  assert.ok(state.combat);
  assert.deepEqual(state.bankPins, ['fogwort']);
  assert.equal(state.store.pressure.fogwort, 3);
  assert.equal(state.lanternIntegrity, 88);
  assert.equal(state.cosmetics.bankTheme, 'dusk');
  assert.equal(state.cosmetics.lanternFrame, 'plain');
});

test('main v3 combat saves keep the hunt and gain S4 fields (v3→v4)', () => {
  const json = JSON.stringify({
    version: 3,
    savedAt: 1,
    state: {
      lumen: 40,
      souls: 3,
      beacons: { kindled: ['hearthway'] },
      combat: { fighting: false, zoneId: 'hearthway', kills: { 'pale-moth': 2 } },
      store: { pressure: {}, pressureAt: {} },
    },
  });
  const { state } = deserializeSave(json);
  assert.equal(state.souls, 3);
  assert.equal(state.combat.kills['pale-moth'], 2);
  assert.equal(state.radiance, 0);
  assert.ok(state.perks);
});

test('S4-only v3 saves keep Radiance and gain a combat blob (v3→v4)', () => {
  const json = JSON.stringify({
    version: 3,
    savedAt: 1,
    state: {
      lumen: 22,
      radiance: 7,
      perks: { owned: ['kindling'], respecs: 0 },
      achievements: { unlocked: {} },
    },
  });
  const { state } = deserializeSave(json);
  assert.equal(state.radiance, 7);
  assert.deepEqual(state.perks.owned, ['kindling']);
  assert.ok(state.combat);
  assert.equal(state.souls, 0);
});

test('v4 combat saves keep the hunt and gain leftover-station fields (v4→v5)', () => {
  const json = JSON.stringify({
    version: 4,
    savedAt: 1,
    state: {
      lumen: 40,
      souls: 3,
      beacons: { kindled: ['hearthway'] },
      combat: { fighting: false, zoneId: 'hearthway', kills: { 'pale-moth': 2 } },
      radiance: 1,
      perks: { owned: [], respecs: 0 },
    },
  });
  const { state } = deserializeSave(json);
  assert.equal(state.souls, 3);
  assert.equal(state.combat.kills['pale-moth'], 2);
  assert.equal(state.combat.foodId, null);
  assert.equal(state.combat.lastStation, null);
  assert.ok(Array.isArray(state.combat.lootTray));
  assert.deepEqual(state.discovered, {});
  assert.equal(state.radiance, 1);
});

test('fresh save still round-trips through serialize/deserialize', () => {
  const s = createState({ nowMs: 42, rngSeed: 11 });
  const { state } = deserializeSave(serializeSave(s, 99));
  assert.deepEqual(state, s);
});

test('tick loop grants radiance sparks from live cycles', () => {
  const s = createState({ nowMs: 0, rngSeed: 12 });
  s.bank.tinderscrap = 50;
  startAction(s, 'tend-flame');
  for (let i = 0; i < 80; i++) tickActions(s, 100, createRng(12)); // 8s → 2 cycles
  // 2 × 14 XP × 0.025 = 0.7 sparks — still fractional
  assert.ok(s.radianceFrac > 0 || s.radiance > 0);
  // Push enough XP to overflow a whole spark.
  grantRadianceFromXp(s, 40, 1); // +1 spark
  assert.ok(s.radiance >= 1);
});

test('boot feat cascade grants Cataloguer, Wear a Name, and Write It Down in one eval', () => {
  const s = createState({ nowMs: 0, rngSeed: 1 });
  const newly = cascadeAchievements(s, {
    onUnlock(a) { pushLog(s, `Feat lit: ${a.name}.`, 0); },
  });
  const ids = newly.map((a) => a.id);
  assert.ok(ids.includes('g-known-6'), 'six starter items');
  assert.ok(ids.includes('s-title'), 'auto-equipped title');
  assert.ok(ids.includes('x-journal'), 'journal lines from earlier feats');
  assert.equal(s.lumen, 35, '20 starter +10 Wear a Name +5 Write It Down');
  assert.equal(s.cosmetics.activeTitle, 'Cataloguer');
});

test('feat toasts name the Lumen the wallet just gained', () => {
  assert.equal(featToastMessage(ACHIEVEMENTS_BY_ID['s-title']), 'Feat: Wear a Name. +✦10.');
  assert.equal(featToastMessage(ACHIEVEMENTS_BY_ID['x-journal']), 'Feat: Write It Down. +✦5.');
  assert.equal(featToastMessage(ACHIEVEMENTS_BY_ID['g-known-6']), 'Feat: Six Known Things.');
  assert.equal(
    actionFeatToast('Sold Tinderscrap ×1 for ✦1.', [ACHIEVEMENTS_BY_ID['e-sell-1']]),
    'Sold Tinderscrap ×1 for ✦1. Feat: A Fair Trade. +✦5.',
  );
  assert.equal(actionFeatToast('Sold Tinderscrap ×1 for ✦1.', []), 'Sold Tinderscrap ×1 for ✦1.');
});

test('Kindling changes Tend the Flame from a 14 XP chip to a 15 XP grant', () => {
  const s = createState({ nowMs: 0, rngSeed: 7 });
  const before = actionStatus(s, 'tend-flame');
  assert.equal(before.xpBase, 14);
  assert.equal(before.xpGrant, Math.round(14 * 1.01));
  s.radiance = 1;
  assert.equal(unlockPerk(s, 'kindling').ok, true);
  const after = actionStatus(s, 'tend-flame');
  assert.equal(after.xpGrant, 15);
  assert.ok(after.xpGrant !== after.xpBase);
});

test('Drawn Wick rewrites Tend duration in the same eval (4.0s → 3.9s / cycle)', () => {
  const s = createState({ nowMs: 0, rngSeed: 7 });
  s.radiance = 10;
  const before = actionStatus(s, 'tend-flame');
  assert.equal(before.durationMs, 4000);
  assert.equal(unlockPerk(s, 'kindling').ok, true);
  assert.equal(unlockPerk(s, 'wick-1').ok, true);
  const after = actionStatus(s, 'tend-flame');
  assert.equal(after.durationMs, Math.round(4000 / 1.02));
  assert.equal(after.durationMs, 3922);
  assert.equal(after.durationCause, 'Wick');
});

test('LOG completion uses Skills/Mastery/Items/Feats; tab-open feats do not pad the mean', () => {
  const s = createState({ nowMs: 0, rngSeed: 9 });
  cascadeAchievements(s);
  const before = totalCompletion(s);
  s.achievements.unlocked = {
    ...s.achievements.unlocked,
    ...Object.fromEntries(TAB_OPEN_FEAT_IDS.map((id) => [id, { atMs: 0 }])),
  };
  const rows = logCategoryStats(s);
  assert.deepEqual(rows.map((r) => r.name), ['Skills', 'Mastery', 'Items', 'Feats']);
  const feats = rows.find((r) => r.id === 'feats');
  const items = rows.find((r) => r.id === 'items');
  const mastery = rows.find((r) => r.id === 'mastery');
  assert.equal(items.done, Object.keys(STARTER_BANK).length,
    'fresh Items is Times Found known, not occupancy-as-zero');
  assert.equal(mastery.done, 0, 'unpracticed mastery is 0, not fake 1/99');
  const tot = totalCompletion(s);
  assert.equal(tot.label, before.label, 'tab-open feats must not move the headline');
  assert.equal(tot.pct, before.pct);
  assert.ok(feats.pct < 0.12, `tab-open feats must not pad Feats, got ${feats.pct}`);
  assert.ok(tot.pct < 0.08, `headline must stay a small early %, got ${tot.pct}`);
});

test('practiced mastery 7/1089 prints 0.6%, not 0%, next to Feats', () => {
  const s = createState({ nowMs: 0, rngSeed: 9 });
  const tracks = logCategoryStats(s).find((r) => r.id === 'mastery');
  assert.equal(tracks.done, 0);
  assert.equal(formatCompletionPct(tracks.pct), '0%');

  s.skills.emberkeeping.mastery['tend-flame'] = { xp: 100, level: 3 };
  s.actions.completed['tend-flame'] = 12;
  s.skills.foraging.mastery['gather-herbs'] = { xp: 140, level: 4 };
  s.actions.completed['gather-herbs'] = 20;
  const mastery = logCategoryStats(s).find((r) => r.id === 'mastery');
  assert.equal(mastery.done, 7);
  assert.equal(mastery.total, 1089);
  assert.equal(formatCompletionPct(mastery.pct), '0.6%');
  assert.notEqual(formatCompletionPct(mastery.pct), '0%');
  assert.equal(formatCompletionPct(0.01), '1%');
  assert.equal(formatCompletionPct(0), '0%');
});

test('known items never decrease when the last stack is spent', () => {
  const s = createState({ nowMs: 0, rngSeed: 1 });
  const starterKnown = Object.keys(STARTER_BANK).length;
  assert.equal(logCategoryStats(s).find((r) => r.id === 'items').done, starterKnown);
  assert.equal(Object.keys(s.discovered).length, 0);

  const herbs = ACTIONS_BY_ID['gather-herbs'];
  completeCycle(s, herbs, createRng(1));
  const afterFind = logCategoryStats(s).find((r) => r.id === 'items').done;
  assert.ok(afterFind >= starterKnown, 'live pickup does not un-know the starter pack');
  assert.equal(!!s.discovered.fogwort, true);

  s.bank.fogwort = 1;
  assert.equal(bankPay(s.bank, [{ id: 'fogwort', qty: 1 }]), true);
  assert.equal(s.bank.fogwort, undefined);
  assert.equal(logCategoryStats(s).find((r) => r.id === 'items').done, afterFind);
  assert.equal(s.discovered.fogwort, true);

  markDiscovered(s, 'tinderscrap');
  const mid = logCategoryStats(s).find((r) => r.id === 'items').done;
  s.bank.tinderscrap = 0;
  delete s.bank.tinderscrap;
  assert.equal(logCategoryStats(s).find((r) => r.id === 'items').done, mid);
});

test('fresh save never receives a gated daily (Gather Fungi at Foraging 1)', () => {
  const s = createState({ nowMs: 0, rngSeed: 1 });
  assert.equal(s.skills.foraging.level, 1);
  assert.equal(isDailyProgressable(s, 'fungi-8'), false);
  assert.equal(isDailyProgressable(s, 'tend-8'), true);

  s.dailies = {
    dayKey: '2026-08-25',
    rerollsUsed: 0,
    tasks: [
      { id: 'fungi-8', need: 8, reward: 3, claimed: false, baseline: 0 },
      { id: 'tend-8', need: 8, reward: 2, claimed: false, baseline: 0 },
      { id: 'sit-10', need: 10, reward: 2, claimed: false, baseline: 0 },
    ],
  };
  ensureDailies(s, Date.UTC(2026, 7, 25, 12, 0, 0));
  assert.ok(!s.dailies.tasks.some((t) => t.id === 'fungi-8'),
    'ensureDailies replaces a gated ember already on the board');

  for (let day = 1; day <= 40; day++) {
    const fresh = createState({ nowMs: 0, rngSeed: day });
    const when = Date.UTC(2026, 7, day, 12, 0, 0);
    ensureDailies(fresh, when);
    assert.equal(fresh.dailies.tasks.length, DAILY_TASK_COUNT);
    for (const t of fresh.dailies.tasks) {
      assert.equal(isDailyProgressable(fresh, t.id), true, `${t.id} on day ${day}`);
    }
    const reroll = rerollDailies(fresh, when);
    assert.equal(reroll.ok, true);
    for (const t of fresh.dailies.tasks) {
      if (t.claimed) continue;
      assert.equal(isDailyProgressable(fresh, t.id), true, `reroll ${t.id} on day ${day}`);
    }
  }
});

test('v4 saves gain an empty discovered map (v4→v5)', () => {
  const json = JSON.stringify({
    version: 4,
    savedAt: 1,
    state: {
      lumen: 22,
      bank: { tinderscrap: 12, fogwort: 4 },
      radiance: 3,
    },
  });
  const { state } = deserializeSave(json);
  assert.equal(SAVE_VERSION, 5);
  assert.deepEqual(state.discovered, {});
  assert.equal(state.combat.foodId, null);
  assert.equal(state.combat.lastStation, null);
  assert.ok(Array.isArray(state.combat.lootTray));
  assert.equal(logCategoryStats(state).find((r) => r.id === 'items').done, 2,
    'held stacks floor Times Found so v4 goods stay known');
  assert.equal(state.radiance, 3);
  assert.equal(state.bank.tinderscrap, 12);
  assert.deepEqual(state.bankLocks, []);
  assert.deepEqual(state.stats.itemFound, { tinderscrap: 12, fogwort: 4 });
  assert.deepEqual(state.stats.itemSold, {});
  assert.deepEqual(state.stats.itemLumen, {});
});

test('S4d-only v5 saves keep discovered and gain eat/station defaults without v6', () => {
  const json = JSON.stringify({
    version: 5,
    savedAt: 1,
    state: {
      lumen: 18,
      discovered: { 'pall-fang': true },
      combat: { fighting: false, zoneId: 'hearthway', kills: { 'pale-moth': 1 } },
    },
  });
  const { state } = deserializeSave(json);
  assert.equal(SAVE_VERSION, 5);
  assert.equal(state.discovered['pall-fang'], true);
  assert.equal(state.combat.foodId, null);
  assert.equal(state.combat.lastStation, null);
  assert.ok(Array.isArray(state.combat.lootTray));
  assert.equal(state.combat.kills['pale-moth'], 1);
  assert.deepEqual(state.bankLocks, []);
  assert.deepEqual(state.stats.itemFound, {});
});
