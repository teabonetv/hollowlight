// Generic Camp craft engine over src/game/data/recipes.js.
// Same pay-atomic contract as upgrades.js: costs settle together or not at all.
// Instant (one tap) — not a timed artisan queue.

import { ITEMS_BY_ID } from '../data/items.js';
import { RECIPES_BY_ID } from '../data/recipes.js';
import * as bank from './bank.js';

export function recipeById(recipeId) {
  return RECIPES_BY_ID[recipeId] ?? null;
}

export function recipeCostList(recipe) {
  return Object.entries(recipe?.costs ?? {}).map(([id, qty]) => ({
    id,
    qty,
    name: ITEMS_BY_ID[id]?.name ?? id,
  }));
}

export function canCraft(state, recipeId) {
  const recipe = RECIPES_BY_ID[recipeId];
  if (!recipe) return false;
  if (!bank.canAfford(state.bank, recipeCostList(recipe))) return false;
  if (!bank.canAcceptStack(state, recipe.output.id)) return false;
  return true;
}

export function craftNeedLabel(state, recipeId) {
  const recipe = RECIPES_BY_ID[recipeId];
  if (!recipe) return 'Unknown craft.';
  for (const c of recipeCostList(recipe)) {
    if (bank.bankCount(state.bank, c.id) < c.qty) return `Need ${c.name} ×${c.qty}`;
  }
  if (!bank.canAcceptStack(state, recipe.output.id)) return bank.PACK_FULL_MSG;
  return 'Need materials';
}

/**
 * Craft `recipeId` once. Returns { ok:true, recipe, output } or { ok:false, error }
 * with no state change on failure.
 */
export function craftRecipe(state, recipeId) {
  const recipe = RECIPES_BY_ID[recipeId];
  if (!recipe) return { ok: false, error: 'Unknown craft.' };
  const costs = recipeCostList(recipe);
  if (!bank.canAfford(state.bank, costs)) {
    return { ok: false, error: craftNeedLabel(state, recipeId) };
  }
  if (!bank.canAcceptStack(state, recipe.output.id)) {
    return { ok: false, error: bank.PACK_FULL_MSG };
  }
  // Atomic pay: verified affordable + hollow room above.
  bank.bankPay(state.bank, costs);
  const added = bank.tryBankAdd(state, recipe.output.id, recipe.output.qty);
  return { ok: true, recipe, output: { id: recipe.output.id, qty: added.added } };
}
