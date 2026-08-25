// Back-compat alias for the Wave-0 “Camp Trader” name.
// The General Store (S2) owns pricing; this file re-exports the always-shelf.

import { ITEMS_BY_ID } from './items.js';
import { ALWAYS_STOCK, catalogBuyPrice } from './store.js';

export const TRADER_STOCK = ALWAYS_STOCK.map((id) => ({
  id,
  cost: catalogBuyPrice(ITEMS_BY_ID[id]),
}));

export const TRADER_STOCK_BY_ID = Object.fromEntries(TRADER_STOCK.map((s) => [s.id, s]));

export function stockCost(itemId) {
  return TRADER_STOCK_BY_ID[itemId]?.cost;
}

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
