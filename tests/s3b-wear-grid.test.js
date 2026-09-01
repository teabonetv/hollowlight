// S3b: first chimney unlocks the 2×3 wear grid. Smith existing goods.
// Grid hidden on boot; visible after smith or first lantern equip.
// Equipping chimney or weapon changes a Hunt number. SAVE_VERSION stays 5.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeNode, FakeText } from './helpers/fake-node.mjs';

globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => new FakeText(s),
  addEventListener() {},
  removeEventListener() {},
};
globalThis.requestAnimationFrame = (fn) => 0;
try { globalThis.navigator = {}; } catch { /* node ≥21 */ }

import { createState } from '../src/game/state.js';
import { SAVE_VERSION, serializeSave, deserializeSave } from '../src/core/save.js';
import { createRng } from '../src/core/rng.js';
import { ACTIONS_BY_ID } from '../src/game/data/actions.js';
import { RECIPES } from '../src/game/data/recipes.js';
import { ITEMS_BY_ID } from '../src/game/data/items.js';
import { OIL_ORDER } from '../src/game/data/combat/consumables.js';
import {
  CHIMNEY_ITEM_ID, SMITH_CHIMNEY_ACTION_ID, WEAR_SLOTS,
} from '../src/game/data/wear.js';
import { completeCycle, startAction, tickActions } from '../src/game/systems/action-runner.js';
import * as combat from '../src/game/systems/combat.js';
import { buyUpgrade } from '../src/game/systems/upgrades.js';
import { renderSkillDetail } from '../src/ui/screens/skills.js';
import { renderCampScreen } from '../src/ui/screens/tabs.js';
import { REGULARS } from '../src/game/data/enemies/regulars.js';

function makeCtx(state) {
  return {
    state,
    toast() {},
    buyUpgrade: (id) => buyUpgrade(state, id),
    craftRecipe() {},
    equipWeapon: (id) => combat.equipWeapon(state, id),
    equipSlot: (slot, id) => combat.equipSlot(state, slot, id),
    openSellSheet() {},
    openSkill() {},
    openStore() {},
    openAlmanac() {},
    actionStatus() { return { running: false, frac: 0, durationMs: 8000, etaMs: 8000, locked: false, affordable: true, autoRestart: true, mastery: { level: 1 }, xpBase: 22, xpGrant: 22, xpRaw: 22 }; },
    toggleAction() {},
    setAutoRestart() {},
  };
}

function fundChimneyMats(state) {
  state.bank.tinderscrap = (state.bank.tinderscrap ?? 0) + 2;
  state.bank.graveresin = (state.bank.graveresin ?? 0) + 1;
}

function smithChimney(state, seed = 1) {
  fundChimneyMats(state);
  const action = ACTIONS_BY_ID[SMITH_CHIMNEY_ACTION_ID];
  const tinder0 = state.bank.tinderscrap;
  const resin0 = state.bank.graveresin;
  const out0 = state.bank[CHIMNEY_ITEM_ID] ?? 0;
  const res = completeCycle(state, action, createRng(seed));
  state.actions.completed[SMITH_CHIMNEY_ACTION_ID] =
    (state.actions.completed[SMITH_CHIMNEY_ACTION_ID] ?? 0) + 1;
  return { res, tinder0, resin0, out0 };
}

test('SAVE_VERSION stays 5; S1al oil order and one Camp recipe stay', () => {
  assert.equal(SAVE_VERSION, 5);
  assert.deepEqual(OIL_ORDER, ['lamp-oil', 'wick-oil']);
  assert.equal(RECIPES.length, 1);
  assert.ok(ITEMS_BY_ID[CHIMNEY_ITEM_ID]);
  assert.equal(ITEMS_BY_ID[CHIMNEY_ITEM_ID].slot, 'lantern');
  assert.ok(ACTIONS_BY_ID[SMITH_CHIMNEY_ACTION_ID]);
  assert.equal(WEAR_SLOTS.length, 6);
});

test('S1al: wick spend does not steal the flask', () => {
  const s = createState({ rngSeed: 4 });
  s.campUpgrades = {};
  s.lumen = 8;
  s.bank['lamp-oil'] = 1;
  s.bank['wick-oil'] = 0;
  assert.equal(buyUpgrade(s, 'lantern-wick').ok, true);
  assert.equal(s.bank['lamp-oil'], 1, 'wick spend must not steal the flask');
});

test('S1al: Hunt drinks Lamp-oil first', () => {
  const s = createState({ rngSeed: 2 });
  s.bank['lamp-oil'] = 1;
  s.bank['wick-oil'] = 1;
  combat.startFight(s, 'fog-rat', { encounterSeed: 1 });
  const interval = combat.consumeOilSip(s);
  assert.equal(interval, 16000);
  assert.equal(s.bank['lamp-oil'] ?? 0, 0);
  assert.equal(s.bank['wick-oil'], 1);
});

test('smith chimney consumes mats and yields glass-chimney', () => {
  const s = createState({ rngSeed: 1 });
  const { res, tinder0, resin0, out0 } = smithChimney(s);
  assert.equal(res.halted, undefined);
  assert.equal(s.bank.tinderscrap, tinder0 - 2);
  assert.equal(s.bank.graveresin ?? 0, resin0 - 1);
  assert.equal(s.bank[CHIMNEY_ITEM_ID], out0 + 1);
});

test('smith chimney without mats does not invent output', () => {
  const s = createState({ rngSeed: 2 });
  delete s.bank.graveresin;
  const tinder0 = s.bank.tinderscrap;
  const res = completeCycle(s, ACTIONS_BY_ID[SMITH_CHIMNEY_ACTION_ID], createRng(2));
  assert.equal(res.halted, true);
  assert.equal(s.bank[CHIMNEY_ITEM_ID], undefined);
  assert.equal(s.bank.tinderscrap, tinder0);
});

test('wear grid is hidden on boot and after first chimney', () => {
  const fresh = createState({ rngSeed: 3 });
  const boot = renderCampScreen(makeCtx(fresh));
  assert.equal(combat.wearGridUnlocked(fresh), false);
  assert.equal(boot.node.querySelector('[data-wear-grid]')?.style.display, 'none');
  assert.equal(boot.node.querySelector('[data-wear-slot="weapon"]'), null);
  assert.ok(boot.node.querySelector('[data-camp="hand"]'));
  assert.match(boot.node.querySelector('[data-camp="hand"]').textContent ?? '', /Wick-knife/);
  assert.equal(boot.node.querySelector('[data-camp-wear="title"]')?.textContent, 'Hand');

  const smithed = createState({ rngSeed: 3 });
  smithChimney(smithed);
  assert.equal(combat.wearGridUnlocked(smithed), true);
  const after = renderCampScreen(makeCtx(smithed));
  assert.equal(after.node.querySelector('[data-wear-grid]')?.style.display, '');
  for (const slot of WEAR_SLOTS) {
    assert.ok(after.node.querySelector(`[data-wear-slot="${slot.id}"]`), slot.id);
  }
  assert.equal(after.node.querySelector('[data-camp-wear="title"]')?.textContent, 'Wear');
});

test('equipping the chimney without smithing also shows the grid', () => {
  const s = createState({ rngSeed: 5 });
  s.bank[CHIMNEY_ITEM_ID] = 1;
  assert.equal(combat.wearGridUnlocked(s), false);
  const res = combat.equipSlot(s, 'lantern', CHIMNEY_ITEM_ID);
  assert.equal(res.ok, true);
  assert.equal(combat.wearGridUnlocked(s), true);
  const scr = renderCampScreen(makeCtx(s));
  assert.ok(scr.node.querySelector('[data-wear-slot="lantern"]'));
});

test('fresh fight starts at playerMaxHp, not the 36/40 lie', () => {
  const s = createState({ rngSeed: 1 });
  assert.equal(s.combat.player.hp, combat.playerMaxHp(s));
  assert.equal(combat.playerMaxHp(s), 40);
  combat.startFight(s, 'pale-moth', { encounterSeed: 1 });
  assert.equal(s.combat.player.hp, combat.playerMaxHp(s));
  assert.equal(s.combat.player.hp, 40);
});

test('equipping wick-knife still changes a Hunt combat number', () => {
  const armed = createState({ rngSeed: 1 });
  combat.startFight(armed, 'pale-moth', { encounterSeed: 1 });
  const kitArmed = combat.fightCockpit(armed);

  const bare = createState({ rngSeed: 1 });
  combat.equipWeapon(bare, 'unarmed');
  combat.startFight(bare, 'pale-moth', { encounterSeed: 1 });
  const kitBare = combat.fightCockpit(bare);

  assert.ok(kitArmed.hitPct > kitBare.hitPct);
  assert.ok(kitArmed.playerMaxHit > kitBare.playerMaxHit);
});

test('equipping chimney changes oil seconds and Hunt acc while fed', () => {
  const bare = createState({ rngSeed: 6 });
  bare.bank['lamp-oil'] = 2;
  bare.bank['wick-oil'] = 0;
  combat.startFight(bare, 'pale-moth', { encounterSeed: 1 });
  const oilBare = combat.consumeOilSip(bare);
  const accBare = combat.playerOffense(bare, 'strike').accuracy;
  const kitBare = combat.fightCockpit(bare);

  const worn = createState({ rngSeed: 6 });
  worn.bank['lamp-oil'] = 2;
  worn.bank['wick-oil'] = 0;
  worn.bank[CHIMNEY_ITEM_ID] = 1;
  combat.equipSlot(worn, 'lantern', CHIMNEY_ITEM_ID);
  combat.startFight(worn, 'pale-moth', { encounterSeed: 1 });
  const oilWorn = combat.consumeOilSip(worn);
  const accWorn = combat.playerOffense(worn, 'strike').accuracy;
  const kitWorn = combat.fightCockpit(worn);

  assert.ok(oilWorn > oilBare, 'chimney stretches oil seconds');
  assert.equal(oilWorn, Math.round(16000 * 1.25));
  assert.ok(accWorn > accBare, 'chimney raises acc while fed');
  assert.ok(kitWorn.hitPct > kitBare.hitPct);
});

test('tool slot never changes combat damage', () => {
  const s = createState({ rngSeed: 7 });
  s.bank['flint-striker'] = 1;
  s.bank[CHIMNEY_ITEM_ID] = 1;
  combat.equipSlot(s, 'lantern', CHIMNEY_ITEM_ID);
  const before = combat.playerOffense(s, 'strike');
  combat.equipSlot(s, 'tool', 'flint-striker');
  const after = combat.playerOffense(s, 'strike');
  assert.equal(after.minDmg, before.minDmg);
  assert.equal(after.maxDmg, before.maxDmg);
  assert.equal(after.accuracy, before.accuracy);
  assert.equal(combat.heldSlotItem(s, 'tool')?.id, 'flint-striker');
});

test('wear unlock persists across save without a version bump', () => {
  const s = createState({ rngSeed: 8 });
  smithChimney(s);
  combat.equipSlot(s, 'lantern', CHIMNEY_ITEM_ID);
  const json = serializeSave(s, 2000);
  assert.equal(JSON.parse(json).version, 5);
  const { state: back } = deserializeSave(json);
  assert.equal(SAVE_VERSION, 5);
  assert.equal(combat.wearGridUnlocked(back), true);
  assert.equal(combat.heldLantern(back)?.id, CHIMNEY_ITEM_ID);
});

test('Smithing detail is the chimney action, not coming-soon', () => {
  const s = createState({ rngSeed: 1 });
  const scr = renderSkillDetail(makeCtx(s), 'smithing');
  assert.match(scr.node.textContent ?? '', /Smith a Chimney/);
  assert.doesNotMatch(scr.node.textContent ?? '', /The fog is thick here/);
});

test('timed smith cycle spends mats the same as completeCycle', () => {
  const s = createState({ rngSeed: 9 });
  fundChimneyMats(s);
  const tinder0 = s.bank.tinderscrap;
  assert.equal(startAction(s, SMITH_CHIMNEY_ACTION_ID).ok, true);
  tickActions(s, 8000, createRng(9));
  assert.equal(s.bank.tinderscrap, tinder0 - 2);
  assert.equal(s.bank[CHIMNEY_ITEM_ID], 1);
  assert.equal(combat.wearGridUnlocked(s), true);
});

test('no extra Hunt regulars', () => {
  const hearth = REGULARS.filter((e) => e.zoneId === 'hearthway').map((e) => e.id);
  assert.ok(hearth.includes('wick-thief'));
  assert.ok(hearth.includes('hollow-cur'));
  assert.ok(hearth.includes('lantern-shade'));
  assert.ok(hearth.includes('ash-crawler'));
  assert.equal(hearth.length, 6);
});
