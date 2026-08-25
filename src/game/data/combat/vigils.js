// Vigils — slayer-style contracts. The Lampwright is assigned a category of
// pale-thing and paid in Lumen, souls, and Combat XP on completion.
// Tiers escalate; only categories that appear in currently kindled stretches
// are offered, so the first Vigil is always huntable at Hearthway.

export const VIGIL_CATEGORIES = [
  { id: 'pale', name: 'pale-things', hint: 'Things that forgot they had faces.' },
  { id: 'wight', name: 'fog-wights', hint: 'Choirs and bells with no congregation.' },
  { id: 'horror', name: 'marsh horrors', hint: 'What the meres kept.' },
];

export const VIGIL_CATEGORY_BY_ID = Object.fromEntries(VIGIL_CATEGORIES.map((c) => [c.id, c]));

export const VIGIL_TIERS = [
  { tier: 1, kills: 8, lumen: 28, souls: 4, xp: 48 },
  { tier: 2, kills: 14, lumen: 55, souls: 8, xp: 90 },
  { tier: 3, kills: 22, lumen: 95, souls: 14, xp: 150 },
  { tier: 4, kills: 32, lumen: 160, souls: 22, xp: 240 },
  { tier: 5, kills: 44, lumen: 260, souls: 34, xp: 380 },
  { tier: 6, kills: 60, lumen: 420, souls: 50, xp: 560 },
];

export const VIGIL_TIER_BY_N = Object.fromEntries(VIGIL_TIERS.map((t) => [t.tier, t]));
