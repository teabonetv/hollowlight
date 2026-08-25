// Keeper's Camp upgrade engine — generic over src/game/data/upgrades.js.
//
// Contract notes (mirrors the rest of systems/**):
// - Pure with respect to globals; mutates only the state passed in.
// - Purchases are ATOMIC: Lumen and every material are paid together or not
//   at all — a failed buy leaves state untouched.
// - Tiers gate strictly in order: tier i requires level i (0-indexed), i.e.
//   you must own every previous tier of that track.
// - Effects expose three multipliers consumed by the REAL math paths:
//     speedMultiplier → action durations (live ticks, offline calc, ETA UI)
//     yieldChance     → extra-unit rolls on gathering outputs (action runner)
//     xpMultiplier    → skill XP grants (live + offline, identical rounding)
// - Reads tolerate old saves: `state.campUpgrades` may be missing entirely.

import { TRACKS_BY_ID } from '../data/upgrades.js';
import { ITEMS_BY_ID } from '../data/items.js';
import * as bank from './bank.js';

export function upgradeLevel(state, trackId) {
  return state.campUpgrades?.[trackId] ?? 0;
}

/** Next purchasable tier, or null when the track is maxed. */
export function nextTier(state, trackId) {
  const track = TRACKS_BY_ID[trackId];
  if (!track) return null;
  const i = upgradeLevel(state, trackId);
  return i < track.tiers.length ? { index: i, ...track.tiers[i] } : null;
}

/**
 * Normalize a tier's cost into [{ id, qty, name }] chips for UI/tests.
 * `lumen` becomes id 'lumen'; items keep their registry names.
 */
export function costChips(tierOrCost) {
  const chips = [];
  const cost = tierOrCost;
  if (cost.lumen > 0) chips.push({ id: 'lumen', qty: cost.lumen, name: 'Lumen' });
  for (const [id, qty] of Object.entries(cost.items ?? {})) {
    chips.push({ id, qty, name: ITEMS_BY_ID[id]?.name ?? id });
  }
  return chips;
}

/**
 * Button copy when a tier is unaffordable. Names the first missing cost
 * (`Need ✦30` / `Need Fogwort ×15`) so Lumen gates are not lied about as
 * "Need materials" while the bank already holds the goods.
 */
export function upgradeNeedLabel(state, tierCost) {
  for (const c of costChips(tierCost)) {
    const have = c.id === 'lumen' ? state.lumen : bank.bankCount(state.bank, c.id);
    if (have < c.qty) {
      return c.id === 'lumen'
        ? `Need ✦${c.qty}`
        : `Need ${c.name} ×${c.qty}`;
    }
  }
  return 'Need materials';
}

export function canAffordUpgrade(state, tierCost) {
  if ((tierCost.lumen ?? 0) > state.lumen) return false;
  return bank.canAfford(
    state.bank,
    Object.entries(tierCost.items ?? {}).map(([id, qty]) => ({ id, qty })),
  );
}

/**
 * Buy the next tier of `trackId`. Returns { ok:true, level, tier } on
 * success or { ok:false, error } with no state change on failure.
 */
export function buyUpgrade(state, trackId) {
  const track = TRACKS_BY_ID[trackId];
  if (!track) return { ok: false, error: 'Unknown upgrade.' };

  const level = upgradeLevel(state, trackId);
  if (level >= track.tiers.length) return { ok: false, error: 'This lantern-work is complete.' };

  const tier = track.tiers[level];
  if (!canAffordUpgrade(state, tier)) return { ok: false, error: 'Not enough to pay for this.' };

  // Atomic pay: verified affordable above, so both deductions succeed.
  state.lumen -= tier.lumen;
  bank.bankPay(state.bank, Object.entries(tier.items ?? {}).map(([id, qty]) => ({ id, qty })));
  state.campUpgrades ??= {};
  state.campUpgrades[trackId] = level + 1;

  return { ok: true, level: level + 1, tier };
}

// ── effect math ───────────────────────────────────────────────────

/** Additive per-tier effect with hard cap, e.g. 3 tiers × 5% = 15%. */
export function trackEffectFraction(state, track) {
  const raw = track.perTier * upgradeLevel(state, track.id);
  // Snap FP noise (0.05×3 = 0.15000000000000002) so multipliers stay exact.
  const clean = Math.round(raw * 1e9) / 1e9;
  return Math.min(track.cap, clean);
}

/** Global action-speed multiplier (≥1). Durations divide by this. */
export function speedMultiplier(state) {
  return 1 + trackEffectFraction(state, TRACKS_BY_ID['lantern-wick']);
}

/** Chance each gathered output rolls one bonus unit (0..cap). */
export function yieldChance(state) {
  return trackEffectFraction(state, TRACKS_BY_ID['foraging-satchel']);
}

/** XP multiplier (≥1) applied to every action XP grant. */
export function xpMultiplier(state) {
  return 1 + trackEffectFraction(state, TRACKS_BY_ID['ember-altar']);
}

/**
 * The ONE duration an action takes right now, rounded once, shared by live
 * ticking, offline calculation and UI ETAs so the three never disagree.
 */
export function effectiveDurationMs(state, action) {
  return Math.max(1, Math.round(action.durationMs / speedMultiplier(state)));
}
