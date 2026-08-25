// One stack of numeric bonuses. Live ticks, offline calc, and UI ETAs all
// call these helpers so the three never disagree.
//
// Application ORDER (tested):
//   mastery → camp → radiance → achievement → mastery-hooks
// Each layer is a multiplier of the form (1 + bonus). Layers are NOT added
// into a single percentage first — that would under-count late-game stacks.

import * as camp from './upgrades.js';
import { perkBonus } from './radiance.js';
import { achievementBonus } from './achievements.js';
import { masteryHookBonus } from './mastery-hooks.js';

/** Mirrors action-runner; kept here to avoid an import cycle. */
export const MASTERY_XP_BONUS_PER_LEVEL = 0.01;

export const EFFECT_APPLY_ORDER = Object.freeze([
  'mastery',
  'camp',
  'radiance',
  'achievement',
  'hooks',
]);

export const YIELD_CHANCE_CAP = 0.55;

/**
 * Multiply (1 + layer) in EFFECT_APPLY_ORDER. Missing keys are 0.
 * @param {Record<string, number>} layers
 */
export function applyStackedBonuses(layers) {
  let m = 1;
  for (const key of EFFECT_APPLY_ORDER) {
    const b = layers[key] ?? 0;
    m *= 1 + b;
  }
  return m;
}

function layersFor(state, stat, { masteryLevel = 0 } = {}) {
  const mastery = stat === 'xp' ? MASTERY_XP_BONUS_PER_LEVEL * masteryLevel : 0;
  const campB = campBonusFor(state, stat);
  return {
    mastery,
    camp: campB,
    radiance: perkBonus(state, stat),
    achievement: achievementBonus(state, stat),
    hooks: masteryHookBonus(state, stat),
  };
}

function campBonusFor(state, stat) {
  if (stat === 'xp') return camp.xpMultiplier(state) - 1;
  if (stat === 'speed') return camp.speedMultiplier(state) - 1;
  if (stat === 'yield') return camp.yieldChance(state);
  return 0;
}

/** Skill-XP multiplier for one cycle (includes mastery of that action). */
export function xpGrantMultiplier(state, masteryLevel) {
  return applyStackedBonuses(layersFor(state, 'xp', { masteryLevel }));
}

/** Duration divisor (≥1). */
export function speedMultiplier(state) {
  return applyStackedBonuses({
    ...layersFor(state, 'speed'),
    mastery: 0, // mastery does not shorten cycles
  });
}

export function effectiveDurationMs(state, action) {
  return Math.max(1, Math.round(action.durationMs / speedMultiplier(state)));
}

/** Additive chance, then cap. Camp yield is already a chance, not a (1+x). */
export function yieldChance(state) {
  const campY = camp.yieldChance(state);
  const extra = perkBonus(state, 'yield')
    + achievementBonus(state, 'yield')
    + masteryHookBonus(state, 'yield');
  const raw = campY + extra;
  return Math.min(YIELD_CHANCE_CAP, Math.round(raw * 1e9) / 1e9);
}

export function lumenGainMultiplier(state) {
  return applyStackedBonuses({
    ...layersFor(state, 'lumen'),
    mastery: 0,
    camp: 0,
  });
}

export function radianceGainMultiplier(state) {
  return applyStackedBonuses({
    ...layersFor(state, 'radiance'),
    mastery: 0,
    camp: 0,
  });
}

export function masteryXpMultiplier(state) {
  return applyStackedBonuses({
    ...layersFor(state, 'masteryXp'),
    mastery: 0,
    camp: 0,
  });
}
