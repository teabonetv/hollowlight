// Versioned save/load (charter §5 "save integrity").
//
// Envelope format:
//   { version: <int>, savedAt: <ms>, state: {...} }
//
// Migration hook: append to MIGRATIONS when the schema changes.
//   { from: 1, migrate(state) { ...; return newState } }
// deserialize walks them in order until the save reaches SAVE_VERSION.
//
// v1 → v2  S2 economy (pins, stall, lantern, cosmetics)
// v2 → v3  S1 combat (souls, beacons, combat blob) — shipped on main as v3
// v3 → v4  S4 meta (Radiance, perks, feats, dailies) + combat defaults so
//          S4-only v3 PR saves also pick up the S1 blob
// v4 → v5  Almanac LOG discovered map + S1e leftover station / selected eat slot

import { hydrateState } from '../game/hydrate.js';
import { createCombatState } from '../game/systems/combat.js';

export const SAVE_KEY = 'hollowlight.save';
export const SAVE_VERSION = 5;

function unionCosmetics(state) {
  return {
    bankTheme: state.cosmetics?.bankTheme ?? 'default',
    unlocked: state.cosmetics?.unlocked ?? ['default'],
    titles: state.cosmetics?.titles ?? [],
    frames: state.cosmetics?.frames ?? ['plain'],
    lanternFrame: state.cosmetics?.lanternFrame ?? 'plain',
    activeTitle: state.cosmetics?.activeTitle ?? null,
  };
}

/** @type {Array<{from:number, migrate:(s:any)=>any}>} */
export const MIGRATIONS = [
  {
    from: 1,
    migrate(state) {
      return {
        ...state,
        bankPins: state.bankPins ?? [],
        bankPresets: state.bankPresets ?? [],
        store: state.store ?? { pressure: {}, pressureAt: {} },
        lanternIntegrity: Number.isFinite(state.lanternIntegrity) ? state.lanternIntegrity : 100,
        cosmetics: unionCosmetics(state),
      };
    },
  },
  {
    from: 2,
    migrate(state) {
      return {
        ...state,
        souls: state.souls ?? 0,
        beacons: state.beacons ?? { kindled: ['hearthway'] },
        combat: state.combat ?? createCombatState(),
      };
    },
  },
  {
    from: 3,
    migrate(state) {
      return {
        ...state,
        radiance: state.radiance ?? 0,
        radianceFrac: state.radianceFrac ?? 0,
        radianceEarned: state.radianceEarned ?? 0,
        perks: state.perks ?? { owned: [], respecs: 0 },
        achievements: state.achievements ?? { unlocked: {} },
        dailies: state.dailies ?? null,
        cosmetics: unionCosmetics(state),
        souls: state.souls ?? 0,
        beacons: state.beacons ?? { kindled: ['hearthway'] },
        combat: state.combat ?? createCombatState(),
      };
    },
  },
  {
    from: 4,
    migrate(state) {
      const combat = state.combat ?? createCombatState();
      const stats = state.stats && typeof state.stats === 'object' ? state.stats : {};
      return {
        ...state,
        discovered: (state.discovered && typeof state.discovered === 'object'
          && !Array.isArray(state.discovered))
          ? state.discovered
          : {},
        bankLocks: Array.isArray(state.bankLocks) ? state.bankLocks : [],
        stats: {
          ...stats,
          itemFound: (stats.itemFound && typeof stats.itemFound === 'object'
            && !Array.isArray(stats.itemFound)) ? stats.itemFound : {},
          itemSold: (stats.itemSold && typeof stats.itemSold === 'object'
            && !Array.isArray(stats.itemSold)) ? stats.itemSold : {},
          itemLumen: (stats.itemLumen && typeof stats.itemLumen === 'object'
            && !Array.isArray(stats.itemLumen)) ? stats.itemLumen : {},
        },
        combat: {
          ...combat,
          foodId: combat.foodId ?? null,
          lastStation: combat.lastStation ?? null,
        },
      };
    },
  },
];

export class SaveError extends Error {
  constructor(reason, detail) {
    super(`save error: ${reason}${detail ? ` (${detail})` : ''}`);
    this.name = 'SaveError';
    this.reason = reason;
  }
}

export function serializeSave(state, savedAtMs) {
  return JSON.stringify({ version: SAVE_VERSION, savedAt: savedAtMs, state });
}

/**
 * Parse + validate + migrate a save envelope. Throws SaveError with a stable
 * `reason` ('corrupt' | 'malformed' | 'newer' | 'unmigratable') so callers can
 * show an honest message instead of silently wiping.
 */
export function deserializeSave(json, { currentVersion = SAVE_VERSION, migrations = MIGRATIONS } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SaveError('corrupt');
  }
  if (!parsed || typeof parsed !== 'object'
    || typeof parsed.version !== 'number'
    || !parsed.state || typeof parsed.state !== 'object') {
    throw new SaveError('malformed');
  }
  if (parsed.version > currentVersion) {
    throw new SaveError('newer', String(parsed.version));
  }

  let state = parsed.state;
  let v = parsed.version;
  const sorted = [...migrations].sort((a, b) => a.from - b.from);
  for (const m of sorted) {
    if (m.from !== v) continue;
    state = m.migrate(state) ?? state;
    v += 1;
  }
  if (v !== currentVersion) throw new SaveError('unmigratable', `${parsed.version}→${v}`);

  state = hydrateState(state);

  return { state, savedAt: Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0 };
}

// Storage is injected (localStorage-shaped: getItem/setItem/removeItem) so
// tests run against a plain object and the app passes window.localStorage.

export function storageGet(storage, key = SAVE_KEY) {
  try { return storage.getItem(key); } catch { return null; }
}

export function storageSet(storage, json, key = SAVE_KEY) {
  try {
    storage.setItem(key, json);
    return true;
  } catch {
    return false; // quota/private-mode failures must never crash gameplay
  }
}
