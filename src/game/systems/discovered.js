// Unique items found in play. The starter pack is a boot grant and is not
// written here; Times Found still counts held starter qty. Known (Almanac /
// catalogue) is itemFound > 0 or this stamp — dumping never un-completes.

import { ITEMS_BY_ID } from '../data/items.js';

export function markDiscovered(state, itemId) {
  if (!state || !itemId || !ITEMS_BY_ID[itemId]) return false;
  state.discovered ??= {};
  if (state.discovered[itemId]) return false;
  state.discovered[itemId] = true;
  return true;
}

export function isDiscovered(state, itemId) {
  return !!state?.discovered?.[itemId];
}
