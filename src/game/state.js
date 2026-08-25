// The single game-state object (charter §5 "save integrity"). Plain
// JSON-safe data only — no classes, no Maps, no DOM references — so
// structuredClone, JSON round-trips, and deep-equality tests all just work.

import { SAVE_VERSION } from '../core/save.js';
import { SKILLS } from './data/skills.js';
import { ACTIONS } from './data/actions.js';
import { emptyStats } from './systems/stats.js';
import { hydrateState } from './hydrate.js';

export const STARTER_BANK = {
  tinderscrap: 30,
  rushwick: 5,
  fogwort: 4,
};

/**
 * Fresh save. `nowMs` stamps createdAt; `rngSeed` seeds the persistent RNG.
 * Both injected so tests can be fully deterministic.
 */
export function createState({ nowMs = 0, rngSeed = 1 } = {}) {
  const skills = {};
  for (const s of SKILLS) {
    skills[s.id] = { xp: 0, level: 1, mastery: {} };
  }

  const autoRestart = {};
  for (const a of ACTIONS) autoRestart[a.id] = true;

  return hydrateState({
    schemaVersion: SAVE_VERSION,
    createdAt: nowMs,
    savedAt: nowMs,
    rngState: rngSeed >>> 0,

    // currencies & light resources
    lumen: 20,
    radiance: 0,
    radianceFrac: 0,
    radianceEarned: 0,
    flame: 0,

    bank: { ...STARTER_BANK },

    // S2 bank chrome — pins, named loadouts (never extra power).
    bankPins: [],
    bankPresets: [],

    // Stall selling-pressure (recovered from playtime, not wall-clock).
    store: { pressure: {}, pressureAt: {} },

    lanternIntegrity: 100,
    cosmetics: {
      bankTheme: 'default',
      unlocked: ['default'],
      titles: [],
      frames: ['plain'],
      lanternFrame: 'plain',
      activeTitle: null,
    },

    skills,

    // generic action-runner state; keyed by action id
    actions: {
      active: {},        // actionId -> { progressMs }   (≤1 per skill enforced)
      autoRestart,       // actionId -> bool (default true, written from birth)
      completed: {},     // actionId -> lifetime cycle count
    },

    // Keeper's Camp upgrade levels, keyed by track id (systems/upgrades.js).
    // Missing on pre-F1c saves; every read defaults to level 0.
    campUpgrades: {},

    perks: { owned: [], respecs: 0 },
    achievements: { unlocked: {} },
    dailies: null,

    settings: {
      reducedMotion: false, // app boot syncs this with the media query once
    },

    stats: emptyStats(nowMs),

    log: [], // journal entries, oldest first, capped by pushLog()
  });
}

export { hydrateState };

/** Journal entry helper — capped ring so saves can't bloat forever. */
export function pushLog(state, text, atMs = 0) {
  state.log.push({ t: atMs, text });
  if (state.log.length > 100) state.log.splice(0, state.log.length - 100);
}
