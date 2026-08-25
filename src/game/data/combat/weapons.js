// Weapons the Lampwright can hold. Smithing will mint more later; Wave-1
// combat ships a starter knife plus a Shot and Rite drop from the first stretch.

export const UNARMED = {
  strike: { minDmg: 2, maxDmg: 4, speedMs: 2400, accuracy: 0 },
  shot: { minDmg: 1, maxDmg: 3, speedMs: 2800, accuracy: 0 },
  rite: { minDmg: 2, maxDmg: 3, speedMs: 3200, accuracy: 1 },
};

export const WEAPONS = [
  {
    id: 'wick-knife',
    style: 'strike',
    minDmg: 3,
    maxDmg: 6,
    speedMs: 2200,
    accuracy: 4,
  },
  {
    id: 'ash-sling',
    style: 'shot',
    minDmg: 2,
    maxDmg: 8,
    speedMs: 2600,
    accuracy: 3,
  },
  {
    id: 'prayer-stub',
    style: 'rite',
    minDmg: 4,
    maxDmg: 6,
    speedMs: 3000,
    accuracy: 5,
  },
];

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
