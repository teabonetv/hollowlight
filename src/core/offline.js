// Offline-progress calculator — pure and honest (charter §5).
//
// Given the saved state and elapsed wall time, computes what the player's
// running actions produced while away, capped at OFFLINE_CAP_HOURS. Yields
// use EXPECTED VALUES (ranges roll their mean, chance-gated outputs weigh by
// chance) so results are deterministic and instantly computable; completions
// are bounded by materials actually in the bank at save time.
//
// This module stays free of game DATA (pass the registry in as `actionsById`)
// so it works for any future content set without edits.

import { levelFromXp } from './xp.js';
import {
  xpGrantMultiplier, effectiveDurationMs, lumenGainMultiplier,
  radianceGainMultiplier, masteryXpMultiplier,
} from '../game/systems/modifiers.js';
import { grantRadianceFromXp } from '../game/systems/radiance.js';

export const OFFLINE_CAP_HOURS = 12;
export const OFFLINE_MIN_AWAY_MS = 60_000;

function clampPositive(n) { return Math.max(0, Math.floor(n)); }

/**
 * @returns {{
 *   awayMs:number, creditedMs:number, capped:boolean,
 *   gains:{ items:{id:string,name:string,qty:number}, lumen:number, flame:number,
 *           xp:Object<string,number>, actions:Array },
 *   levelUps:Array<{skillId:string,level:number}>,
 *   nextState:object,
 * }}
 */
export function computeOfflineProgress({
  state,
  nowMs,
  lastSavedAt,
  capHours = OFFLINE_CAP_HOURS,
  actionsById,
}) {
  const awayMs = clampPositive(nowMs - lastSavedAt);
  const capMs = capHours * 3_600_000;
  const creditedMs = Math.min(awayMs, capMs);
  const capped = awayMs > creditedMs;

  const next = structuredClone(state);
  next.stats ??= {};
  const originalPlaytimeMs = next.stats.playtimeMs ?? 0;
  /** @type {Record<string,{id,name,qty}>} */ const itemGains = {};
  const xpGains = {};
  const actionLines = [];
  const idleNotes = [];
  let lumenGained = 0;
  let flameGained = 0;
  const levelsBefore = {};
  for (const [id, s] of Object.entries(next.skills)) levelsBefore[id] = s.level;

  if (creditedMs >= OFFLINE_MIN_AWAY_MS && next.actions && actionsById) {
    for (const [actionId, active] of Object.entries(next.actions.active)) {
      const action = actionsById[actionId];
      if (!action || !active) continue;
      const autoOn = next.actions.autoRestart[actionId] ?? true;
      if (!autoOn) continue; // one-shot actions don't idle

      // Whole cycles the window allows — at the camp-upgrade-adjusted
      // duration (same helper live play uses, so speeds apply offline too)…
      const timeCompletions = Math.floor(creditedMs / effectiveDurationMs(next, action));
      let completions = timeCompletions;
      // …bounded by materials for every cycle cost.
      let missingId = null;
      for (const c of action.costs ?? []) {
        const have = next.bank[c.id] ?? 0;
        const byMat = Math.floor(have / c.qty);
        if (byMat < completions) {
          completions = byMat;
          missingId = c.id;
        }
      }
      if (completions <= 0) {
        if (timeCompletions > 0 && missingId) {
          idleNotes.push({
            actionId, name: action.name, completions: 0, missingId, timeCompletions,
          });
        }
        continue;
      }

      // settle costs
      for (const c of action.costs ?? []) {
        next.bank[c.id] -= c.qty * completions;
        if (next.bank[c.id] === 0) delete next.bank[c.id];
      }

      // expected-value yields
      const skill = next.skills[action.skill];
      if (!skill.mastery[actionId]) skill.mastery[actionId] = { xp: 0, level: 1 };
      const mastery = skill.mastery[actionId];
      const lumenMult = lumenGainMultiplier(next);

      for (const o of action.outputs ?? []) {
        const expected = o.min !== undefined
          ? ((o.min + o.max) / 2) * completions
          : o.qty * completions;
        const weighted = o.chance !== undefined ? expected * o.chance : expected;
        const qty = clampPositive(weighted);
        if (qty <= 0) continue;
        if (o.kind === 'item') {
          const slot = (itemGains[o.id] ??= {
            id: o.id,
            name: o.id,
            qty: 0,
          });
          slot.qty += qty;
          next.bank[o.id] = (next.bank[o.id] ?? 0) + qty;
          next.stats.itemsGathered = (next.stats.itemsGathered ?? 0) + qty;
        } else if (o.kind === 'lumen') {
          // Live applyGains rounds per cycle, then the runner repeats.
          // Flooring the whole batch (clampPositive(weighted * mult)) drifts
          // once Radiance lumen nodes push the multiplier off an integer.
          const baseQty = o.min !== undefined ? (o.min + o.max) / 2 : o.qty;
          const perCycle = Math.max(0, Math.round(baseQty * lumenMult));
          const cyclesPaid = o.chance !== undefined
            ? clampPositive(completions * o.chance)
            : completions;
          const lit = perCycle * cyclesPaid;
          lumenGained += lit;
          next.lumen += lit;
          next.stats.lumenEarned = (next.stats.lumenEarned ?? 0) + lit;
        } else if (o.kind === 'resource') {
          if (o.id === 'flame') flameGained += qty;
          next[o.id] = (next[o.id] ?? 0) + qty;
        }
      }

      const perCycle = Math.round(action.xp * xpGrantMultiplier(next, mastery.level));
      const xpGain = perCycle * completions; // identical rounding to live play
      skill.xp += xpGain;
      xpGains[action.skill] = (xpGains[action.skill] ?? 0) + xpGain;
      grantRadianceFromXp(next, action.xp * completions, radianceGainMultiplier(next));
      const masteryPer = Math.round(action.masteryXp * masteryXpMultiplier(next));
      mastery.xp += masteryPer * completions;
      mastery.level = levelFromXp(mastery.xp);
      next.actions.completed[actionId] = (next.actions.completed[actionId] ?? 0) + completions;
      next.stats.actionsDone = (next.stats.actionsDone ?? 0) + completions;

      actionLines.push({ actionId, name: action.name, completions, xp: xpGain });
      if (missingId && completions < timeCompletions) {
        idleNotes.push({
          actionId, name: action.name, completions, missingId, timeCompletions,
        });
      }
    }
  }

  const levelUps = [];
  for (const [id, s] of Object.entries(next.skills)) {
    const lvl = levelFromXp(s.xp);
    // Assign the earned level into the save (D1 fix): XP alone is not enough —
    // startAction gates on skill.level, so an unassigned level locks skills.
    s.level = lvl;
    if (lvl > levelsBefore[id]) levelUps.push({ skillId: id, level: lvl });
  }

  // Wall-clock that produced credited work lands in playtime so the HUD
  // cannot go backwards on Claim (S4 honesty bug).
  if (creditedMs >= OFFLINE_MIN_AWAY_MS) {
    next.stats.playtimeMs = originalPlaytimeMs + creditedMs;
  }

  return {
    awayMs,
    creditedMs,
    capped,
    originalPlaytimeMs,
    gains: {
      items: Object.values(itemGains),
      lumen: lumenGained,
      flame: flameGained,
      xp: xpGains,
      actions: actionLines,
    },
    levelUps,
    nextState: next,
    idleNotes,
    hasGains: actionLines.length > 0,
    hasReport: actionLines.length > 0 || idleNotes.length > 0,
  };
}
