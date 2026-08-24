// F1d Fix 2 regression — Sell All two-tap confirm survives re-renders.
//
// The armed confirm is component state keyed by item id (with a deadline),
// never DOM-only. These tests simulate the failure mode the critic hit:
// a live render tick between the two taps must not swallow the confirm.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeNode } from './helpers/fake-node.mjs';
import { formatNumber } from '../src/core/format.js';

// Minimal DOM globals for dom.js / modals.js.
globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => ({ nodeType: 3, textContent: String(s) }),
  getElementById: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
};
if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = (cb) => 1;
if (!globalThis.navigator) globalThis.navigator = {};

const { showSellSheet, sellConfirmPending, clearSellConfirm } =
  await import('../src/ui/modals.js');
const { sellItems, needsSellConfirm } = await import('../src/game/systems/bank.js');
const { ITEMS } = await import('../src/game/data/items.js');

// A real item id so ITEMS_BY_ID lookups work.
const ITEM = [...ITEMS].sort((a, b) => b.sell - a.sell)[0];
const SELL = ITEM.sell;

function makeCtx(qty) {
  const state = { bank: { [ITEM.id]: qty }, lumen: 0 };
  const sells = [];
  return {
    state,
    sells,
    sell(itemId, n) {
      const res = sellItems(state, itemId, n);
      if (res.ok) sells.push({ itemId, qty: n });
      return res;
    },
    toast() {},
  };
}

function openSheet(mount, ctx, opts) {
  return showSellSheet(mount, ctx, ITEM.id, opts);
}

function confirmBtn(mount) {
  const btns = mount.querySelectorAll('button');
  // The confirm is the last .btn-wide button in the sheet body.
  return btns.find((b) => (b.className ?? '').includes('btn-wide'));
}

test('needsSellConfirm policy: above 25 needs a tap, at/below sells outright', () => {
  assert.equal(needsSellConfirm(26), true);
  assert.equal(needsSellConfirm(25), false);
});

test('first tap arms the confirm and shows the total; nothing sells yet', () => {
  clearSellConfirm(ITEM.id);
  const ctx = makeCtx(40);
  const mount = new FakeNode('div');
  openSheet(mount, ctx);

  const btn = confirmBtn(mount);
  assert.match(btn.textContent, /Sell All/);
  btn.click();

  assert.match(
    btn.textContent,
    new RegExp(`Tap again — sell all 40 for ✦${formatNumber(40 * SELL)}`));
  assert.equal(ctx.sells.length, 0, 'no sale on the first tap');
  assert.equal(sellConfirmPending(ITEM.id), true, 'confirm state lives in component store');
});

test('render ticks between taps preserve the confirm; second tap completes', async () => {
  clearSellConfirm(ITEM.id);
  const ctx = makeCtx(62);
  const mount = new FakeNode('div');
  const ref = openSheet(mount, ctx);

  confirmBtn(mount).click(); // arm
  assert.match(confirmBtn(mount).textContent, /Tap again/);

  // Simulate live re-render ticks (progress bars etc.) between the taps.
  for (let i = 0; i < 5; i++) {
    ref.repaint();
    assert.match(confirmBtn(mount).textContent, /Tap again/,
      `confirm survived repaint ${i + 1}`);
  }

  confirmBtn(mount).click(); // confirm
  assert.deepEqual(ctx.sells, [{ itemId: ITEM.id, qty: 62 }],
    'second tap sold the whole stack');
  assert.equal(sellConfirmPending(ITEM.id), false);
  assert.equal(ctx.state.lumen, 62 * SELL);
});

test('a fully re-created sheet within the window still sees the armed confirm', () => {
  clearSellConfirm(ITEM.id);
  const ctx = makeCtx(30);
  const mountA = new FakeNode('div');
  openSheet(mountA, ctx);
  confirmBtn(mountA).click(); // arm in sheet A

  // Sheet B is a brand-new instance (e.g. UI rebuilt under it).
  const mountB = new FakeNode('div');
  const refB = openSheet(mountB, ctx);
  assert.match(confirmBtn(mountB).textContent, /Tap again — sell all 30/,
    'armed state is keyed by item id, not per-DOM-instance');
  refB.repaint();
  assert.match(confirmBtn(mountB).textContent, /Tap again — sell all 30/);

  refB.close();
  assert.equal(sellConfirmPending(ITEM.id), false, 'closing clears the pending confirm');
});

test('confirm expires after its window and the button reverts honestly', async () => {
  clearSellConfirm(ITEM.id);
  const ctx = makeCtx(40);
  const mount = new FakeNode('div');
  const ref = openSheet(mount, ctx, { confirmWindowMs: 40 });

  confirmBtn(mount).click();
  assert.match(confirmBtn(mount).textContent, /Tap again/);

  await new Promise((r) => setTimeout(r, 90));
  assert.equal(sellConfirmPending(ITEM.id), false, 'deadline passed');
  assert.doesNotMatch(confirmBtn(mount).textContent, /Tap again/);

  // After expiry nothing auto-sells; the two-tap dance starts over.
  confirmBtn(mount).click(); // re-arm
  assert.equal(ctx.sells.length, 0);
  confirmBtn(mount).click(); // complete
  assert.deepEqual(ctx.sells, [{ itemId: ITEM.id, qty: 40 }]);
  ref.close();
});

test('stacks at or below the threshold still sell on a single tap', () => {
  clearSellConfirm(ITEM.id);
  const ctx = makeCtx(10);
  const mount = new FakeNode('div');
  openSheet(mount, ctx);

  const btn = confirmBtn(mount);
  btn.click();
  assert.deepEqual(ctx.sells, [{ itemId: ITEM.id, qty: 10 }]);
  assert.equal(ctx.state.lumen, 10 * SELL);
});
