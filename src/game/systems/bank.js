// Bank operations. The bank is a plain { itemId -> count } map inside the
// game state. Payments are atomic: either every cost is affordable or nothing
// is taken — no partial pays, ever.

import { ITEMS, ITEMS_BY_ID } from '../data/items.js';
import { liveSellUnit, addSellPressure } from './store.js';
import { recordSell } from './stats.js';

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

/** Catalog Lumen value of a bank snapshot (header; ignores live pressure). */
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

export function needsSellConfirm(qty, item) {
  if (item?.unique) return true;
  return qty > SELL_CONFIRM_THRESHOLD;
}

/**
 * Sell `qty` of `itemId` from the bank.
 * Pays the live stall unit (registry sell at 0 pressure; see store.js curve).
 * Mutates state (bank + lumen + pressure). Returns
 *   { ok:true, sold, gained, unit } | { ok:false, error }
 */
export function sellItems(state, itemId, qty) {
  const item = ITEMS_BY_ID[itemId];
  if (!item) return { ok: false, error: 'Unknown item.' };
  const owned = bankCount(state.bank, itemId);
  const n = Math.min(Math.floor(qty), owned);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: owned <= 0 ? 'None to sell.' : 'Nothing to sell.' };
  }
  const unit = liveSellUnit(state, itemId);
  state.bank[itemId] -= n;
  if (state.bank[itemId] === 0) delete state.bank[itemId];
  const gained = n * unit;
  state.lumen += gained;
  addSellPressure(state, itemId, n);
  recordSell(state, n, gained);
  return { ok: true, sold: n, gained, unit };
}

// ── search / tabs / pins ──────────────────────────────────────────

export function matchesQuery(item, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  return item.name.toLowerCase().includes(q)
    || item.id.toLowerCase().includes(q)
    || item.category.toLowerCase().includes(q)
    || (item.flavor ?? '').toLowerCase().includes(q)
    || (item.sources ?? []).some((s) => s.toLowerCase().includes(q))
    || (item.uses ?? []).some((s) => s.toLowerCase().includes(q));
}

export function ensureBankMeta(state) {
  if (!Array.isArray(state.bankPins)) state.bankPins = [];
  if (!Array.isArray(state.bankPresets)) state.bankPresets = [];
  return state;
}

export function isPinned(state, itemId) {
  return (state.bankPins ?? []).includes(itemId);
}

export function togglePin(state, itemId) {
  ensureBankMeta(state);
  const i = state.bankPins.indexOf(itemId);
  if (i >= 0) state.bankPins.splice(i, 1);
  else state.bankPins.push(itemId);
  return isPinned(state, itemId);
}

export function filterItems({ items = ITEMS, bank = {}, tab = 'all', query = '', pins = [] } = {}) {
  let list = items;
  if (tab === 'pinned') list = list.filter((i) => pins.includes(i.id));
  else if (tab === 'owned') list = list.filter((i) => (bank[i.id] ?? 0) > 0);
  else if (tab === 'candle') list = list.filter((i) => i.category === 'candle' || i.category === 'oil');
  else if (tab !== 'all') list = list.filter((i) => i.category === tab);
  if (query) list = list.filter((i) => matchesQuery(i, query));
  const pinSet = new Set(pins);
  return [...list].sort((a, b) => {
    const pa = pinSet.has(a.id) ? 0 : 1;
    const pb = pinSet.has(b.id) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return 0;
  });
}

// ── presets (gear sets / loadouts) ────────────────────────────────

function newPresetId(state) {
  const n = (state.bankPresets?.length ?? 0) + 1;
  return `preset-${n}-${Math.floor(Math.random() * 1e6)}`;
}

export function captureBankSnapshot(bank) {
  const items = {};
  for (const [id, qty] of Object.entries(bank ?? {})) {
    if (qty > 0) items[id] = qty;
  }
  return items;
}

export function captureGearSnapshot(bank) {
  const items = {};
  for (const [id, qty] of Object.entries(bank ?? {})) {
    if (qty > 0 && ITEMS_BY_ID[id]?.category === 'gear') items[id] = qty;
  }
  return items;
}

export function savePreset(state, name, items, { kind = 'loadout' } = {}) {
  ensureBankMeta(state);
  const preset = {
    id: newPresetId(state),
    name: String(name || 'Loadout').slice(0, 32),
    kind,
    items: { ...items },
  };
  state.bankPresets.push(preset);
  return preset;
}

export function deletePreset(state, presetId) {
  ensureBankMeta(state);
  const i = state.bankPresets.findIndex((p) => p.id === presetId);
  if (i < 0) return false;
  state.bankPresets.splice(i, 1);
  return true;
}

export function getPreset(state, presetId) {
  return (state.bankPresets ?? []).find((p) => p.id === presetId) ?? null;
}

/**
 * Apply a preset: pin its item ids and report missing quantities.
 * Never magically creates items (that would be a dupe exploit).
 */
export function applyPreset(state, presetId) {
  const preset = getPreset(state, presetId);
  if (!preset) return { ok: false, error: 'No such loadout.' };
  ensureBankMeta(state);
  const missing = [];
  for (const [id, need] of Object.entries(preset.items ?? {})) {
    const have = bankCount(state.bank, id);
    if (have < need) missing.push({ id, need, have, name: ITEMS_BY_ID[id]?.name ?? id });
    if (!state.bankPins.includes(id)) state.bankPins.push(id);
  }
  return { ok: true, preset, missing };
}

export { ITEMS };
