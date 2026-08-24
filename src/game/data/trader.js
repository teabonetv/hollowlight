// Camp Trader — the Wave-0 economy faucet/sink pair (pre-S2 scope: NOT the
// full general store). The trader buys ANY gathered good at its item sell
// value (`items.js`), and sells back a small stocked shelf of consumables
// players always want more of.
//
// Pricing law (see balance-notes.md §Camp Trader):
//   buyPrice(item) ≈ 2–2.5 × sellPrice(item)
// so converting Lumen → goods → Lumen always LOSES Lumen. The trader is a
// convenience, never an arbitrage engine.

import { ITEMS_BY_ID } from './items.js';

/** Stocked shelf: id → Lumen cost per unit. Only ever stock real items. */
export const TRADER_STOCK = [
  { id: 'tinderscrap', cost: 3 },   // sells 1  — emergency tinder for Ek loops
  { id: 'bogmoss',     cost: 5 },   // sells 2
  { id: 'rushwick',    cost: 5 },   // sells 2  — future chandlercraft feedstock
  { id: 'fogwort',     cost: 6 },   // sells 3
  { id: 'palecap',     cost: 8 },   // sells 4
  { id: 'graveresin',  cost: 13 },  // sells 6  — Fan-the-Coals fuel, early gate
];

export const TRADER_STOCK_BY_ID = Object.fromEntries(TRADER_STOCK.map((s) => [s.id, s]));

export function stockCost(itemId) {
  return TRADER_STOCK_BY_ID[itemId]?.cost;
}

/** Guard so a bad data row can never ship silently. */
export function validateStock() {
  const errors = [];
  for (const s of TRADER_STOCK) {
    const item = ITEMS_BY_ID[s.id];
    if (!item) errors.push(`stock ${s.id}: unknown item`);
    else if (!Number.isInteger(s.cost) || s.cost <= item.sell) {
      errors.push(`stock ${s.id}: cost ${s.cost} must be an integer > sell (${item.sell})`);
    }
  }
  return errors;
}
