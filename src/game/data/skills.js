// Skill registry — the eight crafts of the lantern trade (charter §3).
// `glyph` keys into src/ui/icons.js. Wave 0 ships playable actions for
// emberkeeping + foraging; the rest are visible, tappable, and honest about
// arriving in later waves (designed "coming soon" states — never dead clicks).

export const SKILLS = [
  {
    id: 'emberkeeping',
    name: 'Emberkeeping',
    glyph: 'flame',
    kind: 'gathering',
    tagline: 'Tend the personal flame. Fuel, wicks, and flame-quality tiers.',
    produces: 'Flame units, Radiance',
    wave: 0,
  },
  {
    id: 'foraging',
    name: 'Foraging',
    glyph: 'leaf',
    kind: 'gathering',
    tagline: 'Gather what still grows in the fog-dark.',
    produces: 'Herbs, fungi, resins',
    wave: 0,
  },
  {
    id: 'mining',
    name: 'Mining',
    glyph: 'pick',
    kind: 'gathering',
    tagline: 'Dig the old shafts for emberstone.',
    produces: 'Ores, coal, gems',
    wave: 1,
  },
  {
    id: 'fishing',
    name: 'Fishing',
    glyph: 'hook',
    kind: 'gathering',
    tagline: 'Fish the black meres by lanternlight.',
    produces: 'Fish, oddities',
    wave: 1,
  },
  {
    id: 'chandlercraft',
    name: 'Chandlercraft',
    glyph: 'candle',
    kind: 'artisan',
    tagline: 'Candles, oils, tallow, wicks.',
    produces: 'Consumables, Light goods',
    wave: 1,
  },
  {
    id: 'smithing',
    name: 'Smithing',
    glyph: 'anvil',
    kind: 'artisan',
    tagline: 'Lantern-hardware, tools, weapons.',
    produces: 'Gear frames, tools',
    wave: 2,
  },
  {
    id: 'almanac',
    name: 'Almanac',
    glyph: 'star',
    kind: 'scholar',
    tagline: 'Study relics, chart stars, decode pilgrim journals.',
    produces: 'Knowledge, permanent bonuses',
    wave: 2,
  },
  {
    id: 'combat',
    name: 'Combat',
    glyph: 'sword',
    kind: 'combat',
    tagline: 'Fight the pale-things and their lords.',
    produces: 'Loot, souls, settlement keys',
    wave: 2,
  },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
