// Radiance prestige: earn slowly from ALL activities, spend on the
// constellation, respec for a Lumen cost. No progress wipe (charter §4.9).

import { PERKS, PERKS_BY_ID, RADIANCE_PER_XP, RESPEC_LUMEN_PER_NODE } from '../data/perks.js';

export function ownedSet(state) {
  return new Set(state.perks?.owned ?? []);
}

export function perkBonus(state, stat) {
  let sum = 0;
  for (const id of state.perks?.owned ?? []) {
    const perk = PERKS_BY_ID[id];
    if (!perk) continue;
    for (const e of perk.effects) {
      if (e.stat === stat) sum += e.value;
    }
  }
  return sum;
}

export function canUnlock(state, perkId) {
  const perk = PERKS_BY_ID[perkId];
  if (!perk) return { ok: false, error: 'Unknown star.' };
  const owned = ownedSet(state);
  if (owned.has(perkId)) return { ok: false, error: 'Already kindled.' };
  for (const req of perk.requires) {
    if (!owned.has(req)) return { ok: false, error: `Needs ${PERKS_BY_ID[req]?.name ?? req}.` };
  }
  if ((state.radiance ?? 0) < perk.cost) {
    return { ok: false, error: `Needs ${perk.cost} Radiance.` };
  }
  return { ok: true, perk };
}

export function unlockPerk(state, perkId) {
  const gate = canUnlock(state, perkId);
  if (!gate.ok) return gate;
  state.radiance -= gate.perk.cost;
  state.stats.radianceSpent = (state.stats.radianceSpent ?? 0) + gate.perk.cost;
  state.perks ??= { owned: [], respecs: 0 };
  state.perks.owned.push(perkId);
  return { ok: true, perk: gate.perk };
}

export function respecCostLumen(state) {
  const n = state.perks?.owned?.length ?? 0;
  return n * RESPEC_LUMEN_PER_NODE;
}

export function respecPerks(state) {
  const owned = state.perks?.owned ?? [];
  if (owned.length === 0) return { ok: false, error: 'Nothing to rearrange.' };
  const cost = respecCostLumen(state);
  if ((state.lumen ?? 0) < cost) return { ok: false, error: `Respec costs ✦${cost}.` };

  let refund = 0;
  for (const id of owned) refund += PERKS_BY_ID[id]?.cost ?? 0;
  state.lumen -= cost;
  state.stats.lumenSpent = (state.stats.lumenSpent ?? 0) + cost;
  state.radiance += refund;
  state.perks.owned = [];
  state.perks.respecs = (state.perks.respecs ?? 0) + 1;
  return { ok: true, refund, cost };
}

/**
 * Convert action XP into Radiance sparks via a fractional accumulator so
 * small cycles still contribute. Multiplier is applied HERE (radiance layer)
 * so tests can pin the order against modifiers.radianceGainMultiplier.
 */
export function grantRadianceFromXp(state, xp, radianceMult = 1) {
  if (!(xp > 0)) return 0;
  state.radianceFrac = (state.radianceFrac ?? 0) + xp * RADIANCE_PER_XP * radianceMult;
  const whole = Math.floor(state.radianceFrac);
  if (whole <= 0) return 0;
  state.radianceFrac -= whole;
  state.radiance = (state.radiance ?? 0) + whole;
  state.radianceEarned = (state.radianceEarned ?? 0) + whole;
  state.stats.radianceEarned = (state.stats.radianceEarned ?? 0) + whole;
  return whole;
}

export function cheapestAvailable(state) {
  const owned = ownedSet(state);
  let best = null;
  for (const p of PERKS) {
    if (owned.has(p.id)) continue;
    if (!p.requires.every((r) => owned.has(r))) continue;
    if (!best || p.cost < best.cost) best = p;
  }
  return best;
}

export function capstonesOwned(state) {
  const owned = ownedSet(state);
  return PERKS.filter((p) => p.capstone && owned.has(p.id)).length;
}
