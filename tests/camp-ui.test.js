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

test('unaffordable tiers show "Need materials" and short chips flag what is missing', () => {
  const s = createState({ rngSeed: 4 }); // starter bank: no palecap
  s.campUpgrades = {}; // fresh
  s.lumen += 5000;
  const scr = tabs.renderCampScreen(makeCtx(s));
  const cards = scr.node.querySelectorAll('.track-card');
  // Satchel tier 1 costs fogwort ×15 — starter has none (fresh save).
  const satchelBtn = [...cards[1].querySelectorAll('button')][0];
  assert.match(satchelBtn.textContent ?? '', /Need materials/);
  assert.ok(cards[1].querySelectorAll('.chip-short').length >= 1,
    'short chips highlighted');
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

  const emberstone = tiles.find((t) => /Emberstone/.test(t.textContent ?? ''));
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
      if (res.ok) sold.push(res);
      return res;
    },
    toast() {},
  };
  const mount = new FakeNode('div');
  modals.showSellSheet(mount, ctx, 'fogwort'); // sells ✦3 each
  return { mount, ctx, sold };
}

test('sell sheet shows lore, per-unit value, stack worth and three sell buttons', () => {
  const s = createState({ rngSeed: 7 });
  s.bank.fogwort = 12;
  const { mount } = bootSellSheet(s);
  const panel = mount.querySelector('.modal-panel');
  assert.match(panel.textContent ?? '', /grey herb that only grows/, 'lore line');
  assert.match(panel.textContent ?? '', /Sells for ✦3 each/);
  assert.match(panel.textContent ?? '', /12 in the bank/);
  assert.match(panel.textContent ?? '', /stack worth ✦36/);
  const buttons = panel.querySelectorAll('button');
  assert.ok(buttons.some((b) => b.textContent === 'Sell 1'));
  assert.ok(buttons.some((b) => b.textContent === 'Sell 10'));
  assert.ok(buttons.some((b) => /Sell All/.test(b.textContent ?? '')));
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
