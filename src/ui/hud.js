// HUD pills. Painted from live state on every tick and every mutation.
//
// F1c briefly counted lumen up over 450ms via rAF. The tick loop also used
// rAF and called updateHud every 100ms, which restarted that tween before a
// +1 Lumen change could round away from the previous integer — and a Sell All
// could freeze mid-lerp (critic: save 9,923, HUD 4,465). The contract is that
// the pills equal hollowlight.save without a remount, so we snap.

import { formatNumber } from '../core/format.js';
import { uniqueStackCount, lanternRoom } from '../game/systems/bank.js';
import { ITEMS } from '../game/data/items.js';
import { knownItemCount } from '../game/systems/completion.js';

/**
 * Persistent HUD chip — Melvor pins `Bank N/MAX` on every screen.
 * The noun is visible text, not title/aria only. Bank is the workplace;
 * this chip names the lantern's hollow (unique-stack cap). It is a door
 * to the owned grid, not wallpaper.
 */
export function formatHollowChip(state) {
  return `Hollow ${uniqueStackCount(state?.bank)}/${lanternRoom(state)}`;
}

/**
 * Persistent HUD chip — Melvor pins Completion Log % beside Bank N/MAX.
 * Known is ever-found (`itemFound > 0` or discovered), not occupancy.
 * It is a door to Bank Catalogue (the item log), not wallpaper.
 */
export function formatKnownChip(state) {
  return `Known ${knownItemCount(state)}/${ITEMS.length}`;
}

function paintChip(node, chip) {
  if (!node) return;
  node.textContent = chip;
  node.setAttribute?.('title', chip);
  node.setAttribute?.('aria-label', chip);
}

export function paintHud(hudLumen, hudFlame, state, hudRadiance, extras = {}) {
  const radiance = formatNumber(state.radiance ?? 0);
  if (hudLumen) hudLumen.textContent = `✦ ${formatNumber(state.lumen)}`;
  if (hudFlame) hudFlame.textContent = `${formatNumber(state.flame)} flame`;
  if (hudRadiance) hudRadiance.textContent = `✧ ${radiance}`;
  const unspent = extras.unspentRadiance;
  if (unspent) unspent.textContent = `${radiance} Radiance unspent`;
  paintChip(extras.hudKnown, formatKnownChip(state));
  paintChip(extras.hudHollow, formatHollowChip(state));
}
