// S1al: Press Lamp-oil → Hunt is fed. The lantern drinks Lamp-oil first.
// Wick speed spend (✦8 / ✦16) must not steal the flask.
// SAVE_VERSION stays 5. No new track / recipe / item.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/game/state.js';
import { SAVE_VERSION } from '../src/core/save.js';
import { OILS, OIL_ORDER } from '../src/game/data/combat/consumables.js';
import { buyUpgrade } from '../src/game/systems/upgrades.js';
import * as combat from '../src/game/systems/combat.js';

function oilOnly(state, { lamp = 0, wick = 0 } = {}) {
  state.bank['lamp-oil'] = lamp;
  state.bank['wick-oil'] = wick;
}

test('SAVE_VERSION stays 5; lantern prefers Lamp-oil (16s) then Wick-oil (8s)', () => {
  assert.equal(SAVE_VERSION, 5);
  assert.deepEqual(OIL_ORDER, ['lamp-oil', 'wick-oil']);
  assert.equal(OILS['lamp-oil'].intervalMs, 16000);
  assert.equal(OILS['wick-oil'].intervalMs, 8000);
});

test('A: 1 lamp-oil, 0 wick-oil — Hunt starts fed; sip drinks Lamp-oil for 16s', () => {
  const s = createState({ rngSeed: 1 });
  oilOnly(s, { lamp: 1, wick: 0 });
  assert.ok(combat.oilSipsRemaining(s) >= 1);
  combat.startFight(s, 'fog-rat', { encounterSeed: 1 });
  assert.equal(s.combat.lanternDry, false);
  const interval = combat.consumeOilSip(s);
  assert.equal(interval, 16000);
  assert.equal(s.bank['lamp-oil'] ?? 0, 0);
  assert.equal(s.bank['wick-oil'] ?? 0, 0);
});

test('B: 1 lamp-oil + 1 wick-oil — first sip is Lamp-oil, not Wick-oil', () => {
  const s = createState({ rngSeed: 2 });
  oilOnly(s, { lamp: 1, wick: 1 });
  combat.startFight(s, 'fog-rat', { encounterSeed: 1 });
  assert.equal(s.combat.lanternDry, false);
  const interval = combat.consumeOilSip(s);
  assert.equal(interval, 16000);
  assert.equal(s.bank['lamp-oil'] ?? 0, 0);
  assert.equal(s.bank['wick-oil'], 1);
});

test('C: 0 oils — startFight lanternDry; Need/dry path unchanged', () => {
  const s = createState({ rngSeed: 3 });
  oilOnly(s, { lamp: 0, wick: 0 });
  assert.equal(combat.oilSipsRemaining(s), 0);
  combat.startFight(s, 'fog-rat', { encounterSeed: 1 });
  assert.equal(s.combat.lanternDry, true);
  assert.equal(combat.lanternIsFed(s), false);
  const st = combat.combatStatus(s);
  assert.equal(st.lanternFed, false);
  assert.ok(s.combat.log.some((l) => /lantern is dry|goes dry/i.test(l.text)));
});

test('D: lumen 8 buys Scraped Wicks and leaves lamp-oil; Hunt still drinks it', () => {
  const s = createState({ rngSeed: 4 });
  s.campUpgrades = {};
  s.lumen = 8;
  oilOnly(s, { lamp: 1, wick: 0 });
  assert.equal(buyUpgrade(s, 'lantern-wick').ok, true);
  assert.equal(s.bank['lamp-oil'], 1, 'wick spend must not steal the flask');
  assert.ok(combat.oilSipsRemaining(s) >= 1);
  combat.startFight(s, 'fog-rat', { encounterSeed: 1 });
  assert.equal(s.combat.lanternDry, false);
  const interval = combat.consumeOilSip(s);
  assert.equal(interval, 16000);
  assert.equal(s.bank['lamp-oil'] ?? 0, 0);
});
