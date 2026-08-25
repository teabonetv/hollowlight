// Per-item bank glyphs. Category fallback is last resort — items that share
// a shelf (especially Fuel) must not collapse to the same gold flame.

export const CAT_GLYPH = {
  fuel: 'flame',
  herb: 'leaf',
  fungi: 'mushroom',
  resin: 'drop',
  ore: 'pick',
  gem: 'spark',
  fish: 'hook',
  oddity: 'star',
  component: 'gear',
  candle: 'candle',
  oil: 'vial',
  gear: 'anvil',
  drop: 'chest',
  relic: 'book',
  consumable: 'camp',
  cosmetic: 'spark',
};

/** Distinct marks for fuels and the starter pack — the working-grid lookalikes. */
export const ITEM_GLYPH = {
  tinderscrap: 'flame',
  bogmoss: 'moss',
  cindercoal: 'spark',
  peatbrick: 'brick',
  driwood: 'wood',
  fatwood: 'candle',
  'ember-dust': 'camp',
  'kiln-coke': 'pick',
  'drift-pine': 'hook',
  'saints-kindling': 'star',

  fogwort: 'leaf',
  rushwick: 'reed',
  'lantern-loaf': 'loaf',
  'wick-oil': 'vial',
  'wick-knife': 'sword',
  palecap: 'mushroom',
};

export function itemGlyph(item) {
  if (!item) return 'chest';
  return item.glyph ?? ITEM_GLYPH[item.id] ?? CAT_GLYPH[item.category] ?? 'chest';
}
