// Burn bank goods at the Ember Altar for Radiance sparks.
// Atomic: unaffordable qty fails with no mutation.

import { ITEMS_BY_ID } from '../data/items.js';
import { sparksFor } from '../data/offerings.js';
import { bankCount } from './bank.js';

export { sparksFor };

export function offerItems(state, itemId, qty) {
  const item = ITEMS_BY_ID[itemId];
  if (!item) return { ok: false, error: 'Unknown item.' };
  const owned = bankCount(state.bank, itemId);
  const n = Math.min(Math.floor(qty), owned);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: owned <= 0 ? 'Nothing to offer.' : 'Offer how many?' };
  }
  const per = sparksFor(item);
  const gained = per * n;
  state.bank[itemId] -= n;
  if (state.bank[itemId] === 0) delete state.bank[itemId];
  state.radiance = (state.radiance ?? 0) + gained;
  state.radianceEarned = (state.radianceEarned ?? 0) + gained;
  if (state.stats) state.stats.radianceEarned = (state.stats.radianceEarned ?? 0) + gained;
  return { ok: true, offered: n, sparks: gained, per };
}
