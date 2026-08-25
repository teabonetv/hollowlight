// HUD pills. Painted from live state on every tick and every mutation.
//
// F1c briefly counted lumen up over 450ms via rAF. The tick loop also used
// rAF and called updateHud every 100ms, which restarted that tween before a
// +1 Lumen change could round away from the previous integer — and a Sell All
// could freeze mid-lerp (critic: save 9,923, HUD 4,465). The contract is that
// the pills equal hollowlight.save without a remount, so we snap.

import { formatNumber } from '../core/format.js';

export function paintHud(hudLumen, hudFlame, state, hudRadiance) {
  if (hudLumen) hudLumen.textContent = `✦ ${formatNumber(state.lumen)}`;
  if (hudFlame) hudFlame.textContent = `${formatNumber(state.flame)} flame`;
  if (hudRadiance) hudRadiance.textContent = `✧ ${formatNumber(state.radiance ?? 0)}`;
}
