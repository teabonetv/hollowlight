// Achievement trigger evaluation + one-shot rewards.

import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID } from '../data/achievements.js';
import { PERKS } from '../data/perks.js';
import { ownedSet } from './radiance.js';

/** Player-facing feat toast. Lumen/Radiance grants name the wallet delta. */
export function featToastMessage(a) {
  const r = a?.reward;
  if (r?.kind === 'lumen' && r.qty > 0) return `Feat: ${a.name}. +✦${r.qty}.`;
  if (r?.kind === 'radiance' && r.qty > 0) {
    return `Feat: ${a.name}. +${r.qty} Radiance.`;
  }
  return `Feat: ${a.name}.`;
}

/** One mutation, one toast: keep the action line and any feat unlocks together. */
export function actionFeatToast(actionLine, feats) {
  const featPart = (feats ?? []).map(featToastMessage).filter(Boolean).join(' ');
  const action = String(actionLine ?? '').trim();
  if (action && featPart) return `${action} ${featPart}`;
  return action || featPart;
}

export function achievementBonus(state, stat) {
  let sum = 0;
  for (const id of Object.keys(state.achievements?.unlocked ?? {})) {
    const a = ACHIEVEMENTS_BY_ID[id];
    const r = a?.reward;
    if (r?.kind === 'perk' && r.stat === stat) sum += r.value ?? 0;
  }
  return sum;
}

export function isUnlocked(state, id) {
  return !!state.achievements?.unlocked?.[id];
}

export function triggerMet(state, trigger) {
  if (!trigger) return false;
  const st = state.stats ?? {};
  const skills = state.skills ?? {};
  switch (trigger.type) {
    case 'skillLevel':
      return (skills[trigger.skill]?.level ?? 1) >= trigger.level;
    case 'anySkillLevel':
      return Object.values(skills).some((s) => (s.level ?? 1) >= trigger.level);
    case 'allSkillsLevel':
      return (trigger.skills ?? []).every((id) => (skills[id]?.level ?? 1) >= trigger.level);
    case 'skillLevelSum': {
      let sum = 0;
      for (const s of Object.values(skills)) sum += s.level ?? 1;
      return sum >= trigger.level;
    }
    case 'masteryLevel': {
      for (const s of Object.values(skills)) {
        if ((s.mastery?.[trigger.actionId]?.level ?? 1) >= trigger.level) return true;
      }
      return false;
    }
    case 'anyMasteryLevel': {
      for (const s of Object.values(skills)) {
        for (const m of Object.values(s.mastery ?? {})) {
          if ((m.level ?? 1) >= trigger.level) return true;
        }
      }
      return false;
    }
    case 'cyclesTotal': {
      let n = 0;
      for (const v of Object.values(state.actions?.completed ?? {})) n += v;
      return n >= trigger.count;
    }
    case 'cyclesAction':
      return (state.actions?.completed?.[trigger.actionId] ?? 0) >= trigger.count;
    case 'itemsGathered':
      return (st.itemsGathered ?? 0) >= trigger.count;
    case 'bankAtLeast':
      return (state.bank?.[trigger.itemId] ?? 0) >= trigger.count;
    case 'itemsKnown':
      return Object.keys(state.bank ?? {}).filter((k) => (state.bank[k] ?? 0) > 0).length >= trigger.count;
    case 'lumenEarned':
      return (st.lumenEarned ?? 0) >= trigger.count;
    case 'lumenSpent':
      return (st.lumenSpent ?? 0) >= trigger.count;
    case 'sells':
      return (st.sells ?? 0) >= trigger.count;
    case 'beaconsKindled':
      return (st.beaconsKindled ?? 1) >= trigger.count;
    case 'mapOpens':
      return (st.mapOpens ?? 0) >= trigger.count;
    case 'logCount':
      return (state.log?.length ?? 0) >= trigger.count;
    case 'almanacOpens':
      return (st.almanacOpens ?? 0) >= trigger.count;
    case 'starsOpens':
      return (st.starsOpens ?? 0) >= trigger.count;
    case 'settingsOpens':
      return (st.settingsOpens ?? 0) >= trigger.count;
    case 'kills':
      return (st.kills ?? 0) >= trigger.count;
    case 'deaths':
      return (st.deaths ?? 0) >= trigger.count;
    case 'unkilledPlay':
      return (st.deaths ?? 0) === 0 && (st.playtimeMs ?? 0) >= trigger.ms;
    case 'guardians':
      return (st.guardians ?? 0) >= trigger.count;
    case 'radianceEarned':
      return (state.radianceEarned ?? st.radianceEarned ?? 0) >= trigger.count;
    case 'perksOwned':
      return (state.perks?.owned?.length ?? 0) >= trigger.count;
    case 'capstoneOwned': {
      const owned = ownedSet(state);
      const n = PERKS.filter((p) => p.capstone && owned.has(p.id)).length;
      return n >= trigger.count;
    }
    case 'respecs':
      return (state.perks?.respecs ?? 0) >= trigger.count;
    case 'playtime':
      return (st.playtimeMs ?? 0) >= trigger.ms;
    case 'offlineClaims':
      return (st.offlineClaims ?? 0) >= trigger.count;
    case 'autoRestartToggles':
      return (st.autoRestartToggles ?? 0) >= trigger.count;
    case 'tinderHalts':
      return (st.tinderHalts ?? 0) >= trigger.count;
    case 'manualStops':
      return (st.manualStops ?? 0) >= trigger.count;
    case 'lumenExactly':
      return (state.lumen ?? 0) === trigger.count;
    case 'lumenAtLeast':
      return (state.lumen ?? 0) >= trigger.count;
    case 'dailiesDone':
      return (st.dailiesDone ?? 0) >= trigger.count;
    case 'dailyRerolls':
      return (st.dailyRerolls ?? 0) >= trigger.count;
    case 'titleEquipped':
      return (state.cosmetics?.activeTitle ? 1 : 0) >= trigger.count;
    default:
      return false;
  }
}

/** Evaluate all locked achievements; apply rewards for newly met ones. */
export function evaluateAchievements(state) {
  const newly = [];
  state.achievements ??= { unlocked: {} };
  for (const a of ACHIEVEMENTS) {
    if (state.achievements.unlocked[a.id]) continue;
    if (!triggerMet(state, a.trigger)) continue;
    unlockAchievement(state, a);
    newly.push(a);
  }
  return newly;
}

/**
 * Keep evaluating until a pass unlocks nothing. Feats that grant titles/logs/lumen
 * can trip later feats in the same player action (boot Cataloguer → Wear a Name
 * → journal line → Write It Down).
 */
export function cascadeAchievements(state, { onUnlock, maxPasses = 12 } = {}) {
  const all = [];
  for (let i = 0; i < maxPasses; i++) {
    const newly = evaluateAchievements(state);
    if (!newly.length) break;
    for (const a of newly) onUnlock?.(a);
    all.push(...newly);
  }
  return all;
}

export function unlockAchievement(state, a) {
  state.achievements ??= { unlocked: {} };
  if (state.achievements.unlocked[a.id]) return;
  state.achievements.unlocked[a.id] = { atMs: state.stats?.playtimeMs ?? 0 };
  applyReward(state, a.reward);
}

function applyReward(state, reward) {
  if (!reward) return;
  state.cosmetics ??= { titles: [], lanternFrame: 'plain', activeTitle: null };
  if (reward.kind === 'lumen') {
    state.lumen = (state.lumen ?? 0) + reward.qty;
    state.stats.lumenEarned = (state.stats.lumenEarned ?? 0) + reward.qty;
  } else if (reward.kind === 'radiance') {
    state.radiance = (state.radiance ?? 0) + reward.qty;
    state.radianceEarned = (state.radianceEarned ?? 0) + reward.qty;
    state.stats.radianceEarned = (state.stats.radianceEarned ?? 0) + reward.qty;
  } else if (reward.kind === 'title') {
    if (!state.cosmetics.titles.includes(reward.title)) {
      state.cosmetics.titles.push(reward.title);
    }
    if (!state.cosmetics.activeTitle) state.cosmetics.activeTitle = reward.title;
  } else if (reward.kind === 'frame') {
    state.cosmetics.frames ??= ['plain'];
    if (!state.cosmetics.frames.includes(reward.frame)) {
      state.cosmetics.frames.push(reward.frame);
    }
  }
  // perk rewards are passive via achievementBonus()
}

export { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID };
