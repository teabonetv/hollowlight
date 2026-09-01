// S1ak/S1al: Lantern & Wick first two tiers are lumen-only (8 / 16).
// Wick speed spend must not steal Lamp-oil. Clock follows speedMultiplier.
// SAVE_VERSION stays 5. No new track / recipe / item.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/game/state.js';
import { SAVE_VERSION } from '../src/core/save.js';
import { formatSeconds } from '../src/core/format.js';
import { TRACKS_BY_ID, validateTracks } from '../src/game/data/upgrades.js';
import {
  canAffordUpgrade, buyUpgrade, upgradeNeedLabel,
} from '../src/game/systems/upgrades.js';
import { playerOffense } from '../src/game/systems/combat.js';

function wickTier(i) {
  return TRACKS_BY_ID['lantern-wick'].tiers[i];
}

test('SAVE_VERSION stays 5; wick lumen stays strictly ascending', () => {
  assert.equal(SAVE_VERSION, 5);
  assert.deepEqual(validateTracks(), []);
  const lumens = TRACKS_BY_ID['lantern-wick'].tiers.map((t) => t.lumen);
  assert.deepEqual(lumens.slice(0, 2), [8, 16]);
  assert.deepEqual(lumens.slice(2), [200, 450, 1000, 2200]);
});

test('fresh camp: lumen 8 buys Scraped Wicks; wick-knife clock is 2.1s', () => {
  const s = createState({ rngSeed: 1 });
  s.campUpgrades = {};
  s.lumen = 8;
  const tier = wickTier(0);
  assert.equal(tier.name, 'Scraped Wicks');
  assert.deepEqual(tier.items ?? {}, {});
  assert.equal(canAffordUpgrade(s, tier), true);
  assert.equal(buyUpgrade(s, 'lantern-wick').ok, true);
  const speedMs = playerOffense(s, 'strike').speedMs;
  assert.equal(speedMs, Math.round(2200 / 1.05));
  assert.equal(formatSeconds(speedMs), '2.1s');
});

test('wick I: lumen 16 buys Fogwort Dressing; clock is 2.0s', () => {
  const s = createState({ rngSeed: 1 });
  s.campUpgrades = { 'lantern-wick': 1 };
  s.lumen = 16;
  const tier = wickTier(1);
  assert.equal(tier.name, 'Fogwort Dressing');
  assert.deepEqual(tier.items ?? {}, {});
  assert.equal(canAffordUpgrade(s, tier), true);
  assert.equal(buyUpgrade(s, 'lantern-wick').ok, true);
  const speedMs = playerOffense(s, 'strike').speedMs;
  assert.equal(speedMs, Math.round(2200 / 1.10));
  assert.equal(formatSeconds(speedMs), '2.0s');
});

test('unaffordable Need names lumen, not a materials lie', () => {
  const fresh = createState({ rngSeed: 1 });
  fresh.campUpgrades = {};
  fresh.lumen = 7;
  delete fresh.bank['lamp-oil'];
  const t0 = wickTier(0);
  assert.equal(canAffordUpgrade(fresh, t0), false);
  assert.equal(upgradeNeedLabel(fresh, t0), 'Need ✦8');
  assert.doesNotMatch(upgradeNeedLabel(fresh, t0), /Lamp-oil/);

  const owned = createState({ rngSeed: 2 });
  owned.campUpgrades = { 'lantern-wick': 1 };
  owned.lumen = 15;
  delete owned.bank['lamp-oil'];
  const t1 = wickTier(1);
  assert.equal(canAffordUpgrade(owned, t1), false);
  assert.equal(upgradeNeedLabel(owned, t1), 'Need ✦16');
  assert.doesNotMatch(upgradeNeedLabel(owned, t1), /Lamp-oil/);
});
