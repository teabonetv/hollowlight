// Item inspector — sources, uses, sell, pin, offerings.
// Mounted as a mobile sheet (modals.showSellSheet) or a persistent desktop pane.

import { el } from './dom.js';
import { formatNumber } from '../core/format.js';
import { ITEMS_BY_ID } from '../game/data/items.js';
import { ACTIONS } from '../game/data/actions.js';
import { bankCount, needsSellConfirm, isPinned } from '../game/systems/bank.js';
import { liveSellUnit } from '../game/systems/store.js';
import { sparksFor } from '../game/systems/offerings.js';
import {
  sellConfirmPending, clearSellConfirm, armSellConfirm, SELL_CONFIRM_WINDOW_MS,
} from './sell-confirm.js';

function itemMeta(item) {
  const feeds = [];
  const actionSources = [];
  for (const a of ACTIONS) {
    if ((a.costs ?? []).some((c) => c.id === item.id)) feeds.push(a.name);
    if ((a.outputs ?? []).some((o) => o.kind === 'item' && o.id === item.id)) {
      actionSources.push(a.name);
    }
  }
  const sources = [...new Set([...(item.sources ?? []), ...actionSources.map((n) => `Gathered by ${n}`)])];
  const uses = [...new Set([...(item.uses ?? []), ...feeds.map((n) => `Feeds ${n}`)])];
  return { sources, uses };
}

/**
 * Build a live inspector for `itemId`. Returns { node, title, itemId, repaint, dispose }.
 * `onEmpty` fires after a sale/offer that empties the stack (sheet closes).
 */
export function createItemInspector(ctx, itemId, {
  confirmWindowMs = SELL_CONFIRM_WINDOW_MS,
  onEmpty,
} = {}) {
  const item = ITEMS_BY_ID[itemId];
  if (!item) return null;

  const { sources, uses } = itemMeta(item);
  const qtyLabel = el('span', { class: 'sell-qty' });
  const worthLabel = el('span', { class: 'sell-worth gold' });
  const confirmBtn = el('button', {
    class: 'btn btn-danger btn-wide',
    'aria-live': 'assertive',
  });

  function awaitingConfirm() { return sellConfirmPending(itemId); }
  function ownedQty() { return bankCount(ctx.state.bank, itemId); }
  function unitPrice() { return liveSellUnit(ctx.state, itemId); }

  function paintButtons() {
    const qty = ownedQty();
    const unit = unitPrice();
    qtyLabel.textContent = `${formatNumber(qty)} in the bank`;
    worthLabel.textContent = `stack worth ✦${formatNumber(qty * unit)} at today’s stall`;

    for (const b of [sell1Btn, sell10Btn, sell100Btn]) {
      b.style.display = '';
      b.disabled = false;
      b.setAttribute('aria-disabled', 'false');
    }
    sell1Btn.textContent = 'Sell 1';
    sell10Btn.textContent = 'Sell 10';
    sell100Btn.textContent = 'Sell 100';
    if (qty < 100) {
      sell100Btn.disabled = true;
      sell100Btn.textContent = `Sell 100 (${qty})`;
      sell100Btn.setAttribute('aria-disabled', 'true');
    }
    if (qty < 10) {
      sell10Btn.disabled = true;
      sell10Btn.textContent = `Sell 10 (${qty})`;
      sell10Btn.setAttribute('aria-disabled', 'true');
    }
    if (qty < 1) {
      sell1Btn.disabled = true;
      sell1Btn.setAttribute('aria-disabled', 'true');
      sell100Btn.disabled = true;
      sell100Btn.setAttribute('aria-disabled', 'true');
    }

    if (qty <= 0) {
      clearSellConfirm(itemId);
      confirmBtn.className = 'btn btn-ghost btn-wide btn-disabled';
      confirmBtn.textContent = 'None left in the bank';
      confirmBtn.setAttribute('aria-disabled', 'true');
      return;
    }

    if (awaitingConfirm()) {
      confirmBtn.className = 'btn btn-danger btn-wide';
      confirmBtn.textContent = `Tap again — sell all ${formatNumber(qty)} for ✦${formatNumber(qty * unit)}`;
      confirmBtn.setAttribute('aria-disabled', 'false');
    } else {
      confirmBtn.className = 'btn btn-wide ' + (qty > 0 ? 'btn-ghost' : 'btn-ghost btn-disabled');
      confirmBtn.textContent = `Sell All — ✦${formatNumber(qty * unit)}`;
      confirmBtn.setAttribute('aria-disabled', qty > 0 ? 'false' : 'true');
    }
  }

  function doSell(qtyRequested) {
    const res = ctx.sell(itemId, qtyRequested);
    if (!res.ok) { ctx.toast(res.error ?? 'Could not sell.', 'warn'); paintButtons(); return; }
    clearSellConfirm(itemId);
    ctx.toast(`Sold ${item.name} ×${res.sold} for ✦${formatNumber(res.gained)}.`, 'success');
    paintButtons();
    paintOffer();
    if (ownedQty() <= 0) onEmpty?.();
  }

  const sell1Btn = el('button', { class: 'btn btn-primary', onclick: () => doSell(1) }, '');
  const sell10Btn = el('button', { class: 'btn btn-primary', onclick: () => doSell(10) }, '');
  const sell100Btn = el('button', { class: 'btn btn-primary', onclick: () => doSell(100) }, '');

  let expiryTimer = 0;
  function armConfirm() {
    armSellConfirm(itemId, Date.now() + confirmWindowMs);
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(() => { paintButtons(); }, confirmWindowMs + 20);
  }

  confirmBtn.addEventListener('click', () => {
    const qty = ownedQty();
    if (qty <= 0) return;
    if (needsSellConfirm(qty, item) && !awaitingConfirm()) {
      armConfirm();
      paintButtons();
      return;
    }
    clearSellConfirm(itemId);
    clearTimeout(expiryTimer);
    doSell(qty);
  });

  const useChips = el('div', { class: 'chips sell-uses' },
    sources.slice(0, 4).map((s) => el('span', { class: 'chip chip-yield' }, s)),
    uses.slice(0, 4).map((u) => el('span', { class: 'chip chip-cost' }, u)));

  const pinBtn = el('button', { class: 'btn btn-ghost btn-small' });
  function paintPin() {
    if (!ctx.togglePin) { pinBtn.style.display = 'none'; return; }
    pinBtn.style.display = '';
    pinBtn.textContent = isPinned(ctx.state, itemId) ? 'Unpin' : 'Pin to top';
  }
  pinBtn.addEventListener('click', () => {
    ctx.togglePin?.(itemId);
    paintPin();
  });

  const offerBtn = el('button', { class: 'btn btn-ghost btn-wide' });
  function paintOffer() {
    if (!ctx.offer) { offerBtn.style.display = 'none'; return; }
    const qty = ownedQty();
    const sparks = sparksFor(item);
    offerBtn.style.display = '';
    offerBtn.disabled = qty < 1;
    offerBtn.textContent = qty < 1
      ? 'Nothing to offer'
      : `Offer 1 for ${sparks} Radiance spark${sparks === 1 ? '' : 's'}`;
  }
  offerBtn.addEventListener('click', () => {
    const res = ctx.offer?.(itemId, 1);
    if (!res?.ok) { ctx.toast(res?.error ?? 'Could not offer.', 'warn'); return; }
    ctx.toast(`Offered ${item.name} — +${res.sparks} Radiance.`, 'success');
    paintButtons();
    paintOffer();
    if (ownedQty() <= 0) onEmpty?.();
  });

  const node = el('div', { class: 'item-inspector-body' },
    el('p', { class: 'sell-flavor' }, `“${item.flavor}”`),
    pinBtn,
    useChips,
    el('p', { class: 'sell-line' },
      el('span', {}, `Sells for ✦${item.sell} each (catalog) · `),
      qtyLabel,
      el('br'),
      worthLabel),
    el('div', { class: 'sell-actions' }, sell1Btn, sell10Btn, sell100Btn),
    confirmBtn,
    offerBtn);

  paintButtons();
  paintPin();
  paintOffer();

  return {
    node,
    title: item.name,
    itemId,
    repaint: () => { paintButtons(); paintPin(); paintOffer(); },
    dispose: () => { clearSellConfirm(itemId); clearTimeout(expiryTimer); },
  };
}
