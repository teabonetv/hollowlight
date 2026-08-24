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
import { levelFromXp } from '../../core/xp.js';
import * as bank from './bank.js';

/** +1% XP per mastery level of the running action (see balance-notes.md). */
export const MASTERY_XP_BONUS_PER_LEVEL = 0.01;

export function masteryXpMultiplier(masteryLevel) {
  return 1 + MASTERY_XP_BONUS_PER_LEVEL * masteryLevel;
}

function ensureMastery(skillState, actionId) {
  if (!skillState.mastery[actionId]) skillState.mastery[actionId] = { xp: 0, level: 1 };
  return skillState.mastery[actionId];
}

/** Roll one cycle's outputs. Chance gates resolve before quantity rolls. */
export function rollOutputs(action, rng) {
  const gains = [];
  for (const o of action.outputs) {
    if (o.chance !== undefined && !rng.chance(o.chance)) continue;
    const qty = o.min !== undefined
      ? o.min + rng.int(o.max - o.min + 1)
      : o.qty;
    gains.push({ ...o, qty });
  }
  return gains;
}

/** Apply gains to the state; returns a human-readable summary list. */
export function applyGains(state, gains) {
  const applied = [];
  for (const g of gains) {
    if (g.kind === 'item') {
      bank.bankAdd(state.bank, g.id, g.qty);
      applied.push({ kind: 'item', id: g.id, name: ITEMS_BY_ID[g.id]?.name ?? g.id, qty: g.qty });
    } else if (g.kind === 'lumen') {
      state.lumen += g.qty;
      applied.push({ kind: 'lumen', qty: g.qty });
    } else if (g.kind === 'resource') {
      state[g.id] = (state[g.id] ?? 0) + g.qty;
      applied.push({ kind: 'resource', id: g.id, qty: g.qty });
    }
  }
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
    return { halted: true, reason: `out of ${ITEMS_BY_ID[missing?.id ?? '']?.name ?? 'materials'}` };
  }

  bank.bankPay(state.bank, action.costs);
  const gains = rollOutputs(action, rng);
  const applied = applyGains(state, gains);

  const events = [];
  const skill = state.skills[action.skill];
  const mastery = ensureMastery(skill, action.id);
  const beforeLevel = skill.level;

  skill.xp += Math.round(action.xp * masteryXpMultiplier(mastery.level));

  const mBefore = mastery.level;
  mastery.xp += action.masteryXp;
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
  return { events };
}

export function autoRestartEnabled(state, action) {
  return state.actions.autoRestart[action.id] ?? true;
}

export function setAutoRestart(state, actionId, enabled) {
  state.actions.autoRestart[actionId] = !!enabled;
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
      if (progress < action.durationMs) break;
      progress -= action.durationMs;

      const result = completeCycle(state, action, rng);
      if (result.halted) {
        delete state.actions.active[actionId];
        events.push({ type: 'halted', actionId, reason: result.reason });
        progress = 0;
        break;
      }

      state.actions.completed[actionId] = (state.actions.completed[actionId] ?? 0) + 1;
      events.push(...result.events);

      if (!autoRestartEnabled(state, action)) {
        delete state.actions.active[actionId];
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
  return { ok: true };
}

/** Stop an action by id; omit to stop all (used by offline/reset paths). */
export function stopAction(state, actionId) {
  if (actionId !== undefined) delete state.actions.active[actionId];
  else state.actions.active = {};
}

/** Snapshot for UI rows: locked? affordable? running? progress/eta? */
export function actionStatus(state, actionId) {
  const action = ACTIONS_BY_ID[actionId];
  const skill = action ? state.skills[action.skill] : null;
  const active = state.actions.active[actionId];
  const locked = !action || !skill || skill.level < action.unlockLevel;
  const affordable = bank.canAfford(state.bank, action?.costs ?? []);
  return {
    action,
    running: !!active,
    progressMs: active?.progressMs ?? 0,
    durationMs: action?.durationMs ?? 0,
    frac: active && action ? Math.min(1, active.progressMs / action.durationMs) : 0,
    etaMs: active && action ? action.durationMs - active.progressMs : action?.durationMs ?? 0,
    locked,
    lockLevel: action?.unlockLevel ?? 1,
    affordable,
    completed: state.actions.completed[actionId] ?? 0,
    mastery: skill?.mastery[actionId] ?? { xp: 0, level: 1 },
  };
}
