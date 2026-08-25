// Radiance constellation — ~40 permanent account-wide perks (charter §4.9).
// Multi-branch: Wick (speed), Satchel (yield), Scholar (XP), Flame (light).
// Capstones sit at the end of each branch; conjunctions bind two branches.
// Layout is branch-list (mobile ≥44px targets), not a hover-gated star map.

export const RADIANCE_PER_XP = 0.025; // 40 action-XP ≈ 1 spark; see balance-notes.md
export const RESPEC_LUMEN_PER_NODE = 25;

/**
 * @typedef {{
 *   id: string, name: string, flavor: string, branch: string,
 *   cost: number, requires: string[], capstone?: boolean,
 *   effects: Array<{ stat: string, value: number }>
 * }} Perk
 */

/** @type {Perk[]} */
export const PERKS = [
  {
    id: 'kindling',
    name: 'Kindling',
    flavor: 'The first star you pin to the dark. Everything else hangs from it.',
    branch: 'origin',
    cost: 1,
    requires: [],
    effects: [{ stat: 'xp', value: 0.01 }],
  },

  // ── Wick: action speed ────────────────────────────────────────
  ...chain('wick', 'Wick', 'speed', [
    [2, 0.02, 'Drawn Wick', 'You pull the wick a finger longer. Cycles run a breath faster.'],
    [3, 0.02, 'Trimmed Snuff', 'A cleaner burn. Less smoke, more work.'],
    [4, 0.03, 'Brass Collar', 'The flame sits still in a breeze. Hands stay sure.'],
    [5, 0.03, 'Steady Draught', 'Air finds the flame without hunting.'],
    [6, 0.03, 'Twin Feed', 'Two wicks, one lantern. The dark recedes faster.'],
    [8, 0.04, 'Choir Wick', 'The old keepers sang to their lamps. You remember the tune.'],
    [10, 0.04, 'Unfailing Thread', 'It does not gutter. It does not pause.'],
  ], { capId: 'wick-cap', capCost: 18, capValue: 0.08, capName: 'The Unquenchable', capFlavor: 'A wick that outlives the night. Capstone of the Wick line.' }),

  // ── Satchel: bonus finds ──────────────────────────────────────
  ...chain('yield', 'Satchel', 'yield', [
    [2, 0.02, 'Deep Pockets', 'You bring home what the fog meant to keep.'],
    [3, 0.02, 'Keen Eye', 'Pale-caps no longer hide under the same stone twice.'],
    [4, 0.03, 'Second Glance', 'Look once more. There is always another stem.'],
    [5, 0.03, 'Fog-Wise', 'The dark tells you where the living things still are.'],
    [6, 0.03, 'Harvest Knot', 'A keeper’s trick: bind the extra sprig before you stand.'],
    [8, 0.04, 'Bounty of Ash', 'Even burnt ground gives, if you know the season.'],
    [10, 0.04, 'Never Empty', 'The satchel has a bottom. You have not found it.'],
  ], { capId: 'yield-cap', capCost: 18, capValue: 0.08, capName: 'Horn of the Hollow', capFlavor: 'The land itself leans toward your hands. Capstone of the Satchel line.' }),

  // ── Scholar: XP ───────────────────────────────────────────────
  ...chain('scholar', 'Scholar', 'xp', [
    [2, 0.02, 'Margin Notes', 'You write what the flame taught you. It sticks.'],
    [3, 0.02, 'Star-Count', 'Each cycle has a number. Numbers remember you.'],
    [4, 0.03, 'Quiet Study', 'Work done in attention grows twice.'],
    [5, 0.03, 'Relic Primer', 'Old pages, new hands. The trade has a grammar.'],
    [6, 0.03, 'Lantern Logic', 'Cause, effect, wick, reward. You see the joints.'],
    [8, 0.04, 'Mnemonic Ember', 'Heat in the mind. Lessons do not cool.'],
    [10, 0.04, 'Open Codex', 'Nothing you have done is lost to you.'],
  ], { capId: 'scholar-cap', capCost: 18, capValue: 0.08, capName: 'The Lit Page', capFlavor: 'Every craft leaves ink. Capstone of the Scholar line.' }),

  // ── Flame: lumen + radiance ───────────────────────────────────
  {
    id: 'flame-1',
    name: 'Warm Coin',
    flavor: 'Lumen clings to a tended flame.',
    branch: 'flame',
    cost: 2,
    requires: ['kindling'],
    effects: [{ stat: 'lumen', value: 0.03 }],
  },
  {
    id: 'flame-2',
    name: 'Kindred Spark',
    flavor: 'Radiance notices Radiance.',
    branch: 'flame',
    cost: 3,
    requires: ['flame-1'],
    effects: [{ stat: 'radiance', value: 0.05 }],
  },
  {
    id: 'flame-3',
    name: 'Shared Heat',
    flavor: 'The camp pays you back in coin and starlight.',
    branch: 'flame',
    cost: 4,
    requires: ['flame-2'],
    effects: [{ stat: 'lumen', value: 0.03 }, { stat: 'radiance', value: 0.03 }],
  },
  {
    id: 'flame-4',
    name: 'Tithe of Light',
    flavor: 'A sliver of every gleam is yours to keep.',
    branch: 'flame',
    cost: 5,
    requires: ['flame-3'],
    effects: [{ stat: 'lumen', value: 0.04 }],
  },
  {
    id: 'flame-5',
    name: 'Slow Star',
    flavor: 'Prestige is a long burn. This shortens the night a little.',
    branch: 'flame',
    cost: 6,
    requires: ['flame-4'],
    effects: [{ stat: 'radiance', value: 0.06 }],
  },
  {
    id: 'flame-6',
    name: 'Master’s Ash',
    flavor: 'Mastery itself learns faster under a brighter lamp.',
    branch: 'flame',
    cost: 8,
    requires: ['flame-5'],
    effects: [{ stat: 'masteryXp', value: 0.08 }],
  },
  {
    id: 'flame-7',
    name: 'Beacon Dues',
    flavor: 'Light paid is light returned, with interest.',
    branch: 'flame',
    cost: 10,
    requires: ['flame-6'],
    effects: [{ stat: 'lumen', value: 0.05 }, { stat: 'radiance', value: 0.05 }],
  },
  {
    id: 'flame-cap',
    name: 'Heart of Hollowflame',
    flavor: 'The personal flame and the world’s flame remember they were one. Capstone of the Flame line.',
    branch: 'flame',
    cost: 18,
    requires: ['flame-7'],
    capstone: true,
    effects: [{ stat: 'lumen', value: 0.08 }, { stat: 'radiance', value: 0.10 }],
  },

  // ── Conjunctions / capstones that bind branches ───────────────
  {
    id: 'cross-wy',
    name: 'Quick Hands',
    flavor: 'Speed and finding, married.',
    branch: 'conjunction',
    cost: 8,
    requires: ['wick-3', 'yield-3'],
    effects: [{ stat: 'speed', value: 0.02 }, { stat: 'yield', value: 0.02 }],
  },
  {
    id: 'cross-sf',
    name: 'Studied Fire',
    flavor: 'Scholarship feeding the flame that feeds it.',
    branch: 'conjunction',
    cost: 8,
    requires: ['scholar-3', 'flame-3'],
    effects: [{ stat: 'xp', value: 0.02 }, { stat: 'radiance', value: 0.04 }],
  },
  {
    id: 'cross-ws',
    name: 'Lantern Heart',
    flavor: 'A faster wick and a fuller page.',
    branch: 'conjunction',
    cost: 12,
    requires: ['wick-5', 'scholar-5'],
    effects: [{ stat: 'speed', value: 0.03 }, { stat: 'xp', value: 0.03 }],
  },
  {
    id: 'cross-yf',
    name: 'Fog Harvest',
    flavor: 'What you gather becomes light more readily.',
    branch: 'conjunction',
    cost: 12,
    requires: ['yield-5', 'flame-5'],
    effects: [{ stat: 'yield', value: 0.03 }, { stat: 'lumen', value: 0.04 }],
  },
  {
    id: 'cap-wy',
    name: 'Hollow Crown',
    flavor: 'Wick and satchel, both finished. The road hurries to meet you.',
    branch: 'conjunction',
    cost: 22,
    requires: ['wick-cap', 'yield-cap'],
    capstone: true,
    effects: [{ stat: 'speed', value: 0.05 }, { stat: 'yield', value: 0.05 }],
  },
  {
    id: 'cap-sf',
    name: 'Star Crown',
    flavor: 'Page and flame, both finished. Prestige answers when called.',
    branch: 'conjunction',
    cost: 22,
    requires: ['scholar-cap', 'flame-cap'],
    capstone: true,
    effects: [{ stat: 'xp', value: 0.05 }, { stat: 'radiance', value: 0.08 }],
  },
  {
    id: 'apex',
    name: 'The First Beacon',
    flavor: 'Every branch lit. The pilgrim road has a sun again — small, and yours.',
    branch: 'conjunction',
    cost: 30,
    requires: ['cap-wy', 'cap-sf'],
    capstone: true,
    effects: [
      { stat: 'speed', value: 0.04 },
      { stat: 'yield', value: 0.04 },
      { stat: 'xp', value: 0.04 },
      { stat: 'lumen', value: 0.04 },
      { stat: 'radiance', value: 0.08 },
    ],
  },
];

export const PERKS_BY_ID = Object.fromEntries(PERKS.map((p) => [p.id, p]));

export const PERK_BRANCHES = [
  { id: 'origin', name: 'Origin' },
  { id: 'wick', name: 'Wick' },
  { id: 'yield', name: 'Satchel' },
  { id: 'scholar', name: 'Scholar' },
  { id: 'flame', name: 'Flame' },
  { id: 'conjunction', name: 'Conjunctions' },
];

function chain(prefix, _branchName, stat, rows, cap) {
  const out = [];
  let prev = 'kindling';
  rows.forEach(([cost, value, name, flavor], i) => {
    const id = `${prefix}-${i + 1}`;
    out.push({
      id,
      name,
      flavor,
      branch: prefix,
      cost,
      requires: [prev],
      effects: [{ stat, value }],
    });
    prev = id;
  });
  out.push({
    id: cap.capId,
    name: cap.capName,
    flavor: cap.capFlavor,
    branch: prefix,
    cost: cap.capCost,
    requires: [prev],
    capstone: true,
    effects: [{ stat, value: cap.capValue }],
  });
  return out;
}
