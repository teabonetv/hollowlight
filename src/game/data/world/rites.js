// Camp rites. S5a ships one: the Warden rite that opens Ashfen.
// Costs sit here so the engine stays generic. Key is preferred; cheap
// starter goods + Lumen are the mercy path when the Warden still stands.

export const WARDEN_RITE = {
  id: 'warden-ashfen',
  name: 'Warden rite',
  settlementId: 'ashfen',
  beaconId: 'ashfen',
  keyId: 'key-hearthway',
  goods: {
    lumen: 8,
    items: { fogwort: 2, tinderscrap: 5 },
  },
  journal: 'The Warden rite kindled Ashfen. The pilgrim road is open.',
  toast: 'Ashfen is open. The pilgrim road begins.',
  doneToast: 'Ashfen is already open.',
  flavor: 'The Warden’s permission — or a small offering — wakes the first wick on the road.',
};
