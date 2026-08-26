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
import { formatMissingChip, formatNumber } from './format.js';
import {
  xpGrantMultiplier, effectiveDurationMs, lumenGainMultiplier,
  radianceGainMultiplier, masteryXpMultiplier,
} from '../game/systems/modifiers.js';
import { grantRadianceFromXp } from '../game/systems/radiance.js';
import { tryBankAdd } from '../game/systems/bank.js';
import { cascadeAchievements } from '../game/systems/achievements.js';
import { pushLog } from '../game/state.js';

export const OFFLINE_CAP_HOURS = 12;
export const OFFLINE_MIN_AWAY_MS = 60_000;

function clampPositive(n) { return Math.max(0, Math.floor(n)); }

/**
 * @returns {{
 *   awayMs:number, creditedMs:number, capped:boolean,
 *   gains:{ items:{id:string,name:string,qty:number}, lumen:number, flame:number,
 *           radiance:number, xp:Object<string,number>, actions:Array },
 *   levelUps:Array<{skillId:string,from:number,to:number,level:number}>,
 *   masteryUps:Array<{actionId:string,name:string,skillId:string,from:number,to:number}>,
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
  const masteryUps = [];
  let lumenGained = 0;
  let flameGained = 0;
  let radianceGained = 0;
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
        // Always name a fuel halt, even at ×0 — dropping the line hid "out of
        // Tinderscrap" from the recap while feats still fired.
        if (missingId) {
          idleNotes.push({
            actionId, name: action.name, completions: 0, missingId, timeCompletions,
            remainingQty: next.bank[missingId] ?? 0,
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
      const masteryFrom = skill.mastery[actionId]?.level ?? 1;
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
          const granted = tryBankAdd(next, o.id, qty);
          if (!granted.ok) continue;
          const slot = (itemGains[o.id] ??= {
            id: o.id,
            name: o.id,
            qty: 0,
          });
          slot.qty += granted.added;
          next.stats.itemsGathered = (next.stats.itemsGathered ?? 0) + granted.added;
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
      radianceGained += grantRadianceFromXp(
        next, action.xp * completions, radianceGainMultiplier(next),
      );
      const masteryPer = Math.round(action.masteryXp * masteryXpMultiplier(next));
      mastery.xp += masteryPer * completions;
      mastery.level = levelFromXp(mastery.xp);
      if (mastery.level > masteryFrom) {
        masteryUps.push({
          actionId, name: action.name, skillId: action.skill,
          from: masteryFrom, to: mastery.level,
        });
      }
      next.actions.completed[actionId] = (next.actions.completed[actionId] ?? 0) + completions;
      next.stats.actionsDone = (next.stats.actionsDone ?? 0) + completions;

      actionLines.push({
        actionId, name: action.name, completions, xp: xpGain, creditedMs,
      });
      if (missingId && completions < timeCompletions) {
        idleNotes.push({
          actionId, name: action.name, completions, missingId, timeCompletions,
          remainingQty: next.bank[missingId] ?? 0,
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
    if (lvl > levelsBefore[id]) {
      levelUps.push({ skillId: id, from: levelsBefore[id], to: lvl, level: lvl });
    }
  }

  // Credited wall-clock lands in playtime only when cycles actually ran.
  // A feats-only / fuel-halt rewind must not stuff idle hours into
  // "Time by the Flame" or light "The Work Went On".
  const hasGains = actionLines.length > 0;
  if (hasGains) {
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
      radiance: radianceGained,
      xp: xpGains,
      actions: actionLines,
    },
    levelUps,
    masteryUps,
    nextState: next,
    idleNotes,
    recapLines: mergeRecapLines(actionLines, idleNotes),
    hasGains,
    hasReport: hasGains || idleNotes.length > 0,
  };
}

/**
 * Melvor still shows Welcome Back on empty-away. Hollowlight must recap
 * every absence at/above the min threshold, including idle / feats-only.
 * Claim (or a Claim-equivalent skip) is still the only way to close it.
 */
export function shouldOfferOfflineRecap(res) {
  return (res?.awayMs ?? 0) >= OFFLINE_MIN_AWAY_MS;
}

function isIdleRecap(res) {
  return !res?.hasGains && (res?.idleNotes?.length ?? 0) === 0;
}

/**
 * Idle / feats-only headline. Halted actions already have recap lines, so they
 * return null. Never hide an empty-away behind silence. Feats-only still uses
 * this headline — names live under Feats on Claim, not in the title.
 */
export function formatIdleRecapLine(res, _featPreview) {
  if (!isIdleRecap(res)) return null;
  return 'Nothing ran.';
}

/** What sat still on an idle away. Player voice; one sentence. */
export const IDLE_RECAP_STILLNESS =
  'With nothing queued, Time by the Flame and the dailies sat still.';

export function formatIdleRecapStillness(res) {
  if (!isIdleRecap(res)) return null;
  return IDLE_RECAP_STILLNESS;
}

/** `+3,240 · 1,080/h` — honest EV rate from credited window. */
export function formatOfflineHourRate(qty, creditedMs) {
  if (!(creditedMs > 0) || !(qty > 0) || !Number.isFinite(qty)) return '';
  const perHour = qty / (creditedMs / 3_600_000);
  if (!(perHour > 0) || !Number.isFinite(perHour)) return '';
  return `${formatNumber(Math.round(perHour))}/h`;
}

function mergeRecapLines(actionLines, idleNotes) {
  /** @type {Map<string, object>} */
  const byId = new Map();
  for (const line of actionLines) byId.set(line.actionId, { ...line });
  for (const note of idleNotes) {
    const prev = byId.get(note.actionId);
    if (prev) {
      byId.set(note.actionId, {
        ...prev,
        missingId: note.missingId,
        timeCompletions: note.timeCompletions,
        remainingQty: note.remainingQty,
      });
    } else {
      byId.set(note.actionId, { ...note, xp: 0 });
    }
  }
  return [...byId.values()];
}

/**
 * One recap sentence. Halted actions always include ×N (including 0 and 1)
 * and name the leftover stack (`out of Tinderscrap ×0` when empty).
 * @param {{name:string, completions?:number, missingId?:string, xp?:number, remainingQty?:number}} line
 * @param {(id:string)=>string} [resolveItem]
 */
export function formatRecapLine(line, resolveItem = (id) => id) {
  const n = line.completions ?? 0;
  let text = `${line.name} ×${n}`;
  if (line.missingId) {
    const left = Number.isFinite(line.remainingQty) ? line.remainingQty : 0;
    text += ` — ${formatMissingChip(resolveItem(line.missingId), left)}`;
  } else if (line.xp > 0) {
    text += ` · +${line.xp} XP`;
    const rate = formatOfflineHourRate(n, line.creditedMs);
    if (rate) text += ` · ${rate}`;
  }
  return text;
}

/** `Foraging 1 → 21` — skill name resolved by the caller (data-free engine). */
export function formatLevelUpLine(lu, resolveSkill = (id) => id) {
  const from = lu.from ?? 1;
  const to = lu.to ?? lu.level;
  return `${resolveSkill(lu.skillId)} ${from} → ${to}`;
}

/**
 * Single-action recaps say `Mastery 1 → 18`. Multiple actions name the craft.
 * @param {{name:string, from:number, to:number}} mu
 * @param {{named?:boolean}} [opts]
 */
export function formatMasteryUpLine(mu, { named = false } = {}) {
  const label = named ? `${mu.name} mastery` : 'Mastery';
  return `${label} ${mu.from} → ${mu.to}`;
}

/** Always-on cap chip. Short enough for a 360 away-line. */
export function formatOfflineCapNote(capHours = OFFLINE_CAP_HOURS) {
  return `Cap ${capHours}h.`;
}

/**
 * Wallet + feats Claim will apply on top of `res.nextState`.
 * OfflineClaims (and "The Work Went On") only fire when cycles actually ran.
 */
export function previewOfflineClaim(res) {
  const preview = structuredClone(res.nextState);
  preview.stats ??= {};
  if (res.hasGains) {
    preview.stats.offlineClaims = (preview.stats.offlineClaims ?? 0) + 1;
  }
  const beforeL = preview.lumen;
  const beforeR = preview.radiance ?? 0;
  const newly = cascadeAchievements(preview, {
    onUnlock(a) {
      pushLog(preview, `Feat lit: ${a.name}.`, preview.stats.playtimeMs ?? 0);
    },
  });
  return {
    feats: newly,
    lumen: preview.lumen - beforeL,
    radiance: (preview.radiance ?? 0) - beforeR,
    state: preview,
  };
}

/** Recap arithmetic: action wallet + feat wallet. Matches post-Claim HUD. */
export function recapWalletDelta(res, featPreview) {
  return {
    lumen: (res.gains?.lumen ?? 0) + (featPreview?.lumen ?? 0),
    radiance: (res.gains?.radiance ?? 0) + (featPreview?.radiance ?? 0),
    flame: res.gains?.flame ?? 0,
  };
}
