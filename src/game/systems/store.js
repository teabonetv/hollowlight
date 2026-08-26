// General store engine — buy/sell with selling-pressure price curve,
// rare rotation, and the Kindling Bundle. Mutates only the passed state.
// Playtime (not wall-clock) drives recovery and rotation so tests stay
// deterministic and offline/live never disagree.

import { ITEMS_BY_ID } from '../data/items.js';
import { recordLumenSpend } from './stats.js';
import { markDiscovered } from './discovered.js';
import { canAcceptStack, PACK_FULL_MSG } from './lantern-room.js';
import {
  ALWAYS_STOCK, KINDLING_BUNDLE, BANK_THEMES,
  catalogBuyPrice, sellUnitPrice, buyUnitPrice, recoveredPressure,
  rareStockAt, PRESSURE_PER_UNIT, PRESSURE_CAP,
} from '../data/store.js';

function bankAdd(bank, itemId, qty, state) {
  if (!Number.isFinite(qty) || qty <= 0) return;
  bank[itemId] = (bank[itemId] ?? 0) + Math.floor(qty);
  if (state) markDiscovered(state, itemId);
}

export function ensureStore(state) {
  if (!state.store || typeof state.store !== 'object') {
    state.store = { pressure: {}, pressureAt: {} };
  }
  state.store.pressure ??= {};
  state.store.pressureAt ??= {};
  return state.store;
}

function nowPlay(state) {
  return state.stats?.playtimeMs ?? 0;
}

export function currentPressure(state, itemId, atMs = nowPlay(state)) {
  const store = ensureStore(state);
  const p = store.pressure[itemId] ?? 0;
  const stamped = store.pressureAt[itemId] ?? atMs;
  return recoveredPressure(p, Math.max(0, atMs - stamped));
}

export function stampPressure(state, itemId, pressure, atMs = nowPlay(state)) {
  const store = ensureStore(state);
  const p = Math.min(PRESSURE_CAP, Math.max(0, pressure));
  if (p <= 1e-12) {
    delete store.pressure[itemId];
    delete store.pressureAt[itemId];
    return;
  }
  store.pressure[itemId] = p;
  store.pressureAt[itemId] = atMs;
}

export function addSellPressure(state, itemId, qty, atMs = nowPlay(state)) {
  const live = currentPressure(state, itemId, atMs);
  stampPressure(state, itemId, live + PRESSURE_PER_UNIT * qty, atMs);
}

export function liveSellUnit(state, itemId, atMs = nowPlay(state)) {
  const item = ITEMS_BY_ID[itemId];
  if (!item) return 0;
  return sellUnitPrice(item.sell, currentPressure(state, itemId, atMs));
}

export function liveBuyUnit(state, itemId, atMs = nowPlay(state)) {
  const item = ITEMS_BY_ID[itemId];
  if (!item) return 0;
  const p = currentPressure(state, itemId, atMs);
  return buyUnitPrice(item.sell, p, catalogBuyPrice(item));
}

export function currentShelfIds(state) {
  const rares = rareStockAt(nowPlay(state));
  const ids = [...ALWAYS_STOCK];
  for (const id of rares) if (!ids.includes(id)) ids.push(id);
  return ids;
}

export function isOnShelf(state, itemId) {
  return currentShelfIds(state).includes(itemId);
}

/**
 * Buy `qty` from the current shelf at the live buy unit.
 * Bundles use buyKindlingBundle.
 */
export function buyFromStore(state, itemId, qty = 1) {
  const item = ITEMS_BY_ID[itemId];
  if (!item) return { ok: false, error: 'Unknown item.' };
  if (!isOnShelf(state, itemId)) return { ok: false, error: 'Not on the stall today.' };
  const n = Math.floor(qty);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'Buy how many?' };
  const unit = liveBuyUnit(state, itemId);
  const total = unit * n;
  if (state.lumen < total) return { ok: false, error: 'Not enough Lumen.' };
  if (!canAcceptStack(state, itemId)) {
    return { ok: false, error: PACK_FULL_MSG };
  }
  state.lumen -= total;
  recordLumenSpend(state, total);
  bankAdd(state.bank, itemId, n, state);
  return { ok: true, bought: n, spent: total, unit };
}

export function buyKindlingBundle(state) {
  const { cost, grants } = KINDLING_BUNDLE;
  if (state.lumen < cost) return { ok: false, error: 'Not enough Lumen.' };
  for (const g of grants) {
    if (!canAcceptStack(state, g.id)) return { ok: false, error: PACK_FULL_MSG };
  }
  state.lumen -= cost;
  recordLumenSpend(state, cost);
  for (const g of grants) bankAdd(state.bank, g.id, g.qty, state);
  return { ok: true, spent: cost, grants: grants.map((g) => ({ ...g })) };
}

export function buyTheme(state, themeId) {
  const theme = BANK_THEMES.find((t) => t.id === themeId);
  if (!theme) return { ok: false, error: 'Unknown dye.' };
  state.cosmetics ??= { bankTheme: 'default', unlocked: ['default'] };
  state.cosmetics.unlocked ??= ['default'];
  if (state.cosmetics.unlocked.includes(themeId)) {
    state.cosmetics.bankTheme = themeId;
    return { ok: true, equipped: themeId, spent: 0 };
  }
  if (state.lumen < theme.cost) return { ok: false, error: 'Not enough Lumen.' };
  state.lumen -= theme.cost;
  recordLumenSpend(state, theme.cost);
  state.cosmetics.unlocked.push(themeId);
  state.cosmetics.bankTheme = themeId;
  return { ok: true, equipped: themeId, spent: theme.cost };
}

/** Qty steppers for thumbs: 1 / 10 / 100 / all (all = owned or max affordable). */
export function stepperQtys(ownedOrMax) {
  const cap = Math.max(0, Math.floor(ownedOrMax));
  return [
    { label: '1', qty: 1, enabled: cap >= 1 },
    { label: '10', qty: 10, enabled: cap >= 10 },
    { label: '100', qty: 100, enabled: cap >= 100 },
    { label: 'All', qty: cap, enabled: cap >= 1 },
  ];
}

export function maxAffordable(state, itemId) {
  const unit = liveBuyUnit(state, itemId);
  if (!(unit > 0)) return 0;
  return Math.floor(state.lumen / unit);
}

export { ALWAYS_STOCK, KINDLING_BUNDLE, BANK_THEMES, catalogBuyPrice };
