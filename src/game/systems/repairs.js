// Lantern integrity: a sink, never a halt. Emberkeeping cycles wear the
// glass; repairs spend Lumen + materials. Flame grants scale slightly when
// the lantern is neglected (see INTEGRITY_FLAME_FLOOR) so ignoring repairs
// is a choice, not a lockout.

import { ITEMS_BY_ID } from '../data/items.js';
import {
  LANTERN_MAX, WEAR_PER_EMBERKEEPING_CYCLE, INTEGRITY_FLAME_FLOOR, REPAIR_KITS_BY_ID,
} from '../data/repairs.js';
import { bankPay, canAfford, bankCount } from './bank.js';

export function lanternIntegrity(state) {
  const v = state.lanternIntegrity;
  if (!Number.isFinite(v)) return LANTERN_MAX;
  return Math.max(0, Math.min(LANTERN_MAX, v));
}

export function flameIntegrityMultiplier(state) {
  const i = lanternIntegrity(state);
  return INTEGRITY_FLAME_FLOOR + (1 - INTEGRITY_FLAME_FLOOR) * (i / LANTERN_MAX);
}

export function applyEmberkeepingWear(state, action) {
  if (action?.skill !== 'emberkeeping') return;
  state.lanternIntegrity = Math.max(0, lanternIntegrity(state) - WEAR_PER_EMBERKEEPING_CYCLE);
}

export function canAffordRepair(state, kitId) {
  const kit = REPAIR_KITS_BY_ID[kitId];
  if (!kit) return false;
  if ((state.lumen ?? 0) < kit.lumen) return false;
  const costs = Object.entries(kit.items ?? {}).map(([id, qty]) => ({ id, qty }));
  return canAfford(state.bank, costs);
}

export function repairLantern(state, kitId) {
  const kit = REPAIR_KITS_BY_ID[kitId];
  if (!kit) return { ok: false, error: 'Unknown repair.' };
  if (lanternIntegrity(state) >= LANTERN_MAX) {
    return { ok: false, error: 'The lantern is already whole.' };
  }
  if ((state.lumen ?? 0) < kit.lumen) return { ok: false, error: 'Not enough Lumen.' };
  const costs = Object.entries(kit.items ?? {}).map(([id, qty]) => ({ id, qty }));
  if (!canAfford(state.bank, costs)) return { ok: false, error: repairNeedLabel(state, kit) };
  state.lumen -= kit.lumen;
  bankPay(state.bank, costs);
  const before = lanternIntegrity(state);
  state.lanternIntegrity = Math.min(LANTERN_MAX, before + kit.restore);
  return { ok: true, restored: state.lanternIntegrity - before, integrity: state.lanternIntegrity, kit };
}

export function repairCostChips(kit) {
  const chips = [{ id: 'lumen', name: 'Lumen', qty: kit.lumen }];
  for (const [id, qty] of Object.entries(kit.items ?? {})) {
    chips.push({ id, name: ITEMS_BY_ID[id]?.name ?? id, qty });
  }
  return chips;
}

/** Button copy when a kit cannot apply — names the missing Lumen or good. */
export function repairNeedLabel(state, kit) {
  if (!kit) return 'Need materials';
  if (lanternIntegrity(state) >= LANTERN_MAX) return 'Already whole';
  for (const c of repairCostChips(kit)) {
    const have = c.id === 'lumen' ? (state.lumen ?? 0) : bankCount(state.bank, c.id);
    if (have < c.qty) {
      return c.id === 'lumen' ? `Need ✦${c.qty}` : `Need ${c.name} ×${c.qty}`;
    }
  }
  return 'Need materials';
}
