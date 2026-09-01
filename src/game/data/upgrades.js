// Keeper's Camp upgrade tracks — permanent economy sinks (charter system #8,
// F1c pre-S2 slice: three global tracks; per-skill trees come later).
//
// Shape contract (consumed by systems/upgrades.js):
//   track = { id, name, desc, glyph?, effect?, perTier, cap,
//             tiers:[{ name, flavor, lumen, items? }] }
//   - tiers are bought strictly in order; level = number of tiers owned.
//   - perTier/cap drive the effect math (speed, yield chance, XP multiplier).
//   - every tier costs Lumen AND specific materials, so gathered goods are
//     sinks too, not just currency.
//
// Cost curves escalate ~×2.2–2.8 per tier so each next tier reads as a real
// goal (minutes → hours → days); every number is justified in
// src/game/data/balance-notes.md §"Keeper's Camp upgrade tracks".

import { ITEMS_BY_ID } from './items.js';

/** @type {Array<{id:string,name:string,desc:string,glyph:string,effect:string,perTier:number,cap:number,tiers:Array<{name:string,flavor:string,lumen:number,items?:Object<string,number>}>}>} */
export const TRACKS = [
  {
    id: 'lantern-wick',
    name: 'Lantern & Wick',
    desc: 'A brighter, steadier flame makes every task quicker.',
    glyph: 'flame',
    effect: 'speed',
    perTier: 0.05, cap: 0.30, // +5%/tier, hard-capped at +30%
    tiers: [
      { name: 'Scraped Wicks', flavor: 'Splinters of dead lanterns, twisted into a wick. The pressed oil feeds the first strike.',
        lumen: 8, items: { 'lamp-oil': 1 } },
      { name: 'Fogwort Dressing', flavor: 'Herb-oil worked into the braid. It burns green for a heartbeat, then clean.',
        lumen: 16, items: { 'lamp-oil': 1 } },
      { name: 'Moss-packed Core', flavor: 'Bog-moss holds the flame like a secret. Slow to catch, loath to die.',
        lumen: 200, items: { bogmoss: 12, tinderscrap: 15 } },
      { name: 'Pale-cap Mantle', flavor: 'Fungus-fibre woven to a mantle that glows faintly even unlit.',
        lumen: 450, items: { palecap: 30 } },
      { name: 'Resin-sealed Burner', flavor: 'Grave-resin varnish over every joint. The wind gives up complaining.',
        lumen: 1000, items: { graveresin: 8, palecap: 50 } },
      { name: 'The Long Burn', flavor: 'Pilgrims swore they could see this light from the Pale Steps. They still can.',
        lumen: 2200, items: { graveresin: 25 } },
    ],
  },

  {
    id: 'foraging-satchel',
    name: "Keeper's Satchel",
    desc: 'Roomier bags mean fewer things left behind at the fog-line, and a little more room in the lantern\'s hollow.',
    glyph: 'leaf',
    effect: 'yield',
    perTier: 0.04, cap: 0.35, // +4% bonus-unit chance/tier, capped at +35%
    tiers: [
      { name: 'Netted Pouch', flavor: 'Knots copied from a fisherman\u2019s widow. She asked nothing for it but news.',
        lumen: 30, items: { fogwort: 15 } },
      { name: 'Waxed Canvas', flavor: 'Double-waxed, triple-folded. Smells of candle shops and rain.',
        lumen: 80, items: { fogwort: 30 } },
      { name: 'Pale-cap Lining', flavor: 'A soft fungus-felt lining, gentle on the herbs and faintly warm.',
        lumen: 180, items: { palecap: 25 } },
      { name: 'Pilgrim\u2019s Frame', flavor: 'An old pilgrim pack, ribs straightened, straps restitched with care.',
        lumen: 420, items: { palecap: 60, tinderscrap: 20 } },
      { name: 'Resin-proofed Seams', flavor: 'Every seam sealed against the damp. Nothing rots in here anymore.',
        lumen: 950, items: { graveresin: 12, palecap: 60 } },
      { name: 'The Fog-cutter\u2019s Burden', flavor: 'They say its owner walked the whole road twice. The bag believes it.',
        lumen: 2100, items: { graveresin: 30, bogmoss: 40 } },
    ],
  },

  {
    id: 'ember-altar',
    name: 'Ember Altar',
    desc: 'Offerings to the Hollowflame come back as deeper understanding.',
    glyph: 'spark',
    effect: 'xp',
    perTier: 0.03, cap: 0.18, // +3% XP/tier, capped at +18%
    tiers: [
      { name: 'Flat Stone', flavor: 'Any stone will do, said the first Lampwright. It was listening.',
        lumen: 60, items: { tinderscrap: 15 } },
      { name: 'Resin Offerings', flavor: 'Amber tears burned at dusk. The flame leans toward them.',
        lumen: 140, items: { graveresin: 10 } },
      { name: 'Carved Hearthstone', flavor: 'Old words cut deep into the side. Half are worn away; half are enough.',
        lumen: 320, items: { graveresin: 22, fogwort: 30 } },
      { name: 'Reliquary Brazier', flavor: 'Iron bones of a reliquary, reborn as a cradle for living fire.',
        lumen: 720, items: { graveresin: 45 } },
      { name: 'Choir-stone Altar', flavor: 'Stone from the fallen choir at Starfell. It hums when fed.',
        lumen: 1600, items: { graveresin: 90, tinderscrap: 60 } },
      { name: 'The Ember Throne', flavor: 'Not a throne for sitting. A throne for keeping. The dark keeps its distance.',
        lumen: 3600, items: { graveresin: 180 } },
    ],
  },
];

export const TRACKS_BY_ID = Object.fromEntries(TRACKS.map((t) => [t.id, t]));

/** Total Lumen cost of an entire track (balance tooling / notes checks). */
export function trackLumenTotal(track) {
  return track.tiers.reduce((sum, t) => sum + t.lumen, 0);
}

/** Data sanity guard for tests/tools: ascending costs, sane effects, real items. */
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
      for (const [id, qty] of Object.entries(tier.items ?? {})) {
        if (!ITEMS_BY_ID[id]) errors.push(`${t.id}: tier ${i} references unknown item ${id}`);
        if (!(qty > 0)) errors.push(`${t.id}: tier ${i} item ${id} needs positive qty`);
      }
    }
    if (!(t.perTier > 0) || !(t.cap + 1e-9 >= t.perTier * t.tiers.length)) {
      errors.push(`${t.id}: cap ${t.cap} must cover ${t.tiers.length} tiers × ${t.perTier}`);
    }
  }
  return errors;
}
