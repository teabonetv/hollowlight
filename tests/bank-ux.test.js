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

const { createState, STARTER_BANK } = await import('../src/game/state.js');
const { DEFAULT_BANK_TAB, ITEMS, ITEMS_BY_ID } = await import('../src/game/data/items.js');
const { filterItems, sellItems, bankCount, bankSellValue, uniqueStackCount, lanternRoom,
  toggleLock, isLocked, sellQtyForMode, tryBankAdd, resolveBankTab, isCatalogueTab } = await import('../src/game/systems/bank.js');
const { itemGlyph } = await import('../src/game/data/item-glyphs.js');
const { ICONS, FILLED_ICONS, filledIcon } = await import('../src/ui/icons.js');
const tabs = await import('../src/ui/screens/tabs.js');
const {
  prefersDockedInspector, itemTileGlyph, itemTileChrome, itemTileStallPip,
  ownedNameFits, ownedNameClientWidth, OWNED_NAME_LAYOUT,
  UNKNOWN_ITEM_MARK, STILL_IN_THE_DARK,
} = await import('../src/ui/screens/bank.js');
const { inspectorPriceLawLine, inspectorStackStatsLine } = await import('../src/ui/item-inspector.js');
const { liveSellUnit, addSellPressure } = await import('../src/game/systems/store.js');
const { formatHollowChip, formatKnownChip, paintHud } = await import('../src/ui/hud.js');
const { readFileSync } = await import('node:fs');
const modals = await import('../src/ui/modals.js');
const { cascadeAchievements } = await import('../src/game/systems/achievements.js');
const { itemTimesFound } = await import('../src/game/systems/stats.js');
const { formatNumber } = await import('../src/core/format.js');
const { knownItemCount, logCategoryStats } = await import('../src/game/systems/completion.js');
const { renderAlmanacScreen } = await import('../src/ui/screens/meta.js');

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
  assert.equal(resolveBankTab('all'), 'all');
  assert.equal(resolveBankTab('catalogue'), 'all');
  assert.equal(resolveBankTab('owned'), 'owned');
  assert.equal(resolveBankTab('pinned'), 'pinned');
  assert.equal(resolveBankTab('food'), 'owned');
  assert.equal(isCatalogueTab(resolveBankTab('catalogue')), true);
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
  assert.match(dock.textContent ?? '', /catalog ✦1 · stall today ✦1/);
  assert.match(dock.textContent ?? '', /Fair Trade \/ stall pressure/);

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
    const name = t.querySelector('.bank-name');
    assert.ok(name, 'owned tiles keep a readable name under the glyph');
    assert.equal(name.classList.contains('visually-hidden'), false);
    assert.ok(name.classList.contains('bank-name-dense'));
    assert.ok((name.textContent ?? '').length > 1);
  }
  const tinder = tiles.find((t) => /Tinderscrap/.test(t.textContent ?? ''));
  assert.equal(tinder.querySelector('.bank-chrome').textContent, itemTileChrome(ITEMS_BY_ID.tinderscrap, 30));
  const header = scr.node.querySelector('.screen-sub').textContent ?? '';
  assert.match(header, /catalog worth ✦/);
  assert.match(header, new RegExp(`${uniqueStackCount(s.bank)} / ${lanternRoom(s)}`));
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

function tileByItem(root, id) {
  return root.querySelector(`[data-item="${id}"]`);
}

test('every registry glyph exists and Fuel items are unique', () => {
  for (const it of ITEMS) {
    const g = itemGlyph(it);
    assert.ok(ICONS[g], `${it.id} uses missing glyph ${g}`);
    assert.ok(FILLED_ICONS[g], `${it.id} uses missing filled glyph ${g}`);
  }
  const fuels = ITEMS.filter((it) => it.category === 'fuel');
  const glyphs = fuels.map((it) => itemTileGlyph(it));
  assert.equal(new Set(glyphs).size, fuels.length, 'no two fuels share a glyph');
  assert.equal(itemTileGlyph(ITEMS_BY_ID.tinderscrap), 'flame');
  assert.equal(itemTileGlyph(ITEMS_BY_ID.bogmoss), 'moss');
});

test('Catalogue Herbs do not share one leaf — each has a unique filled mark', () => {
  const herbs = ITEMS.filter((it) => it.category === 'herb');
  const glyphs = herbs.map((it) => itemTileGlyph(it));
  assert.equal(new Set(glyphs).size, herbs.length, 'no two herbs share a glyph');
  assert.equal(itemTileGlyph(ITEMS_BY_ID.fogwort), 'leaf');
  assert.notEqual(itemTileGlyph(ITEMS_BY_ID['bitter-sage']), 'leaf');
  assert.notEqual(itemTileGlyph(ITEMS_BY_ID['veil-clover']), 'leaf');
  assert.notEqual(FILLED_ICONS.parsley, FILLED_ICONS.clover);
  assert.notEqual(FILLED_ICONS.mint, FILLED_ICONS.clover);
  assert.notEqual(FILLED_ICONS.sage, FILLED_ICONS.leaf);
  const s = createState({ rngSeed: 1 });
  s.bank['bitter-sage'] = 1;
  s.bank['veil-clover'] = 1;
  const scr = tabs.renderBankScreen(makeCtx(s));
  const fog = tileByName(scr.node, 'Fogwort');
  const sage = tileByName(scr.node, 'Bitter-sage');
  const clover = tileByName(scr.node, 'Veil-clover');
  const fogSvg = fog.querySelector('.bank-glyph').innerHTML ?? '';
  const sageSvg = sage.querySelector('.bank-glyph').innerHTML ?? '';
  const cloverSvg = clover.querySelector('.bank-glyph').innerHTML ?? '';
  assert.match(fogSvg, /fill="currentColor"/);
  assert.match(sageSvg, /width="32"/);
  assert.notEqual(fogSvg, sageSvg);
  assert.notEqual(sageSvg, cloverSvg);
  assert.notEqual(fogSvg, cloverSvg);
});

test('starter Fuel tiles are filled ≥32px silhouettes, not two gold strokes', () => {
  const s = createState({ rngSeed: 1 });
  s.bank.bogmoss = 4;
  const scr = tabs.renderBankScreen(makeCtx(s));
  const tinder = tileByName(scr.node, 'Tinderscrap');
  const moss = tileByName(scr.node, 'Bog-moss');
  assert.ok(tinder && moss);
  assert.ok(tinder.classList.contains('glyph-flame'));
  assert.ok(moss.classList.contains('glyph-moss'));
  const tinderMark = tinder.querySelector('.bank-glyph');
  const mossMark = moss.querySelector('.bank-glyph');
  assert.notEqual(tinderMark.className, mossMark.className);
  const tinderSvg = tinderMark.innerHTML ?? '';
  const mossSvg = mossMark.innerHTML ?? '';
  assert.match(tinderSvg, /fill="currentColor"/);
  assert.match(mossSvg, /fill="currentColor"/);
  assert.doesNotMatch(tinderSvg, /fill="none"/);
  assert.doesNotMatch(mossSvg, /fill="none"/);
  assert.match(tinderSvg, /width="32"/);
  assert.match(tinderSvg, /height="32"/);
  assert.match(mossSvg, /width="32"/);
  assert.notEqual(tinderSvg, mossSvg, 'flame vs moss silhouettes stay distinct');
  assert.match(filledIcon('flame'), /fill="currentColor"/);
  assert.match(filledIcon('moss'), /fill="currentColor"/);
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

  const panelKids = sheetPanel.children;
  assert.ok(panelKids[0].classList.contains('sheet-handle'), 'first paint: handle');
  assert.match(panelKids[1].textContent ?? '', /Tinderscrap/, 'first paint: name');
  const inspector = sheetPanel.querySelector('.item-inspector-body');
  assert.ok(inspector);
  assert.match(inspector.children[0].textContent ?? '', /catalog ✦1 · stall today ✦1/, 'first paint: catalog line');
  assert.match(inspector.children[0].textContent ?? '', /Fair Trade \/ stall pressure/);
  assert.match(inspector.children[1].textContent ?? '', /Sell 1/, 'first paint: Sell 1');
  assert.match(inspector.children[1].textContent ?? '', /Sell All/, 'first paint: Sell All');
  const lore = inspector.querySelector('.sell-flavor')?.textContent ?? '';
  assert.match(lore, /Shaved splinters/);
  const inspectorText = inspector.children.map?.((c) => c.textContent).join('\n')
    ?? inspector.textContent;
  const sellAt = inspectorText.indexOf('Sell 1');
  const loreAt = inspectorText.indexOf('Shaved splinters');
  assert.ok(sellAt >= 0 && loreAt > sellAt, 'lore sits below sell controls');

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

test('Sell Mode and qty survive a feat-unlocking grid sell remount', () => {
  const s = createState({ rngSeed: 9 });
  const ui = { sellMode: false, sellQtyMode: '1' };
  let scr;
  const ctx = {
    get state() { return s; },
    toast() {},
    openSellSheet() {},
    get sellMode() { return ui.sellMode; },
    setSellMode(v) { ui.sellMode = !!v; },
    get sellQtyMode() { return ui.sellQtyMode; },
    setSellQtyMode(v) { ui.sellQtyMode = v; },
    sell(id, qty) {
      const res = sellItems(s, id, qty);
      cascadeAchievements(s);
      // afterMutation({redraw:true}) remounts the bank when A Fair Trade lights.
      scr = tabs.renderBankScreen(ctx);
      return res;
    },
  };
  scr = tabs.renderBankScreen(ctx);
  scr.node.querySelector('.bank-sell-toggle').click();
  const qty10 = scr.node.querySelectorAll('.bank-sell-qty-btn')
    .find((b) => /×10/.test(b.textContent ?? ''));
  qty10.click();
  assert.equal(ui.sellMode, true);
  assert.equal(ui.sellQtyMode, '10');

  tileByName(scr.node, 'Tinderscrap').click();
  assert.ok(s.achievements.unlocked['e-sell-1'], 'A Fair Trade lights on the first sell');
  const toggle = scr.node.querySelector('.bank-sell-toggle');
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.match(toggle.textContent ?? '', /Selling/);
  assert.equal(scr.node.classList.contains('bank-selling'), true);
  const activeQty = scr.node.querySelectorAll('.bank-sell-qty-btn')
    .find((b) => b.classList.contains('active'));
  assert.match(activeQty.textContent ?? '', /×10/);
  assert.equal(bankCount(s.bank, 'tinderscrap'), 20, '×10 sold from the grid');
});

test('owned dense names wrap at 12px — never ellipsize; starter pack fits 360', () => {
  const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
  const dense = css.match(/\.bank-name-dense\s*\{[^}]+\}/)?.[0] ?? '';
  assert.match(dense, /font-size:\s*12px/);
  assert.doesNotMatch(dense, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(dense, /white-space:\s*nowrap/);
  assert.match(css, /\.bank-grid-owned[\s\S]{0,180}repeat\(3/);
  assert.match(css, /\.bank-tile-dense \.bank-glyph svg \{ width: 32px; height: 32px; \}/);
  assert.equal(OWNED_NAME_LAYOUT.fontPx, 12);
  assert.equal(OWNED_NAME_LAYOUT.phoneColumns, 3);
  assert.equal(OWNED_NAME_LAYOUT.glyphPx, 32);

  const names = [
    ...Object.keys(STARTER_BANK).map((id) => ITEMS_BY_ID[id].name),
    ITEMS_BY_ID.driwood.name,
  ];
  for (const name of names) {
    assert.equal(ownedNameFits(name, 360), true, `${name} must fit two lines at 360`);
  }
  const client = ownedNameClientWidth(360);
  // scrollWidth of a nowrap "Rushwick Reed" at 12px exceeds one line; wrap keeps it readable.
  const rushwickScroll = 'Rushwick Reed'.length * OWNED_NAME_LAYOUT.fontPx * OWNED_NAME_LAYOUT.worstCharEm;
  assert.ok(rushwickScroll > client, 'Rushwick Reed overflows a single 3-col line (wrap, do not clip)');
  assert.ok(rushwickScroll <= client * OWNED_NAME_LAYOUT.lines);

  const s = createState({ rngSeed: 1 });
  const scr = tabs.renderBankScreen(makeCtx(s));
  const rush = tileByName(scr.node, 'Rushwick Reed');
  assert.ok(rush, 'Rushwick Reed tile exists');
  const nameEl = rush.querySelector('.bank-name-dense');
  assert.equal(nameEl.textContent, 'Rushwick Reed');
  assert.doesNotMatch(nameEl.textContent, /…|\.\.\./);
  assert.ok(nameEl.classList.contains('bank-name-dense'));
});

test('inspector names catalog vs stall today on first paint; HUD chips are Known N/N and Hollow N/MAX', () => {
  const s = createState({ rngSeed: 1 });
  const unit = liveSellUnit(s, 'tinderscrap');
  const line = inspectorPriceLawLine(ITEMS_BY_ID.tinderscrap, unit);
  assert.equal(line, 'catalog ✦1 · stall today ✦1 (Fair Trade / stall pressure)');
  assert.equal(formatHollowChip(s), `Hollow ${uniqueStackCount(s.bank)}/${lanternRoom(s)}`);
  assert.equal(formatHollowChip(s), 'Hollow 6/12');
  assert.match(formatHollowChip(s), /^Hollow \d+\/\d+$/);
  assert.equal(formatKnownChip(s), `Known ${knownItemCount(s)}/${ITEMS.length}`);
  assert.equal(formatKnownChip(s), 'Known 6/137');
  assert.match(formatKnownChip(s), /^Known \d+\/\d+$/);
});

test('Catalogue Fungi do not share one mushroom — each has a unique filled mark', () => {
  const fungi = ITEMS.filter((it) => it.category === 'fungi');
  const glyphs = fungi.map((it) => itemTileGlyph(it));
  assert.equal(new Set(glyphs).size, fungi.length, 'no two fungi share a glyph');
  assert.equal(itemTileGlyph(ITEMS_BY_ID.palecap), 'mushroom');
  assert.equal(itemTileGlyph(ITEMS_BY_ID['ghost-morel']), 'morel');
  assert.equal(itemTileGlyph(ITEMS_BY_ID.inkcap), 'inkcap');
  assert.equal(itemTileGlyph(ITEMS_BY_ID['bell-puff']), 'puffball');
  assert.equal(itemTileGlyph(ITEMS_BY_ID['widow-ear']), 'earfungus');
  assert.equal(itemTileGlyph(ITEMS_BY_ID['glow-spore']), 'sporecloud');
  assert.notEqual(FILLED_ICONS.mushroom, FILLED_ICONS.morel);
  assert.notEqual(FILLED_ICONS.inkcap, FILLED_ICONS.puffball);
  assert.notEqual(FILLED_ICONS.earfungus, FILLED_ICONS.sporecloud);
  assert.notEqual(FILLED_ICONS.bracket, FILLED_ICONS.lichen);
  const herbs = ITEMS.filter((it) => it.category === 'herb');
  assert.equal(new Set(herbs.map((it) => itemTileGlyph(it))).size, herbs.length, 'herbs stay unique');

  const s = createState({ rngSeed: 1 });
  for (const it of fungi) s.bank[it.id] = 1;
  const scr = tabs.renderBankScreen(makeCtx(s));
  const pale = tileByName(scr.node, 'Pale-cap');
  const morel = tileByName(scr.node, 'Ghost-morel');
  const ink = tileByName(scr.node, 'Inkcap');
  assert.ok(pale && morel && ink);
  const paleSvg = pale.querySelector('.bank-glyph').innerHTML ?? '';
  const morelSvg = morel.querySelector('.bank-glyph').innerHTML ?? '';
  const inkSvg = ink.querySelector('.bank-glyph').innerHTML ?? '';
  assert.notEqual(paleSvg, morelSvg);
  assert.notEqual(morelSvg, inkSvg);
  assert.notEqual(paleSvg, inkSvg);
  assert.match(paleSvg, /fill="currentColor"/);
  assert.match(morelSvg, /width="32"/);
});

test('All-but-1 sells owned minus one; Dump still clears the unique-stack hollow', () => {
  assert.equal(sellQtyForMode('keep1', 8), 7);
  assert.equal(sellQtyForMode('keep1', 1), 0);
  assert.equal(sellQtyForMode('dump', 8), 8);
  const s = createState({ rngSeed: 6 });
  const beforeKinds = uniqueStackCount(s.bank);
  let scr;
  const ctx = makeCtx(s, {
    sell(id, qty) {
      const res = sellItems(s, id, qty);
      scr.update();
      return res;
    },
  });
  scr = tabs.renderBankScreen(ctx);
  scr.node.querySelector('.bank-sell-toggle').click();
  const keep = scr.node.querySelectorAll('.bank-sell-qty-btn')
    .find((b) => /All-but-1/.test(b.textContent ?? ''));
  const dump = scr.node.querySelectorAll('.bank-sell-qty-btn')
    .find((b) => /Dump/.test(b.textContent ?? ''));
  assert.ok(keep && dump, 'All-but-1 sits beside Dump');
  keep.click();
  const tinder = tileByName(scr.node, 'Tinderscrap');
  tinder.click();
  tinder.click();
  assert.equal(bankCount(s.bank, 'tinderscrap'), 1, 'All-but-1 keeps a single stack');
  dump.click();
  tileByName(scr.node, 'Wick-knife').click();
  assert.equal(s.bank['wick-knife'], undefined);
  assert.equal(uniqueStackCount(s.bank), beforeKinds - 1);
  assert.equal(formatHollowChip(s), `Hollow ${beforeKinds - 1}/${lanternRoom(s)}`);
});

test('item lock survives a feat remount and refuses sell; hollowlight.ui mirrors it', () => {
  const s = createState({ rngSeed: 8 });
  const ui = { sellMode: false, sellQtyMode: '1', bankLocks: [] };
  let scr;
  const ctx = {
    get state() { return s; },
    toast() {},
    openSellSheet() {},
    get sellMode() { return ui.sellMode; },
    setSellMode(v) { ui.sellMode = !!v; },
    get sellQtyMode() { return ui.sellQtyMode; },
    setSellQtyMode(v) { ui.sellQtyMode = v; },
    toggleLock(id) {
      toggleLock(s, id);
      ui.bankLocks = [...(s.bankLocks ?? [])];
    },
    sell(id, qty) {
      const res = sellItems(s, id, qty);
      cascadeAchievements(s);
      scr = tabs.renderBankScreen(ctx);
      return res;
    },
  };
  scr = tabs.renderBankScreen(ctx);
  ctx.toggleLock('tinderscrap');
  assert.equal(isLocked(s, 'tinderscrap'), true);
  scr.update();
  const lockedTile = tileByName(scr.node, 'Tinderscrap');
  assert.ok(lockedTile.classList.contains('locked'));
  scr.node.querySelector('.bank-sell-toggle').click();
  const before = bankCount(s.bank, 'tinderscrap');
  tileByName(scr.node, 'Tinderscrap').click();
  assert.equal(bankCount(s.bank, 'tinderscrap'), before, 'locked stack is not sold');
  const blocked = sellItems(s, 'tinderscrap', 1);
  assert.equal(blocked.ok, false);
  assert.match(blocked.error ?? '', /locked/i);

  scr = tabs.renderBankScreen(ctx);
  assert.ok(tileByName(scr.node, 'Tinderscrap').classList.contains('locked'), 'lock survives remount');
  assert.deepEqual(ui.bankLocks, ['tinderscrap']);
});

test('dense owned tile keeps catalog chrome and paints a stall pip when they diverge', () => {
  const s = createState({ rngSeed: 1 });
  assert.equal(itemTileStallPip(ITEMS_BY_ID.fogwort, 3), '');
  assert.equal(itemTileStallPip(ITEMS_BY_ID.fogwort, 2), 'stall ✦2');
  addSellPressure(s, 'fogwort', 20);
  const live = liveSellUnit(s, 'fogwort');
  assert.ok(live < ITEMS_BY_ID.fogwort.sell, 'pressure drops fogwort below catalog');
  const scr = tabs.renderBankScreen(makeCtx(s));
  const fog = tileByName(scr.node, 'Fogwort');
  assert.equal(fog.querySelector('.bank-chrome').textContent, itemTileChrome(ITEMS_BY_ID.fogwort, 4));
  const pip = fog.querySelector('.bank-stall-pip').textContent ?? '';
  assert.equal(pip, `stall ✦${live}`);
  assert.ok(fog.classList.contains('stall-divergent'));
  const tinder = tileByName(scr.node, 'Tinderscrap');
  assert.equal(tinder.querySelector('.bank-stall-pip').classList.contains('visually-hidden'), true);
});

test('inspector stack stats pull times found / sold / lumen taken without a version bump', () => {
  const s = createState({ rngSeed: 1 });
  assert.equal(itemTimesFound(s, 'rushwick'), STARTER_BANK.rushwick);
  assert.equal(
    inspectorStackStatsLine(s, 'rushwick'),
    `times found ${STARTER_BANK.rushwick} · sold 0 · lumen taken ✦0`,
  );
  assert.equal(inspectorStackStatsLine(s, 'palecap'), 'times found 0 · sold 0 · lumen taken ✦0');
  tryBankAdd(s, 'palecap', 3);
  assert.equal(inspectorStackStatsLine(s, 'palecap'), 'times found 3 · sold 0 · lumen taken ✦0');
  const sold = sellItems(s, 'palecap', 2);
  assert.equal(sold.ok, true);
  assert.equal(
    inspectorStackStatsLine(s, 'palecap'),
    `times found 3 · sold 2 · lumen taken ✦${sold.gained}`,
  );
  const prev = globalThis.window;
  globalThis.window = { matchMedia: (q) => ({ matches: /min-width:\s*900px/.test(q) }) };
  const scr = tabs.renderBankScreen(makeCtx(s, { sell: (id, qty) => sellItems(s, id, qty) }));
  tileByName(scr.node, 'Pale-cap').click();
  const dock = scr.node.querySelector('.bank-inspector').textContent ?? '';
  assert.match(dock, /times found 3/);
  assert.match(dock, /sold 2/);
  assert.match(dock, /lumen taken ✦/);
  assert.match(dock, /catalog ✦4 · stall today ✦/);
  tileByName(scr.node, 'Rushwick').click();
  const rushDock = scr.node.querySelector('.bank-inspector').textContent ?? '';
  assert.match(rushDock, new RegExp(`times found ${STARTER_BANK.rushwick}`));
  globalThis.window = prev;
});

test('grid sell with a feat unlock is one toast, not sell + feat competing', () => {
  const s = createState({ rngSeed: 3 });
  const toasts = [];
  let scr;
  const ctx = makeCtx(s, {
    openSellSheet() {},
    toast: (m) => toasts.push(m),
    sell(id, qty) {
      const res = sellItems(s, id, qty);
      res.feats = cascadeAchievements(s);
      scr.update();
      return res;
    },
  });
  scr = tabs.renderBankScreen(ctx);
  scr.node.querySelector('.bank-sell-toggle').click();
  tileByName(scr.node, 'Tinderscrap').click();
  assert.equal(toasts.length, 1, 'one mutation, one toast');
  assert.match(toasts[0], /Sold Tinderscrap ×1 for ✦1/);
  assert.match(toasts[0], /Feat: A Fair Trade/);
  assert.equal(toasts.filter((m) => /^Sold /.test(m)).length, 1, 'do not double the same sell');
});

test('dump a unique starter stack decrements Hollow occupancy, not known', () => {
  const s = createState({ rngSeed: 1 });
  const loafId = 'lantern-loaf';
  const priorFound = itemTimesFound(s, loafId);
  const beforeKnown = knownItemCount(s);
  const beforeOcc = uniqueStackCount(s.bank);
  assert.equal(priorFound, STARTER_BANK[loafId]);
  assert.equal(beforeKnown, Object.keys(STARTER_BANK).length);
  assert.equal(beforeOcc, Object.keys(STARTER_BANK).length);
  assert.equal(logCategoryStats(s).find((r) => r.id === 'items').done, beforeKnown);

  const dumped = sellItems(s, loafId, priorFound);
  assert.equal(dumped.ok, true);
  assert.equal(s.bank[loafId], undefined);
  assert.equal(itemTimesFound(s, loafId), priorFound, 'Times Found is not un-counted');
  assert.equal(uniqueStackCount(s.bank), beforeOcc - 1);
  assert.equal(formatHollowChip(s), `Hollow ${beforeOcc - 1}/${lanternRoom(s)}`);
  assert.equal(formatHollowChip(s), 'Hollow 5/12');
  assert.equal(formatKnownChip(s), `Known ${beforeKnown}/${ITEMS.length}`);
  assert.equal(formatKnownChip(s), 'Known 6/137');
  assert.equal(knownItemCount(s), beforeKnown);
  assert.equal(logCategoryStats(s).find((r) => r.id === 'items').done, beforeKnown,
    'Almanac items found stays known after a dump');

  const hudKnown = new FakeNode('span');
  const hudHollow = new FakeNode('span');
  paintHud(new FakeNode('span'), new FakeNode('span'), s, new FakeNode('span'), { hudKnown, hudHollow });
  assert.equal(hudKnown.textContent, 'Known 6/137');
  assert.equal(hudHollow.textContent, 'Hollow 5/12');
  assert.equal(hudKnown.getAttribute('aria-label'), 'Known 6/137');
  assert.equal(hudHollow.getAttribute('aria-label'), 'Hollow 5/12');

  const opened = [];
  const toasts = [];
  const scr = tabs.renderBankScreen(makeCtx(s, {
    openSellSheet: (id) => opened.push(id),
    toast: (m) => toasts.push(m),
  }));
  const header = scr.node.querySelector('.screen-sub').textContent ?? '';
  assert.match(header, new RegExp(`${beforeKnown} of ${ITEMS.length} known`));
  assert.match(header, new RegExp(`${beforeOcc - 1} / ${lanternRoom(s)}`));
  assert.equal(scr.node.querySelectorAll('.bank-tile').length, beforeOcc - 1,
    'dumped loaf leaves the working pack');
  const labels = scr.node.querySelectorAll('.bank-tab').map((t) => t.textContent);
  assert.ok(labels.includes('Food'), 'dumping the last loaf does not drop the Food tab');
  const food = scr.node.querySelectorAll('.bank-tab').find((t) => t.textContent === 'Food');
  food.click();
  const foodLoaf = tileByName(scr.node, 'Lantern-loaf');
  assert.ok(foodLoaf, 'Food tab keeps the dumped loaf');
  assert.ok(foodLoaf.classList.contains('known-empty'));
  assert.equal(foodLoaf.classList.contains('unowned'), false);
  assert.equal(foodLoaf.querySelector('.bank-qty').textContent, '0');
  assert.equal(foodLoaf.querySelector('.bank-name').textContent, 'Lantern-loaf');

  const cat = scr.node.querySelectorAll('.bank-tab').find((t) => /Catalogue/.test(t.textContent ?? ''));
  cat.click();
  const loaf = tileByName(scr.node, 'Lantern-loaf');
  assert.ok(loaf, 'catalogue still names a dumped known stack');
  assert.equal(loaf.classList.contains('unowned'), false, 'not a never-found ghost');
  assert.ok(loaf.classList.contains('known-empty'));
  assert.equal(loaf.querySelector('.bank-qty').textContent, '0');
  assert.equal(loaf.querySelector('.bank-name').textContent, 'Lantern-loaf');
  assert.doesNotMatch(loaf.querySelector('.bank-qty').textContent ?? '', /—/);
  loaf.click();
  assert.deepEqual(opened, [loafId], 'known-empty inspects; does not toast never-found');
  assert.equal(toasts.some((m) => /not yet found/.test(m)), false);

  const bog = tileByItem(scr.node, 'bogmoss');
  assert.ok(bog, 'never-found fuel still has a catalogue tile');
  assert.ok(bog.classList.contains('unowned'));
  assert.equal(bog.querySelector('.bank-name').textContent, UNKNOWN_ITEM_MARK);
  assert.equal(bog.querySelector('.bank-qty').textContent, UNKNOWN_ITEM_MARK);
  assert.doesNotMatch(bog.textContent ?? '', /Bog-moss/);
  assert.equal(bog.getAttribute('aria-label'), STILL_IN_THE_DARK);
  for (const [id, name] of [['cindercoal', 'Cinder-coal'], ['peatbrick', 'Peat-brick']]) {
    const tile = tileByItem(scr.node, id);
    assert.ok(tile, `${name} occupies a never-found tile`);
    assert.equal(tile.querySelector('.bank-name').textContent, UNKNOWN_ITEM_MARK);
    assert.doesNotMatch(tile.textContent ?? '', new RegExp(name));
  }
  bog.click();
  assert.equal(toasts.at(-1), STILL_IN_THE_DARK);
  assert.equal(toasts.some((m) => /Bog-moss/.test(m)), false);

  const almanac = renderAlmanacScreen({
    state: s,
    toast() {},
    almanacView: () => 'log-items',
    openAlmanac() {},
    ensureDailies() {},
    rerollDailies() {},
    claimDaily() {},
  });
  const found = almanac.node.querySelector('[data-log-drill="items-found"]');
  const missing = almanac.node.querySelector('[data-log-drill="items-missing"]');
  assert.match(found.textContent ?? '', /Lantern-loaf/);
  const loafTile = found.querySelector('[data-log-row="lantern-loaf"]');
  assert.equal(loafTile.querySelector('.log-tile-times')?.textContent, '×8');
  assert.doesNotMatch(loafTile.querySelector('.log-tile-frac')?.textContent ?? '', /^Found$/);
  assert.equal((missing?.textContent ?? '').includes('Lantern-loaf'), false);
  assert.equal((missing?.textContent ?? '').includes('?'), true);
});

test('stall pip paints when catalog ≠ stall on owned and Catalogue tiles', () => {
  const s = createState({ rngSeed: 1 });
  addSellPressure(s, 'lantern-loaf', 20);
  const live = liveSellUnit(s, 'lantern-loaf');
  const catalog = ITEMS_BY_ID['lantern-loaf'].sell;
  assert.ok(live < catalog, 'pressure drops loaf below catalog ✦4');
  const scr = tabs.renderBankScreen(makeCtx(s));
  const loaf = tileByName(scr.node, 'Lantern-loaf');
  const pip = loaf.querySelector('.bank-stall-pip');
  assert.equal(pip.classList.contains('visually-hidden'), false);
  assert.equal(pip.textContent, `stall ✦${live}`);
  assert.ok(loaf.classList.contains('stall-divergent'));

  const cat = scr.node.querySelectorAll('.bank-tab').find((t) => /Catalogue/.test(t.textContent ?? ''));
  cat.click();
  const catLoaf = tileByName(scr.node, 'Lantern-loaf');
  const catPip = catLoaf.querySelector('.bank-stall-pip');
  assert.equal(catPip.classList.contains('visually-hidden'), false,
    'catalogue must not hide a divergent stall pip');
  assert.equal(catPip.textContent, `stall ✦${live}`);
});

test('Food tab stays on the starter row after dump; HUD chips and tab chips wrap instead of clipping', () => {
  const s = createState({ rngSeed: 1 });
  const scr = tabs.renderBankScreen(makeCtx(s));
  const labels = scr.node.querySelectorAll('.bank-tab').map((t) => t.textContent);
  assert.ok(labels.includes('Food'), 'Lantern-loaf keeps Food on the chip row');
  sellItems(s, 'lantern-loaf', s.bank['lantern-loaf']);
  scr.update();
  const after = scr.node.querySelectorAll('.bank-tab').map((t) => t.textContent);
  assert.ok(after.includes('Food'), 'Food tab follows known, not occupancy');
  const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.bank-tabs\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /\.hud-counts\s*\{[^}]*flex-wrap:\s*nowrap/s);
  assert.match(css, /\.pill\.known[\s\S]{0,220}white-space:\s*nowrap/);
  assert.match(css, /\.pill\.hollow[\s\S]{0,220}white-space:\s*nowrap/);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<button[^>]*id="hud-known"/);
  assert.match(html, /<button[^>]*id="hud-hollow"/);
  assert.match(html, /Known 0\/137/);
  assert.match(html, /Hollow 0\/12/);
  assert.match(css, /\.screen\.log-items\s*\{[^}]*gap:\s*4px/s);
  assert.match(css, /\.screen\.log-items \.section-title\s*\{[^}]*margin-top:\s*0/s);
});

test('bankTab all opens Catalogue with named found and mystery unfound tiles, not Camp', () => {
  const s = createState({ rngSeed: 1 });
  const scr = tabs.renderBankScreen(makeCtx(s, { bankTab: 'all' }));
  assert.ok(scr.node.classList.contains('bank-screen'));
  const cat = scr.node.querySelectorAll('.bank-tab').find((t) => /Catalogue/.test(t.textContent ?? ''));
  assert.equal(cat?.getAttribute('aria-selected'), 'true');
  const tiles = scr.node.querySelectorAll('.bank-tile');
  assert.ok(tiles.length >= 100, 'catalogue lists the registry');
  assert.ok(tiles.some((t) => t.classList.contains('unowned')));
  assert.ok(tileByName(scr.node, 'Lantern-loaf'), 'found starter is named');
  const pale = tileByItem(scr.node, 'palecap');
  assert.ok(pale, 'never-found still occupies a tile');
  assert.ok(pale.classList.contains('unowned'));
  assert.equal(pale.querySelector('.bank-name')?.textContent, UNKNOWN_ITEM_MARK);
  assert.equal(pale.querySelector('.bank-qty')?.textContent, UNKNOWN_ITEM_MARK);
  assert.equal(pale.getAttribute('aria-label'), STILL_IN_THE_DARK);
  assert.equal(pale.getAttribute('title'), STILL_IN_THE_DARK);
  assert.doesNotMatch(pale.textContent ?? '', /Pale-cap/);
  assert.equal(tileByName(scr.node, 'Pale-cap'), undefined, 'never-found must not spoil its name');
  assert.equal(scr.node.querySelector('.camp'), null);
});

test('bankTab owned is the working pack (Hollow door)', () => {
  const s = createState({ rngSeed: 1 });
  const scr = tabs.renderBankScreen(makeCtx(s, { bankTab: 'owned' }));
  const owned = scr.node.querySelectorAll('.bank-tab').find((t) => t.textContent === 'Owned');
  assert.equal(owned?.getAttribute('aria-selected'), 'true');
  const tiles = scr.node.querySelectorAll('.bank-tile');
  assert.ok(tiles.length > 0);
  assert.ok(tiles.every((t) => t.classList.contains('owned')));
  assert.equal(scr.node.querySelectorAll('.bank-tile.unowned').length, 0);
});



