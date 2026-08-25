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
  assert.equal(/✦/.test(tinder.textContent ?? ''), false, 'tile itself has no price caption');
  const dock = scr.node.querySelector('.bank-inspector');
  assert.match(dock.textContent ?? '', /Tinderscrap|in the bank|tinder/i);
  assert.match(dock.textContent ?? '', /Sells for ✦/);
  assert.match(dock.textContent ?? '', /catalog/);

  globalThis.window = prev;
});

test('owned grid tiles are dense glyphs with no per-tile ✦price captions', () => {
  const s = createState({ rngSeed: 1 });
  const scr = tabs.renderBankScreen(makeCtx(s));
  const tiles = scr.node.querySelectorAll('.bank-tile');
  assert.ok(tiles.length > 0);
  assert.ok(tiles.every((t) => t.classList.contains('bank-tile-dense')));
  assert.ok(tiles.every((t) => t.querySelector('.bank-glyph')));
  for (const t of tiles) {
    assert.equal(/✦/.test(t.textContent ?? ''), false, 'price stays off the tile');
    assert.ok(t.querySelector('.bank-qty'), 'qty badge present');
  }
  assert.match(scr.node.querySelector('.screen-sub').textContent ?? '', /catalog worth ✦/);
});

test('owned tab chips are core tabs plus only categories that hold stock', () => {
  const s = createState({ rngSeed: 1 });
  const scr = tabs.renderBankScreen(makeCtx(s));
  const labels = scr.node.querySelectorAll('.bank-tab').map((t) => t.textContent);
  assert.deepEqual(labels.slice(0, 3), ['Owned', 'Pinned', 'Catalogue']);
  assert.ok(labels.includes('Fuel'));
  assert.ok(labels.includes('Herbs'));
  assert.equal(labels.includes('Fish'), false);
  assert.equal(labels.includes('Gems'), false);
  assert.equal(labels.includes('Ores'), false);
  assert.ok(labels.length < 12, 'empty categories are not a second inventory');
});
