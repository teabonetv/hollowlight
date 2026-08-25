// Combat styles — Hollowlight's Strike / Shot / Rite (charter melee / ranged /
// magic-equivalent). Style choice is a real fight decision: each enemy has a
// weakness and a resist, and weapons gate speed + damage per style.

export const STYLES = [
  {
    id: 'strike',
    name: 'Strike',
    verb: 'strikes',
    youVerb: 'strike',
    tagline: 'Close work. Lantern-iron and a steady wrist.',
  },
  {
    id: 'shot',
    name: 'Shot',
    verb: 'looses a shot',
    youVerb: 'loose a shot',
    tagline: 'Distance. Ash-slings, thrown wicks, quiet aim.',
  },
  {
    id: 'rite',
    name: 'Rite',
    verb: 'intones',
    youVerb: 'intone',
    tagline: 'Old pilgrim words. Light as a blade.',
  },
];

export const STYLE_BY_ID = Object.fromEntries(STYLES.map((s) => [s.id, s]));

/** Hit chance floor/ceiling so neither tank nor glass is a coin-flip void. */
export const HIT_FLOOR = 0.20;
export const HIT_CEIL = 0.95;

/** Weakness / resist multipliers (see balance-notes.md). */
export const WEAKNESS_MULT = 1.18;
export const RESIST_MULT = 0.86;

export function clamp01(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Melvor-shaped accuracy: acc / (acc + avoid), then remapped into
 * [HIT_FLOOR, HIT_CEIL] so early fights still miss and late ones still can.
 */
export function hitChance(accuracy, avoidance) {
  const a = Math.max(1, Number(accuracy) || 1);
  const d = Math.max(1, Number(avoidance) || 1);
  const raw = a / (a + d);
  return clamp01(0.12 + 0.88 * raw, HIT_FLOOR, HIT_CEIL);
}

export function styleMultiplier(attackStyle, weakness, resist) {
  if (attackStyle && attackStyle === weakness) return WEAKNESS_MULT;
  if (attackStyle && attackStyle === resist) return RESIST_MULT;
  return 1;
}
