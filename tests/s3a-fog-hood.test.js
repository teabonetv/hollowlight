// S3a: Fog-hood is one hearth recipe on existing goods.
// Fogwort + Pale-cap + Tinderscrap → Fog-hood (HEAD slot flag).
// Instant atomic pay like Press Lamp-oil. Not Chandlercraft-the-skill.
// SAVE_VERSION stays 5.

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

const { createState } = await import('../src/game/state.js');
const { SAVE_VERSION } = await import('../src/core/save.js');
const { ITEMS_BY_ID } = await import('../src/game/data/items.js');
const {
  PRESS_LAMP_OIL_ID,
  STITCH_FOG_HOOD_ID,
  RECIPES,
  RECIPES_BY_ID,
  validateRecipes,
} = await import('../src/game/data/recipes.js');
const { craftRecipe, canCraft, craftNeedLabel } = await import('../src/game/systems/craft.js');
const tabs = await import('../src/ui/screens/tabs.js');

function fundHood(state, extras = {}) {
  state.bank.fogwort = extras.fogwort ?? 1;
  state.bank.palecap = extras.palecap ?? 1;
  state.bank.tinderscrap = extras.tinderscrap ?? 1;
  return state;
}

function makeCtx(state, overrides = {}) {
  return {
    state,
    toast() {},
    buyUpgrade() {},
    craftRecipe: (id) => craftRecipe(state, id),
    openSellSheet() {},
    openSkill() {},
    openStore() {},
    openAlmanac() {},
    ...overrides,
  };
}

test('SAVE_VERSION stays 5; Fog-hood is a head-slot item', () => {
  assert.equal(SAVE_VERSION, 5);
  const hood = ITEMS_BY_ID['fog-hood'];
  assert.ok(hood);
  assert.equal(hood.slot, 'head');
  assert.equal(hood.obtainable, true);
  assert.ok(hood.sources.some((s) => /Stitch Fog-hood/.test(s)));
});

test('exactly two hearth recipes; Fog-hood costs the three named mats', () => {
  assert.deepEqual(validateRecipes(), []);
  assert.equal(RECIPES.length, 2, 'door into a slot, not a 25-recipe dump');
  assert.equal(RECIPES[0].id, PRESS_LAMP_OIL_ID);
  const r = RECIPES_BY_ID[STITCH_FOG_HOOD_ID];
  assert.ok(r);
  assert.equal(r.name, 'Stitch Fog-hood');
  assert.deepEqual(r.costs, { fogwort: 1, palecap: 1, tinderscrap: 1 });
  assert.deepEqual(r.output, { id: 'fog-hood', qty: 1 });
});

test('craft consumes Fogwort, Pale-cap, Tinderscrap and yields fog-hood', () => {
  const s = createState({ rngSeed: 1 });
  fundHood(s);
  const fog0 = s.bank.fogwort;
  const cap0 = s.bank.palecap;
  const tin0 = s.bank.tinderscrap;
  const hood0 = s.bank['fog-hood'] ?? 0;
  assert.equal(canCraft(s, STITCH_FOG_HOOD_ID), true);
  const res = craftRecipe(s, STITCH_FOG_HOOD_ID);
  assert.equal(res.ok, true);
  assert.equal(res.output.id, 'fog-hood');
  assert.equal(res.output.qty, 1);
  assert.equal(s.bank.fogwort ?? 0, fog0 - 1);
  assert.equal(s.bank.palecap ?? 0, cap0 - 1);
  assert.equal(s.bank.tinderscrap ?? 0, tin0 - 1);
  assert.equal(s.bank['fog-hood'], hood0 + 1);
});

test('cannot craft Fog-hood without each mat; pay is atomic', () => {
  const missingCap = createState({ rngSeed: 2 });
  missingCap.bank.fogwort = 4;
  missingCap.bank.tinderscrap = 30;
  delete missingCap.bank.palecap;
  assert.equal(canCraft(missingCap, STITCH_FOG_HOOD_ID), false);
  assert.equal(craftNeedLabel(missingCap, STITCH_FOG_HOOD_ID), 'Need Pale-cap ×1');
  const resCap = craftRecipe(missingCap, STITCH_FOG_HOOD_ID);
  assert.equal(resCap.ok, false);
  assert.equal(missingCap.bank.fogwort, 4);
  assert.equal(missingCap.bank.tinderscrap, 30);
  assert.equal(missingCap.bank['fog-hood'], undefined);

  const missingFog = fundHood(createState({ rngSeed: 3 }), { fogwort: 0, palecap: 2, tinderscrap: 2 });
  assert.equal(canCraft(missingFog, STITCH_FOG_HOOD_ID), false);
  assert.equal(craftNeedLabel(missingFog, STITCH_FOG_HOOD_ID), 'Need Fogwort ×1');
  assert.equal(craftRecipe(missingFog, STITCH_FOG_HOOD_ID).ok, false);
  assert.equal(missingFog.bank.palecap, 2);
  assert.equal(missingFog.bank.tinderscrap, 2);
  assert.equal(missingFog.bank['fog-hood'], undefined);

  const missingTin = fundHood(createState({ rngSeed: 4 }), { fogwort: 2, palecap: 2, tinderscrap: 0 });
  assert.equal(canCraft(missingTin, STITCH_FOG_HOOD_ID), false);
  assert.equal(craftNeedLabel(missingTin, STITCH_FOG_HOOD_ID), 'Need Tinderscrap ×1');
  assert.equal(craftRecipe(missingTin, STITCH_FOG_HOOD_ID).ok, false);
  assert.equal(missingTin.bank.fogwort, 2);
  assert.equal(missingTin.bank.palecap, 2);
  assert.equal(missingTin.bank['fog-hood'], undefined);
});

test('Camp hearth paints Stitch Fog-hood; tap consumes the three mats', () => {
  const s = createState({ rngSeed: 5 });
  fundHood(s);
  const scr = tabs.renderCampScreen(makeCtx(s));
  const cards = scr.node.querySelectorAll('[data-camp="craft"]');
  assert.equal(cards.length, 2);
  const hoodCard = cards.find((n) => /Stitch Fog-hood/.test(n.textContent ?? ''));
  assert.ok(hoodCard, 'Fog-hood craft card on the hearth');
  assert.match(hoodCard.textContent ?? '', /Fogwort ×1/);
  assert.match(hoodCard.textContent ?? '', /Pale-cap ×1/);
  assert.match(hoodCard.textContent ?? '', /Tinderscrap ×1/);
  const btn = hoodCard.querySelector('button');
  assert.match(btn.textContent ?? '', /Craft · Stitch Fog-hood/);
  btn.click();
  assert.equal(s.bank['fog-hood'], 1);
  assert.equal(s.bank.fogwort ?? 0, 0);
  assert.equal(s.bank.palecap ?? 0, 0);
  assert.equal(s.bank.tinderscrap ?? 0, 0);
});
