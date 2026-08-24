// Action definitions — the data the generic action-runner consumes.
// Schema:
//   id           unique action id
//   skill        owning skill id
//   name/desc    display strings
//   unlockLevel  player level in `skill` required to start
//   durationMs   real-time length of one cycle (driven by tick loop)
//   costs[]      paid from the bank at each cycle COMPLETION (see runner)
//   outputs[]    granted each cycle:
//                  { kind:'item', id, min,max }     rolled range, inclusive
//                  { kind:'lumen'|'resource', id?, qty } fixed amount
//                  optional `chance` gates an output (rolled before qty)
//   xp/masteryXp base grants per completed cycle

export const ACTIONS = [
  // ── Emberkeeping ──────────────────────────────────────────────
  {
    id: 'tend-flame',
    skill: 'emberkeeping',
    name: 'Tend the Flame',
    desc: 'Feed the Hollowflame scraped tinder, cup your hands around it, keep it alive.',
    unlockLevel: 1,
    durationMs: 4000,
    costs: [{ id: 'tinderscrap', qty: 1 }],
    outputs: [
      { kind: 'resource', id: 'flame', qty: 2 },
      { kind: 'lumen', qty: 1 },
    ],
    xp: 14,
    masteryXp: 10,
  },
  {
    id: 'fan-the-coals',
    skill: 'emberkeeping',
    name: 'Fan the Coals',
    desc: 'Grave-resin thrown on live coals — the flare lights the whole camp.',
    unlockLevel: 10,
    durationMs: 6000,
    costs: [
      { id: 'tinderscrap', qty: 2 },
      { id: 'graveresin', qty: 1 },
    ],
    outputs: [
      { kind: 'resource', id: 'flame', qty: 6 },
      { kind: 'lumen', qty: 3 },
    ],
    xp: 34,
    masteryXp: 24,
  },

  // ── Foraging ──────────────────────────────────────────────────
  {
    id: 'gather-herbs',
    skill: 'foraging',
    name: 'Gather Herbs',
    desc: 'Work the fog-line with shears and patience. Fogwort, sometimes resin.',
    unlockLevel: 1,
    durationMs: 5000,
    costs: [],
    outputs: [
      { kind: 'item', id: 'fogwort', min: 1, max: 2 },
      { kind: 'item', id: 'graveresin', min: 1, max: 1, chance: 0.1 },
    ],
    xp: 16,
    masteryXp: 12,
  },
  {
    id: 'gather-fungi',
    skill: 'foraging',
    name: 'Gather Fungi',
    desc: 'Pale-caps cluster under leaning stones. Bog-moss comes up with the roots.',
    unlockLevel: 5,
    durationMs: 6500,
    costs: [],
    outputs: [
      { kind: 'item', id: 'palecap', min: 1, max: 3 },
      { kind: 'item', id: 'bogmoss', min: 1, max: 1, chance: 0.15 },
    ],
    xp: 22,
    masteryXp: 16,
  },
];

export const ACTIONS_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

export function actionsForSkill(skillId) {
  return ACTIONS.filter((a) => a.skill === skillId);
}
