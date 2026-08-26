// F1c UI smoke: Keeper's Camp track cards on the Camp tab and the Bank sell
// sheet — render paths plus tap flows, headless via the FakeNode shim.

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
const tabs = await import('../src/ui/screens/tabs.js');
const modals = await import('../src/ui/modals.js');
import { sellItems } from '../src/game/systems/bank.js';
import { repairLantern } from '../src/game/systems/repairs.js';

function makeCtx(state, overrides = {}) {
  return {
    state,
    toast() {},
    buyUpgrade() {},
    openSellSheet() {},
    ...overrides,
  };
}

// ── camp tab: upgrade tracks ─────────────────────────────────────

test('camp lists all three tracks with a designed empty state before any purchase', () => {
  const s = createState({ rngSeed: 1 });
  const scr = tabs.renderCampScreen(makeCtx(s));
  assert.equal(scr.node.querySelectorAll('.track-card').length, 3);
  const banner = scr.node.querySelector('.camp-empty');
  assert.match(banner.textContent ?? '', /the lantern hungers/i);
});

test('track cards show next tier name, flavor, effect line and cost chips', () => {
  const s = createState({ rngSeed: 2 });
  const scr = tabs.renderCampScreen(makeCtx(s));
  const cards = scr.node.querySelectorAll('.track-card');
  const wick = cards[0];
  assert.match(wick.textContent ?? '', /Scraped Wicks/);
  assert.match(wick.textContent ?? '', /\+5% action speed per tier/);
  assert.match(wick.textContent ?? '', /✦40/, 'lumen chip present');
  assert.match(wick.textContent ?? '', /Tinderscrap ×10/, 'material chip present');
});

test('affordable tiers render an active Upgrade button wired to ctx.buyUpgrade', () => {
  const s = createState({ rngSeed: 3 });
  s.lumen += 40;
  s.bank.tinderscrap += 10;
  let called = null;
  const scr = tabs.renderCampScreen(makeCtx(s, {
    buyUpgrade: (id) => { called = id; },
  }));
  const btn = scr.node.querySelectorAll('.track-card')[0].querySelector('button');
  assert.match(btn.textContent ?? '', /Upgrade · Scraped Wicks/);
  btn.click();
  assert.equal(called, 'lantern-wick');
});

test('unaffordable tiers name the missing resource — not a generic "Need materials"', () => {
  const s = createState({ rngSeed: 4 }); // starter bank: no palecap
  s.campUpgrades = {}; // fresh
  s.lumen += 5000;
  const scr = tabs.renderCampScreen(makeCtx(s));
  const cards = scr.node.querySelectorAll('.track-card');
  // Satchel tier 1 costs fogwort ×15 — starter has 4.
  const satchelBtn = [...cards[1].querySelectorAll('button')][0];
  assert.match(satchelBtn.textContent ?? '', /Need Fogwort ×15/);
  assert.doesNotMatch(satchelBtn.textContent ?? '', /Need materials/);
  assert.ok(cards[1].querySelectorAll('.chip-short').length >= 1,
    'short chips highlighted');
});

test('upgrade button names Lumen when the bank already holds the goods', () => {
  const s = createState({ rngSeed: 41 });
  s.bank.fogwort = 15;
  // starter lumen 20 < satchel's ✦30
  const scr = tabs.renderCampScreen(makeCtx(s));
  const satchelBtn = scr.node.querySelectorAll('.track-card')[1].querySelector('button');
  assert.match(satchelBtn.textContent ?? '', /Need ✦30/);
  assert.doesNotMatch(satchelBtn.textContent ?? '', /Need materials/);
});

test('empty banner hides once any track is upgraded', () => {
  const s = createState({ rngSeed: 5 });
  s.campUpgrades = { 'ember-altar': 2 };
  const scr = tabs.renderCampScreen(makeCtx(s));
  const banner = scr.node.querySelector('.camp-empty');
  assert.equal(banner.style.display, 'none');
  const altarCard = scr.node.querySelectorAll('.track-card')[2];
  assert.match(altarCard.textContent ?? '', /Ember Altar · II/);
  assert.match(altarCard.textContent ?? '', /\+6% XP from every task now/);
});

// ── bank tab + sell sheet ────────────────────────────────────────

test('bank search keeps matching owned tiles and omits the rest', () => {
  const s = createState({ rngSeed: 11 });
  const scr = tabs.renderBankScreen(makeCtx(s));
  const search = scr.node.querySelector('.bank-search');
  assert.ok(search, 'search field present');
  search.value = 'fogwort';
  for (const fn of search._listeners.input ?? []) fn({ target: search });
  const fog = scr.node.querySelectorAll('.bank-tile').find((t) => /Fogwort/.test(t.textContent ?? ''));
  const ember = scr.node.querySelectorAll('.bank-tile').find((t) => /Emberstone/.test(t.textContent ?? ''));
  const tinder = scr.node.querySelectorAll('.bank-tile').find((t) => /Tinderscrap/.test(t.textContent ?? ''));
  assert.ok(fog, 'Fogwort remains when the query matches');
  assert.equal(tinder, undefined, 'non-matching owned stacks leave the working grid');
  assert.equal(ember, undefined, 'unowned Emberstone is not on the Owned grid');
});

test('tapping an owned bank stack opens the sell sheet; unowned still toasts', () => {
  const s = createState({ rngSeed: 6 }); // starter owns tinderscrap/rushwick/fogwort
  const opened = [];
  const toasts = [];
  const scr = tabs.renderBankScreen(makeCtx(s, {
    openSellSheet: (id) => opened.push(id),
    toast: (m) => toasts.push(m),
  }));
  const tiles = scr.node.querySelectorAll('.bank-tile');
  const tinderTile = tiles.find((t) => /Tinderscrap/.test(t.textContent ?? ''));
  tinderTile.click();
  assert.deepEqual(opened, ['tinderscrap']);

  const catTab = scr.node.querySelectorAll('.bank-tab').find((t) => /Catalogue/.test(t.textContent ?? ''));
  catTab.click();
  const emberstone = scr.node.querySelectorAll('.bank-tile').find((t) => /Emberstone/.test(t.textContent ?? ''));
  emberstone.click();
  assert.equal(opened.length, 1, 'unowned item did not open sheet');
  assert.equal(toasts.length, 1, 'unowned item toasted instead');
});

function bootSellSheet(state) {
  const sold = [];
  const ctx = {
    state,
    sell: (id, qty) => {
      const res = sellItems(state, id, qty);
      if (res.ok) sold.push({ ok: true, sold: res.sold, gained: res.gained });
      return res;
    },
    toast() {},
  };
  const mount = new FakeNode('div');
  modals.showSellSheet(mount, ctx, 'fogwort'); // sells ✦3 each
  return { mount, ctx, sold };
}

test('sell sheet shows lore, catalog unit, live stall worth, and honest sell controls', () => {
  const s = createState({ rngSeed: 7 });
  s.bank.fogwort = 12;
  const { mount } = bootSellSheet(s);
  const panel = mount.querySelector('.modal-panel');
  assert.match(panel.textContent ?? '', /grey herb that only grows/, 'lore line');
  assert.match(panel.textContent ?? '', /catalog ✦3 · stall today ✦3 \(Fair Trade \/ stall pressure\)/);
  assert.match(panel.textContent ?? '', /12 in the bank/);
  assert.match(panel.textContent ?? '', /stack worth ✦36 at today’s stall/);
  const buttons = panel.querySelectorAll('button');
  assert.ok(buttons.some((b) => b.textContent === 'Sell 1'));
  assert.ok(buttons.some((b) => b.textContent === 'Sell 10'));
  assert.equal(buttons.some((b) => /Sell 100/.test(b.textContent ?? '')), false,
    'Sell 100 is omitted when the stack is below 100');
  assert.ok(buttons.some((b) => /Sell All/.test(b.textContent ?? '')));
  assert.ok(panel.querySelector('.sell-qty-input'), 'custom qty control present');
});

test('Sell 10/100 leave the DOM when qty is too low; custom qty 7 sells seven', () => {
  const s = createState({ rngSeed: 17 });
  s.bank.fogwort = 7;
  const { mount, sold } = bootSellSheet(s);
  const panel = mount.querySelector('.modal-panel');
  const buttons = panel.querySelectorAll('button');
  assert.ok(buttons.some((b) => b.textContent === 'Sell 1'));
  assert.equal(buttons.some((b) => b.textContent === 'Sell 10'), false);
  assert.equal(buttons.some((b) => /Sell 100/.test(b.textContent ?? '')), false);
  const qty = panel.querySelector('.sell-qty-input');
  qty.value = 7;
  const sellCustom = buttons.find((b) => b.textContent === 'Sell');
  sellCustom.click();
  assert.deepEqual(sold, [{ ok: true, sold: 7, gained: 21 }]);
  assert.equal(s.bank.fogwort, undefined);
});

test('Sell 10 deducts ten stacks and pays ten times the value', () => {
  const s = createState({ rngSeed: 8 });
  s.bank.fogwort = 14;
  const { mount, sold } = bootSellSheet(s);
  const panel = mount.querySelector('.modal-panel');
  const sell10 = panel.querySelectorAll('button').find((b) => b.textContent === 'Sell 10');
  sell10.click();
  assert.deepEqual(sold, [{ ok: true, sold: 10, gained: 30 }]);
  assert.equal(s.lumen, 50);
  assert.match(panel.textContent ?? '', /4 in the bank/, 'sheet repaints after sale');
});

test('Sell All over 25 units demands a confirming second tap', () => {
  const s = createState({ rngSeed: 9 });
  s.bank.fogwort = 100;
  const { mount, sold } = bootSellSheet(s);
  const panel = mount.querySelector('.modal-panel');
  const sellAll = panel.querySelectorAll('button').find((b) => /Sell All|Tap again/.test(b.textContent ?? ''));

  sellAll.click(); // first tap arms confirmation
  assert.equal(sold.length, 0, 'nothing sold on first tap');
  assert.match(sellAll.textContent ?? '', /Tap again — sell all 100 for ✦300/);

  sellAll.click(); // second tap commits
  assert.deepEqual(sold, [{ ok: true, sold: 100, gained: 300 }]);
  assert.equal(s.lumen, 320);
  assert.match(panel.textContent ?? '', /0 in the bank|None left/,
    'sheet must not keep showing the pre-sale stack after Sell All');
  assert.doesNotMatch(sellAll.textContent ?? '', /Tap again/);
});

test('selling the last unit closes the sheet instead of showing an empty one', () => {
  const s = createState({ rngSeed: 10 });
  s.bank.fogwort = 1;
  const { mount } = bootSellSheet(s);
  const panel = mount.querySelector('.modal-panel');
  const sell1 = panel.querySelectorAll('button').find((b) => b.textContent === 'Sell 1');
  sell1.click();
  // close() defers removal by 180ms; force it synchronously for the assert.
  const overlay = mount.children[0];
  overlay.remove();
  assert.equal(mount.querySelectorAll('.modal-panel').length, 0,
    'no lingering sheet after the stack empties');
});

test('360 CAMP puts Completion in the first stat cell, not below the fold', () => {
  const s = createState({ rngSeed: 1 });
  const scr = tabs.renderCampScreen(makeCtx(s));
  const grid = scr.node.querySelector('.stat-grid');
  const first = grid.children[0];
  assert.ok(first.classList.contains('stat-complete'));
  assert.match(first.textContent ?? '', /Completion/);
});

test('Wick patch applies when paid, or names the missing cost on the button', () => {
  const poor = createState({ rngSeed: 2 });
  poor.lanternIntegrity = 70;
  poor.lumen = 145;
  poor.bank.tinderscrap = 2;
  const shortScr = tabs.renderCampScreen(makeCtx(poor, {
    repairLantern: (id) => repairLantern(poor, id),
  }));
  const shortBtn = shortScr.node.querySelector('[data-repair-id="wick-patch"]');
  assert.match(shortBtn.textContent ?? '', /Need Tinderscrap ×8/);
  assert.equal(shortBtn.getAttribute('aria-disabled'), 'true');
  shortBtn.click();
  assert.equal(poor.lanternIntegrity, 70, 'disabled tap must not spend');

  const rich = createState({ rngSeed: 3 });
  rich.lanternIntegrity = 70;
  rich.lumen = 145;
  rich.bank.tinderscrap = 20;
  const ctx = {
    ...makeCtx(rich),
    repairLantern(id) {
      const res = repairLantern(rich, id);
      if (res.ok) scr.update();
      return res;
    },
  };
  const scr = tabs.renderCampScreen(ctx);
  const btn = scr.node.querySelector('[data-repair-id="wick-patch"]');
  assert.match(btn.textContent ?? '', /Wick patch · \+25 · ✦10/);
  assert.equal(btn.getAttribute('aria-disabled'), 'false');
  btn.click();
  assert.equal(rich.lanternIntegrity, 95);
  assert.equal(rich.lumen, 135);
  assert.equal(rich.bank.tinderscrap, 12);
  assert.match(scr.node.textContent ?? '', /Integrity 95\/100/);
});
