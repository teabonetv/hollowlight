// Camp hearth crafts — one live recipe. Chandlercraft’s later lattice is
// not this table. Shape consumed by systems/craft.js:
//   { id, name, flavor, costs:{ itemId: qty }, output:{ id, qty } }

import { ITEMS_BY_ID } from './items.js';

/** Hunt Fog-rat always drops Fogwort; this press is the one live close. */
export const PRESS_LAMP_OIL_ID = 'press-lamp-oil';

export const RECIPES = [
  {
    id: PRESS_LAMP_OIL_ID,
    name: 'Press Lamp-oil',
    flavor: 'Fogwort crushed at the hearth. The lantern drinks twice as long as wick-oil.',
    costs: { fogwort: 2 },
    output: { id: 'lamp-oil', qty: 1 },
  },
];

export const RECIPES_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

export function validateRecipes() {
  const errors = [];
  for (const r of RECIPES) {
    if (!r.id || !r.name || !r.flavor) errors.push(`${r.id ?? '?'}: needs id, name, flavor`);
    const costKeys = Object.keys(r.costs ?? {});
    if (!costKeys.length) errors.push(`${r.id}: needs at least one cost`);
    for (const [id, qty] of Object.entries(r.costs ?? {})) {
      if (!ITEMS_BY_ID[id]) errors.push(`${r.id}: unknown cost ${id}`);
      if (!(qty > 0)) errors.push(`${r.id}: cost ${id} needs positive qty`);
    }
    if (!ITEMS_BY_ID[r.output?.id]) errors.push(`${r.id}: unknown output ${r.output?.id}`);
    if (!(r.output?.qty > 0)) errors.push(`${r.id}: output qty must be positive`);
  }
  return errors;
}
