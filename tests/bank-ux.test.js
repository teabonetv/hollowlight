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
const { DEFAULT_BANK_TAB, ITEMS, ITEMS_BY_ID } = await import('../src/game/data/items.js');
const { filterItems, sellItems, bankCount, bankSellValue } = await import('../src/game/systems/bank.js');
const { itemGlyph } = await import('../src/game/data/item-glyphs.js');
const { ICONS } = await import('../src/ui/icons.js');
const tabs = await import('../src/ui/screens/tabs.js');
const { prefersDockedInspector, itemTileGlyph, itemTileChrome } = await import('../src/ui/screens/bank.js');
const modals = await import('../src/ui/modals.js');
const { formatNumber } = await import('../src/core/format.js');

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
  assert.match(tinder.querySelector('.bank-chrome').textContent ?? '', /✦1 · ×/);
  const dock = scr.node.querySelector('.bank-inspector');
  assert.match(dock.textContent ?? '', /Tinderscrap|in the bank|tinder/i);
  assert.match(dock.textContent ?? '', /Sells for ✦/);
  assert.match(dock.textContent ?? '', /catalog/);

  globalThis.window = prev;
});

test('owned grid tiles are dense glyphs with catalog chrome ✦n · ×qty', () => {
  const s = createState({ rngSeed: 1 });
  const scr = tabs.renderBankScreen(makeCtx(s));
  const tiles = scr.node.querySelectorAll('.bank-tile');
  assert.ok(tiles.length > 0);
  assert.ok(tiles.every((t) => t.classList.contains('bank-tile-dense')));
  assert.ok(tiles.every((t) => t.querySelector('.bank-glyph')));
  for (const t of tiles) {
    const chrome = t.querySelector('.bank-chrome').textContent ?? '';
    assert.match(chrome, /✦\d+ · ×/);
    assert.ok(t.querySelector('.bank-qty'), 'qty still in the DOM for live-number reads');
    assert.ok(t.querySelector('.bank-name')?.className.includes('visually-hidden'),
      'owned stays a glyph grid, not named cards');
  }
  const tinder = tiles.find((t) => /Tinderscrap/.test(t.textContent ?? ''));
  assert.equal(tinder.querySelector('.bank-chrome').textContent, itemTileChrome(ITEMS_BY_ID.tinderscrap, 30));
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

function tileByName(root, name) {
  return root.querySelectorAll('.bank-tile').find((t) => new RegExp(name).test(t.textContent ?? ''));
}

test('every registry glyph exists and Fuel items are unique', () => {
  for (const it of ITEMS) {
    const g = itemGlyph(it);
    assert.ok(ICONS[g], `${it.id} uses missing glyph ${g}`);
  }
  const fuels = ITEMS.filter((it) => it.category === 'fuel');
  const glyphs = fuels.map((it) => itemTileGlyph(it));
  assert.equal(new Set(glyphs).size, fuels.length, 'no two fuels share a glyph');
  assert.equal(itemTileGlyph(ITEMS_BY_ID.tinderscrap), 'flame');
  assert.equal(itemTileGlyph(ITEMS_BY_ID.bogmoss), 'moss');
});

test('starter Fuel tiles are not two gold flames', () => {
  const s = createState({ rngSeed: 1 });
  s.bank.bogmoss = 4;
  const scr = tabs.renderBankScreen(makeCtx(s));
  const tinder = tileByName(scr.node, 'Tinderscrap');
  const moss = tileByName(scr.node, 'Bog-moss');
  assert.ok(tinder && moss);
  assert.ok(tinder.classList.contains('glyph-flame'));
  assert.ok(moss.classList.contains('glyph-moss'));
  assert.notEqual(
    tinder.querySelector('.bank-glyph').className,
    moss.querySelector('.bank-glyph').className);
});

test('Sell Mode sells from the grid without opening the inspector', () => {
  const s = createState({ rngSeed: 3 });
  const opened = [];
  const toasts = [];
  let scr;
  const ctx = makeCtx(s, {
    openSellSheet: (id) => opened.push(id),
    toast: (m) => toasts.push(m),
    sell(id, qty) {
      const res = sellItems(s, id, qty);
      scr.update();
      return res;
    },
  });
  scr = tabs.renderBankScreen(ctx);
  const worthBefore = bankSellValue(s.bank);
  const headerBefore = scr.node.querySelector('.screen-sub').textContent;
  assert.match(headerBefore, new RegExp(`catalog worth ✦${formatNumber(worthBefore)}`));

  const toggle = scr.node.querySelector('.bank-sell-toggle');
  toggle.click();
  assert.equal(opened.length, 0);
  assert.equal(scr.node.classList.contains('bank-selling'), true);

  const tinder = tileByName(scr.node, 'Tinderscrap');
  tinder.click();
  assert.deepEqual(opened, [], 'Sell Mode never opens the sheet');
  assert.equal(bankCount(s.bank, 'tinderscrap'), 29);
  assert.equal(s.lumen, 21, 'catalog unit lands in the purse (no feat engine here)');
  assert.equal(bankSellValue(s.bank), worthBefore - ITEMS_BY_ID.tinderscrap.sell);
  const headerAfter = scr.node.querySelector('.screen-sub').textContent;
  assert.match(headerAfter, new RegExp(`catalog worth ✦${formatNumber(worthBefore - 1)}`));
  const chrome = tileByName(scr.node, 'Tinderscrap').querySelector('.bank-chrome').textContent;
  assert.equal(chrome, itemTileChrome(ITEMS_BY_ID.tinderscrap, 29));
  assert.ok(toasts.some((m) => /Sold Tinderscrap/.test(m)));
});

test('Dump from the grid two-taps above the confirm threshold', () => {
  const s = createState({ rngSeed: 4 });
  s.bank.fogwort = 40;
  modals.clearSellConfirm('fogwort');
  const opened = [];
  let scr;
  const ctx = makeCtx(s, {
    openSellSheet: (id) => opened.push(id),
    toast() {},
    sell(id, qty) {
      const res = sellItems(s, id, qty);
      scr.update();
      return res;
    },
  });
  scr = tabs.renderBankScreen(ctx);
  scr.node.querySelector('.bank-sell-toggle').click();
  modals.clearSellConfirm('fogwort');
  const dump = scr.node.querySelectorAll('.bank-sell-qty-btn').find((b) => /Dump/.test(b.textContent ?? ''));
  dump.click();
  const fog = tileByName(scr.node, 'Fogwort');
  fog.click();
  assert.equal(s.bank.fogwort, 40, 'first dump tap only arms confirm');
  assert.equal(opened.length, 0);
  fog.click();
  assert.equal(s.bank.fogwort, undefined);
  assert.equal(opened.length, 0);
  assert.equal(tileByName(scr.node, 'Fogwort'), undefined);
});

test('phone inspect is a bottom sheet; settings stay a centered modal', () => {
  const prev = globalThis.window;
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  assert.equal(prefersDockedInspector(), false);

  const s = createState({ rngSeed: 5 });
  const sheetMount = globalThis.document.createElement('div');
  modals.showSellSheet(sheetMount, {
    state: s,
    sell: () => ({ ok: false }),
    toast() {},
  }, 'tinderscrap');
  const sheet = sheetMount.querySelector('.sheet-overlay');
  const sheetPanel = sheetMount.querySelector('.sheet-panel');
  assert.ok(sheet, 'sell inspect uses sheet-overlay');
  assert.ok(sheetPanel, 'sell inspect uses sheet-panel');
  assert.ok(sheet.classList.contains('modal-overlay'));
  assert.ok(sheetPanel.querySelector('.sheet-handle'), 'sheet has a grab handle');

  const settingsMount = globalThis.document.createElement('div');
  modals.showSettingsModal(settingsMount, {
    isReducedMotion: () => false,
    setReducedMotion() {},
    exportSave: () => '',
    importSave: () => ({ ok: true }),
    resetGame() {},
    toast() {},
  });
  const settingsOverlay = settingsMount.querySelector('.modal-overlay');
  assert.ok(settingsOverlay, 'settings still use the centered overlay');
  assert.equal(settingsOverlay.classList.contains('sheet-overlay'), false);
  assert.equal(settingsMount.querySelector('.sheet-panel'), null);

  globalThis.window = prev;
});

