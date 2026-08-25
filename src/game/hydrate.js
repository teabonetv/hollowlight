// Additive save hydration for S4 fields. Kept out of save.js ↔ state.js so
// neither module has to import the other at init time.

import { ACTIONS } from './data/actions.js';
import { hydrateStats } from './systems/stats.js';

export function hydrateState(state) {
  if (!state || typeof state !== 'object') return state;
  state.radiance ??= 0;
  state.radianceFrac ??= 0;
  state.radianceEarned ??= 0;
  state.perks ??= { owned: [], respecs: 0 };
  state.perks.owned ??= [];
  state.perks.respecs ??= 0;
  state.achievements ??= { unlocked: {} };
  state.achievements.unlocked ??= {};
  state.cosmetics ??= { titles: [], frames: ['plain'], lanternFrame: 'plain', activeTitle: null };
  state.cosmetics.titles ??= [];
  state.cosmetics.frames ??= ['plain'];
  state.dailies ??= null;
  state.actions ??= { active: {}, autoRestart: {}, completed: {} };
  state.actions.autoRestart ??= {};
  for (const a of ACTIONS) {
    if (state.actions.autoRestart[a.id] === undefined) {
      state.actions.autoRestart[a.id] = true;
    }
  }
  state.stats = hydrateStats(state.stats, state.createdAt ?? 0);
  state.log ??= [];
  return state;
}
