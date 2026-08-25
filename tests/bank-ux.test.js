// Bank UX: Owned is the working pack; Catalogue is opt-in; desktop docks
// a persistent inspector.

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
try { globalThis.navigator = {}; } catch { /* node ≥21 read-only */ }

const { createState } = await import('../src/game/state.js');
const { DEFAULT_BANK_TAB } = await import('../src/game/data/items.js');
const { filterItems } = await import('../src/game/systems/bank.js');
const { ITEMS } = await import('../src/game/data/items.js');
const tabs = await import('../src/ui/screens/tabs.js');
const { prefersDockedInspector } = await import('../src/ui/screens/bank.js');

function makeCtx(state, overrides = {}) {
  return {
    state,
    toast() {},
    openSellSheet() {},
    sell: () => ({ ok: false }),
    ...overrides,
  };
}

test('DEFAULT_BANK_TAB is owned', () => {
  assert.equal(DEFAULT_BANK_TAB, 'owned');
});

test('owned-default screen has no unowned tiles until Catalogue is opened', () => {
  const s = createState({ rngSeed: 1 });
  const scr = tabs.renderBankScreen(makeCtx(s));
  const tiles = scr.node.querySelectorAll('.bank-tile');
  assert.ok(tiles.length > 0);
  assert.ok(tiles.every((t) => t.classList.contains('owned')));
  assert.equal(scr.node.querySelectorAll('.bank-tile.unowned').length, 0);

  const cat = scr.node.querySelectorAll('.bank-tab').find((t) => /Catalogue/.test(t.textContent ?? ''));
  cat.click();
  const allTiles = scr.node.querySelectorAll('.bank-tile');
  assert.ok(allTiles.length >= 100, 'catalogue lists the registry');
  assert.ok(allTiles.some((t) => t.classList.contains('unowned')));
});

test('filterItems owned tab never returns a zero stack', () => {
  const bank = { fogwort: 2, palecap: 0 };
  const listed = filterItems({ items: ITEMS, bank, tab: 'owned' });
  assert.ok(listed.every((i) => (bank[i.id] ?? 0) > 0));
  assert.equal(listed.some((i) => i.id === 'palecap'), false);
});

test('desktop matchMedia docks the inspector instead of opening a sheet', () => {
  const prev = globalThis.window;
  globalThis.window = { matchMedia: (q) => ({ matches: /min-width:\s*900px/.test(q) }) };
  assert.equal(prefersDockedInspector(), true);

  const opened = [];
  const s = createState({ rngSeed: 2 });
  const scr = tabs.renderBankScreen(makeCtx(s, { openSellSheet: (id) => opened.push(id) }));
  const tinder = scr.node.querySelectorAll('.bank-tile').find((t) => /Tinderscrap/.test(t.textContent ?? ''));
  tinder.click();
  assert.deepEqual(opened, [], 'sheet stays closed when the inspector is docked');
  const dock = scr.node.querySelector('.bank-inspector');
  assert.match(dock.textContent ?? '', /Tinderscrap|in the bank|tinder/i);

  globalThis.window = prev;
});
