// Per-action mastery reward hooks (charter §4.7). The runner already tracks
// mastery XP on the shared XP curve; this table is what the UI and later
// systems hang rewards on. Wave-0 actions get concrete milestones; later
// skills inherit the same shape when their actions land.

/** Milestone levels shown on every action card. */
export const MASTERY_MILESTONES = [10, 25, 50, 75, 99];

/** Glyphs for Wave-0 gathering actions on the LOG mastery grid. */
export const ACTION_GLYPH = {
  'tend-flame': 'flame',
  'fan-the-coals': 'spark',
  'gather-herbs': 'leaf',
  'gather-fungi': 'mushroom',
  'smith-chimney': 'anvil',
};

/**
 * @typedef {{
 *   level: number,
 *   name: string,
 *   desc: string,
 *   reward: { kind: string, stat?: string, value?: number, title?: string }
 * }} MasteryHook
 */

/** @type {Record<string, MasteryHook[]>} */
export const MASTERY_HOOKS = {
  'tend-flame': [
    { level: 10, name: 'Cupped Hands', desc: 'You no longer flinch from the heat.', reward: { kind: 'flavor' } },
    { level: 25, name: 'Even Glow', desc: 'Mastery of tending slightly brightens skill XP.', reward: { kind: 'perk', stat: 'xp', value: 0.01 } },
    { level: 50, name: 'Night Watch', desc: 'Long sits by the coals teach patience — and coin.', reward: { kind: 'perk', stat: 'lumen', value: 0.02 } },
    { level: 75, name: 'Keeper’s Breath', desc: 'Radiance gathers a little quicker from this work.', reward: { kind: 'perk', stat: 'radiance', value: 0.03 } },
    { level: 99, name: 'Lantern-Spouse', desc: 'Title. The flame knows your name.', reward: { kind: 'title', title: 'Lantern-Spouse' } },
  ],
  'fan-the-coals': [
    { level: 10, name: 'Resin Tongue', desc: 'You know the exact hiss that means it took.', reward: { kind: 'flavor' } },
    { level: 25, name: 'Hotter Work', desc: 'Fanning mastery feeds Emberkeeping XP.', reward: { kind: 'perk', stat: 'xp', value: 0.01 } },
    { level: 50, name: 'Flare Economy', desc: 'A cleaner flare wastes less light as Lumen.', reward: { kind: 'perk', stat: 'lumen', value: 0.02 } },
    { level: 75, name: 'Coal Choir', desc: 'Mastery XP on this action runs richer.', reward: { kind: 'perk', stat: 'masteryXp', value: 0.05 } },
    { level: 99, name: 'Cinder-Cantor', desc: 'Title. You sing the coals awake.', reward: { kind: 'title', title: 'Cinder-Cantor' } },
  ],
  'gather-herbs': [
    { level: 10, name: 'Fog-Line Feet', desc: 'You stop stepping on the good stems.', reward: { kind: 'flavor' } },
    { level: 25, name: 'Second Sprig', desc: 'A keener eye: small bonus-find chance.', reward: { kind: 'perk', stat: 'yield', value: 0.02 } },
    { level: 50, name: 'Herbwise', desc: 'Gathering herbs teaches faster.', reward: { kind: 'perk', stat: 'xp', value: 0.01 } },
    { level: 75, name: 'Resin Nose', desc: 'You smell grave-resin before you see it.', reward: { kind: 'perk', stat: 'yield', value: 0.02 } },
    { level: 99, name: 'Fog-Gardener', desc: 'Title. The dark still grows for you.', reward: { kind: 'title', title: 'Fog-Gardener' } },
  ],
  'gather-fungi': [
    { level: 10, name: 'Stone-Leaning', desc: 'You check the cool side of every rock.', reward: { kind: 'flavor' } },
    { level: 25, name: 'Cluster Sense', desc: 'Pale-caps come in kinder numbers.', reward: { kind: 'perk', stat: 'yield', value: 0.02 } },
    { level: 50, name: 'Moss Memory', desc: 'Fungi work grants a little more skill XP.', reward: { kind: 'perk', stat: 'xp', value: 0.01 } },
    { level: 75, name: 'Spore-Stained', desc: 'Mastery of this action compounds.', reward: { kind: 'perk', stat: 'masteryXp', value: 0.05 } },
    { level: 99, name: 'Mere-Mycologist', desc: 'Title. Even the pale-caps know you.', reward: { kind: 'title', title: 'Mere-Mycologist' } },
  ],
};

export function hooksForAction(actionId) {
  return MASTERY_HOOKS[actionId] ?? defaultHooks(actionId);
}

function defaultHooks(actionId) {
  return MASTERY_MILESTONES.map((level) => ({
    level,
    name: `Mastery ${level}`,
    desc: `A milestone on ${actionId}. Rewards will deepen with the skill.`,
    reward: { kind: 'flavor' },
  }));
}

/** Next unreached hook for UI, or null at max listed milestone. */
export function nextMasteryHook(actionId, masteryLevel) {
  const hooks = hooksForAction(actionId);
  return hooks.find((h) => masteryLevel < h.level) ?? null;
}

export function reachedMasteryHooks(actionId, masteryLevel) {
  return hooksForAction(actionId).filter((h) => masteryLevel >= h.level);
}
