// Log Book / completion percentages. Total completion is the mean of four
// honest buckets we actually have: Skills, Mastery, Items, Feats.

import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES, TAB_OPEN_FEAT_IDS } from '../data/achievements.js';
import { PERKS } from '../data/perks.js';
import { isUnlocked, triggerMet } from './achievements.js';
import { cheapestAvailable } from './radiance.js';
import { DAILY_POOL_BY_ID } from '../data/dailies.js';
import { taskProgress } from './dailies.js';
import { ACTIONS, ACTIONS_BY_ID } from '../data/actions.js';
import { SKILLS, SKILL_BY_ID } from '../data/skills.js';
import { ITEMS } from '../data/items.js';
import { isItemKnown, itemTimesFound } from './stats.js';
import { MILESTONE_LEVEL } from '../../core/xp.js';
import { ENEMIES } from '../data/enemies/index.js';
import { ZONE_BY_ID } from '../data/combat/zones.js';
import { ACTION_GLYPH } from '../data/mastery.js';

/**
 * Completion-honesty rule (S4e): true completion must not move when you open
 * the Almanac. Visit and tab-open feats may still toast on the Feats tab;
 * they are excluded from the Feats bucket that feeds the LOG mean.
 */
export const COMPLETION_HONESTY_RULE =
  'True completion must not move when you open the Almanac. Visit and tab-open feats do not pad the LOG mean.';

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

export function logCategoryStats(state) {
  return [
    skillLogRow(state),
    masteryLogRow(state),
    itemsLogRow(state),
    featsLogRow(state),
  ];
}

function clampRatio(have, need) {
  if (!(need > 0)) return 0;
  return Math.min(1, Math.max(0, have / need));
}

const TAB_OPEN_FEAT_SET = new Set(TAB_OPEN_FEAT_IDS);

/** Wave-0 crafts only. The Almanac tab is not a skill inside this book. */
export function logSkillCrafts() {
  return SKILLS.filter((sk) => sk.wave === 0);
}

function skillLogRow(state) {
  const cap = MILESTONE_LEVEL;
  const live = logSkillCrafts();
  let have = 0;
  for (const sk of live) {
    have += Math.min(cap, state.skills?.[sk.id]?.level ?? 1);
  }
  const total = live.length * cap;
  return { id: 'skills', name: 'Skills', done: have, total, pct: clampRatio(have, total) };
}

function zoneIsPlayable(state, zone) {
  if (!zone) return false;
  const kindled = state.beacons?.kindled ?? [];
  return kindled.includes(zone.beaconId) || kindled.includes(zone.id);
}

/**
 * Every live action that already tracks mastery: emberkeeping, foraging, and
 * combat hunts on currently kindled stretches. No invented Mining/Fishing
 * rows; locked-zone hunts stay off the board.
 */
export function liveMasteryTracks(state) {
  const rows = [];
  for (const action of ACTIONS) {
    const level = state.skills?.[action.skill]?.level ?? 1;
    rows.push({
      id: action.id,
      name: action.name,
      skillId: action.skill,
      glyph: ACTION_GLYPH[action.id] ?? SKILL_BY_ID[action.skill]?.glyph ?? 'star',
      kind: 'action',
      locked: level < (action.unlockLevel ?? 1),
    });
  }
  for (const enemy of ENEMIES) {
    const zone = ZONE_BY_ID[enemy.zoneId];
    if (!zoneIsPlayable(state, zone)) continue;
    rows.push({
      id: enemy.id,
      name: enemy.name,
      skillId: 'combat',
      glyph: enemy.boss ? 'star' : 'sword',
      kind: 'hunt',
      locked: false,
    });
  }
  return rows;
}

/** Mastery is 0 until a cycle or hunt is actually practiced. */
export function practicedMasteryLevel(state, skillId, actionId) {
  const cap = MILESTONE_LEVEL;
  const m = state.skills?.[skillId]?.mastery?.[actionId];
  const cycles = state.actions?.completed?.[actionId] ?? 0;
  const kills = state.combat?.kills?.[actionId] ?? 0;
  if ((m?.xp ?? 0) <= 0 && cycles <= 0 && kills <= 0) return 0;
  return Math.min(cap, m?.level ?? 1);
}

function masteryLogRow(state) {
  const cap = MILESTONE_LEVEL;
  const tracks = liveMasteryTracks(state);
  let have = 0;
  for (const track of tracks) {
    have += practicedMasteryLevel(state, track.skillId, track.id);
  }
  const total = tracks.length * cap;
  return { id: 'mastery', name: 'Mastery', done: have, total, pct: clampRatio(have, total) };
}

function itemsLogRow(state) {
  const have = knownItemCount(state);
  const total = ITEMS.length;
  return { id: 'items', name: 'Items', done: have, total, pct: clampRatio(have, total) };
}

/** Unique registry ids marked found in play. Starter pack is not discovered. */
export function discoveredItemIds(state) {
  const found = [];
  for (const item of ITEMS) {
    if (state.discovered?.[item.id]) found.push(item.id);
  }
  return found;
}

/**
 * Catalogue / Almanac “known”: Times Found > 0 or discovered.
 * Occupancy (Hollow N/MAX) is unique held stacks — a different number.
 */
export function knownItemIds(state) {
  const found = [];
  for (const item of ITEMS) {
    if (isItemKnown(state, item.id)) found.push(item.id);
  }
  return found;
}

export function knownItemCount(state) {
  return knownItemIds(state).length;
}

export function skillLogDetails(state) {
  const cap = MILESTONE_LEVEL;
  const rows = [];
  for (const sk of SKILLS) {
    // Almanac is the tab you are in — never a craft named Almanac in this book.
    if (sk.id === 'almanac') continue;
    const live = sk.wave === 0;
    const done = live ? Math.min(cap, state.skills?.[sk.id]?.level ?? 1) : 0;
    rows.push({
      id: sk.id,
      name: sk.name,
      glyph: sk.glyph,
      done,
      total: cap,
      pct: live ? clampRatio(done, cap) : 0,
      live,
      locked: !live,
    });
  }
  rows.sort((a, b) => Number(a.locked) - Number(b.locked));
  return rows;
}

export function masteryLogDetails(state) {
  const cap = MILESTONE_LEVEL;
  return liveMasteryTracks(state).map((track) => {
    const done = practicedMasteryLevel(state, track.skillId, track.id);
    return {
      id: track.id,
      name: track.name,
      skillId: track.skillId,
      glyph: track.glyph,
      kind: track.kind,
      locked: track.locked,
      done,
      total: cap,
      pct: clampRatio(done, cap),
    };
  });
}

export function itemsLogDetails(state) {
  const found = [];
  const missing = [];
  for (const item of ITEMS) {
    const known = isItemKnown(state, item.id);
    const times = itemTimesFound(state, item.id);
    const row = {
      id: item.id,
      name: item.name,
      found: known,
      mystery: !known,
      timesFound: times,
    };
    (row.found ? found : missing).push(row);
  }
  return { found, missing };
}

/** Feats that feed the LOG mean — visit/tab-open feats are excluded. */
export function logFeatAchievements() {
  return ACHIEVEMENTS.filter((a) => !TAB_OPEN_FEAT_SET.has(a.id));
}

function featsLogRow(state) {
  const list = logFeatAchievements();
  const done = list.filter((a) => isUnlocked(state, a.id)).length;
  return { id: 'feats', name: 'Feats', done, total: list.length, pct: clampRatio(done, list.length) };
}

/**
 * Headline percents must move once practice exists. 7/1089 is ~0.6% — flooring
 * that to 0% next to Feats 27% made the LOG look like mastery did not count.
 */
export function formatCompletionPct(pct) {
  const n = Math.max(0, Math.min(1, Number(pct) || 0));
  if (n <= 0) return '0%';
  const hundred = n * 100;
  if (hundred < 1) {
    const tenths = Math.max(0.1, Number(hundred.toFixed(1)));
    if (tenths >= 1) return '1%';
    return `${tenths.toFixed(1)}%`;
  }
  return `${Math.floor(hundred)}%`;
}

/** Front-and-centre number: mean of Skills / Mastery / Items / Feats. */
export function totalCompletion(state) {
  const rows = logCategoryStats(state);
  const pct = rows.length ? rows.reduce((s, r) => s + r.pct, 0) / rows.length : 0;
  return { pct, label: formatCompletionPct(pct) };
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
