// Shared XP table and level curve — the ONE curve every skill and mastery
// pool uses (charter system #7). Levels 1..MAX_LEVEL.
//
// Curve design (see src/game/data/balance-notes.md for the reasoning):
//   xpBetween(L) = round(42 · L^E + 8·L)      E depends on the level band
//   bands: L<30 → 1.50, L≥30 → 1.62, L≥60 → 1.78, L≥90 → 1.92   (soft caps:
//   each band steepens the climb without a hard wall)
//   elite tax: for L ≥ 99 the cost is additionally multiplied by 1.04^(L-98),
//   keeping post-99 levels aspirational but never unreachable.

export const MAX_LEVEL = 120;
export const MILESTONE_LEVEL = 99;

const BANDS = [
  { from: 1, exp: 1.5 },
  { from: 30, exp: 1.62 },
  { from: 60, exp: 1.78 },
  { from: 90, exp: 1.92 },
];
const BASE_COEF = 42;
const LINEAR_COEF = 8;
const ELITE_START = 99; // cost of going 99->100 and beyond
const ELITE_MULT = 1.04;

function bandExponent(level) {
  let e = BANDS[0].exp;
  for (const b of BANDS) if (level >= b.from) e = b.exp;
  return e;
}

/** XP required to advance FROM `level` TO level+1. Infinity past MAX_LEVEL. */
export function xpBetween(level) {
  if (level < 1 || level >= MAX_LEVEL) return Infinity;
  let xp = BASE_COEF * Math.pow(level, bandExponent(level)) + LINEAR_COEF * level;
  if (level >= ELITE_START) xp *= Math.pow(ELITE_MULT, level - (ELITE_START - 1));
  return Math.max(1, Math.round(xp));
}

/** CUM[level] = total XP required to BE at `level` (CUM[1] = 0). Built once. */
const CUM = [NaN, 0];
{
  let total = 0;
  for (let l = 1; l < MAX_LEVEL; l++) {
    total += xpBetween(l);
    CUM[l + 1] = total;
  }
}

/** Total XP needed to be at `level`. Clamped to [1, MAX_LEVEL]. */
export function xpForLevel(level) {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return CUM[l];
}

/** Highest level whose threshold is met by `xp` (negative XP clamps to 1). */
export function levelFromXp(xp) {
  if (!(xp >= 0)) return 1;
  // Small linear scan over ≤120 entries is cheaper than binary search bookkeeping.
  for (let l = MAX_LEVEL; l >= 1; l--) {
    if (xp >= CUM[l]) return l;
  }
  return 1;
}

/** Progress inside the current level, for progress bars. Fractions in [0,1]. */
export function levelProgress(xp) {
  const level = levelFromXp(xp);
  const base = CUM[level];
  const span = level >= MAX_LEVEL ? Infinity : CUM[level + 1] - base;
  const into = xp - base;
  return {
    level,
    into,
    span,
    frac: span === Infinity ? 1 : Math.max(0, Math.min(1, span === 0 ? 1 : into / span)),
  };
}
