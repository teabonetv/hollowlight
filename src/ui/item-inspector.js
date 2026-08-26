// Item inspector — sources, uses, sell, pin, offerings.
// Mounted as a mobile sheet (modals.showSellSheet) or a persistent desktop pane.

import { el, clear } from './dom.js';
import { formatNumber } from '../core/format.js';
import { ITEMS_BY_ID } from '../game/data/items.js';
import { ACTIONS } from '../game/data/actions.js';
import { bankCount, needsSellConfirm, isPinned, isLocked, sellQtyForMode } from '../game/systems/bank.js';
import { liveSellUnit } from '../game/systems/store.js';
import { sparksFor } from '../game/systems/offerings.js';
import { itemTimesFound, itemTimesSold, itemLumenTaken } from '../game/systems/stats.js';
import {
  sellConfirmPending, clearSellConfirm, armSellConfirm, SELL_CONFIRM_WINDOW_MS,
} from './sell-confirm.js';

/** First-paint price law: catalog vs live stall, named — not two naked numbers. */
export function inspectorPriceLawLine(item, liveUnit) {
  return `catalog ✦${item.sell} · stall today ✦${liveUnit} (Fair Trade / stall pressure)`;
}

/** Melvor Times Found — derived from live counters, repainted on every inspect. */
export function inspectorStackStatsLine(state, itemId) {
  const found = itemTimesFound(state, itemId);
  const sold = itemTimesSold(state, itemId);
  const taken = itemLumenTaken(state, itemId);
  return `times found ${formatNumber(found)} · sold ${formatNumber(sold)} · lumen taken ✦${formatNumber(taken)}`;
}

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
  const priceLaw = el('span', { class: 'sell-price-law' });
  const statsLine = el('span', { class: 'sell-stack-stats' });
  const confirmBtn = el('button', {
    class: 'btn btn-wide sell-all-btn',
    'aria-live': 'assertive',
  });
  const keep1Btn = el('button', {
    class: 'btn btn-ghost btn-wide sell-keep1-btn',
  }, 'Sell all-but-1');

  function awaitingConfirm() { return sellConfirmPending(itemId); }
  function ownedQty() { return bankCount(ctx.state.bank, itemId); }
  function unitPrice() { return liveSellUnit(ctx.state, itemId); }
  function locked() { return isLocked(ctx.state, itemId); }

  function paintStats() {
    statsLine.textContent = inspectorStackStatsLine(ctx.state, itemId);
  }

  function paintButtons() {
    const qty = ownedQty();
    const unit = unitPrice();
    const held = locked();
    qtyLabel.textContent = `${formatNumber(qty)} in the bank`;
    worthLabel.textContent = `stack worth ✦${formatNumber(qty * unit)} at today’s stall`;
    priceLaw.textContent = inspectorPriceLawLine(item, unit);
    paintStats();

    const canSell = qty >= 1 && !held;
    sell1Btn.textContent = 'Sell 1';
    sell1Btn.disabled = !canSell;
    sell1Btn.setAttribute('aria-disabled', canSell ? 'false' : 'true');
    sell10Btn.textContent = 'Sell 10';
    sell100Btn.textContent = 'Sell 100';
    clear(sellActions);
    if (qty >= 10 && !held) sellActions.append(sell10Btn);
    if (qty >= 100 && !held) sellActions.append(sell100Btn);
    sellActions.style.display = sellActions.children.length ? '' : 'none';

    sellQtyInput.setAttribute('max', String(Math.max(1, qty)));
    const typed = Math.floor(Number(sellQtyInput.value));
    if (!Number.isFinite(typed) || typed < 1) sellQtyInput.value = qty >= 1 ? '1' : '0';
    else if (typed > qty) sellQtyInput.value = String(qty);
    sellQtyInput.disabled = !canSell;
    sellCustomBtn.disabled = !canSell;
    sellCustomRow.style.display = qty >= 1 && !held ? '' : 'none';

    const keepQty = sellQtyForMode('keep1', qty);
    keep1Btn.style.display = qty >= 2 && !held ? '' : 'none';
    keep1Btn.disabled = keepQty < 1;
    keep1Btn.textContent = keepQty >= 1
      ? `Sell all-but-1 — ✦${formatNumber(keepQty * unit)}`
      : 'Sell all-but-1';

    if (held) {
      clearSellConfirm(itemId);
      confirmBtn.className = 'btn btn-ghost btn-wide btn-disabled sell-all-btn';
      confirmBtn.textContent = 'Locked — unlock to sell';
      confirmBtn.setAttribute('aria-disabled', 'true');
      return;
    }

    if (qty <= 0) {
      clearSellConfirm(itemId);
      confirmBtn.className = 'btn btn-ghost btn-wide btn-disabled sell-all-btn';
      confirmBtn.textContent = 'None left in the bank';
      confirmBtn.setAttribute('aria-disabled', 'true');
      return;
    }

    if (awaitingConfirm()) {
      confirmBtn.className = 'btn btn-danger btn-wide sell-all-btn';
      confirmBtn.textContent = `Tap again — sell all ${formatNumber(qty)} for ✦${formatNumber(qty * unit)}`;
      confirmBtn.setAttribute('aria-disabled', 'false');
    } else {
      confirmBtn.className = 'btn btn-wide sell-all-btn ' + (qty > 0 ? 'btn-ghost' : 'btn-ghost btn-disabled');
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
    paintLock();
    if (ownedQty() <= 0) onEmpty?.();
  }

  const sell1Btn = el('button', { class: 'btn btn-primary sell-1-btn', onclick: () => doSell(1) }, '');
  const sell10Btn = el('button', { class: 'btn btn-primary', onclick: () => doSell(10) }, '');
  const sell100Btn = el('button', { class: 'btn btn-primary', onclick: () => doSell(100) }, '');
  const sellQtyInput = el('input', {
    type: 'number',
    class: 'sell-qty-input',
    min: '1',
    step: '1',
    inputmode: 'numeric',
    'aria-label': 'Sell quantity',
    value: '1',
  });
  const sellCustomBtn = el('button', {
    class: 'btn btn-primary',
    onclick: () => doSell(Math.floor(Number(sellQtyInput.value))),
  }, 'Sell');
  const sellCustomRow = el('div', { class: 'sell-custom' },
    sellQtyInput, sellCustomBtn);
  const sellActions = el('div', { class: 'sell-actions' });
  keep1Btn.addEventListener('click', () => {
    const qty = sellQtyForMode('keep1', ownedQty());
    if (qty <= 0) {
      ctx.toast(`Keeping the last ${item.name}.`, 'info');
      return;
    }
    doSell(qty);
  });

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
  const lockBtn = el('button', { class: 'btn btn-ghost btn-small' });
  function paintPin() {
    if (!ctx.togglePin) { pinBtn.style.display = 'none'; return; }
    pinBtn.style.display = '';
    pinBtn.textContent = isPinned(ctx.state, itemId) ? 'Unpin' : 'Pin to top';
  }
  pinBtn.addEventListener('click', () => {
    ctx.togglePin?.(itemId);
    paintPin();
  });
  function paintLock() {
    if (!ctx.toggleLock) { lockBtn.style.display = 'none'; return; }
    lockBtn.style.display = '';
    lockBtn.textContent = isLocked(ctx.state, itemId) ? 'Unlock' : 'Lock';
    lockBtn.setAttribute('aria-pressed', isLocked(ctx.state, itemId) ? 'true' : 'false');
  }
  lockBtn.addEventListener('click', () => {
    ctx.toggleLock?.(itemId);
    paintLock();
    paintButtons();
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

  const catalogLine = el('p', { class: 'sell-line sell-catalog' },
    priceLaw,
    el('br'),
    qtyLabel,
    el('br'),
    worthLabel,
    el('br'),
    statsLine);
  const sellPrimary = el('div', { class: 'sell-primary' }, sell1Btn, confirmBtn, keep1Btn);
  const pinRow = el('div', { class: 'sell-pin-row' }, pinBtn, lockBtn);
  const lore = el('div', { class: 'item-inspector-lore' },
    el('p', { class: 'sell-flavor' }, `“${item.flavor}”`),
    pinRow,
    useChips,
    sellActions,
    sellCustomRow,
    offerBtn);

  const node = el('div', { class: 'item-inspector-body' },
    catalogLine,
    sellPrimary,
    lore);

  paintButtons();
  paintPin();
  paintLock();
  paintOffer();

  return {
    node,
    title: item.name,
    itemId,
    repaint: () => { paintButtons(); paintPin(); paintLock(); paintOffer(); },
    dispose: () => { clearSellConfirm(itemId); clearTimeout(expiryTimer); },
  };
}
