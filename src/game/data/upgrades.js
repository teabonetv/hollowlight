// Keeper's Camp upgrade tracks — permanent Lumen sinks (charter system #8,
// F1c pre-S2 slice: three global tracks; per-skill trees come later).
//
// Shape contract (consumed by systems/upgrades.js):
//   track = { id, name, desc, perTier, cap, tiers:[{ lumen, items? }] }
//   - tiers are bought strictly in order; level = number of tiers owned.
//   - perTier/cap drive the effect math (speed, yield chance, XP multiplier).
//
// Cost curves escalate ~×3 per tier so each next tier reads as a real goal
// (minutes → hours → days); see balance-notes.md §Upgrade tracks.

/** @type {Array<{id:string,name:string,desc:string,perTier:number,cap:number,tiers:Array<{lumen:number,items?:Object<string,number>}>}>} */
export const TRACKS = [
  {
    id: 'lantern-wick',
    name: 'Lantern & Wick',
    desc: 'Finer wicks, steadier flame — every action runs faster.',
    perTier: 0.10, cap: 0.30,
    tiers: [ { lumen: 40 }, { lumen: 120 }, { lumen: 360 } ],
  },
  {
    id: 'foraging-satchel',
    name: "Keeper's Satchel",
    desc: 'A deeper satchel — gathered outputs may roll one bonus unit.',
    perTier: 0.05, cap: 0.15,
    tiers: [ { lumen: 60 }, { lumen: 200 }, { lumen: 600 } ],
  },
  {
    id: 'ember-altar',
    name: 'Ember Altar',
    desc: 'A shrine at camp — every action grants more XP.',
    perTier: 0.05, cap: 0.15,
    tiers: [ { lumen: 80 }, { lumen: 250 }, { lumen: 800 } ],
  },
];

export const TRACKS_BY_ID = Object.fromEntries(TRACKS.map((t) => [t.id, t]));

/** Data sanity guard for tests/tools: ascending costs, sane effects. */
export function validateTracks() {
  const errors = [];
  for (const t of TRACKS) {
    if (!Array.isArray(t.tiers) || t.tiers.length < 3) errors.push(`${t.id}: needs ≥3 tiers`);
    let prev = -Infinity;
    for (const [i, tier] of (t.tiers ?? []).entries()) {
      if (!Number.isInteger(tier.lumen) || tier.lumen <= prev) {
        errors.push(`${t.id}: tier ${i} lumen ${tier.lumen} must ascend from ${prev}`);
      }
      prev = tier.lumen;
    }
    if (!(t.perTier > 0) || !(t.cap >= t.perTier * t.tiers.length)) {
      errors.push(`${t.id}: cap ${t.cap} must cover ${t.tiers.length} tiers × ${t.perTier}`);
    }
  }
  return errors;
}
