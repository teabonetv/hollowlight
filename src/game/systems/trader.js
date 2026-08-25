// Camp Trader alias — buy/sell go through the General Store / bank sell path.

import { ITEMS_BY_ID } from '../data/items.js';
import { TRADER_STOCK } from '../data/trader.js';
import { sellItems } from './bank.js';
import { buyFromStore } from './store.js';

export { TRADER_STOCK };

export function sellToTrader(state, itemId, qty) {
  if (!ITEMS_BY_ID[itemId]) return { ok: false, error: 'Unknown item.' };
  return sellItems(state, itemId, qty);
}

export function buyFromTrader(state, itemId, qty = 1) {
  return buyFromStore(state, itemId, qty);
}

export function shelfWorth() {
  return TRADER_STOCK.reduce((a, s) => a + s.cost, 0);
}
