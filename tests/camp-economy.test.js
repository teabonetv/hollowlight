// F1c economy sink: Keeper's Camp upgrade tracks + selling.
// Covers purchase math (atomicity, gating), effect math, the REAL math paths
// (action timing, output rolls, XP grants, offline calc), selling flows, and
// save round-trips.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { TICK_MS } from '../src/core/tick-loop.js';
import { createState } from '../src/game/state.js';
import {
  TRACKS, TRACKS_BY_ID, validateTracks, trackLumenTotal,
} from '../src/game/data/upgrades.js';
import {
  upgradeLevel, nextTier, costChips, canAffordUpgrade, buyUpgrade,
  trackEffectFraction, speedMultiplier, yieldChance, xpMultiplier,
  effectiveDurationMs,
} from '../src/game/systems/upgrades.js';
import {
  sellItems, needsSellConfirm, SELL_CONFIRM_THRESHOLD,
} from '../src/game/systems/bank.js';
import {
  startAction, tickActions, rollOutputs, completeCycle, actionStatus,
} from '../src/game/systems/action-runner.js';
import { computeOfflineProgress } from '../src/core/offline.js';
import { ACTIONS_BY_ID } from '../src/game/data/actions.js';
import { serializeSave, deserializeSave } from '../src/core/save.js';

function fundTier(state, trackId, tierIndex) {
  const tier = TRACKS_BY_ID[trackId].tiers[tierIndex];
  state.lumen += tier.lumen;
  for (const [id, qty] of Object.entries(tier.items ?? {})) {
    state.bank[id] = (state.bank[id] ?? 0) + qty;
  }
}

// ── data sanity ───────────────────────────────────────────────────

test('track data validates: three tracks, six tiers, ascending ~geometric costs', () => {
  assert.deepEqual(validateTracks(), [], 'no data errors');
  assert.equal(TRACKS.length, 3);
  for (const t of TRACKS) {
    assert.equal(t.tiers.length, 6, `${t.id}: six tiers`);
    for (let i = 1; i < t.tiers.length; i++) {
      const ratio = t.tiers[i].lumen / t.tiers[i - 1].lumen;
      assert.ok(ratio >= 2.0 && ratio <= 2.9,
        `${t.id}: tier ${i} ratio ${ratio.toFixed(2)} outside 2.0–2.9`);
    }
    // Every tier costs MATERIALS too — goods must be sinks, not just Lumen.
    for (const [i, tier] of t.tiers.entries()) {
      assert.ok(tier.items && Object.keys(tier.items).length >= 1,
        `${t.id}: tier ${i} must include material costs`);
      assert.ok(tier.name && tier.flavor, `${t.id}: tier ${i} needs name + flavor`);
    }
  }
});

test('full-track Lumen totals sit in the hours–days band (14k ± 4k across tracks)', () => {
  const total = TRACKS.reduce((s, t) => s + trackLumenTotal(t), 0);
  assert.ok(total >= 10_000 && total <= 18_000, `total ${total}`);
});

// ── purchase math ────────────────────────────────────────────────

test('buying a tier pays Lumen AND materials atomically and levels the track', () => {
  const s = createState({ rngSeed: 1 });
  fundTier(s, 'ember-altar', 0);
  const beforeLumen = s.lumen;
  const beforeItems = { ...s.bank };

  const res = buyUpgrade(s, 'ember-altar');
  assert.equal(res.ok, true);
  assert.equal(upgradeLevel(s, 'ember-altar'), 1);
  assert.equal(s.lumen, beforeLumen - TRACKS_BY_ID['ember-altar'].tiers[0].lumen);
  for (const [id, qty] of Object.entries(TRACKS_BY_ID['ember-altar'].tiers[0].items)) {
    assert.equal(s.bank[id] ?? 0, (beforeItems[id] ?? 0) - qty);
  }
});

test('failed buys leave state untouched — no partial payments ever', () => {
  const s = createState({ rngSeed: 2 });

  // Not enough Lumen (materials present).
  const tier = TRACKS_BY_ID['lantern-wick'].tiers[0];
  for (const [id, qty] of Object.entries(tier.items)) s.bank[id] = (s.bank[id] ?? 0) + qty;
  s.lumen = tier.lumen - 1;
  assert.equal(buyUpgrade(s, 'lantern-wick').ok, false);
  assert.equal(s.lumen, tier.lumen - 1, 'lumen untouched');
  assert.equal(upgradeLevel(s, 'lantern-wick'), 0);

  // Enough Lumen, short on a material.
  s.lumen = 10_000;
  delete s.bank[tinderKey(tier)];
  assert.equal(buyUpgrade(s, 'lantern-wick').ok, false);
  assert.equal(s.lumen, 10_000, 'lumen untouched when materials are short');
  assert.equal(upgradeLevel(s, 'lantern-wick'), 0);

  function tinderKey(t) { return Object.keys(t.items)[0]; }
});

test('tiers gate strictly in order and completed tracks refuse more buys', () => {
  const s = createState({ rngSeed: 3 });
  const track = TRACKS_BY_ID['foraging-satchel'];
  for (let i = 0; i < track.tiers.length; i++) {
    fundTier(s, 'foraging-satchel', i);
    assert.deepEqual(nextTier(s, 'foraging-satchel').index, i, `next tier is ${i}`);
    const res = buyUpgrade(s, 'foraging-satchel');
    assert.equal(res.ok, true, `tier ${i} purchasable in order`);
    assert.equal(res.level, i + 1);
  }
  assert.equal(nextTier(s, 'foraging-satchel'), null, 'maxed');
  assert.equal(buyUpgrade(s, 'foraging-satchel').ok, false, 'maxed refuses buys');

  // A fresh track still gates: its FIRST purchasable tier is index 0 only.
  const fresh = createState({ rngSeed: 4 });
  assert.deepEqual(nextTier(fresh, 'foraging-satchel').index, 0);
});

test('costChips normalizes Lumen + named materials for UI/tests', () => {
  const chips = costChips(TRACKS_BY_ID['ember-altar'].tiers[2]);
  assert.equal(chips[0].id, 'lumen');
  assert.equal(chips[0].qty, 320);
  assert.ok(chips.slice(1).every((c) => c.name && c.name !== c.id || ITEMS_NAMES.has(c.id)));
  const ITEMS_NAMES = new Set(['graveresin', 'fogwort']);
  assert.ok(chips.some((c) => c.id === 'graveresin'));
});

// ── effect math ──────────────────────────────────────────────────

test('effect fractions accumulate per tier and respect their caps', () => {
  const s = createState({ rngSeed: 5 });
  assert.equal(speedMultiplier(s), 1);
  assert.equal(yieldChance(s), 0);
  assert.equal(xpMultiplier(s), 1);

  s.campUpgrades = { 'lantern-wick': 3, 'foraging-satchel': 2, 'ember-altar': 1 };
  assert.equal(trackEffectFraction(s, TRACKS_BY_ID['lantern-wick']), 0.15);
  assert.equal(trackEffectFraction(s, TRACKS_BY_ID['foraging-satchel']), 0.08);
  assert.equal(trackEffectFraction(s, TRACKS_BY_ID['ember-altar']), 0.03);

  // Caps hold even against impossible levels (corrupt/migrated saves).
  s.campUpgrades = { 'lantern-wick': 99, 'foraging-satchel': 99, 'ember-altar': 99 };
  assert.equal(trackEffectFraction(s, TRACKS_BY_ID['lantern-wick']), 0.30);
  assert.equal(trackEffectFraction(s, TRACKS_BY_ID['foraging-satchel']), 0.35);
  assert.equal(trackEffectFraction(s, TRACKS_BY_ID['ember-altar']), 0.18);
  assert.equal(xpMultiplier(s), 1.18);
});

test('effective duration divides by speed and matches actionStatus', () => {
  const s = createState({ rngSeed: 6 });
  const tend = ACTIONS_BY_ID['tend-flame'];
  s.campUpgrades = { 'lantern-wick': 6 }; // ×1.30
  const expected = Math.round(tend.durationMs / 1.30); // 4000/1.3 ≈ 3077
  assert.equal(effectiveDurationMs(s, tend), expected);
  assert.equal(actionStatus(s, 'tend-flame').durationMs, expected);
});

test('reads tolerate pre-F1c saves without a campUpgrades field', () => {
  const s = createState({ rngSeed: 7 });
  delete s.campUpgrades;
  assert.equal(upgradeLevel(s, 'ember-altar'), 0);
  assert.equal(buyUpgrade(s, 'nope-track').ok, false);
  s.lumen = 999;
  delete s.bank.tinderscrap; // altar tier 1 needs 15
  assert.equal(canAffordUpgrade(s, TRACKS_BY_ID['ember-altar'].tiers[0]), false,
    'short on materials still unaffordable without the field');
});

// ── effects thread through REAL engine paths ─────────────────────

test('satchel bonus-unit rolls apply to ITEM outputs only, deterministically', () => {
  const herbs = ACTIONS_BY_ID['gather-herbs'];
  const alwaysYes = { chance: () => true, int: () => 0 };
  const base = rollOutputs(herbs, alwaysYes);
  const boosted = rollOutputs(herbs, alwaysYes, { extraYieldChance: 0.24 });
  const sum = (gains) => gains.filter((g) => g.kind === 'item')
    .reduce((n, g) => n + g.qty, 0);
  assert.equal(sum(boosted), sum(base) + 3,
    'all three item outputs (fogwort/resin/tinder) roll one bonus unit');
  // Non-item outputs unchanged.
  assert.deepEqual(
    boosted.filter((g) => g.kind !== 'item'),
    base.filter((g) => g.kind !== 'item'));
});

test('Ember Altar raises live XP grants through completeCycle', () => {
  function run(altarLevel) {
    const s = createState({ rngSeed: 11 });
    if (altarLevel) s.campUpgrades = { 'ember-altar': altarLevel };
    startAction(s, 'gather-herbs');
    completeCycle(s, ACTIONS_BY_ID['gather-herbs'], createRng(42));
    return s.skills.foraging.xp;
  }
  const baseXp = run(0);            // round(16 × 1.01) = 16
  const boostedXp = run(6);         // round(16 × 1.01 × 1.18) = 19
  assert.equal(baseXp, Math.round(16 * 1.01));
  assert.equal(boostedXp, Math.round(16 * 1.01 * 1.18));
  assert.ok(boostedXp > baseXp);
});

test('Lantern & Wick speeds up live ticking (more cycles per window)', () => {
  function cyclesAt(wickLevel) {
    const s = createState({ rngSeed: 12 });
    if (wickLevel) s.campUpgrades = { 'lantern-wick': wickLevel };
    startAction(s, 'tend-flame'); // 4000ms base; needs tinder (starter has 30)
    const rng = createRng(99);
    let cycles = 0;
    for (let i = 0; i < 60_000 / TICK_MS; i++) {
      cycles += tickActions(s, TICK_MS, rng).filter((e) => e.type === 'cycle').length;
    }
    return cycles;
  }
  const base = cyclesAt(0);   // 60000/4000 = 15
  const fast = cyclesAt(6);   // 60000/round(4000/1.3)=3077 → 19
  assert.equal(base, 15);
  assert.equal(fast, 19);
});

test('offline honors both speed (completions) and XP multiplier identically to live', () => {
  const s = createState({ rngSeed: 13 });
  s.campUpgrades = { 'lantern-wick': 6, 'ember-altar': 6 };
  startAction(s, 'tend-flame');
  const res = computeOfflineProgress({
    state: s, nowMs: 60_000, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  const line = res.gains.actions.find((a) => a.actionId === 'tend-flame');
  const dur = effectiveDurationMs(res.nextState, ACTIONS_BY_ID['tend-flame']);
  assert.equal(line.completions, Math.floor(60_000 / dur));
  const expectedPerCycle = Math.round(14 * 1.01 * 1.18);
  assert.equal(line.xp, expectedPerCycle * line.completions);
});

// ── selling ──────────────────────────────────────────────────────

test('selling pays registry value, updates lumen, tidies empty stacks', () => {
  const s = createState({ rngSeed: 21 });
  s.bank.fogwort = 10; // sells 3 each
  const res = sellItems(s, 'fogwort', 4);
  assert.equal(res.ok, true);
  assert.equal(res.sold, 4);
  assert.equal(res.gained, 12);
  assert.equal(s.bank.fogwort, 6);
  assert.equal(s.lumen, 20 + 12);

  const last = sellItems(s, 'fogwort', 99);
  assert.equal(last.ok, true);
  assert.equal(last.sold, 6);
  assert.equal(last.gained, 18);
  assert.equal(s.bank.fogwort, undefined, 'zero stacks are removed from the save');
});

test('selling rejects unknown items and empty stacks cleanly', () => {
  const s = createState({ rngSeed: 22 });
  assert.equal(sellItems(s, 'not-an-item', 1).ok, false);
  assert.equal(sellItems(s, 'palecap', 1).ok, false, 'nothing owned');
  assert.equal(sellItems(s, 'fogwort', 0).ok, false);
  assert.equal(s.lumen, 20, 'failed sells never pay');
});

test('sell-all confirm threshold sits above 25 stacks', () => {
  assert.equal(SELL_CONFIRM_THRESHOLD, 25);
  assert.equal(needsSellConfirm(25), false);
  assert.equal(needsSellConfirm(26), true);
  assert.equal(needsSellConfirm(3300), true);
});

// ── save integrity ───────────────────────────────────────────────

test('save round-trip preserves purchased upgrades and post-sale banks', () => {
  const s = createState({ rngSeed: 31 });
  fundTier(s, 'lantern-wick', 0);
  buyUpgrade(s, 'lantern-wick');
  sellItems(s, 'fogwort', 2);
  const json = serializeSave(s, 1000);
  const { state: back } = deserializeSave(json);
  assert.deepEqual(back.campUpgrades, { 'lantern-wick': 1 });
  assert.deepEqual(back, s, 'whole-state equality across the save boundary');
});
