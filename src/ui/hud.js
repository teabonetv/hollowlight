// HUD pills. Painted from live state on every tick and every mutation.
//
// F1c briefly counted lumen up over 450ms via rAF. The tick loop also used
// rAF and called updateHud every 100ms, which restarted that tween before a
// +1 Lumen change could round away from the previous integer — and a Sell All
// could freeze mid-lerp (critic: save 9,923, HUD 4,465). The contract is that
// the pills equal hollowlight.save without a remount, so we snap.

import { formatNumber } from '../core/format.js';
import { uniqueStackCount, lanternRoom } from '../game/systems/bank.js';

/** Persistent HUD chip — Melvor pins slots on every screen, not only Bank. */
export function formatHollowChip(state) {
  return `${uniqueStackCount(state?.bank)} / ${lanternRoom(state)} hollow`;
}

export function paintHud(hudLumen, hudFlame, state, hudRadiance, extras = {}) {
  const radiance = formatNumber(state.radiance ?? 0);
  if (hudLumen) hudLumen.textContent = `✦ ${formatNumber(state.lumen)}`;
  if (hudFlame) hudFlame.textContent = `${formatNumber(state.flame)} flame`;
  if (hudRadiance) hudRadiance.textContent = `✧ ${radiance}`;
  const unspent = extras.unspentRadiance;
  if (unspent) unspent.textContent = `${radiance} Radiance unspent`;
  const hollow = extras.hudHollow;
  if (hollow) {
    const chip = formatHollowChip(state);
    hollow.textContent = chip;
    hollow.setAttribute?.('title', chip);
    hollow.setAttribute?.('aria-label', `Lantern hollow ${chip}`);
  }
}
