// Daily ember rotation: 3 tasks, one reroll, UTC-day seed. Missing a day
// does not punish — a new set simply appears.

import { createRng } from '../../core/rng.js';
import {
  DAILY_POOL, DAILY_POOL_BY_ID, DAILY_TASK_COUNT, DAILY_REROLLS_PER_DAY,
} from '../data/dailies.js';
import { ACTIONS_BY_ID } from '../data/actions.js';

export function utcDayKey(nowMs) {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function seedFromKey(key, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** True when the save can actually advance this ember (unlockLevel met). */
export function isDailyProgressable(state, taskId) {
  const def = DAILY_POOL_BY_ID[taskId];
  if (!def) return false;
  if (def.actionId) {
    const action = ACTIONS_BY_ID[def.actionId];
    if (!action) return false;
    const level = state.skills?.[action.skill]?.level ?? 1;
    if (level < (action.unlockLevel ?? 1)) return false;
  }
  return true;
}

function pickSet(dayKey, salt, exclude = new Set(), count = DAILY_TASK_COUNT, state = null) {
  const rng = createRng(seedFromKey(dayKey, salt));
  const pool = DAILY_POOL.filter((t) => {
    if (exclude.has(t.id)) return false;
    if (state && !isDailyProgressable(state, t.id)) return false;
    return true;
  });
  const chosen = [];
  const bag = [...pool];
  while (chosen.length < count && bag.length) {
    const i = rng.int(bag.length);
    chosen.push(bag.splice(i, 1)[0]);
  }
  return chosen.map((t) => ({
    id: t.id,
    need: t.need,
    reward: t.reward,
    claimed: false,
  }));
}

function replaceGatedTasks(state) {
  const tasks = state.dailies?.tasks ?? [];
  if (!tasks.length) return;
  const keep = [];
  let need = 0;
  for (const t of tasks) {
    if (t.claimed || isDailyProgressable(state, t.id)) keep.push(t);
    else need += 1;
  }
  if (!need) {
    state.dailies.tasks = keep;
    return;
  }
  const exclude = new Set(tasks.map((t) => t.id));
  const fill = pickSet(state.dailies.dayKey, 17, exclude, need, state);
  state.dailies.tasks = [...keep, ...snapshotBaselines(state, fill)].slice(0, DAILY_TASK_COUNT);
}

function snapshotBaselines(state, tasks) {
  return tasks.map((t) => ({ ...t, baseline: readProgress(state, t.id) }));
}

export function readProgress(state, taskId) {
  const def = DAILY_POOL_BY_ID[taskId];
  if (!def) return 0;
  const st = state.stats ?? {};
  if (def.kind === 'cycles') {
    if (def.actionId) return state.actions?.completed?.[def.actionId] ?? 0;
    let n = 0;
    for (const v of Object.values(state.actions?.completed ?? {})) n += v;
    return n;
  }
  if (def.kind === 'lumenEarned') return st.lumenEarned ?? 0;
  if (def.kind === 'itemsGathered') return st.itemsGathered ?? 0;
  if (def.kind === 'playMinutes') return Math.floor((st.playtimeMs ?? 0) / 60_000);
  if (def.kind === 'skillLevel') return state.skills?.[def.skillId]?.level ?? 1;
  return 0;
}

export function taskProgress(state, task) {
  const def = DAILY_POOL_BY_ID[task.id];
  const now = readProgress(state, task.id);
  const gained = def?.kind === 'skillLevel'
    ? now
    : Math.max(0, now - (task.baseline ?? 0));
  const need = task.need ?? def?.need ?? 1;
  return { current: Math.min(gained, need), need, done: gained >= need };
}

export function ensureDailies(state, nowMs) {
  const key = utcDayKey(nowMs);
  if (state.dailies?.dayKey === key && Array.isArray(state.dailies.tasks)) {
    replaceGatedTasks(state);
    return state.dailies;
  }
  state.dailies = {
    dayKey: key,
    rerollsUsed: 0,
    tasks: snapshotBaselines(state, pickSet(key, 0, new Set(), DAILY_TASK_COUNT, state)),
  };
  return state.dailies;
}

export function canReroll(state) {
  return (state.dailies?.rerollsUsed ?? 0) < DAILY_REROLLS_PER_DAY;
}

export function rerollDailies(state, nowMs) {
  ensureDailies(state, nowMs);
  if (!canReroll(state)) return { ok: false, error: 'Already rerolled today.' };
  const key = state.dailies.dayKey;
  const kept = (state.dailies.tasks ?? []).filter((t) => t.claimed);
  const slots = Math.max(0, DAILY_TASK_COUNT - kept.length);
  const exclude = new Set((state.dailies.tasks ?? []).map((t) => t.id));
  let next = slots > 0 ? pickSet(key, 1, exclude, slots, state) : [];
  // If the pool is too small to exclude all, pickSet may return fewer — fall
  // back to a salted pick that may overlap unclaimed ids, never claimed ones.
  if (next.length !== slots) {
    const claimedIds = new Set(kept.map((t) => t.id));
    next = pickSet(key, 99, claimedIds, slots, state);
  }
  const fresh = snapshotBaselines(state, next);
  state.dailies.rerollsUsed += 1;
  state.dailies.tasks = [...kept, ...fresh].slice(0, DAILY_TASK_COUNT);
  state.stats.dailyRerolls = (state.stats.dailyRerolls ?? 0) + 1;
  return { ok: true, tasks: state.dailies.tasks };
}

export function claimDaily(state, taskId) {
  const slot = state.dailies?.tasks?.find((t) => t.id === taskId);
  if (!slot) return { ok: false, error: 'Unknown ember.' };
  if (slot.claimed) return { ok: false, error: 'Already claimed.' };
  const prog = taskProgress(state, slot);
  if (!prog.done) return { ok: false, error: 'Not finished yet.' };
  slot.claimed = true;
  const sparks = slot.reward ?? DAILY_POOL_BY_ID[taskId]?.reward ?? 0;
  // Daily sparks are whole Radiance, not XP conversion.
  state.radiance = (state.radiance ?? 0) + sparks;
  state.radianceEarned = (state.radianceEarned ?? 0) + sparks;
  state.stats.radianceEarned = (state.stats.radianceEarned ?? 0) + sparks;
  state.stats.dailiesDone = (state.stats.dailiesDone ?? 0) + 1;
  return { ok: true, sparks };
}

