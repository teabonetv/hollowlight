// Hunt → Camp play loop: one Fogwort craft, Camp spend on existing tracks
// changes Hunt speed, Hand wear changes the next fight. Satchel contracts
// from #83 stay (named-only n). SAVE_VERSION stays 5.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FakeNode, FakeText } from './helpers/fake-node.mjs';

const here = dirname(fileURLToPath(import.meta.url));

globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => new FakeText(s),
  addEventListener() {},
  removeEventListener() {},
};
globalThis.requestAnimationFrame = (fn) => 0;
try { globalThis.navigator = {}; } catch { /* node ≥21 */ }

const { createState } = await import('../src/game/state.js');
const { SAVE_VERSION, serializeSave, deserializeSave } = await import('../src/core/save.js');
const { PRESS_LAMP_OIL_ID, RECIPES, validateRecipes } = await import('../src/game/data/recipes.js');
const { craftRecipe, canCraft, craftNeedLabel } = await import('../src/game/systems/craft.js');
const { buyUpgrade, upgradeLevel, speedMultiplier } = await import('../src/game/systems/upgrades.js');
const combat = await import('../src/game/systems/combat.js');
const { TRACKS } = await import('../src/game/data/upgrades.js');
const tabs = await import('../src/ui/screens/tabs.js');
const { HuntSatchel } = await import('../src/ui/screens/hunt-satchel.js');

function makeCtx(state, overrides = {}) {
  return {
    state,
    toast() {},
    buyUpgrade: (id) => buyUpgrade(state, id),
    craftRecipe: (id) => craftRecipe(state, id),
    equipWeapon: (id) => combat.equipWeapon(state, id),
    openSellSheet() {},
    openSkill() {},
    openStore() {},
    openAlmanac() {},
    ...overrides,
  };
}

function fundWickTier0(state) {
  const tier = TRACKS.find((t) => t.id === 'lantern-wick').tiers[0];
  state.lumen += tier.lumen;
  for (const [id, qty] of Object.entries(tier.items ?? {})) {
    state.bank[id] = (state.bank[id] ?? 0) + qty;
  }
  return tier;
}

function killFoe(state, enemyId, encounterSeed = 1) {
  state.combat.autoContinue = false;
  combat.startFight(state, enemyId, { encounterSeed });
  let kill = null;
  for (let i = 0; i < 80 && !kill; i++) {
    if (state.combat.foe) state.combat.foe.hp = 1;
    state.combat.player.nextActMs = 0;
    const events = combat.tickCombat(state, 100);
    kill = events.find((e) => e.type === 'combat-kill') ?? kill;
  }
  return kill;
}

test('SAVE_VERSION stays 5', () => {
  assert.equal(SAVE_VERSION, 5);
});

test('one Hunt-mat recipe: Fogwort → Lamp-oil; leftover-well 184 stays gone', () => {
  assert.deepEqual(validateRecipes(), []);
  assert.equal(RECIPES.length, 1);
  assert.equal(RECIPES[0].id, PRESS_LAMP_OIL_ID);
  assert.equal(RECIPES[0].costs.fogwort, 2);
  assert.equal(RECIPES[0].output.id, 'lamp-oil');
  const ui = readFileSync(join(here, 'combat-ui.test.js'), 'utf8');
  assert.equal(ui.includes('leftoverWellMin'), false);
  const combatSrc = readFileSync(join(here, '../src/ui/screens/combat.js'), 'utf8');
  assert.doesNotMatch(combatSrc, /leftoverWellMin/);
});

test('craft Press Lamp-oil consumes Hunt Fogwort and yields lamp-oil', () => {
  const s = createState({ rngSeed: 1 });
  const fog0 = s.bank.fogwort;
  const oil0 = s.bank['lamp-oil'] ?? 0;
  assert.equal(canCraft(s, PRESS_LAMP_OIL_ID), true);
  const res = craftRecipe(s, PRESS_LAMP_OIL_ID);
  assert.equal(res.ok, true);
  assert.equal(s.bank.fogwort, fog0 - 2);
  assert.equal(s.bank['lamp-oil'], oil0 + 1);
  const short = createState({ rngSeed: 2 });
  short.bank.fogwort = 1;
  assert.equal(canCraft(short, PRESS_LAMP_OIL_ID), false);
  assert.equal(craftNeedLabel(short, PRESS_LAMP_OIL_ID), 'Need Fogwort ×2');
  assert.equal(craftRecipe(short, PRESS_LAMP_OIL_ID).ok, false);
  assert.equal(short.bank.fogwort, 1);
  assert.equal(short.bank['lamp-oil'], undefined);
});

test('Camp spend on Lantern & Wick consumes goods/lumen, persists, and shortens Hunt blows', () => {
  const s = createState({ rngSeed: 3 });
  const tier = fundWickTier0(s);
  const lumen0 = s.lumen;
  const tinder0 = s.bank.tinderscrap;
  const speed0 = combat.playerOffense(s, 'strike').speedMs;
  assert.equal(speed0, 2200);
  const res = buyUpgrade(s, 'lantern-wick');
  assert.equal(res.ok, true);
  assert.equal(upgradeLevel(s, 'lantern-wick'), 1);
  assert.equal(s.lumen, lumen0 - tier.lumen);
  assert.equal(s.bank.tinderscrap, tinder0 - tier.items.tinderscrap);
  assert.equal(speedMultiplier(s), 1.05);
  const speed1 = combat.playerOffense(s, 'strike').speedMs;
  assert.equal(speed1, Math.round(2200 / 1.05));
  assert.ok(speed1 < speed0);

  const json = serializeSave(s, 1000);
  const { state: back } = deserializeSave(json);
  assert.equal(back.campUpgrades['lantern-wick'], 1);
  assert.equal(back.lumen, s.lumen);
  assert.equal(combat.playerOffense(back, 'strike').speedMs, speed1);
  assert.equal(SAVE_VERSION, 5);
});

test('wearing the wick-knife changes Hunt accuracy and max-hit vs unarmed', () => {
  const armed = createState({ rngSeed: 1 });
  assert.equal(combat.heldWeapon(armed)?.id, 'wick-knife');
  const knife = combat.playerOffense(armed, 'strike');
  combat.startFight(armed, 'pale-moth', { encounterSeed: 1 });
  const kitArmed = combat.fightCockpit(armed);

  const bare = createState({ rngSeed: 1 });
  combat.equipWeapon(bare, 'unarmed');
  const un = combat.playerOffense(bare, 'strike');
  combat.startFight(bare, 'pale-moth', { encounterSeed: 1 });
  const kitBare = combat.fightCockpit(bare);

  assert.ok(knife.maxDmg > un.maxDmg);
  assert.ok(knife.accuracy > un.accuracy);
  assert.ok(kitArmed.hitPct > kitBare.hitPct);
  assert.ok(kitArmed.playerMaxHit > kitBare.playerMaxHit);
  assert.equal(combat.heldWeapon(bare), null);
});

test('Camp paints Hand wear and the one Fogwort craft; taps mutate state', () => {
  const s = createState({ rngSeed: 4 });
  const scr = tabs.renderCampScreen(makeCtx(s));
  assert.equal(scr.node.querySelectorAll('.track-card').length, 3);
  assert.ok(scr.node.querySelector('[data-camp="hand"]'));
  assert.ok(scr.node.querySelector('[data-camp="craft"]'));
  const hand = scr.node.querySelector('[data-camp="hand"]');
  const craftCard = scr.node.querySelector('[data-camp="craft"]');
  assert.ok(hand);
  assert.ok(craftCard);
  assert.match(craftCard.textContent ?? '', /Press Lamp-oil/);
  assert.match(craftCard.textContent ?? '', /Fogwort ×2/);
  assert.match(hand.textContent ?? '', /Wick-knife/);

  const fog0 = s.bank.fogwort;
  const craftBtn = craftCard.querySelector('button');
  assert.match(craftBtn.textContent ?? '', /Craft · Press Lamp-oil/);
  craftBtn.click();
  assert.equal(s.bank.fogwort, fog0 - 2);
  assert.equal(s.bank['lamp-oil'], 1);

  const unarmed = hand.querySelector('[data-equip="unarmed"]');
  unarmed.click();
  assert.equal(combat.heldWeapon(s), null);
  const knifeBtn = hand.querySelector('[data-equip="wick-knife"]');
  knifeBtn.click();
  assert.equal(combat.heldWeapon(s)?.id, 'wick-knife');
});

test('satchel contracts: moth wallet-only has no chip; Fog-rat named unpaid is chip+sheet', () => {
  const moth = createState({ rngSeed: 4 });
  const lumen0 = moth.lumen;
  const souls0 = moth.souls;
  assert.ok(killFoe(moth, 'pale-moth'));
  const named = HuntSatchel.itemEntries(HuntSatchel.ungranted(moth.combat.lootTray));
  assert.equal(named.length, 0, 'wallet-only Pale Moth');
  assert.ok(moth.souls > souls0);
  assert.ok(moth.lumen > lumen0);
  assert.equal(HuntSatchel.unpaidCount(combat.combatStatus(moth), { state: moth }), 0);
  assert.equal(HuntSatchel.showChip(combat.combatStatus(moth), { state: moth }), false);

  const rat = createState({ rngSeed: 4 });
  const ratLumen = rat.lumen;
  assert.ok(killFoe(rat, 'fog-rat'));
  const wort = (rat.combat.lootTray ?? []).find((e) => e.kind === 'item' && e.id === 'fogwort');
  assert.ok(wort);
  assert.equal(wort.granted, false);
  assert.equal(HuntSatchel.unpaidCount(combat.combatStatus(rat), { state: rat }), 1);
  assert.equal(rat.lumen, ratLumen, 'named unpaid keeps wallet in the tray');
});
