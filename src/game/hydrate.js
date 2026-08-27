// Additive save hydration for S4 fields. Kept out of save.js ↔ state.js so
// neither module has to import the other at init time.

import { ACTIONS } from './data/actions.js';
import { hydrateStats, floorItemFoundToHeld } from './systems/stats.js';
import { ensureCombat } from './systems/combat.js';

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
  const c = state.cosmetics ?? {};
  state.cosmetics = {
    bankTheme: c.bankTheme ?? 'default',
    unlocked: Array.isArray(c.unlocked) ? c.unlocked : ['default'],
    titles: Array.isArray(c.titles) ? c.titles : [],
    frames: Array.isArray(c.frames) ? c.frames : ['plain'],
    lanternFrame: c.lanternFrame ?? 'plain',
    activeTitle: c.activeTitle ?? null,
  };
  state.bankPins ??= [];
  state.bankPresets ??= [];
  state.bankLocks = Array.isArray(state.bankLocks) ? state.bankLocks : [];
  state.store ??= { pressure: {}, pressureAt: {} };
  if (!Number.isFinite(state.lanternIntegrity)) state.lanternIntegrity = 100;
  state.dailies ??= null;
  state.discovered = (state.discovered && typeof state.discovered === 'object'
    && !Array.isArray(state.discovered))
    ? state.discovered
    : {};
  state.souls ??= 0;
  state.beacons ??= { kindled: ['hearthway'] };
  state.beacons.kindled ??= ['hearthway'];
  state.skills ??= {};
  ensureCombat(state); // v5: leftover tray granted-flag / pending loot (no SAVE_VERSION bump)
  // Reload must not keep swinging on Camp: freeze until the fight HUD mounts.
  if (state.combat?.fighting && state.combat?.foe) {
    state.combat.paused = true;
  }
  state.actions ??= { active: {}, autoRestart: {}, completed: {} };
  state.actions.autoRestart ??= {};
  for (const a of ACTIONS) {
    if (state.actions.autoRestart[a.id] === undefined) {
      state.actions.autoRestart[a.id] = true;
    }
  }
  state.stats = hydrateStats(state.stats, state.createdAt ?? 0);
  floorItemFoundToHeld(state);
  state.log ??= [];
  return state;
}
