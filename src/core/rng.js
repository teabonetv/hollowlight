// Seeded PRNG utilities. The whole game draws randomness through one of these
// so that "same seed + same actions = same results" holds (charter §5).
//
// mulberry32: tiny, fast, statistically fine for loot rolls, fully
// reproducible for a given 32-bit seed. xmur3 turns string seeds into
// well-mixed 32-bit ones.

export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

export function createRng(seed = 1) {
  let state = typeof seed === 'string'
    ? hashSeed(seed)
    : seed >>> 0;

  /** Uniform float in [0, 1). */
  function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [0, maxExclusive). maxExclusive <= 0 yields 0. */
  function int(maxExclusive) {
    if (!(maxExclusive > 0)) return 0;
    return Math.min(maxExclusive - 1, Math.floor(next() * maxExclusive));
  }

  /** Uniform integer in [min, max] inclusive. */
  function range(min, max) {
    if (max <= min) return min;
    return min + int(max - min + 1);
  }

  function pick(arr) {
    return arr.length === 0 ? undefined : arr[int(arr.length)];
  }

  function chance(p) {
    return next() < p;
  }

  function getState() { return state; }

  function setState(s) {
    const v = Number(s);
    if (!Number.isFinite(v) || v < 0 || v > 0xFFFFFFFF) {
      throw new RangeError('rng state must be a uint32');
    }
    state = v >>> 0;
  }

  return { next, int, range, pick, chance, getState, setState };
}
