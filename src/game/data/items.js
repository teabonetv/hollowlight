// Item registry seed (~22 items). Wave 0 makes only the starter set obtainable
// (marked obtainable:true); the rest are visible-but-dimmed bank/database rows
// so later waves slot in without UI changes. Sell values are Lumen.
//
// Categories interlock per charter §5 ("no dead content"):
//   fuel → Emberkeeping · herbs/fungi/resin → Foraging (+ future Almanac)
//   ore/coal/gem → Mining · fish/oddity → Fishing
//   candle/oil/component/wick → Chandlercraft · gear/ingot → Smithing
//   drop/relic → Combat / Almanac

/** @type {Array<{id:string,name:string,tier:number,category:string,sell:number,obtainable:boolean,flavor:string}>} */
export const ITEMS = [
  // --- fuels ---
  { id: 'tinderscrap', name: 'Tinderscrap', tier: 1, category: 'fuel', sell: 1, obtainable: true,
    flavor: 'Shaved splinters saved from every dead lantern. The flame eats them first.' },
  { id: 'bogmoss', name: 'Bog-moss', tier: 1, category: 'fuel', sell: 2, obtainable: true,
    flavor: 'Damp, patient moss. Burns slow and low, like a held breath.' },
  { id: 'cindercoal', name: 'Cinder-coal', tier: 1, category: 'fuel', sell: 5, obtainable: false,
    flavor: 'Coal that remembers being on fire.' },

  // --- foraged goods ---
  { id: 'fogwort', name: 'Fogwort', tier: 1, category: 'herb', sell: 3, obtainable: true,
    flavor: 'A grey herb that only grows where the fog has passed over.' },
  { id: 'palecap', name: 'Pale-cap', tier: 1, category: 'fungi', sell: 4, obtainable: true,
    flavor: 'A soft-glowing mushroom. Chandlers swear by it; alchemists swear at it.' },
  { id: 'graveresin', name: 'Grave-resin', tier: 1, category: 'resin', sell: 6, obtainable: true,
    flavor: 'Amber tears from the old churchyard cedars. Bitter smoke, steady flame.' },
  { id: 'rushwick', name: 'Rushwick Reed', tier: 1, category: 'component', sell: 2, obtainable: false,
    flavor: 'Reed pith, dried and spun. The beginning of every good wick.' },
  { id: 'moonquartz', name: 'Moon-quartz Shard', tier: 2, category: 'gem', sell: 18, obtainable: false,
    flavor: 'It glows faintly on cloudless nights. No one agrees why.' },
  { id: 'emberstone', name: 'Emberstone', tier: 1, category: 'ore', sell: 8, obtainable: false,
    flavor: 'Ore warm to the touch. The old shafts were dug chasing this warmth.' },

  // --- mere catches ---
  { id: 'blackmere-dace', name: 'Blackmere Dace', tier: 1, category: 'fish', sell: 5, obtainable: false,
    flavor: 'A small silver fish with no eyes it is willing to use.' },
  { id: 'lantern-eye', name: 'Lantern-eye Eel', tier: 2, category: 'oddity', sell: 22, obtainable: false,
    flavor: 'Its last meal is still glowing somewhere inside it.' },

  // --- chandlercraft goods ---
  { id: 'wick-spool', name: 'Wick-spool', tier: 1, category: 'component', sell: 7, obtainable: false,
    flavor: 'Braided cord, waxed twice. A week of light on a spool.' },
  { id: 'tallow-candle', name: 'Tallow Candle', tier: 1, category: 'candle', sell: 9, obtainable: false,
    flavor: 'Honest light. Smells faintly of kitchens nobody remembers.' },
  { id: 'saintswax-candle', name: 'Saintswax Candle', tier: 2, category: 'candle', sell: 24, obtainable: false,
    flavor: 'Burns white and quiet. Pilgrims carry them unlit, for hope.' },
  { id: 'lamp-oil', name: 'Lamp-oil', tier: 1, category: 'oil', sell: 12, obtainable: false,
    flavor: 'Pressed from grave-resin and fogwort. Feeds a lantern for hours.' },

  // --- smithing goods ---
  { id: 'ember-ingot', name: 'Ember-ingot', tier: 2, category: 'component', sell: 20, obtainable: false,
    flavor: 'Smelted emberstone. It cools slowly, sulking.' },
  { id: 'flint-striker', name: 'Flint-striker', tier: 1, category: 'gear', sell: 26, obtainable: false,
    flavor: 'The Lampwright’s first tool. Sparks like a small opinionated god.' },
  { id: 'glass-chimney', name: 'Glass Chimney', tier: 2, category: 'gear', sell: 28, obtainable: false,
    flavor: 'Blown glass that keeps wind off a naked flame.' },
  { id: 'lantern-frame', name: 'Lantern Frame', tier: 1, category: 'gear', sell: 30, obtainable: false,
    flavor: 'Iron ribs waiting for a heart of light.' },

  // -- combat drops & relics --
  { id: 'pall-fang', name: 'Pall-fang', tier: 1, category: 'drop', sell: 10, obtainable: false,
    flavor: 'Taken from a pale-thing. Cold long after everything else warms.' },
  { id: 'soul-ember', name: 'Soul-ember', tier: 2, category: 'drop', sell: 15, obtainable: false,
    flavor: 'What is left when a pale-thing ends. It flickers if you speak.' },
  { id: 'journal-page', name: 'Pilgrim’s Journal Page', tier: 1, category: 'relic', sell: 12, obtainable: false,
    flavor: 'Water-stained vellum. The handwriting gives out mid-sentence.' },
];

export const ITEMS_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export function itemName(id) {
  return ITEMS_BY_ID[id]?.name ?? id;
}

export const ITEM_CATEGORIES = [
  ['fuel', 'Fuel'],
  ['herb', 'Herbs'],
  ['fungi', 'Fungi'],
  ['resin', 'Resins'],
  ['ore', 'Ores & Coal'],
  ['gem', 'Gems'],
  ['fish', 'Fish'],
  ['oddity', 'Oddities'],
  ['component', 'Components'],
  ['candle', 'Candles & Oil'],
  ['gear', 'Gear'],
  ['drop', 'Drops'],
  ['relic', 'Relics'],
];
