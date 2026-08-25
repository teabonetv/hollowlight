// F1d Fix 2 — Sell All two-tap confirm state.
//
// The confirm lives HERE, keyed by item id with a deadline — never in the
// DOM. Any number of re-renders, repaints, or even a full re-open of the
// sheet inside the window reflects the same pending confirmation, so a live
// update can no longer silently swallow it before the player's second tap
// lands. The two-tap safety above SELL_CONFIRM_THRESHOLD stays by design.

const pendingSellConfirms = new Map(); // itemId -> deadline (ms epoch)

export const SELL_CONFIRM_WINDOW_MS = 6000;

export function sellConfirmPending(itemId, nowMs = Date.now()) {
  const deadline = pendingSellConfirms.get(itemId);
  if (deadline === undefined) return false;
  if (deadline <= nowMs) { pendingSellConfirms.delete(itemId); return false; }
  return true;
}

export function clearSellConfirm(itemId) {
  pendingSellConfirms.delete(itemId);
}

export function armSellConfirm(itemId, deadlineMs) {
  pendingSellConfirms.set(itemId, deadlineMs);
}
