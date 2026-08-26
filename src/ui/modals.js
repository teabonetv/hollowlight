// Modal system + the three Wave-0 dialogs: offline gains, settings
// (export/import/reset), and confirmations.

import { el, clear } from './dom.js';
import { formatDuration, formatNumber } from '../core/format.js';
import { OFFLINE_CAP_HOURS, formatRecapLine } from '../core/offline.js';
import { SAVE_VERSION } from '../core/save.js';
import { itemName, ITEMS_BY_ID } from '../game/data/items.js';
import { createItemInspector } from './item-inspector.js';
import {
  sellConfirmPending, clearSellConfirm, SELL_CONFIRM_WINDOW_MS,
} from './sell-confirm.js';

export { sellConfirmPending, clearSellConfirm, SELL_CONFIRM_WINDOW_MS };

/**
 * Opens a modal. Returns { close, panel, overlay }. Only one at a time; Escape
 * and backdrop tap close it unless persistent=true. Persistent dialogs have
 * no × — the action button is the only way out.
 * `variant: 'sheet'` docks a bottom sheet that leaves the pack grid visible.
 */
export function openModal(mount, {
  title, body, actions = [], persistent = false, variant = 'dialog',
} = {}) {
  clear(mount);

  const isSheet = variant === 'sheet';
  const panel = el('div', {
    class: isSheet ? 'modal-panel sheet-panel' : 'modal-panel',
    role: 'dialog',
    'aria-modal': 'true',
  },
    isSheet ? el('div', { class: 'sheet-handle', 'aria-hidden': 'true' }) : null,
    el('div', { class: 'modal-head' },
      el('h2', { class: 'modal-title' }, title),
      persistent ? null : el('button', {
        class: 'icon-btn', 'aria-label': 'Close',
        onclick: () => close(),
        html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
      })),
    el('div', { class: 'modal-body' }, body),
    actions.length ? el('div', { class: 'modal-actions' }, actions) : null,
  );

  const overlay = el('div', {
    class: isSheet ? 'modal-overlay sheet-overlay' : 'modal-overlay',
  }, panel);
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

  return { close, panel, overlay };
}

/** "While you were away…" — honest, capped, per-action breakdown. */
export function showOfflineModal(mount, summary, { onClaim }) {
  const { awayMs, creditedMs, capped, gains, idleNotes = [], recapLines, featPreview } = summary;
  const rows = [];
  const actionRecap = recapLines ?? [
    ...gains.actions,
    ...idleNotes,
  ];
  for (const line of actionRecap) {
    const text = formatRecapLine(line, (id) => itemName(id) ?? id);
    rows.push(el('div', { class: 'offline-line' },
      el('span', { class: 'offline-name' }, text)));
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

  let claimed = false;
  const claim = () => {
    if (claimed) return;
    claimed = true;
    onClaim?.();
  };

  const m = openModal(mount, {
    title: 'While You Were Away…',
    body,
    persistent: true,
    actions: [el('button', {
      class: 'btn btn-primary btn-wide',
      onclick: () => m.close(),
    }, 'Claim')],
  });
  // Persistent means persistent: any close path (Claim, a future ×, etc.)
  // applies the away window. Overlay / Escape are already ignored.
  const origClose = m.close;
  m.close = () => {
    origClose();
    claim();
  };
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

  let ref;
  const inspector = createItemInspector(ctx, itemId, {
    confirmWindowMs,
    onEmpty: () => ref?.close(),
  });
  if (!inspector) return;

  ref = openModal(mount, { title: inspector.title, body: inspector.node, variant: 'sheet' });
  const origClose = ref.close;
  ref.close = () => { inspector.dispose(); origClose(); };
  ref.repaint = inspector.repaint;
  return ref;
}
