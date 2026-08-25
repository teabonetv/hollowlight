// Food heals instantly (the eat-now-or-one-more-hit decision).
// Oil is sipped on a timer while the lantern is up; a dry lantern lets the
// fog bite. Auto-eat / auto-brew are wired but locked until a later camp
// purchase — honest copy, no fake unlock.

export const FOOD = {
  'lantern-loaf': { heal: 14, name: 'Lantern-loaf' },
  palecap: { heal: 8, name: 'Pale-cap' },
  fogwort: { heal: 5, name: 'Fogwort' },
};

/** Preferred eat order when auto-eat is eventually unlocked: biggest heal first. */
export const FOOD_ORDER = ['lantern-loaf', 'palecap', 'fogwort'];

export const OILS = {
  'wick-oil': { intervalMs: 8000, name: 'Wick-oil' },
  'lamp-oil': { intervalMs: 16000, name: 'Lamp-oil' },
};

export const OIL_ORDER = ['wick-oil', 'lamp-oil'];

export const OIL_CHECK_MS = 8000;
export const FOG_BITE_MS = 2000;
export const FOG_BITE_DMG = 2;
export const FOG_HIT_MULT = 0.85;

export const AUTO_EAT_DEFAULT_THRESHOLD = 0.45;
export const AUTO_BREW_DEFAULT_THRESHOLD = 0.30;
