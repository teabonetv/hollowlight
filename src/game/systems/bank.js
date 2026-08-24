// Bank operations. The bank is a plain { itemId -> count } map inside the
// game state. Payments are atomic: either every cost is affordable or nothing
// is taken — no partial pays, ever.

import { ITEMS_BY_ID } from '../data/items.js';

export function bankCount(bank, itemId) {
  return bank[itemId] ?? 0;
}

export function bankAdd(bank, itemId, qty) {
  if (!Number.isFinite(qty) || qty <= 0) return;
  bank[itemId] = (bank[itemId] ?? 0) + Math.floor(qty);
}

export function canAfford(bank, costs) {
  if (!costs || costs.length === 0) return true;
  return costs.every((c) => bankCount(bank, c.id) >= c.qty);
}

/**
 * Deduct every cost or none. Returns false (untouched) when unaffordable.
 */
export function bankPay(bank, costs) {
  if (!canAfford(bank, costs)) return false;
  for (const c of costs ?? []) {
    bank[c.id] -= c.qty;
    if (bank[c.id] === 0) delete bank[c.id]; // keep saves tidy of zero-stacks
  }
  return true;
}

/** Total Lumen value of a bank snapshot (for the bank screen header). */
export function bankSellValue(bank) {
  let total = 0;
  for (const [id, qty] of Object.entries(bank)) total += (ITEMS_BY_ID[id]?.sell ?? 0) * qty;
  return total;
}
