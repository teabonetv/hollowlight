/**
 * After a mutation, rebuild the screen only when the current view cannot
 * paint the change in place. Embers Claim / Reroll keep
 * `article[data-ember-id]` — a parent remount kills mountedKey.
 */
export function shouldRebuildScreen(ui, { redraw = false, featUnlocks = 0 } = {}) {
  if (ui?.tab === 'journal' && ui?.almanac === 'dailies') return false;
  return Boolean(redraw || featUnlocks);
}
