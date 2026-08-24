import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bankCount, bankAdd, canAfford, bankPay, bankSellValue,
} from '../src/game/systems/bank.js';

const TINDER = [{ id: 'tinderscrap', qty: 1 }];
const MIXED = [
  { id: 'tinderscrap', qty: 2 },
  { id: 'graveresin', qty: 1 },
];

test('add + count accumulate; unknown ids read as zero', () => {
  const b = {};
  assert.equal(bankCount(b, 'fogwort'), 0);
  bankAdd(b, 'fogwort', 2);
  bankAdd(b, 'fogwort', 3);
  assert.equal(bankCount(b, 'fogwort'), 5);
});

test('bankPay is all-or-nothing on multi-cost payments', () => {
  const b = { tinderscrap: 5, graveresin: 1 };
  assert.equal(canAfford(b, MIXED), true);
  assert.equal(bankPay(b, MIXED), true);
  assert.deepEqual(b, { tinderscrap: 3 });

  // Now insufficient resin: must not deduct tinder either.
  b.tinderscrap = 50;
  b.graveresin = 0;
  assert.equal(canAfford(b, MIXED), false);
  assert.equal(bankPay(b, MIXED), false);
  assert.equal(b.tinderscrap, 50, 'atomic: nothing taken when short');
});

test('paying to exactly zero removes the key (tidy saves)', () => {
  const b = { tinderscrap: 1 };
  bankPay(b, TINDER);
  assert.deepEqual(b, {});
});

test('empty/absent cost lists are always affordable', () => {
  assert.equal(canAfford({}, []), true);
  assert.equal(canAfford({}, undefined), true);
  assert.equal(bankPay({}, undefined), true);
});

test('bankSellValue sums sell prices across stacks', () => {
  // fogwort sells 3, palecap sells 4 → 3*2 + 4*1 = 10
  const b = { fogwort: 2, palecap: 1 };
  assert.equal(bankSellValue(b), 10);
});
