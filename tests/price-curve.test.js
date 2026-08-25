// S2 price curve: selling pressure lowers unit price toward a floor;
// pressure recovers exponentially over playtime (not wall-clock).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUY_MULT, SELL_FLOOR_FRAC, PRESSURE_PER_UNIT, PRESSURE_CAP, RECOVERY_HALF_LIFE_MS,
  sellFloor, sellUnitPrice, buyUnitPrice, recoveredPressure, catalogBuyPrice,
  rareStockAt, RARE_ROTATE_MS, validateStoreCatalog, KINDLING_BUNDLE,
} from '../src/game/data/store.js';
import { createState } from '../src/game/state.js';
import { sellItems } from '../src/game/systems/bank.js';
import {
  currentPressure, liveSellUnit, liveBuyUnit, buyFromStore, buyKindlingBundle,
  addSellPressure, currentShelfIds,
} from '../src/game/systems/store.js';
import { ITEMS_BY_ID } from '../src/game/data/items.js';

test('store catalog validates: always-stock buy > sell, bundle has no unpack arbitrage', () => {
  assert.deepEqual(validateStoreCatalog(), []);
  assert.ok(KINDLING_BUNDLE.cost > 8 * ITEMS_BY_ID.tinderscrap.sell);
});

test('sell unit at 0 pressure equals registry sell; floor is 40%', () => {
  assert.equal(sellUnitPrice(10, 0), 10);
  assert.equal(sellFloor(10), 4);
  assert.equal(sellUnitPrice(10, PRESSURE_CAP), 4);
  assert.equal(sellUnitPrice(1, 1), 1, 'tinder never pays 0');
});

test('buy unit stays strictly above live sell (no round-trip profit)', () => {
  for (const p of [0, 0.2, 0.5, PRESSURE_CAP]) {
    const sell = sellUnitPrice(6, p);
    const buy = buyUnitPrice(6, p, catalogBuyPrice({ sell: 6 }));
    assert.ok(buy > sell, `pressure ${p}: buy ${buy} > sell ${sell}`);
  }
  const tinderBuy = catalogBuyPrice(ITEMS_BY_ID.tinderscrap);
  assert.equal(tinderBuy, 2, 'emergency tinder is ✦2');
  assert.ok(tinderBuy > ITEMS_BY_ID.tinderscrap.sell);
});

test('pressure recovers with half-life over playtime', () => {
  assert.equal(recoveredPressure(0.4, 0), 0.4);
  const half = recoveredPressure(0.4, RECOVERY_HALF_LIFE_MS);
  assert.ok(Math.abs(half - 0.2) < 1e-9);
  const none = recoveredPressure(0.4, RECOVERY_HALF_LIFE_MS * 20);
  assert.ok(none < 1e-6);
});

test('selling a stack snapshots unit then adds pressure; next sale pays less', () => {
  const s = createState({ rngSeed: 1 });
  s.bank.fogwort = 50;
  const first = sellItems(s, 'fogwort', 10); // 10 × 0.02 = 0.20 pressure after
  assert.equal(first.gained, 10 * 3);
  assert.ok(currentPressure(s, 'fogwort') > 0.19 && currentPressure(s, 'fogwort') < 0.21);
  const unit2 = liveSellUnit(s, 'fogwort');
  assert.equal(unit2, sellUnitPrice(3, currentPressure(s, 'fogwort')));
  assert.ok(unit2 <= 3);
  const second = sellItems(s, 'fogwort', 1);
  assert.equal(second.gained, unit2);
});

test('pressure recovers when playtime advances without further sells', () => {
  const s = createState({ rngSeed: 2 });
  addSellPressure(s, 'fogwort', 10, 0); // 0.2 at t=0
  s.stats.playtimeMs = RECOVERY_HALF_LIFE_MS;
  const p = currentPressure(s, 'fogwort');
  assert.ok(Math.abs(p - 0.1) < 1e-9, `half-life recovery got ${p}`);
});

test('kindling bundle grants 8 tinder and spends 12 Lumen', () => {
  const s = createState({ rngSeed: 3 });
  s.lumen = 12;
  const before = s.bank.tinderscrap;
  const res = buyKindlingBundle(s);
  assert.equal(res.ok, true);
  assert.equal(s.lumen, 0);
  assert.equal(s.bank.tinderscrap, before + 8);
});

test('buying from the stall spends live buy and stocks the bank', () => {
  const s = createState({ rngSeed: 4 });
  s.lumen = 100;
  const unit = liveBuyUnit(s, 'tinderscrap');
  const res = buyFromStore(s, 'tinderscrap', 5);
  assert.equal(res.ok, true);
  assert.equal(res.spent, unit * 5);
  assert.equal(s.bank.tinderscrap, 30 + 5);
});

test('unlisted rares cannot be bought unless the rotation includes them', () => {
  const s = createState({ rngSeed: 5 });
  s.lumen = 10_000;
  const shelf = currentShelfIds(s);
  assert.ok(shelf.includes('tinderscrap'));
  const off = Object.keys(ITEMS_BY_ID).find((id) => !shelf.includes(id));
  assert.ok(off);
  assert.equal(buyFromStore(s, off, 1).ok, false);
});

test('rare shelf is deterministic in a playtime epoch and changes after rotate window', () => {
  const a = rareStockAt(0);
  const b = rareStockAt(RARE_ROTATE_MS - 1);
  const c = rareStockAt(RARE_ROTATE_MS);
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  assert.notDeepEqual(a, c);
});

test('BUY_MULT is the documented 2.25', () => {
  assert.equal(BUY_MULT, 2.25);
  assert.equal(SELL_FLOOR_FRAC, 0.40);
  assert.equal(PRESSURE_PER_UNIT, 0.02);
});
