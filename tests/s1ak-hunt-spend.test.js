// S1ak: Hunt spend is Lamp-oil. Lantern & Wick first two tiers
// consume pressed oil; wick-knife blow clock follows speedMultiplier.
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

test('fresh camp: 1 lamp-oil + lumen 8 buys Scraped Wicks; wick-knife clock is 2.1s', () => {
  const s = createState({ rngSeed: 1 });
  s.campUpgrades = {};
  s.lumen = 8;
  s.bank['lamp-oil'] = 1;
  const tier = wickTier(0);
  assert.equal(tier.name, 'Scraped Wicks');
  assert.equal(canAffordUpgrade(s, tier), true);
  assert.equal(buyUpgrade(s, 'lantern-wick').ok, true);
  const speedMs = playerOffense(s, 'strike').speedMs;
  assert.equal(speedMs, Math.round(2200 / 1.05));
  assert.equal(formatSeconds(speedMs), '2.1s');
});

test('wick I: 1 lamp-oil + lumen 16 buys Fogwort Dressing; clock is 2.0s', () => {
  const s = createState({ rngSeed: 1 });
  s.campUpgrades = { 'lantern-wick': 1 };
  s.lumen = 16;
  s.bank['lamp-oil'] = 1;
  const tier = wickTier(1);
  assert.equal(tier.name, 'Fogwort Dressing');
  assert.equal(canAffordUpgrade(s, tier), true);
  assert.equal(buyUpgrade(s, 'lantern-wick').ok, true);
  const speedMs = playerOffense(s, 'strike').speedMs;
  assert.equal(speedMs, Math.round(2200 / 1.10));
  assert.equal(formatSeconds(speedMs), '2.0s');
});

test('same states without lamp-oil: unaffordable; Need names Lamp-oil not a lumen lie', () => {
  const fresh = createState({ rngSeed: 1 });
  fresh.campUpgrades = {};
  fresh.lumen = 8;
  delete fresh.bank['lamp-oil'];
  const t0 = wickTier(0);
  assert.equal(canAffordUpgrade(fresh, t0), false);
  assert.equal(upgradeNeedLabel(fresh, t0), 'Need Lamp-oil ×1');
  assert.doesNotMatch(upgradeNeedLabel(fresh, t0), /Need ✦/);

  const owned = createState({ rngSeed: 2 });
  owned.campUpgrades = { 'lantern-wick': 1 };
  owned.lumen = 16;
  delete owned.bank['lamp-oil'];
  const t1 = wickTier(1);
  assert.equal(canAffordUpgrade(owned, t1), false);
  assert.equal(upgradeNeedLabel(owned, t1), 'Need Lamp-oil ×1');
  assert.doesNotMatch(upgradeNeedLabel(owned, t1), /Need ✦/);
});
