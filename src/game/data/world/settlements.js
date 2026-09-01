// Playable pilgrim-road settlements. Hearthway is the lit camp; Ashfen is
// the first road wick. The other ten beacons stay data-stubbed on the
// combat roster — this registry does not dump twelve settlement screens.

import { ZONE_BY_ID, ASHFEN_ZONE } from '../combat/zones.js';

export const SETTLEMENTS = [
  {
    id: 'hearthway',
    name: 'Hearthway Hollow',
    zoneId: 'hearthway',
    beaconId: 'hearthway',
    startKindled: true,
    mapRole: 'camp',
    flavor: 'The last lit camp. Your lantern sleeps here.',
    walkCopy: 'Hearthway Hollow — the fog-line is walkable from here.',
  },
  {
    id: 'ashfen',
    name: 'Ashfen',
    zoneId: 'ashfen',
    beaconId: 'ashfen',
    startKindled: false,
    mapRole: 'road',
    flavor: 'First wick on the pilgrim road. Ash and fen, and a road that remembers feet.',
    lockCopy: 'Ashfen waits. Perform the Warden rite at camp.',
    walkCopy: 'Ashfen — the pilgrim verge is walkable from here.',
  },
];

export const SETTLEMENT_BY_ID = Object.fromEntries(SETTLEMENTS.map((s) => [s.id, s]));

export const ASHFEN_ID = 'ashfen';

/** Hunt / map road: camp + Ashfen only. Eleven later stretches stay off this list. */
export function huntRoadZones() {
  return SETTLEMENTS.map((s) => ZONE_BY_ID[s.zoneId]).filter(Boolean);
}

export function roadSubtitle(state) {
  const lit = state?.beacons?.kindled ?? [];
  if (lit.includes(ASHFEN_ID)) {
    return 'Hearthway and Ashfen are kindled. The rest of the road sleeps.';
  }
  return 'Hearthway is kindled. The Warden rite at camp opens Ashfen.';
}

export { ASHFEN_ZONE };
