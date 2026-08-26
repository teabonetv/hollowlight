// Unique-stack pressure for the working pack. The lantern's hollow holds a
// finite number of *kinds* (not item count). Existing stacks still grow;
// a new kind is refused until you sell one out or the Keeper's Satchel
// widens the hollow. Not a Melvor extra-slot shop — room comes from the
// bags you already stitch at camp.

export const BASE_LANTERN_ROOM = 12;
export const SATCHEL_ROOM_PER_TIER = 2;
export const PACK_FULL_MSG = "The lantern's hollow is full. Sell a stack to make room.";

export function uniqueStackCount(bank) {
  let n = 0;
  for (const qty of Object.values(bank ?? {})) {
    if (qty > 0) n += 1;
  }
  return n;
}

/** How many distinct kinds the lantern's hollow can carry right now. */
export function lanternRoom(state) {
  const satchel = state?.campUpgrades?.['foraging-satchel'] ?? 0;
  const extra = Math.max(0, Math.floor(satchel)) * SATCHEL_ROOM_PER_TIER;
  return BASE_LANTERN_ROOM + extra;
}

/** True when `itemId` may enter the bank (existing stack, or a free hollow). */
export function canAcceptStack(state, itemId) {
  if ((state?.bank?.[itemId] ?? 0) > 0) return true;
  return uniqueStackCount(state?.bank) < lanternRoom(state);
}
