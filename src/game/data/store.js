// Hearthway General Store — catalog law, always-shelf, rare rotation.
// Price-curve constants live here so tests, UI, and systems/store.js agree.
// Formula documented in src/game/data/balance-notes.md §Price curve.

import { ITEMS_BY_ID } from './items.js';

/** Buy list price ≈ this × registry sell, always strictly above sell. */
export const BUY_MULT = 2.25;

/** Selling never pays below this fraction of registry sell (min 1 Lumen). */
export const SELL_FLOOR_FRAC = 0.40;

/** Each unit sold adds this much pressure (0–1 scale) before recovery. */
export const PRESSURE_PER_UNIT = 0.02;

/** Pressure cannot push the multiplier below (1 − cap). */
export const PRESSURE_CAP = 0.60;

/** Pressure halves every this many ms of *playtime* (not wall-clock). */
export const RECOVERY_HALF_LIFE_MS = 10 * 60 * 1000;

/** Rare shelf reshuffles every this much playtime. */
export const RARE_ROTATE_MS = 30 * 60 * 1000;

export const RARE_SLOT_COUNT = 3;

/**
 * Always on the stall — including emergency Tinderscrap so the first ten
 * minutes cannot hard-halt if the player spent the starter stack tending.
 * Costs must be integers > sell (validated).
 */
export const ALWAYS_STOCK = [
  'tinderscrap',
  'bogmoss',
  'rushwick',
  'fogwort',
  'palecap',
  'graveresin',
  'peatbrick',
  'tallow-candle',
  'lamp-oil',
  'flint-striker',
  'warm-broth',
  'wick-spool',
];

/** Lumen-only pack: cheaper than 8× unit tinder, still above sell. */
export const KINDLING_BUNDLE = {
  id: 'kindling-bundle',
  name: 'Kindling Bundle',
  cost: 12,
  grants: [{ id: 'tinderscrap', qty: 8 }],
  flavor: 'Eight handfuls of dry scrap, twine-bound. The stall’s mercy price.',
};

/** Bank-tab dyes. Visual only — never extra slots, never power. Lumen sink. */
export const BANK_THEMES = [
  { id: 'default', name: 'Unbleached linen', cost: 0, className: 'theme-default' },
  { id: 'dusk', name: 'Dusk ribbon', cost: 80, className: 'theme-dusk' },
  { id: 'choir', name: 'Choir cloth', cost: 140, className: 'theme-choir' },
  { id: 'ash', name: 'Ash-dye tabs', cost: 220, className: 'theme-ash' },
  { id: 'gilt', name: 'Gilded index', cost: 400, className: 'theme-gilt' },
];

export function catalogBuyPrice(item) {
  if (!item) return undefined;
  if (Number.isInteger(item.buy) && item.buy > item.sell) return item.buy;
  return Math.max(item.sell + 1, Math.ceil(item.sell * BUY_MULT));
}

export function sellFloor(baseSell) {
  return Math.max(1, Math.floor(baseSell * SELL_FLOOR_FRAC));
}

/**
 * Instant sell unit price at a given pressure.
 *   unit = max(floor, round(sell × (1 − min(cap, pressure))))
 */
export function sellUnitPrice(baseSell, pressure) {
  const p = Math.min(PRESSURE_CAP, Math.max(0, pressure));
  const raw = Math.round(baseSell * (1 - p));
  return Math.max(sellFloor(baseSell), raw);
}

/**
 * Buy unit price: catalog, eased slightly when the stall is flooded (pressure),
 * but always at least one Lumen above the *current* sell unit — no arbitrage.
 */
export function buyUnitPrice(baseSell, pressure, catalogBuy) {
  const p = Math.min(PRESSURE_CAP, Math.max(0, pressure));
  const buy = catalogBuy ?? Math.max(baseSell + 1, Math.ceil(baseSell * BUY_MULT));
  const eased = Math.round(buy * (1 - 0.15 * p));
  return Math.max(eased, sellUnitPrice(baseSell, p) + 1);
}

/** Exponential recovery: p × 2^(−elapsed / halfLife). */
export function recoveredPressure(pressure, elapsedMs, halfLifeMs = RECOVERY_HALF_LIFE_MS) {
  const p = Math.max(0, pressure ?? 0);
  if (!(p > 0) || !(elapsedMs > 0)) return p;
  return p * (2 ** (-elapsedMs / halfLifeMs));
}

export function rarePoolIds() {
  return Object.values(ITEMS_BY_ID).filter((i) => i.rare).map((i) => i.id);
}

function hash32(n) {
  return ((Math.imul(n, 1103515245) + 12345) >>> 0);
}

/** Deterministic rare shelf from playtime epoch (no RNG consumption). */
export function rareStockAt(playtimeMs, slotCount = RARE_SLOT_COUNT) {
  const pool = rarePoolIds();
  if (pool.length === 0) return [];
  const epoch = Math.floor(Math.max(0, playtimeMs) / RARE_ROTATE_MS);
  const out = [];
  const used = new Set();
  let h = hash32(epoch + 9001);
  let guard = 0;
  while (out.length < Math.min(slotCount, pool.length) && guard++ < 10_000) {
    const id = pool[h % pool.length];
    if (!used.has(id)) {
      used.add(id);
      out.push(id);
    }
    h = hash32(h);
  }
  return out;
}

export function validateStoreCatalog() {
  const errors = [];
  for (const id of ALWAYS_STOCK) {
    const item = ITEMS_BY_ID[id];
    if (!item) errors.push(`always-stock ${id}: unknown item`);
    else {
      const buy = catalogBuyPrice(item);
      if (!Number.isInteger(buy) || buy <= item.sell) {
        errors.push(`always-stock ${id}: buy ${buy} must be an integer > sell (${item.sell})`);
      }
    }
  }
  if (KINDLING_BUNDLE.cost <= 8 * (ITEMS_BY_ID.tinderscrap?.sell ?? 1)) {
    errors.push('kindling bundle must cost more than 8× tinder sell (no arbitrage unpack)');
  }
  for (const g of KINDLING_BUNDLE.grants) {
    if (!ITEMS_BY_ID[g.id]) errors.push(`bundle grants unknown ${g.id}`);
  }
  return errors;
}
