// Modal system + the three Wave-0 dialogs: offline gains, settings
// (export/import/reset), and confirmations.

import { el, clear } from './dom.js';
import { formatNumber } from '../core/format.js';
import {
  formatRecapLine, formatLevelUpLine, formatMasteryUpLine,
  formatOfflineCapNote, formatIdleRecapLine, formatIdleRecapStillness,
  formatOfflineHourRateChip, formatOfflineCappedWorkNote, formatOfflineCreditedNote,
  formatOfflineAwayHead, formatHaltCoda, haltedEarly,
} from '../core/offline.js';
import { SAVE_VERSION } from '../core/save.js';
import { itemName, ITEMS_BY_ID } from '../game/data/items.js';
import { SKILL_BY_ID } from '../game/data/skills.js';
import { createItemInspector } from './item-inspector.js';
import {
  sellConfirmPending, clearSellConfirm, SELL_CONFIRM_WINDOW_MS,
} from './sell-confirm.js';

export { sellConfirmPending, clearSellConfirm, SELL_CONFIRM_WINDOW_MS };

/**
 * 360×640 recap budget. Feat names expand in the body scrollport above the
 * sticky Claim — never dumped under it (S4k: listBottom 753 vs vh 640).
 */
export const RECAP_360 = {
  viewportH: 640,
  overlayPad: 16,
  panelMaxVh: 0.86,
  headH: 44, // pad 14+10 + title 19 + border 1
  actionsPadTop: 12,
  actionsPadBottom: 14,
  actionsBorder: 1,
  claimBtn: 44,
  featToggle: 44,
  featRow: 36,
  featGap: 4,
  listGap: 6,
  minVisibleNames: 3,
};

function closestClass(node, className) {
  let n = node;
  while (n) {
    if (n.classList?.contains?.(className)) return n;
    n = n.parentNode;
  }
  return null;
}

/**
 * After expand+scroll, the feat list sits in the modal-body above Claim.
 * Toggle is end-aligned; names occupy a capped band above it.
 */
export function recapFeatExpandVsClaim({
  viewportH = RECAP_360.viewportH,
  featCount = 25,
} = {}) {
  const C = RECAP_360;
  const overlayInner = viewportH - 2 * C.overlayPad;
  const panelH = Math.min(overlayInner, Math.round(C.panelMaxVh * viewportH));
  const panelTop = C.overlayPad + Math.max(0, Math.floor((overlayInner - panelH) / 2));
  const panelBottom = panelTop + panelH;
  const actionsH = C.actionsBorder + C.actionsPadTop + C.claimBtn + C.actionsPadBottom;
  const claimBottom = panelBottom - C.actionsPadBottom;
  const claimTop = claimBottom - C.claimBtn;
  const bodyTop = panelTop + C.headH;
  const bodyBottom = panelBottom - actionsH;
  const toggleBottom = bodyBottom;
  const toggleTop = toggleBottom - C.featToggle;
  const bodyH = Math.max(0, bodyBottom - bodyTop);
  const listMaxH = Math.max(
    C.minVisibleNames * C.featRow + (C.minVisibleNames - 1) * C.featGap,
    Math.min(Math.floor(bodyH * 0.55), toggleTop - bodyTop - C.listGap),
  );
  const listBottom = toggleTop - C.listGap;
  const naturalH = featCount * C.featRow + Math.max(0, featCount - 1) * C.featGap;
  const listH = Math.min(naturalH, listMaxH);
  const listTop = listBottom - listH;
  const namesVisible = Math.max(
    0, Math.floor((listH + C.featGap) / (C.featRow + C.featGap)),
  );
  return {
    viewportH,
    panelTop,
    panelBottom,
    bodyTop,
    bodyBottom,
    claimTop,
    claimBottom,
    listTop,
    listBottom,
    listMaxH,
    listH,
    toggleTop,
    toggleBottom,
    namesVisible,
    fits: listBottom <= claimTop
      && listBottom <= bodyBottom
      && listTop >= bodyTop
      && namesVisible >= C.minVisibleNames
      && claimBottom <= viewportH
      && claimTop < viewportH,
  };
}

/** Cap the open feat list to the body and scroll it above Claim. */
export function layoutOfflineFeatList(list, { expanded = true, toggle } = {}) {
  if (!list) return;
  if (!expanded) {
    list.style.maxHeight = '';
    return;
  }
  void list.offsetHeight;
  const body = closestClass(list, 'modal-body');
  const toggleH = Number(toggle?.offsetHeight) > 0
    ? toggle.offsetHeight
    : RECAP_360.featToggle;
  const bodyH = Number(body?.clientHeight) > 0 ? body.clientHeight : 0;
  if (bodyH > 0) {
    const cap = Math.max(
      RECAP_360.minVisibleNames * RECAP_360.featRow,
      Math.min(Math.floor(bodyH * 0.55), bodyH - toggleH - RECAP_360.listGap),
    );
    list.style.maxHeight = `${cap}px`;
  }
  const block = closestClass(list, 'offline-feat-block') ?? list;
  if (typeof block.scrollIntoView === 'function') {
    block.scrollIntoView({ block: 'end', inline: 'nearest' });
  } else if (body && bodyH > 0 && Number.isFinite(block.offsetTop)) {
    body.scrollTop = Math.max(
      0, block.offsetTop + (Number(block.offsetHeight) || 0) - bodyH,
    );
  }
}

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
function qtyWithHourRate(qty, rateMs, { gold = false, forMs = 0 } = {}) {
  const rate = formatOfflineHourRateChip(qty, rateMs, { forMs });
  const text = `+${formatNumber(qty)}${rate ? ` · ${rate}` : ''}`;
  return el('span', { class: gold ? 'offline-detail gold' : 'offline-detail' }, text);
}

export function showOfflineModal(mount, summary, { onClaim }) {
  const {
    creditedMs, gains, idleNotes = [], recapLines, featPreview,
    levelUps = [], masteryUps = [], hasGains, workedMs,
  } = summary;
  const rateMs = workedMs > 0 ? workedMs : creditedMs;
  const haltForMs = haltedEarly(summary) ? (workedMs ?? 0) : 0;
  const rows = [];
  const idleLine = formatIdleRecapLine({ hasGains, idleNotes }, featPreview);
  if (idleLine) {
    rows.push(el('p', { class: 'offline-idle' }, idleLine));
  }
  const idleStill = formatIdleRecapStillness({ hasGains, idleNotes });
  if (idleStill) {
    rows.push(el('p', { class: 'offline-idle-still muted small' }, idleStill));
  }
  const actionRecap = recapLines ?? [
    ...gains.actions,
    ...idleNotes,
  ];
  for (const line of actionRecap) {
    const text = formatRecapLine(line, (id) => itemName(id) ?? id);
    rows.push(el('div', { class: 'offline-line' },
      el('span', { class: 'offline-name' }, text)));
  }
  const skillName = (id) => SKILL_BY_ID[id]?.name ?? id;
  for (const lu of levelUps) {
    rows.push(el('div', { class: 'offline-line' },
      el('span', { class: 'offline-name' }, formatLevelUpLine(lu, skillName))));
  }
  const nameMastery = masteryUps.length > 1;
  for (const mu of masteryUps) {
    rows.push(el('div', { class: 'offline-line' },
      el('span', { class: 'offline-name' },
        formatMasteryUpLine(mu, { named: nameMastery }))));
  }
  if (gains.lumen > 0) {
    rows.push(el('div', { class: 'offline-line' },
      el('span', { class: 'offline-name' }, 'Lumen'),
      qtyWithHourRate(gains.lumen, rateMs, { gold: true, forMs: haltForMs })));
  }
  if (gains.radiance > 0) {
    rows.push(el('div', { class: 'offline-line' },
      el('span', { class: 'offline-name' }, 'Radiance'),
      qtyWithHourRate(gains.radiance, rateMs, { gold: true, forMs: haltForMs })));
  }
  if (gains.flame > 0) {
    rows.push(el('div', { class: 'offline-line' },
      el('span', { class: 'offline-name' }, 'Flame units'),
      qtyWithHourRate(gains.flame, rateMs, { gold: true, forMs: haltForMs })));
  }
  for (const item of gains.items) {
    rows.push(el('div', { class: 'offline-line' },
      el('span', { class: 'offline-name' }, itemName(item.id) ?? item.name ?? item.id),
      qtyWithHourRate(item.qty, rateMs, { forMs: haltForMs })));
  }
  const feats = featPreview?.feats ?? [];
  if (featPreview?.lumen > 0 || featPreview?.radiance > 0 || feats.length > 0) {
    const bits = [];
    if (featPreview.lumen > 0) bits.push(`+${formatNumber(featPreview.lumen)} Lumen`);
    if (featPreview.radiance > 0) bits.push(`+${formatNumber(featPreview.radiance)} Radiance`);
    rows.push(el('div', { class: 'offline-line' },
      el('span', { class: 'offline-name' }, 'Feats on Claim'),
      el('span', { class: 'offline-detail gold' },
        bits.length ? bits.join(' · ') : `${feats.length} titles`),
    ));
    if (feats.length) {
      const n = feats.length;
      const collapsedLabel = n === 1 ? '1 feat' : `${n} feats`;
      const list = el('div', { class: 'offline-feat-list is-collapsed' },
        ...feats.map((a) => el('div', { class: 'offline-feat' }, a.name)));
      const toggle = el('button', {
        class: 'btn btn-small btn-wide offline-feat-toggle',
        type: 'button',
        'aria-expanded': 'false',
      }, collapsedLabel);
      const reveal = () => {
        const collapsed = list.classList.contains('is-collapsed');
        if (collapsed) {
          list.classList.remove('is-collapsed');
          toggle.setAttribute('aria-expanded', 'true');
          toggle.textContent = 'Hide feats';
          layoutOfflineFeatList(list, { expanded: true, toggle });
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
              layoutOfflineFeatList(list, { expanded: true, toggle });
            });
          }
        } else {
          list.classList.add('is-collapsed');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.textContent = collapsedLabel;
          layoutOfflineFeatList(list, { expanded: false, toggle });
        }
      };
      toggle.addEventListener('click', reveal);
      // Names first so expand grows above the toggle / Claim, not under it.
      rows.push(el('div', { class: 'offline-feat-block' }, list, toggle));
    }
  }

  const workNote = formatOfflineCappedWorkNote(summary);
  const creditedNote = formatOfflineCreditedNote(summary);
  const haltCoda = formatHaltCoda(summary);
  const body = el('div', {},
    el('p', { class: 'offline-away' },
      formatOfflineAwayHead(summary), ' ',
      el('span', { class: 'muted' },
        workNote ?? formatOfflineCapNote()),
    ),
    creditedNote ? el('p', { class: 'muted small' }, creditedNote) : null,
    haltCoda ? el('p', { class: 'offline-halt-coda muted' }, haltCoda) : null,
    el('div', { class: 'offline-list' }, rows),
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

  const resetBtn = el('button', { type: 'button', class: 'btn btn-danger' }, 'Reset all progress');
  resetBtn.addEventListener('click', () => {
    if (!confirmReset) {
      // Stay armed until the second tap or the modal closes. A short
      // timeout used to expire the confirm so a second tap was a no-op
      // (it just re-armed) and the save never wiped.
      confirmReset = true;
      resetBtn.textContent = 'Tap again — this snuffs your flame';
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
export function showSellSheet(mount, ctx, itemId, {
  confirmWindowMs = SELL_CONFIRM_WINDOW_MS,
  unpaid = false,
  trayQty = 0,
} = {}) {
  const item = ITEMS_BY_ID[itemId];
  if (!item) return;

  let ref;
  const inspector = createItemInspector(ctx, itemId, {
    confirmWindowMs,
    unpaid,
    trayQty,
    onEmpty: () => ref?.close(),
  });
  if (!inspector) return;

  ref = openModal(mount, { title: inspector.title, body: inspector.node, variant: 'sheet' });
  const origClose = ref.close;
  ref.close = () => { inspector.dispose(); origClose(); };
  ref.repaint = inspector.repaint;
  return ref;
}
