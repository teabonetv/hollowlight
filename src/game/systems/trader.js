// Camp Trader — buy/sell flows over the stocked shelf and the player's bank.
// Pure-with-respect-to-globals; mutates only the passed state; every flow is
// atomic (all-or-nothing) and returns a result object for the UI to toast.
//
// Selling uses the registry sell value via bank.sellItems (the ONE sell path,
// shared with any future general store). Buying pays the shelf cost from
// Lumen — always strictly above sell value, so round-trips lose Lumen
// (see data/trader.js pricing law).

import { ITEMS_BY_ID } from '../data/items.js';
import { TRADER_STOCK, stockCost } from '../data/trader.js';
import { sellItems } from './bank.js';

export { TRADER_STOCK };

/**
 * Sell `qty` of an item to the trader at its registry value.
 * @returns {{ok:true, sold:number, gained:number} | {ok:false, error:string}}
 */
export function sellToTrader(state, itemId, qty) {
  if (!ITEMS_BY_ID[itemId]) return { ok: false, error: 'Unknown item.' };
  return sellItems(state, itemId, qty);
}

/**
 * Buy `qty` of a stocked item from the trader's shelf.
 * @returns {{ok:true, bought:number, spent:number} | {ok:false, error:string}}
 */
export function buyFromTrader(state, itemId, qty = 1) {
  const cost = stockCost(itemId);
  const n = Math.floor(qty);
  if (!Number.isInteger(cost)) return { ok: false, error: 'Not stocked.' };
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'Buy how many?' };
  const total = cost * n;
  if (state.lumen < total) return { ok: false, error: 'Not enough Lumen.' };
  state.lumen -= total;
  state.bank[itemId] = (state.bank[itemId] ?? 0) + n;
  return { ok: true, bought: n, spent: total };
}

/** Total Lumen on the shelf for one unit of each stocked good (UI/tests). */
export function shelfWorth() {
  return TRADER_STOCK.reduce((a, s) => a + s.cost, 0);
}
