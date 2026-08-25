// Twelve guardian bosses — one per beacon-settlement. Multi-phase: enrage
// thresholds and telegraphs written into the combat log. Only the Hearthway
// Warden is fightable until later beacons kindle; the rest ship with honest
// lock copy via their zone.

function L(kind, spec) {
  if (kind === 'lumen') return { kind: 'lumen', min: spec[0], max: spec[1], chance: spec[2] ?? 1 };
  return { kind: 'item', id: kind, min: spec[0], max: spec[1], chance: spec[2] ?? 1 };
}

function boss(p) {
  return {
    id: p.id,
    name: p.name,
    zoneId: p.z,
    category: 'guardian',
    hp: p.hp,
    accuracy: p.acc,
    avoidance: p.avo,
    minDmg: p.min,
    maxDmg: p.max,
    speedMs: p.spd,
    style: p.style,
    weakness: p.weak,
    resist: p.resist,
    xp: p.xp,
    souls: p.souls,
    flavor: p.flavor,
    loot: p.loot,
    boss: true,
    /** Kills on this stretch before the guardian will stand. */
    stirKills: p.stir ?? 5,
    phases: p.phases,
  };
}

const PHASE = (atHpFrac, name, telegraph, mods = {}) => ({
  atHpFrac, name, telegraph,
  dmgMult: mods.dmg ?? 1,
  accMult: mods.acc ?? 1,
  speedMult: mods.spd ?? 1,
});

export const BOSSES = [
  boss({
    id: 'hearth-warden', name: 'The Hearth-Warden', z: 'hearthway',
    hp: 90, acc: 16, avo: 12, min: 4, max: 8, spd: 2800, style: 'strike', weak: 'rite', resist: 'shot',
    xp: 80, souls: 8, stir: 5,
    flavor: 'The first guardian. It kept this hearth before you, and it has not yet agreed to share.',
    loot: [
      L('lumen', [12, 20, 1]),
      L('soul-ember', [1, 2, 1]),
      L('key-hearthway', [1, 1, 1]),
      L('pall-fang', [1, 2, 0.5]),
      L('lantern-loaf', [1, 2, 0.4]),
    ],
    phases: [
      PHASE(1, 'Kindled Vigil', null),
      PHASE(0.65, 'Lantern-Storm', 'The Warden raises the camp-lantern — blows will come faster.', { spd: 0.78, dmg: 1.12 }),
      PHASE(0.30, 'Last Ember', 'The flame screams. The Warden no longer misses what it can see.', { spd: 0.70, dmg: 1.25, acc: 1.18 }),
    ],
  }),
  boss({
    id: 'vesper-abbess', name: 'The Vesper Abbess', z: 'vespers',
    hp: 160, acc: 22, avo: 18, min: 6, max: 12, spd: 2700, style: 'rite', weak: 'strike', resist: 'shot',
    xp: 140, souls: 12, stir: 6,
    flavor: 'She rings a bell that has no tower. The choir answers from under the floor.',
    loot: [L('lumen', [18, 28, 1]), L('soul-ember', [1, 2, 1]), L('key-vespers', [1, 1, 1]), L('journal-page', [1, 1, 0.6])],
    phases: [
      PHASE(1, 'Compline', null),
      PHASE(0.6, 'Broken Choir', 'The Abbess splits her hymn — two voices, one of them yours if you slip.', { acc: 1.12, dmg: 1.15 }),
      PHASE(0.25, 'Silence', 'The bell stops. That is worse.', { spd: 0.72, dmg: 1.3 }),
    ],
  }),
  boss({
    id: 'tallow-duke', name: 'The Tallow Duke', z: 'tallowmere',
    hp: 210, acc: 24, avo: 14, min: 8, max: 15, spd: 3000, style: 'strike', weak: 'rite', resist: 'shot',
    xp: 180, souls: 14, stir: 6,
    flavor: 'A chandler who outlived his shop by becoming the merchandise.',
    loot: [L('lumen', [22, 34, 1]), L('soul-ember', [2, 3, 1]), L('key-tallowmere', [1, 1, 1]), L('lamp-oil', [1, 2, 0.5])],
    phases: [
      PHASE(1, 'Rendered', null),
      PHASE(0.55, 'Boil', 'The Duke’s fat catches. Every blow comes with heat.', { dmg: 1.2, spd: 0.85 }),
      PHASE(0.22, 'Wick-Crown', 'A hundred stolen wicks ignite around its head.', { dmg: 1.35, acc: 1.1 }),
    ],
  }),
  boss({
    id: 'shrift-deacon', name: 'The Shrift Deacon', z: 'sunken-shrift',
    hp: 260, acc: 28, avo: 20, min: 9, max: 16, spd: 2800, style: 'rite', weak: 'shot', resist: 'strike',
    xp: 220, souls: 16, stir: 7,
    flavor: 'It offers confession. The water is the penance.',
    loot: [L('lumen', [26, 40, 1]), L('soul-ember', [2, 3, 1]), L('key-sunken-shrift', [1, 1, 1])],
    phases: [
      PHASE(1, 'Nave', null),
      PHASE(0.6, 'Undertow', 'The Deacon calls the flood up the aisle.', { spd: 0.8, dmg: 1.15 }),
      PHASE(0.28, 'Drowned Hymn', 'You hear the congregation under the floorboards.', { acc: 1.2, dmg: 1.28 }),
    ],
  }),
  boss({
    id: 'ember-foreman', name: 'The Ember Foreman', z: 'emberfall',
    hp: 320, acc: 30, avo: 18, min: 11, max: 19, spd: 2900, style: 'strike', weak: 'shot', resist: 'rite',
    xp: 270, souls: 18, stir: 7,
    flavor: 'The stacks still have a shift boss. The shift never ended.',
    loot: [L('lumen', [30, 46, 1]), L('soul-ember', [2, 3, 1]), L('key-emberfall', [1, 1, 1]), L('cindercoal', [2, 4, 0.7])],
    phases: [
      PHASE(1, 'First Bell', null),
      PHASE(0.58, 'Overtime', 'The Foreman rings a kiln-bell. The air thickens with ash.', { dmg: 1.18, spd: 0.82 }),
      PHASE(0.25, 'Blast', 'Every stack exhales at once.', { dmg: 1.4, acc: 1.15 }),
    ],
  }),
  boss({
    id: 'green-cantor', name: 'The Green Cantor', z: 'choirgreen',
    hp: 360, acc: 32, avo: 24, min: 11, max: 18, spd: 2600, style: 'shot', weak: 'strike', resist: 'rite',
    xp: 300, souls: 20, stir: 8,
    flavor: 'It taught the hedge to sing. The hedge taught it to hunger.',
    loot: [L('lumen', [34, 52, 1]), L('soul-ember', [2, 4, 1]), L('key-choirgreen', [1, 1, 1])],
    phases: [
      PHASE(1, 'Verse', null),
      PHASE(0.62, 'Thorn-Chorus', 'The hedge closes. Shots come from every leaf.', { acc: 1.18, spd: 0.84 }),
      PHASE(0.3, 'Final Cadence', 'The Cantor hits a note that should not exist.', { dmg: 1.32 }),
    ],
  }),
  boss({
    id: 'bridge-widow', name: 'The Bridge Widow', z: 'mourning-bridge',
    hp: 420, acc: 34, avo: 22, min: 13, max: 21, spd: 2800, style: 'rite', weak: 'strike', resist: 'shot',
    xp: 340, souls: 22, stir: 8,
    flavor: 'She waits at the unnamed crossing for a name that will never come home.',
    loot: [L('lumen', [40, 58, 1]), L('soul-ember', [2, 4, 1]), L('key-mourning-bridge', [1, 1, 1])],
    phases: [
      PHASE(1, 'Vigil', null),
      PHASE(0.55, 'Toll', 'The Widow names a price in light.', { dmg: 1.22 }),
      PHASE(0.22, 'Unmaking', 'The bridge forgets it has two ends.', { spd: 0.74, dmg: 1.35, acc: 1.12 }),
    ],
  }),
  boss({
    id: 'wake-sexton', name: 'The Wake Sexton', z: 'lantern-wake',
    hp: 480, acc: 36, avo: 24, min: 14, max: 22, spd: 2700, style: 'strike', weak: 'rite', resist: 'shot',
    xp: 390, souls: 24, stir: 8,
    flavor: 'It lays lanterns with the dead. Sometimes the lanterns get up. Sometimes it does.',
    loot: [L('lumen', [46, 66, 1]), L('soul-ember', [3, 4, 1]), L('key-lantern-wake', [1, 1, 1]), L('lamp-oil', [1, 2, 0.5])],
    phases: [
      PHASE(1, 'Laying-out', null),
      PHASE(0.6, 'Rouse', 'Every grave-lantern on the yard lifts at once.', { acc: 1.16, dmg: 1.18 }),
      PHASE(0.28, 'Last Watch', 'The Sexton blows the lanterns out. You are the only light left.', { spd: 0.76, dmg: 1.38 }),
    ],
  }),
  boss({
    id: 'step-count', name: 'The Step-Count', z: 'pale-steps',
    hp: 560, acc: 38, avo: 26, min: 15, max: 24, spd: 2600, style: 'shot', weak: 'strike', resist: 'rite',
    xp: 450, souls: 26, stir: 9,
    flavor: 'It is the number of stairs, walking. The number is never the same.',
    loot: [L('lumen', [52, 74, 1]), L('soul-ember', [3, 5, 1]), L('key-pale-steps', [1, 1, 1]), L('moonquartz', [1, 1, 0.4])],
    phases: [
      PHASE(1, 'Ascent', null),
      PHASE(0.58, 'Miscount', 'The stairs rearrange. The Count does not slow.', { spd: 0.8, acc: 1.14 }),
      PHASE(0.24, 'Fall', 'There is no top. There never was.', { dmg: 1.4, spd: 0.72 }),
    ],
  }),
  boss({
    id: 'star-prior', name: 'The Star Prior', z: 'starfell',
    hp: 640, acc: 40, avo: 28, min: 16, max: 26, spd: 2500, style: 'rite', weak: 'shot', resist: 'strike',
    xp: 520, souls: 28, stir: 9,
    flavor: 'It charted a falling sky and then joined it.',
    loot: [L('lumen', [60, 86, 1]), L('soul-ember', [3, 5, 1]), L('key-starfell', [1, 1, 1]), L('moonquartz', [1, 2, 0.5])],
    phases: [
      PHASE(1, 'Observance', null),
      PHASE(0.6, 'Conjunction', 'Two fallen stars eclipse. The Prior strikes between them.', { dmg: 1.22, acc: 1.18 }),
      PHASE(0.26, 'Impact', 'The abbey roof remembers the night the sky arrived.', { dmg: 1.42, spd: 0.78 }),
    ],
  }),
  boss({
    id: 'mere-mirror', name: 'The Mere-Mirror', z: 'duskmere',
    hp: 740, acc: 42, avo: 30, min: 17, max: 28, spd: 2500, style: 'shot', weak: 'rite', resist: 'strike',
    xp: 600, souls: 32, stir: 10,
    flavor: 'Still water that learned to keep faces, then to wear them.',
    loot: [L('lumen', [70, 98, 1]), L('soul-ember', [4, 6, 1]), L('key-duskmere', [1, 1, 1])],
    phases: [
      PHASE(1, 'Reflection', null),
      PHASE(0.55, 'Double', 'Your own lantern-light looks back and swings.', { acc: 1.2, dmg: 1.2 }),
      PHASE(0.22, 'Drown', 'The mere stands up.', { spd: 0.7, dmg: 1.45 }),
    ],
  }),
  boss({
    id: 'first-flame', name: 'The First Flame’s Shadow', z: 'first-beacon',
    hp: 900, acc: 46, avo: 32, min: 20, max: 32, spd: 2400, style: 'rite', weak: 'strike', resist: 'rite',
    xp: 760, souls: 40, stir: 12,
    flavor: 'Hollowflame’s first opposite. It has been waiting at the origin-light since the naming.',
    loot: [L('lumen', [90, 130, 1]), L('soul-ember', [5, 8, 1]), L('key-first-beacon', [1, 1, 1])],
    phases: [
      PHASE(1, 'Unkindling', null),
      PHASE(0.66, 'Pale Noon', 'The Shadow puts the sun out a second time.', { dmg: 1.25, acc: 1.15 }),
      PHASE(0.33, 'Origin Dark', 'It speaks the un-name of Hollowflame.', { spd: 0.68, dmg: 1.5, acc: 1.22 }),
    ],
  }),
];
