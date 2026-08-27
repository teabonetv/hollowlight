// Generic action-runner — the ONE engine behind every skilling loop
// (charter system #2). It knows nothing about specific skills; it consumes
// data from src/game/data/actions.js and drives per-action progress against
// the tick loop. Emberkeeping and Foraging are just the first two datasets.
//
// Contract notes:
// - Costs settle at each cycle COMPLETION (no negative windows mid-cycle).
//   Starting requires affording one cycle up front.
// - All functions are pure-with-respect-to-globals: they mutate only the
//   state object passed in, draw randomness only from the passed RNG, and
//   never touch clocks or DOM — so tests can drive them deterministically.
// - Events are RETURNED (not bus-emitted) so callers decide what surfaces in
//   UI: toasts, journal entries, sounds.

import { ACTIONS_BY_ID } from '../data/actions.js';
import { SKILL_BY_ID } from '../data/skills.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { formatMissingChip } from '../../core/format.js';
import { levelFromXp } from '../../core/xp.js';
import * as bank from './bank.js';
import * as mods from './modifiers.js';
import { grantRadianceFromXp } from './radiance.js';
import { recordCycle, recordTinderHalt } from './stats.js';
import { applyEmberkeepingWear } from './repairs.js';

/** +1% XP per mastery level of the running action (see balance-notes.md). */
export const MASTERY_XP_BONUS_PER_LEVEL = mods.MASTERY_XP_BONUS_PER_LEVEL;

export function masteryXpMultiplier(masteryLevel) {
  return 1 + MASTERY_XP_BONUS_PER_LEVEL * masteryLevel;
}

function ensureMastery(skillState, actionId) {
  if (!skillState.mastery[actionId]) skillState.mastery[actionId] = { xp: 0, level: 1 };
  return skillState.mastery[actionId];
}

/**
 * Roll one cycle's outputs. Chance gates resolve before quantity rolls.
 * `extraYieldChance` (Keeper's Camp satchel) gives each ITEM output an extra
 * roll for ONE bonus unit, after the base quantity is known. Deterministic:
 * draws only from the passed RNG, in stable order.
 */
export function rollOutputs(action, rng, { extraYieldChance = 0 } = {}) {
  const gains = [];
  for (const o of action.outputs) {
    if (o.chance !== undefined && !rng.chance(o.chance)) continue;
    const qty = o.min !== undefined
      ? o.min + rng.int(o.max - o.min + 1)
      : o.qty;
    let finalQty = qty;
    if (o.kind === 'item' && extraYieldChance > 0 && rng.chance(extraYieldChance)) {
      finalQty = qty + 1;
    }
    gains.push({ ...o, qty: finalQty });
  }
  return gains;
}

/** Apply gains to the state; returns a human-readable summary list. */
export function applyGains(state, gains) {
  const applied = [];
  let packFull = false;
  for (const g of gains) {
    if (g.kind === 'item') {
      const res = bank.tryBankAdd(state, g.id, g.qty);
      if (!res.ok) {
        if (res.reason === 'pack-full') packFull = true;
        continue;
      }
      applied.push({ kind: 'item', id: g.id, name: ITEMS_BY_ID[g.id]?.name ?? g.id, qty: res.added });
    } else if (g.kind === 'lumen') {
      const qty = Math.max(0, Math.round(g.qty * mods.lumenGainMultiplier(state)));
      state.lumen += qty;
      applied.push({ kind: 'lumen', qty });
    } else if (g.kind === 'resource') {
      state[g.id] = (state[g.id] ?? 0) + g.qty;
      applied.push({ kind: 'resource', id: g.id, qty: g.qty });
    }
  }
  applied.packFull = packFull;
  return applied;
}

/**
 * Resolve one full cycle of `action` against `state`.
 * Returns { events } on success or { halted: true, reason } when the bank
 * can no longer pay (which also stops the action upstream).
 */
export function completeCycle(state, action, rng) {
  if (!bank.canAfford(state.bank, action.costs)) {
    const missing = (action.costs ?? []).find((c) => !bank.canAfford(state.bank, [c]));
    const remainingQty = missing ? (state.bank[missing.id] ?? 0) : 0;
    const name = ITEMS_BY_ID[missing?.id ?? '']?.name ?? 'materials';
    return {
      halted: true,
      reason: formatMissingChip(name, remainingQty),
      remainingQty,
      missingId: missing?.id ?? null,
    };
  }

  bank.bankPay(state.bank, action.costs);
  const gains = rollOutputs(action, rng, { extraYieldChance: mods.yieldChance(state) });
  const applied = applyGains(state, gains);
  recordCycle(state, applied);

  const events = [];
  if (applied.packFull) events.push({ type: 'pack-full' });
  const skill = state.skills[action.skill];
  const mastery = ensureMastery(skill, action.id);
  const beforeLevel = skill.level;

  // XP stack (mastery → camp → radiance → achievement → hooks) is shared
  // with the offline calculator so live and offline never disagree by 1.
  const xpGain = Math.round(action.xp * mods.xpGrantMultiplier(state, mastery.level));
  skill.xp += xpGain;
  const sparks = grantRadianceFromXp(state, action.xp, mods.radianceGainMultiplier(state));
  if (sparks > 0) events.push({ type: 'radiance', qty: sparks });

  const mBefore = mastery.level;
  mastery.xp += Math.round(action.masteryXp * mods.masteryXpMultiplier(state));
  mastery.level = levelFromXp(mastery.xp);
  if (mastery.level > mBefore) {
    events.push({ type: 'mastery-levelup', actionId: action.id, level: mastery.level });
  }

  const newLevel = levelFromXp(skill.xp);
  if (newLevel > beforeLevel) {
    skill.level = newLevel;
    events.push({ type: 'levelup', skillId: action.skill, level: newLevel });
    for (const other of Object.values(ACTIONS_BY_ID)) {
      if (other.skill === action.skill && other.unlockLevel > beforeLevel && other.unlockLevel <= newLevel) {
        events.push({ type: 'unlock', actionId: other.id });
      }
    }
  }

  events.push({ type: 'cycle', actionId: action.id, gains: applied });
  applyEmberkeepingWear(state, action);
  return { events };
}

export function autoRestartEnabled(state, action) {
  return state.actions.autoRestart[action.id] ?? true;
}

export function setAutoRestart(state, actionId, enabled) {
  state.actions.autoRestart[actionId] = !!enabled;
  state.stats.autoRestartToggles = (state.stats.autoRestartToggles ?? 0) + 1;
}

/**
 * Advance every running action by dtMs of game time.
 * Returns the event list for the caller to dispatch.
 */
export function tickActions(state, dtMs, rng) {
  const events = [];

  for (const actionId of Object.keys({ ...state.actions.active })) {
    const action = ACTIONS_BY_ID[actionId];
    const active = state.actions.active[actionId];
    // Unknown action id (stale save): drop it rather than crash.
    if (!action || !active) { delete state.actions.active[actionId]; continue; }

    let progress = active.progressMs + dtMs;
    let guard = 0;
    while (guard++ < 10000) {
      // Lantern & Wick shortens every cycle; read per-iteration so a
      // mid-run purchase applies from the next cycle onward.
      const durationMs = mods.effectiveDurationMs(state, action);
      if (progress < durationMs) break;
      progress -= durationMs;

      const result = completeCycle(state, action, rng);
      if (result.halted) {
        delete state.actions.active[actionId];
        recordTinderHalt(state, result);
        events.push({
          type: 'halted',
          actionId,
          reason: result.reason,
          remainingQty: result.remainingQty,
          missingId: result.missingId,
        });
        progress = 0;
        break;
      }

      state.actions.completed[actionId] = (state.actions.completed[actionId] ?? 0) + 1;
      events.push(...result.events);

      if (!autoRestartEnabled(state, action)) {
        delete state.actions.active[actionId];
        // F1d Fix 1: surface the stop so the UI re-renders immediately.
        // Without this event the screen kept showing a running action while
        // state.actions.active was already empty — and every later save then
        // serialized an empty runner, diverging from what the player sees.
        events.push({ type: 'stopped', actionId, reason: 'completed' });
        progress = 0;
        break;
      }
    }

    if (state.actions.active[actionId]) active.progressMs = progress;
  }

  return events;
}

/**
 * Start an action. Validations return { ok:false, error } so UI can toast.
 * Starting another action in the same skill replaces the current one.
 */
export function startAction(state, actionId) {
  const action = ACTIONS_BY_ID[actionId];
  if (!action) return { ok: false, error: 'Unknown action.' };

  const skill = state.skills[action.skill];
  if (!skill) return { ok: false, error: 'Unknown skill.' };
  if (skill.level < action.unlockLevel) {
    return { ok: false, error: `Requires ${SKILL_BY_ID[action.skill].name} level ${action.unlockLevel}.` };
  }
  if (!bank.canAfford(state.bank, action.costs)) {
    return { ok: false, error: 'Not enough materials to begin.' };
  }

  // One active action per skill.
  for (const otherId of Object.keys(state.actions.active)) {
    if (ACTIONS_BY_ID[otherId]?.skill === action.skill) delete state.actions.active[otherId];
  }

  state.actions.active[actionId] = { progressMs: 0 };
  // Persist the painted default (ON) so save.actions.autoRestart is not {}
  // while the switch shows on. Missing keys used to stay missing until the
  // player toggled twice.
  if (state.actions.autoRestart[actionId] === undefined) {
    state.actions.autoRestart[actionId] = true;
  }
  return { ok: true };
}

/** Stop an action by id; omit to stop all (used by offline/reset paths). */
export function stopAction(state, actionId) {
  if (actionId !== undefined) {
    if (state.actions.active[actionId]) {
      state.stats.manualStops = (state.stats.manualStops ?? 0) + 1;
    }
    delete state.actions.active[actionId];
  } else {
    state.actions.active = {};
  }
}

/** Snapshot for UI rows: locked? affordable? running? progress/eta? */
export function actionStatus(state, actionId) {
  const action = ACTIONS_BY_ID[actionId];
  const skill = action ? state.skills[action.skill] : null;
  const active = state.actions.active[actionId];
  const locked = !action || !skill || skill.level < action.unlockLevel;
  const affordable = bank.canAfford(state.bank, action?.costs ?? []);
  const mastery = skill?.mastery[actionId] ?? { xp: 0, level: 1 };
  const practiced = (mastery.xp ?? 0) > 0 || (state.actions.completed[actionId] ?? 0) > 0;
  // Duration reflects Lantern & Wick speed so bars/ETAs match real ticks.
  const durationMs = action ? mods.effectiveDurationMs(state, action) : 0;
  const xpMult = action ? mods.xpGrantMultiplier(state, mastery.level) : 1;
  const xpRaw = action ? action.xp * xpMult : 0;
  return {
    action,
    running: !!active,
    progressMs: active?.progressMs ?? 0,
    durationMs,
    frac: active && action ? Math.min(1, active.progressMs / durationMs) : 0,
    etaMs: active && action ? durationMs - active.progressMs : durationMs,
    locked: locked,
    lockLevel: action?.unlockLevel ?? 1,
    affordable,
    autoRestart: state.actions.autoRestart[actionId] ?? true,
    completed: state.actions.completed[actionId] ?? 0,
    mastery: { xp: mastery.xp, level: practiced ? mastery.level : 0 },
    xpBase: action?.xp ?? 0,
    xpRaw,
    xpGrant: Math.round(xpRaw),
    durationCause: action ? mods.durationRewriteCause(state, action) : '',
  };
}
