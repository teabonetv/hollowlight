// Modal system + the three Wave-0 dialogs: offline gains, settings
// (export/import/reset), and confirmations.

import { el, clear } from './dom.js';
import { formatDuration, formatNumber } from '../core/format.js';
import { OFFLINE_CAP_HOURS } from '../core/offline.js';
import { SAVE_VERSION } from '../core/save.js';
import { itemName, ITEMS_BY_ID } from '../game/data/items.js';
import { ACTIONS } from '../game/data/actions.js';
import { bankCount, needsSellConfirm, isPinned } from '../game/systems/bank.js';
import { liveSellUnit } from '../game/systems/store.js';
import { sparksFor } from '../game/systems/offerings.js';

/**
 * Opens a modal. Returns { close, panel }. Only one modal at a time; Escape
 * and backdrop tap close it unless persistent=true.
 */
export function openModal(mount, { title, body, actions = [], persistent = false }) {
  clear(mount);

  const panel = el('div', { class: 'modal-panel', role: 'dialog', 'aria-modal': 'true' },
    el('div', { class: 'modal-head' },
      el('h2', { class: 'modal-title' }, title),
      el('button', {
        class: 'icon-btn', 'aria-label': 'Close',
        onclick: () => close(),
        html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
      })),
    el('div', { class: 'modal-body' }, body),
    actions.length ? el('div', { class: 'modal-actions' }, actions) : null,
  );

  const overlay = el('div', { class: 'modal-overlay' }, panel);
  if (!persistent) {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
  }
  mount.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.classList.remove('open');
    setTimeout(() => { overlay.remove(); if (mount.contains(overlay)) mount.removeChild(overlay); }, 180);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  return { close, panel };
}

/** "While you were away…" — honest, capped, per-action breakdown. */
export function showOfflineModal(mount, summary, { onClaim }) {
  const { awayMs, creditedMs, capped, gains, idleNotes = [], featPreview } = summary;
  const rows = [];

  for (const line of gains.actions) {
    rows.push(el('div', { class: 'offline-line' },
      el('span', { class: 'offline-name' }, line.name),
      el('span', { class: 'offline-detail' }, `×${formatNumber(line.completions)} · +${formatNumber(line.xp)} XP`)));
  }
  for (const note of idleNotes) {
    const need = itemName(note.missingId) ?? note.missingId;
    const why = note.completions > 0
      ? `Stopped after ×${formatNumber(note.completions)} — out of ${need}.`
      : `No cycles — out of ${need}.`;
    rows.push(el('div', { class: 'offline-line' },
      el('span', { class: 'offline-name' }, note.name),
      el('span', { class: 'offline-detail muted' }, why)));
  }
  if (gains.lumen > 0) {
    rows.push(el('div', { class: 'offline-line' },
      el('span', { class: 'offline-name' }, 'Lumen'),
      el('span', { class: 'offline-detail gold' }, `+${formatNumber(gains.lumen)}`)));
  }
  if (gains.flame > 0) {
    rows.push(el('div', { class: 'offline-line' },
      el('span', { class: 'offline-name' }, 'Flame units'),
      el('span', { class: 'offline-detail gold' }, `+${formatNumber(gains.flame)}`)));
  }
  for (const item of gains.items) {
    rows.push(el('div', { class: 'offline-line' },
      el('span', { class: 'offline-name' }, itemName(item.id) ?? item.name ?? item.id),
      el('span', { class: 'offline-detail' }, `+${formatNumber(item.qty)}`)));
  }
  if (featPreview?.lumen > 0 || featPreview?.radiance > 0 || (featPreview?.feats?.length ?? 0) > 0) {
    const bits = [];
    if (featPreview.lumen > 0) bits.push(`+${formatNumber(featPreview.lumen)} Lumen`);
    if (featPreview.radiance > 0) bits.push(`+${formatNumber(featPreview.radiance)} Radiance`);
    const names = (featPreview.feats ?? []).map((a) => a.name).slice(0, 4).join(', ');
    rows.push(el('div', { class: 'offline-line' },
      el('span', { class: 'offline-name' }, 'Feats on Claim'),
      el('span', { class: 'offline-detail gold' },
        bits.length ? bits.join(' · ') : 'titles'),
    ));
    if (names) {
      rows.push(el('p', { class: 'muted small' }, names));
    }
  }

  const body = el('div', {},
    el('p', { class: 'offline-away' },
      formatDuration(awayMs), ' away.',
      capped ? el('span', { class: 'muted' },
        ` The lantern kept ${OFFLINE_CAP_HOURS} hours of work.`) : ''),
    !capped && creditedMs < awayMs ? el('p', { class: 'muted small' },
      `Credited ${formatDuration(creditedMs)}.`) : null,
    rows.length
      ? el('div', { class: 'offline-list' }, rows)
      : el('p', { class: 'muted' }, 'Your actions rested with you. Nothing was gathered.'),
  );

  const m = openModal(mount, {
    title: 'While You Were Away…',
    body,
    persistent: true,
    actions: [el('button', {
      class: 'btn btn-primary btn-wide',
      onclick: () => { m.close(); onClaim(); },
    }, 'Claim')],
  });
}

/** Settings: reduced motion, export/import, reset. */
export function showSettingsModal(mount, ctx) {
  let confirmReset = false;

  const motionToggle = el('input', { type: 'checkbox', id: 'set-motion' });
  motionToggle.checked = ctx.isReducedMotion();
  motionToggle.addEventListener('change', () => ctx.setReducedMotion(motionToggle.checked));

  const exportArea = el('textarea', {
    class: 'save-textarea', readonly: '', rows: 5,
    'aria-label': 'Exported save data',
  });
  exportArea.value = ctx.exportSave();

  const importArea = el('textarea', { class: 'save-textarea', rows: 5, placeholder: 'Paste a Hollowlight save here…', 'aria-label': 'Import save data' });

  const resetBtn = el('button', { class: 'btn btn-danger' }, 'Reset all progress');
  resetBtn.addEventListener('click', () => {
    if (!confirmReset) {
      confirmReset = true;
      resetBtn.textContent = 'Tap again — this snuffs your flame';
      setTimeout(() => { confirmReset = false; resetBtn.textContent = 'Reset all progress'; }, 4000);
      return;
    }
    ctx.resetGame();
    closeRef.close();
  });

  const body = el('div', {},
    el('label', { class: 'settings-row', for: 'set-motion' },
      el('span', {}, 'Reduced motion'),
      motionToggle),
    el('div', { class: 'settings-block' },
      el('h3', { class: 'settings-h' }, 'Export save'),
      exportArea,
      el('button', {
        class: 'btn btn-small',
        onclick: async () => {
          try { await navigator.clipboard.writeText(exportArea.value); ctx.toast('Save copied to clipboard.', 'success'); }
          catch { ctx.toast('Copy failed — select the text manually.', 'warn'); }
        },
      }, 'Copy to clipboard')),
    el('div', { class: 'settings-block' },
      el('h3', { class: 'settings-h' }, 'Import save'),
      importArea,
      el('button', {
        class: 'btn btn-small',
        onclick: () => {
          const res = ctx.importSave(importArea.value.trim());
          if (res.ok) { ctx.toast('Save restored.', 'success'); closeRef.close(); }
          else ctx.toast(`Could not read that save (${res.reason}).`, 'warn');
        },
      }, 'Load save')),
    el('div', { class: 'settings-block' },
      el('h3', { class: 'settings-h' }, 'Danger'),
      resetBtn),
    el('p', { class: 'settings-foot muted' },
      `Hollowlight · Wave 0 · save schema v${SAVE_VERSION}`),
  );

  const closeRef = openModal(mount, { title: 'Settings', body });
}

/**
 * F1d Fix 2 — Sell All two-tap confirm state.
 *
 * The confirm lives HERE, keyed by item id with a deadline — never in the
 * DOM. Any number of re-renders, repaints, or even a full re-open of the
 * sheet inside the window reflects the same pending confirmation, so a live
 * update can no longer silently swallow it before the player's second tap
 * lands. The two-tap safety above SELL_CONFIRM_THRESHOLD stays by design.
 */
const pendingSellConfirms = new Map(); // itemId -> deadline (ms epoch)

export const SELL_CONFIRM_WINDOW_MS = 6000;

export function sellConfirmPending(itemId, nowMs = Date.now()) {
  const deadline = pendingSellConfirms.get(itemId);
  if (deadline === undefined) return false;
  if (deadline <= nowMs) { pendingSellConfirms.delete(itemId); return false; }
  return true;
}

export function clearSellConfirm(itemId) {
  pendingSellConfirms.delete(itemId);
}
/**
 * Sell sheet — tap a bank stack, see its lore/uses/value, sell 1 / 10 / 100 / All.
 * "Sell All" on stacks above SELL_CONFIRM_THRESHOLD demands a second tap
 * (F1d Fix 2: the armed confirm is component state keyed by item id, so
 * re-renders can't lose it). `ctx.sell(itemId, qty)` does the engine work.
 *
 * After a sale the labels always re-read the live bank. Selling the last
 * unit paints “0 in the bank” and then closes — the sheet must never keep
 * showing the pre-sale stack (or an armed “Tap again”) after the goods are gone.
 */
export function showSellSheet(mount, ctx, itemId, { confirmWindowMs = SELL_CONFIRM_WINDOW_MS } = {}) {
  const item = ITEMS_BY_ID[itemId];
  if (!item) return;

  const feeds = [];
  const actionSources = [];
  for (const a of ACTIONS) {
    if ((a.costs ?? []).some((c) => c.id === itemId)) feeds.push(a.name);
    if ((a.outputs ?? []).some((o) => o.kind === 'item' && o.id === itemId)) actionSources.push(a.name);
  }
  const sources = [...new Set([...(item.sources ?? []), ...actionSources.map((n) => `Gathered by ${n}`)])];
  const uses = [...new Set([...(item.uses ?? []), ...feeds.map((n) => `Feeds ${n}`)])];

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
    if (ownedQty() <= 0) { ref.close(); }
  }

  const sell1Btn = el('button', { class: 'btn btn-primary' , onclick: () => doSell(1) }, '');
  const sell10Btn = el('button', { class: 'btn btn-primary', onclick: () => doSell(10) }, '');
  const sell100Btn = el('button', { class: 'btn btn-primary', onclick: () => doSell(100) }, '');

  let expiryTimer = 0;
  function armConfirm() {
    pendingSellConfirms.set(itemId, Date.now() + confirmWindowMs);
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(() => { if (paintButtons) paintButtons(); }, confirmWindowMs + 20);
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
    if (ownedQty() <= 0) ref.close();
  });

  const body = el('div', {},
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

  const ref = openModal(mount, { title: item.name, body });

  paintButtons();
  paintPin();
  paintOffer();
  const origClose = ref.close;
  ref.close = () => { clearSellConfirm(itemId); clearTimeout(expiryTimer); origClose(); };
  ref.repaint = () => { paintButtons(); paintPin(); paintOffer(); };
  return ref;
}
