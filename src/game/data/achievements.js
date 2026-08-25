// Almanac achievements — ≥60, each with a real reward (title, lantern frame,
// small perk, or a pouch of Lumen/Radiance). Triggers are data; the engine
// in systems/achievements.js evaluates them. Combat/kills exist as honest
// 0% rows until the combat lane ships.

/** Opening a tab is a feat; it must not be a sixth of the log book. */
export const TAB_OPEN_FEAT_IDS = Object.freeze([
  'x-camp', 'x-map', 'x-journal', 'x-almanac', 'x-stars', 'x-settings',
]);

export const ACHIEVEMENT_CATEGORIES = [
  { id: 'skill', name: 'Craft' },
  { id: 'mastery', name: 'Mastery' },
  { id: 'work', name: 'Labour' },
  { id: 'gather', name: 'Gathering' },
  { id: 'economy', name: 'Purse' },
  { id: 'explore', name: 'Road' },
  { id: 'kills', name: 'Vigil' },
  { id: 'radiance', name: 'Stars' },
  { id: 'time', name: 'Watch' },
  { id: 'silly', name: 'Oddments' },
];

const L = (qty) => ({ kind: 'lumen', qty });
const R = (qty) => ({ kind: 'radiance', qty });
const T = (title) => ({ kind: 'title', title });
const F = (frame, name) => ({ kind: 'frame', frame, name });
const P = (stat, value) => ({ kind: 'perk', stat, value });

function A(id, category, name, desc, trigger, reward) {
  return { id, category, name, desc, trigger, reward };
}

export const ACHIEVEMENTS = [
  // ── skill (16) ────────────────────────────────────────────────
  A('ek-2', 'skill', 'First Kindling', 'Reach Emberkeeping 2.', { type: 'skillLevel', skill: 'emberkeeping', level: 2 }, L(8)),
  A('ek-5', 'skill', 'Coal-Sitter', 'Reach Emberkeeping 5.', { type: 'skillLevel', skill: 'emberkeeping', level: 5 }, T('Coal-Sitter')),
  A('ek-10', 'skill', 'Ready for the Flare', 'Reach Emberkeeping 10 — Fan the Coals waits.', { type: 'skillLevel', skill: 'emberkeeping', level: 10 }, R(2)),
  A('ek-25', 'skill', 'Warden of the Hearth', 'Reach Emberkeeping 25.', { type: 'skillLevel', skill: 'emberkeeping', level: 25 }, P('xp', 0.01)),
  A('ek-50', 'skill', 'Half a Lifetime of Heat', 'Reach Emberkeeping 50.', { type: 'skillLevel', skill: 'emberkeeping', level: 50 }, F('ember-ring', 'Ember Ring')),
  A('ek-99', 'skill', 'Lantern-Master', 'Reach Emberkeeping 99.', { type: 'skillLevel', skill: 'emberkeeping', level: 99 }, T('Lantern-Master')),
  A('fo-2', 'skill', 'First Sprig', 'Reach Foraging 2.', { type: 'skillLevel', skill: 'foraging', level: 2 }, L(8)),
  A('fo-5', 'skill', 'Under-Stone', 'Reach Foraging 5 — fungi open.', { type: 'skillLevel', skill: 'foraging', level: 5 }, T('Fog-Walker')),
  A('fo-10', 'skill', 'Herbwise', 'Reach Foraging 10.', { type: 'skillLevel', skill: 'foraging', level: 10 }, R(2)),
  A('fo-25', 'skill', 'Green in the Dark', 'Reach Foraging 25.', { type: 'skillLevel', skill: 'foraging', level: 25 }, P('yield', 0.01)),
  A('fo-50', 'skill', 'The Fog Provides', 'Reach Foraging 50.', { type: 'skillLevel', skill: 'foraging', level: 50 }, F('moss-band', 'Moss Band')),
  A('fo-99', 'skill', 'Hollow Botanist', 'Reach Foraging 99.', { type: 'skillLevel', skill: 'foraging', level: 99 }, T('Hollow Botanist')),
  A('any-5', 'skill', 'Five and Alive', 'Have any skill at level 5.', { type: 'anySkillLevel', level: 5 }, L(12)),
  A('any-10', 'skill', 'Double Digits', 'Have any skill at level 10.', { type: 'anySkillLevel', level: 10 }, R(1)),
  A('both-5', 'skill', 'Two Crafts Lit', 'Emberkeeping and Foraging both at 5.', { type: 'allSkillsLevel', skills: ['emberkeeping', 'foraging'], level: 5 }, T('Journeyman Lampwright')),
  A('sum-15', 'skill', 'Fifteen Lights', 'Combined skill levels reach 15.', { type: 'skillLevelSum', level: 15 }, P('xp', 0.005)),

  // ── mastery (8) ───────────────────────────────────────────────
  A('m-tend-10', 'mastery', 'Hands That Do Not Shake', 'Tend the Flame mastery 10.', { type: 'masteryLevel', actionId: 'tend-flame', level: 10 }, L(15)),
  A('m-tend-25', 'mastery', 'Even Glow', 'Tend the Flame mastery 25.', { type: 'masteryLevel', actionId: 'tend-flame', level: 25 }, P('lumen', 0.01)),
  A('m-herbs-10', 'mastery', 'No Trampled Stems', 'Gather Herbs mastery 10.', { type: 'masteryLevel', actionId: 'gather-herbs', level: 10 }, L(15)),
  A('m-herbs-25', 'mastery', 'Second Sprig', 'Gather Herbs mastery 25.', { type: 'masteryLevel', actionId: 'gather-herbs', level: 25 }, P('yield', 0.01)),
  A('m-fungi-10', 'mastery', 'Cool Side of the Stone', 'Gather Fungi mastery 10.', { type: 'masteryLevel', actionId: 'gather-fungi', level: 10 }, L(20)),
  A('m-any-10', 'mastery', 'A Trade, Practised', 'Any action at mastery 10.', { type: 'anyMasteryLevel', level: 10 }, R(1)),
  A('m-any-50', 'mastery', 'Muscle Memory', 'Any action at mastery 50.', { type: 'anyMasteryLevel', level: 50 }, F('master-rim', 'Master’s Rim')),
  A('m-99', 'mastery', 'One Action, Perfected', 'Any action at mastery 99.', { type: 'anyMasteryLevel', level: 99 }, T('Obsessive')),

  // ── work / cycles (8) ─────────────────────────────────────────
  A('c-1', 'work', 'First Cycle', 'Complete any action once.', { type: 'cyclesTotal', count: 1 }, L(5)),
  A('c-25', 'work', 'Calloused', 'Complete 25 cycles.', { type: 'cyclesTotal', count: 25 }, L(15)),
  A('c-100', 'work', 'Hundred Hands', 'Complete 100 cycles.', { type: 'cyclesTotal', count: 100 }, R(2)),
  A('c-500', 'work', 'The Work Goes On', 'Complete 500 cycles.', { type: 'cyclesTotal', count: 500 }, P('xp', 0.01)),
  A('c-tend-50', 'work', 'Fifty Tendings', 'Complete Tend the Flame 50 times.', { type: 'cyclesAction', actionId: 'tend-flame', count: 50 }, T('Tinder-Thief')),
  A('c-herbs-50', 'work', 'Fifty Gatherings', 'Complete Gather Herbs 50 times.', { type: 'cyclesAction', actionId: 'gather-herbs', count: 50 }, T('Fog-Line Regular')),
  A('c-fan-1', 'work', 'First Flare', 'Complete Fan the Coals once.', { type: 'cyclesAction', actionId: 'fan-the-coals', count: 1 }, R(3)),
  A('c-fungi-25', 'work', 'Pale-Cap Picker', 'Complete Gather Fungi 25 times.', { type: 'cyclesAction', actionId: 'gather-fungi', count: 25 }, L(25)),

  // ── gathering items (6) ───────────────────────────────────────
  A('g-10', 'gather', 'A Little Heap', 'Gather 10 items.', { type: 'itemsGathered', count: 10 }, L(8)),
  A('g-100', 'gather', 'Satchel Strain', 'Gather 100 items.', { type: 'itemsGathered', count: 100 }, R(1)),
  A('g-1000', 'gather', 'Never Empty', 'Gather 1,000 items.', { type: 'itemsGathered', count: 1000 }, F('satchel-stitch', 'Satchel Stitch')),
  A('g-fog-50', 'gather', 'Fogwort Familiar', 'Own 50 Fogwort at once.', { type: 'bankAtLeast', itemId: 'fogwort', count: 50 }, L(20)),
  A('g-resin-10', 'gather', 'Grave-Sweet', 'Own 10 Grave-resin at once.', { type: 'bankAtLeast', itemId: 'graveresin', count: 10 }, R(2)),
  A('g-known-6', 'gather', 'Six Known Things', 'Have 6 different items in the bank.', { type: 'itemsKnown', count: 6 }, T('Cataloguer')),

  // ── economy (6) ───────────────────────────────────────────────
  A('e-lumen-50', 'economy', 'Fifty Coins of Light', 'Earn 50 Lumen lifetime.', { type: 'lumenEarned', count: 50 }, L(10)),
  A('e-lumen-250', 'economy', 'A Bright Purse', 'Earn 250 Lumen lifetime.', { type: 'lumenEarned', count: 250 }, R(2)),
  A('e-lumen-1000', 'economy', 'Thousand Gleams', 'Earn 1,000 Lumen lifetime.', { type: 'lumenEarned', count: 1000 }, F('gilt-frame', 'Gilt Frame')),
  A('e-spend-40', 'economy', 'First Tithe', 'Spend 40 Lumen (camp upgrades count).', { type: 'lumenSpent', count: 40 }, T('Patron of Wicks')),
  A('e-sell-1', 'economy', 'A Fair Trade', 'Sell any item once.', { type: 'sells', count: 1 }, L(5)),
  A('e-sell-10', 'economy', 'Market Regular', 'Sell 10 times.', { type: 'sells', count: 10 }, P('lumen', 0.01)),

  // ── exploration (6) ───────────────────────────────────────────
  A('x-camp', 'explore', 'Hearthway Kindled', 'Stand in the only lit camp.', { type: 'beaconsKindled', count: 1 }, T('Last Ember')),
  A('x-map', 'explore', 'Look Down the Road', 'Open the pilgrim map.', { type: 'mapOpens', count: 1 }, L(5)),
  A('x-journal', 'explore', 'Write It Down', 'The Almanac has a journal entry.', { type: 'logCount', count: 1 }, L(5)),
  A('x-almanac', 'explore', 'Open the Book', 'Open the Almanac tab.', { type: 'almanacOpens', count: 1 }, R(1)),
  A('x-stars', 'explore', 'Chart the Dark', 'Open the constellation.', { type: 'starsOpens', count: 1 }, L(8)),
  A('x-settings', 'explore', 'Tinker', 'Open Settings once.', { type: 'settingsOpens', count: 1 }, L(5)),

  // ── vigil / kills (6) — honest empty until combat ─────────────
  A('k-1', 'kills', 'First Pale-Thing', 'Defeat 1 enemy. Combat lane.', { type: 'kills', count: 1 }, T('Vigilant')),
  A('k-10', 'kills', 'Ten Against the Fog', 'Defeat 10 enemies.', { type: 'kills', count: 10 }, L(40)),
  A('k-100', 'kills', 'A Hundred Names', 'Defeat 100 enemies.', { type: 'kills', count: 100 }, F('ash-frame', 'Ash Frame')),
  A('k-death', 'kills', 'The Lantern Fell', 'Die once. Harsh, recoverable.', { type: 'deaths', count: 1 }, T('Returned')),
  A('k-unkilled', 'kills', 'Unscathed', 'Reach 30 minutes of play with 0 deaths.', { type: 'unkilledPlay', ms: 30 * 60_000 }, T('Unscathed')),
  A('k-guardian', 'kills', 'A Lord of a Place', 'Defeat a settlement guardian.', { type: 'guardians', count: 1 }, R(8)),

  // ── radiance (6) ──────────────────────────────────────────────
  A('r-1', 'radiance', 'First Spark', 'Earn 1 Radiance (lifetime).', { type: 'radianceEarned', count: 1 }, L(10)),
  A('r-10', 'radiance', 'A Small Constellation', 'Earn 10 Radiance.', { type: 'radianceEarned', count: 10 }, R(1)),
  A('r-perk', 'radiance', 'A Star Pinned', 'Spend a perk on the grid.', { type: 'perksOwned', count: 1 }, T('Star-Pinned')),
  A('r-5p', 'radiance', 'Five Lights Hung', 'Own 5 constellation perks.', { type: 'perksOwned', count: 5 }, F('star-frame', 'Star Frame')),
  A('r-cap', 'radiance', 'A Capstone', 'Unlock any capstone node.', { type: 'capstoneOwned', count: 1 }, T('Capstone')),
  A('r-respec', 'radiance', 'Rearranged Heaven', 'Respec the constellation once.', { type: 'respecs', count: 1 }, L(25)),

  // ── time (6) ──────────────────────────────────────────────────
  A('t-5m', 'time', 'Five Minutes by the Flame', '5 minutes of play (incl. credited offline).', { type: 'playtime', ms: 5 * 60_000 }, L(8)),
  A('t-30m', 'time', 'A Watch', '30 minutes by the flame.', { type: 'playtime', ms: 30 * 60_000 }, R(1)),
  A('t-2h', 'time', 'The Long Sit', '2 hours by the flame.', { type: 'playtime', ms: 2 * 3_600_000 }, T('Long-Sitter')),
  A('t-12h', 'time', 'Through the Night', '12 hours by the flame.', { type: 'playtime', ms: 12 * 3_600_000 }, F('night-frame', 'Night Frame')),
  A('t-off-1', 'time', 'The Work Went On', 'Claim offline progress once.', { type: 'offlineClaims', count: 1 }, L(10)),
  A('t-off-5', 'time', 'Trusted the Dark', 'Claim offline progress 5 times.', { type: 'offlineClaims', count: 5 }, R(2)),

  // ── silly (8) ─────────────────────────────────────────────────
  A('s-toggle', 'silly', 'On, Off, On', 'Flip auto-restart three times.', { type: 'autoRestartToggles', count: 3 }, T('Indecisive')),
  A('s-empty', 'silly', 'Out of Tinder', 'Halt Tend the Flame for want of tinder.', { type: 'tinderHalts', count: 1 }, T('Forgot the Fuel')),
  A('s-stop', 'silly', 'That Will Do', 'Stop a running action by hand.', { type: 'manualStops', count: 1 }, L(5)),
  A('s-zero', 'silly', 'Broke on Purpose', 'Hold 0 Lumen.', { type: 'lumenExactly', count: 0 }, T('Pockets Out')),
  A('s-rich', 'silly', 'Too Bright to Pocket', 'Hold 500 Lumen at once.', { type: 'lumenAtLeast', count: 500 }, T('Gleaming')),
  A('s-daily', 'silly', 'Came Back Tomorrow', 'Complete a daily ember task.', { type: 'dailiesDone', count: 1 }, R(1)),
  A('s-reroll', 'silly', 'Not Those Stars', 'Reroll the daily embers once.', { type: 'dailyRerolls', count: 1 }, L(8)),
  A('s-title', 'silly', 'Wear a Name', 'Equip a title.', { type: 'titleEquipped', count: 1 }, L(10)),
];

export const ACHIEVEMENTS_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

if (ACHIEVEMENTS.length < 60) {
  throw new Error(`S4 contract: need ≥60 achievements, have ${ACHIEVEMENTS.length}`);
}
