// Log Book / completion percentages. Total completion is the average of
// category percents (achievements) plus constellation fill, so a returning
// player can see one number and three next-hints.

import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES } from '../data/achievements.js';
import { PERKS } from '../data/perks.js';
import { isUnlocked, triggerMet } from './achievements.js';
import { cheapestAvailable } from './radiance.js';
import { DAILY_POOL_BY_ID } from '../data/dailies.js';
import { taskProgress } from './dailies.js';
import { ACTIONS_BY_ID } from '../data/actions.js';
import { SKILL_BY_ID } from '../data/skills.js';

export function categoryStats(state) {
  const rows = [];
  for (const cat of ACHIEVEMENT_CATEGORIES) {
    const list = ACHIEVEMENTS.filter((a) => a.category === cat.id);
    const done = list.filter((a) => isUnlocked(state, a.id)).length;
    rows.push({
      id: cat.id,
      name: cat.name,
      done,
      total: list.length,
      pct: list.length ? done / list.length : 0,
    });
  }
  return rows;
}

export function achievementCompletion(state) {
  const done = ACHIEVEMENTS.filter((a) => isUnlocked(state, a.id)).length;
  return { done, total: ACHIEVEMENTS.length, pct: done / ACHIEVEMENTS.length };
}

export function perkCompletion(state) {
  const done = state.perks?.owned?.length ?? 0;
  return { done, total: PERKS.length, pct: done / PERKS.length };
}

/** Front-and-centre number: mean of achievement % and constellation %. */
export function totalCompletion(state) {
  const a = achievementCompletion(state).pct;
  const p = perkCompletion(state).pct;
  const pct = (a + p) / 2;
  return { pct, label: `${Math.floor(pct * 100)}%` };
}

export function nextAchievementHint(state) {
  for (const a of ACHIEVEMENTS) {
    if (isUnlocked(state, a.id)) continue;
    if (a.category === 'kills') continue; // combat lane; don't tease a wall
    return a;
  }
  return null;
}

/**
 * Three concrete next-wants for Camp (charter: visible within 5 seconds).
 */
export function nextWants(state) {
  const wants = [];

  const daily = (state.dailies?.tasks ?? []).find((t) => {
    if (t.claimed) return false;
    const p = taskProgress(state, t);
    return !p.done;
  });
  if (daily) {
    const def = DAILY_POOL_BY_ID[daily.id];
    const p = taskProgress(state, daily);
    wants.push({
      id: 'daily',
      title: def?.label ?? daily.id,
      detail: `${p.current}/${p.need} · ${daily.reward} Radiance`,
      go: 'dailies',
    });
  } else if ((state.dailies?.tasks ?? []).some((t) => !t.claimed)) {
    wants.push({
      id: 'daily-claim',
      title: 'An ember is ready',
      detail: 'Claim today’s Radiance spark.',
      go: 'dailies',
    });
  }

  const perk = cheapestAvailable(state);
  if (perk) {
    wants.push({
      id: 'perk',
      title: perk.name,
      detail: `${perk.cost} Radiance · ${state.radiance ?? 0} held`,
      go: 'stars',
    });
  }

  const ach = nextAchievementHint(state);
  if (ach) {
    wants.push({
      id: 'ach',
      title: ach.name,
      detail: ach.desc,
      go: 'achievements',
    });
  }

  // Skill unlock teaser if we still have room.
  if (wants.length < 3) {
    for (const a of Object.values(ACTIONS_BY_ID)) {
      const sk = state.skills[a.skill];
      if (sk && sk.level < a.unlockLevel) {
        wants.push({
          id: 'unlock',
          title: a.name,
          detail: `${SKILL_BY_ID[a.skill]?.name} ${a.unlockLevel}`,
          go: 'skills',
          skillId: a.skill,
        });
        break;
      }
    }
  }

  return wants.slice(0, 3);
}

export function closestAchievement(state) {
  // Prefer one that is "almost" met for the log-book hint line.
  let best = null;
  let bestPct = -1;
  for (const a of ACHIEVEMENTS) {
    if (isUnlocked(state, a.id)) continue;
    if (a.category === 'kills') continue;
    const met = triggerMet(state, a.trigger);
    if (met) return a;
    const approx = roughProgress(state, a.trigger);
    if (approx > bestPct) {
      bestPct = approx;
      best = a;
    }
  }
  return best;
}

function roughProgress(state, trigger) {
  if (!trigger) return 0;
  const st = state.stats ?? {};
  const ratio = (have, need) => (need > 0 ? Math.min(1, have / need) : 0);
  switch (trigger.type) {
    case 'skillLevel':
      return ratio(state.skills[trigger.skill]?.level ?? 1, trigger.level);
    case 'cyclesTotal': {
      let n = 0;
      for (const v of Object.values(state.actions?.completed ?? {})) n += v;
      return ratio(n, trigger.count);
    }
    case 'playtime':
      return ratio(st.playtimeMs ?? 0, trigger.ms);
    case 'radianceEarned':
      return ratio(state.radianceEarned ?? 0, trigger.count);
    default:
      return 0;
  }
}
