// Lantern repairs — a Lumen + material sink that is never a hard halt.
// Integrity is 0–100. Emberkeeping cycles nibble it; at 0 the flame still
// burns, just a little poorer (see systems/repairs.js). Players who ignore
// repairs keep playing; players who pay get the full glow.

export const LANTERN_MAX = 100;
export const WEAR_PER_EMBERKEEPING_CYCLE = 1;

/** Flame output multiplier at integrity 0 (linear lerp up to 1.0 at 100). */
export const INTEGRITY_FLAME_FLOOR = 0.85;

export const REPAIR_KITS = [
  {
    id: 'wick-patch',
    name: 'Wick patch',
    restore: 25,
    lumen: 10,
    items: { tinderscrap: 8 },
    flavor: 'Fresh scrap twisted into the tired braid. Honest work.',
  },
  {
    id: 'glass-reset',
    name: 'Glass reset',
    restore: 40,
    lumen: 18,
    items: { bogmoss: 3, rushwick: 2 },
    flavor: 'Moss packed around a hairline crack. The chimney stops singing.',
  },
  {
    id: 'full-service',
    name: 'Keeper’s service',
    restore: 100,
    lumen: 45,
    items: { graveresin: 2, tinderscrap: 12 },
    flavor: 'Resin-seal, new wick, polished glass. The lantern remembers its name.',
  },
];

export const REPAIR_KITS_BY_ID = Object.fromEntries(REPAIR_KITS.map((k) => [k.id, k]));
