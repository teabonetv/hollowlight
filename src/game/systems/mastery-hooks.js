// Mastery-hook bonuses: small perks that fire once a listed mastery milestone
// is reached on an action. Pure reads over state.skills.*.mastery.

import { MASTERY_HOOKS } from '../data/mastery.js';
import { ACTIONS_BY_ID } from '../data/actions.js';

export function masteryHookBonus(state, stat) {
  let sum = 0;
  for (const [actionId, hooks] of Object.entries(MASTERY_HOOKS)) {
    const skillId = ACTIONS_BY_ID[actionId]?.skill;
    const level = skillId
      ? (state.skills?.[skillId]?.mastery?.[actionId]?.level ?? 1)
      : 1;
    for (const h of hooks) {
      if (level >= h.level && h.reward?.kind === 'perk' && h.reward.stat === stat) {
        sum += h.reward.value ?? 0;
      }
    }
  }
  return sum;
}
