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

// ── selling (F1c economy sink) ────────────────────────────────────

/**
 * Selling stacks larger than this via "Sell All" demands a confirm tap.
 * Pure policy constant so UI and tests agree on the threshold.
 */
export const SELL_CONFIRM_THRESHOLD = 25;

export function needsSellConfirm(qty) {
  return qty > SELL_CONFIRM_THRESHOLD;
}

/**
 * Sell `qty` of `itemId` from the bank at its registry sell value.
 * Mutates state (bank + lumen). Returns
 *   { ok:true, sold, gained } | { ok:false, error }
 * Sells at most what the stack holds; qty ≤ 0 or an empty stack fails
 * cleanly with no mutation.
 */
export function sellItems(state, itemId, qty) {
  const item = ITEMS_BY_ID[itemId];
  if (!item) return { ok: false, error: 'Unknown item.' };
  const owned = bankCount(state.bank, itemId);
  const n = Math.min(Math.floor(qty), owned);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: owned <= 0 ? 'None to sell.' : 'Nothing to sell.' };
  }
  state.bank[itemId] -= n;
  if (state.bank[itemId] === 0) delete state.bank[itemId]; // tidy saves
  const gained = n * item.sell;
  state.lumen += gained;
  return { ok: true, sold: n, gained };
}
