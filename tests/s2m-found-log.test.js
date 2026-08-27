// S2m: Almanac Items is a Times Found grid above the 360 fold.
// Known still opens this room; Found tiles show ×N; two ? rows sit above --tab-h.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FakeNode, FakeText } from './helpers/fake-node.mjs';

globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => new FakeText(s),
  addEventListener() {},
  removeEventListener() {},
};
globalThis.requestAnimationFrame = (fn) => 0;
try { globalThis.navigator = {}; } catch { /* node ≥21 read-only */ }

import { createState, STARTER_BANK } from '../src/game/state.js';
const { renderAlmanacScreen, LOG_ITEMS_360, logItemsMissingRowsVsTab, formatLogTimesFound } =
  await import('../src/ui/screens/meta.js');
const { itemsLogDetails } = await import('../src/game/systems/completion.js');
const { sellItems } = await import('../src/game/systems/bank.js');
const { itemTimesFound } = await import('../src/game/systems/stats.js');
const { formatKnownChip, formatHollowChip } = await import('../src/ui/hud.js');
const { renderBankScreen } = await import('../src/ui/screens/bank.js');
const { UNKNOWN_ITEM_MARK, STILL_IN_THE_DARK } = await import('../src/ui/screens/bank.js');
const { SAVE_VERSION } = await import('../src/core/save.js');

function almanacCtx(state, view = 'log-items') {
  return {
    state,
    toast() {},
    almanacView: () => view,
    openAlmanac() {},
    ensureDailies() {},
    rerollDailies() {},
    claimDaily() {},
  };
}

function bankCtx(state) {
  return {
    state,
    toast() {},
    bankTab: 'all',
    openSellSheet() {},
    sell: () => ({ ok: false }),
  };
}

test('itemsLogDetails carries Times Found on every found row', () => {
  const state = createState({ rngSeed: 1 });
  const { found, missing } = itemsLogDetails(state);
  assert.equal(found.length, Object.keys(STARTER_BANK).length);
  const loaf = found.find((r) => r.id === 'lantern-loaf');
  assert.ok(loaf);
  assert.equal(loaf.timesFound, STARTER_BANK['lantern-loaf']);
  assert.equal(loaf.timesFound, 8);
  const fog = found.find((r) => r.id === 'fogwort');
  assert.equal(fog.timesFound, STARTER_BANK.fogwort);
  assert.equal(missing.some((r) => r.id === 'lantern-loaf'), false);
  assert.ok(missing.every((r) => r.mystery && (r.timesFound ?? 0) === 0));
});

test('Almanac Items found tiles paint ×N Times Found, not a binary Found sticker', () => {
  const state = createState({ rngSeed: 1 });
  const scr = renderAlmanacScreen(almanacCtx(state));
  assert.ok(scr.node.classList.contains('log-items'));
  assert.equal(scr.node.querySelector('.screen-title')?.textContent, 'Items');
  assert.ok(scr.node.querySelector('.log-items-head'), 'Items chrome is a compact head row');
  assert.ok(scr.node.querySelector('.log-back'), 'way back to the completion log');

  const found = scr.node.querySelector('[data-log-drill="items-found"]');
  const missing = scr.node.querySelector('[data-log-drill="items-missing"]');
  assert.ok(found && missing);

  const loaf = found.querySelector('[data-log-row="lantern-loaf"]');
  assert.ok(loaf, 'starter loaf is on the Found grid');
  assert.match(loaf.textContent ?? '', /Lantern-loaf/);
  assert.equal(loaf.querySelector('.log-tile-times')?.textContent, formatLogTimesFound(8));
  assert.equal(loaf.querySelector('.log-tile-times')?.textContent, '×8');
  assert.equal(loaf.getAttribute('data-times-found'), '8');
  assert.doesNotMatch(loaf.querySelector('.log-tile-frac')?.textContent ?? '', /^Found$/);

  const fog = found.querySelector('[data-log-row="fogwort"]');
  assert.equal(fog.querySelector('.log-tile-times')?.textContent, '×4');

  const knife = found.querySelector('[data-log-row="wick-knife"]');
  assert.equal(knife.querySelector('.log-tile-times')?.textContent, '×1');

  assert.match(missing.textContent ?? '', /\?/);
  assert.equal((missing.textContent ?? '').includes('Bog-moss'), false);
  const bog = missing.querySelector('[data-log-row="bogmoss"]');
  assert.ok(bog);
  assert.equal(bog.querySelector('.log-tile-name')?.textContent, '?');
  assert.equal(bog.querySelector('.log-tile-frac')?.textContent, '?');
});

test('dump lantern-loaf keeps Known 6/137 and Almanac ×8; Catalogue unfound stays ?', () => {
  const state = createState({ rngSeed: 1 });
  const prior = itemTimesFound(state, 'lantern-loaf');
  assert.equal(prior, 8);
  const dumped = sellItems(state, 'lantern-loaf', prior);
  assert.equal(dumped.ok, true);
  assert.equal(state.bank['lantern-loaf'], undefined);
  assert.equal(itemTimesFound(state, 'lantern-loaf'), 8);
  assert.equal(formatKnownChip(state), 'Known 6/137');
  assert.equal(formatHollowChip(state), 'Hollow 5/12');
  assert.equal(SAVE_VERSION, 5);

  const items = renderAlmanacScreen(almanacCtx(state));
  const foundGrid = items.node.querySelector('[data-log-drill="items-found"]');
  const loaf = foundGrid.querySelector('[data-log-row="lantern-loaf"]');
  assert.ok(loaf, 'dumped loaf stays on the found-log');
  assert.equal(loaf.querySelector('.log-tile-times')?.textContent, '×8');
  assert.match(loaf.textContent ?? '', /Lantern-loaf/);
  const missing = items.node.querySelector('[data-log-drill="items-missing"]');
  assert.equal((missing?.textContent ?? '').includes('Lantern-loaf'), false);

  const cat = renderBankScreen(bankCtx(state));
  const bogTile = cat.node.querySelector('[data-item="bogmoss"]');
  assert.ok(bogTile, 'never-found Catalogue tile exists');
  assert.ok(bogTile.classList.contains('unowned'));
  assert.equal(bogTile.querySelector('.bank-name')?.textContent, UNKNOWN_ITEM_MARK);
  assert.equal(UNKNOWN_ITEM_MARK, '?');
  assert.doesNotMatch(bogTile.textContent ?? '', /Bog-moss/);
  assert.equal(bogTile.getAttribute('aria-label'), STILL_IN_THE_DARK);
});

test('360 Known-door geometry: two Still-in-the-dark rows sit above tab 577', () => {
  assert.equal(LOG_ITEMS_360.viewportH, 640);
  assert.equal(LOG_ITEMS_360.tabbarH, 63);
  const fold = logItemsMissingRowsVsTab({ foundCount: 6, rows: 2 });
  assert.equal(fold.tabTop, 577);
  assert.equal(fold.rows.length, 2);
  assert.ok(fold.row2Bottom < fold.tabTop,
    `second ? row bottom ${fold.row2Bottom} vs tab ${fold.tabTop}`);
  assert.ok(fold.fits, `row1 ${fold.rows[0].bottom} row2 ${fold.row2Bottom} vs tab 577`);
  for (const row of fold.rows) {
    assert.ok(row.bottom < 577, `? row ${row.index} bottom ${row.bottom} vs tab 577`);
  }

  const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.screen\.log-items\s*\{[^}]*gap:\s*4px/s);
  assert.match(css, /\.screen\.log-items \.log-items-head\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.screen\.log-items \[data-log-drill="items-found"\]\s*\{[^}]*grid-template-columns:\s*repeat\(6,/s);
  assert.match(css, /\.screen\.log-items \.section-title\s*\{[^}]*font-size:\s*12px/s);
  assert.match(css, /\.screen\.log-items \[data-log-drill="items-missing"\] \.log-tile\s*\{[^}]*min-height:\s*44px/s);
  assert.doesNotMatch(css, /\.screen\.log-items \[data-log-drill="items-found"\]\s*\{[^}]*repeat\(3,/s);
});
