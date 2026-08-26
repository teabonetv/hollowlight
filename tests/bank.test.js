import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../src/game/data/items.js';
import {
  bankCount, bankAdd, canAfford, bankPay, bankSellValue, sellItems,
  tryBankAdd, uniqueStackCount, lanternRoom, canAcceptStack,
  BASE_LANTERN_ROOM, PACK_FULL_MSG,
} from '../src/game/systems/bank.js';
import { createState, STARTER_BANK } from '../src/game/state.js';
import { itemTimesFound, isItemKnown } from '../src/game/systems/stats.js';
import { knownItemCount, logCategoryStats } from '../src/game/systems/completion.js';
import { formatHollowChip } from '../src/ui/hud.js';
import { applyGains } from '../src/game/systems/action-runner.js';
import { buyFromStore } from '../src/game/systems/store.js';

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

function fillHollow(state, cap = lanternRoom(state)) {
  for (const it of ITEMS) {
    if (uniqueStackCount(state.bank) >= cap) break;
    if ((state.bank[it.id] ?? 0) <= 0) state.bank[it.id] = 1;
  }
  return uniqueStackCount(state.bank);
}

test('lantern hollow starts at 12 and grows with Keeper\'s Satchel, not a slot shop', () => {
  const s = createState({ rngSeed: 1 });
  assert.equal(uniqueStackCount(s.bank), 6, 'starter pack is six kinds');
  assert.equal(lanternRoom(s), BASE_LANTERN_ROOM);
  assert.equal(canAcceptStack(s, 'palecap'), true);
  s.campUpgrades = { 'foraging-satchel': 3 };
  assert.equal(lanternRoom(s), BASE_LANTERN_ROOM + 6);
});

test('Times Found is never 0 for a held stack — starter Rushwick is 5', () => {
  const s = createState({ rngSeed: 1 });
  assert.equal(s.bank.rushwick, STARTER_BANK.rushwick);
  assert.equal(itemTimesFound(s, 'rushwick'), STARTER_BANK.rushwick);
  assert.equal(s.discovered.rushwick, undefined, 'starter is not Almanac-discovered');
  assert.equal(isItemKnown(s, 'rushwick'), true, 'Times Found still makes it known');
  for (const [id, qty] of Object.entries(STARTER_BANK)) {
    assert.equal(itemTimesFound(s, id), qty, `${id} starter Times Found matches held`);
  }
  const grew = tryBankAdd(s, 'rushwick', 3);
  assert.equal(grew.ok, true);
  assert.equal(itemTimesFound(s, 'rushwick'), STARTER_BANK.rushwick + 3);
  assert.equal(itemTimesFound(s, 'palecap'), 0);
  tryBankAdd(s, 'palecap', 10);
  assert.equal(itemTimesFound(s, 'palecap'), 10);
});

test('dumping a unique starter decrements occupancy, not known', () => {
  const s = createState({ rngSeed: 1 });
  const found = itemTimesFound(s, 'lantern-loaf');
  const known = knownItemCount(s);
  const occ = uniqueStackCount(s.bank);
  assert.equal(found, STARTER_BANK['lantern-loaf']);
  assert.equal(known, 6);
  assert.equal(occ, 6);
  const sold = sellItems(s, 'lantern-loaf', found);
  assert.equal(sold.ok, true);
  assert.equal(s.bank['lantern-loaf'], undefined);
  assert.equal(uniqueStackCount(s.bank), 5);
  assert.equal(formatHollowChip(s), 'Hollow 5/12');
  assert.equal(knownItemCount(s), 6);
  assert.equal(logCategoryStats(s).find((r) => r.id === 'items').done, 6);
  assert.equal(itemTimesFound(s, 'lantern-loaf'), found);
  assert.equal(isItemKnown(s, 'lantern-loaf'), true);
  assert.equal(isItemKnown(s, 'palecap'), false);
});

test('unique-stack cap blocks a new kind when full; existing stacks still grow', () => {
  const s = createState({ rngSeed: 2 });
  fillHollow(s);
  assert.equal(uniqueStackCount(s.bank), BASE_LANTERN_ROOM);

  const stranger = ITEMS.find((it) => !s.bank[it.id]);
  assert.ok(stranger, 'registry still has a kind outside the hollow');
  assert.equal(canAcceptStack(s, stranger.id), false);

  const blocked = tryBankAdd(s, stranger.id, 4);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'pack-full');
  assert.equal(blocked.error, PACK_FULL_MSG);
  assert.equal(s.bank[stranger.id], undefined);
  assert.equal(s.discovered[stranger.id], undefined, 'a refused unique is not discovered');

  const beforeTinder = s.bank.tinderscrap;
  const grew = tryBankAdd(s, 'tinderscrap', 5);
  assert.equal(grew.ok, true);
  assert.equal(s.bank.tinderscrap, beforeTinder + 5);
  assert.equal(uniqueStackCount(s.bank), BASE_LANTERN_ROOM);
  assert.equal(s.discovered.tinderscrap, true, 'live grant stamps discovered via bankAdd state');
});

test('gathering a new unique is skipped when the hollow is full', () => {
  const s = createState({ rngSeed: 3 });
  fillHollow(s);
  const stranger = ITEMS.find((it) => !s.bank[it.id]);
  const applied = applyGains(s, [{ kind: 'item', id: stranger.id, qty: 2 }]);
  assert.equal(applied.length, 0);
  assert.equal(applied.packFull, true);
  assert.equal(s.bank[stranger.id], undefined);

  const tinder = applyGains(s, [{ kind: 'item', id: 'tinderscrap', qty: 1 }]);
  assert.equal(tinder[0].qty, 1);
  assert.equal(tinder.packFull, false);
});

test('stall refuses a new unique when the hollow is full; existing kinds still sell through', () => {
  const s = createState({ rngSeed: 4 });
  s.lumen = 500;
  fillHollow(s);
  const stranger = ITEMS.find((it) => !s.bank[it.id] && ['bogmoss', 'palecap', 'peatbrick', 'graveresin', 'tallow-candle'].includes(it.id));
  assert.ok(stranger);
  const buyNew = buyFromStore(s, stranger.id, 1);
  assert.equal(buyNew.ok, false);
  assert.match(buyNew.error ?? '', /hollow is full/i);
  assert.equal(s.bank[stranger.id], undefined);

  const buyOld = buyFromStore(s, 'tinderscrap', 1);
  assert.equal(buyOld.ok, true);
});

test('selling a stack opens a hollow for a new kind', () => {
  const s = createState({ rngSeed: 5 });
  fillHollow(s);
  const evicted = Object.keys(s.bank).find((id) => id !== 'tinderscrap');
  delete s.bank[evicted];
  const stranger = ITEMS.find((it) => !s.bank[it.id]);
  const res = tryBankAdd(s, stranger.id, 1);
  assert.equal(res.ok, true);
  assert.equal(s.bank[stranger.id], 1);
  assert.equal(s.discovered[stranger.id], true);
});
