// Bank screen — owned-first dense grid that sells from the tiles.
// Catalogue stays opt-in; desktop docks an inspector; phone uses a sheet.

import { el, clear } from '../dom.js';
import { filledIcon } from '../icons.js';
import { ITEMS, ITEM_CATEGORIES, DEFAULT_BANK_TAB } from '../../game/data/items.js';
import { itemGlyph } from '../../game/data/item-glyphs.js';
import {
  bankCount, bankSellValue, filterItems, isPinned, isLocked, isCatalogueTab, visibleBankTabs,
  needsSellConfirm, uniqueStackCount, lanternRoom, sellQtyForMode,
} from '../../game/systems/bank.js';
import { formatNumber } from '../../core/format.js';
import { liveSellUnit } from '../../game/systems/store.js';
import { createItemInspector, soldToastMessage } from '../item-inspector.js';
import {
  sellConfirmPending, clearSellConfirm, armSellConfirm, SELL_CONFIRM_WINDOW_MS,
} from '../sell-confirm.js';

const DESKTOP_INSPECTOR_MQ = '(min-width: 900px)';

/** Phone-360 owned-grid geometry. CSS must match — names wrap, never ellipsize. */
export const OWNED_NAME_LAYOUT = {
  phoneMaxWidth: 400,
  phoneColumns: 3,
  screenPadX: 16,
  gap: 6,
  tilePadX: 3,
  fontPx: 12,
  lines: 2,
  glyphPx: 32,
  /** Worst-case system-ui advance in ems (covers W/M). */
  worstCharEm: 0.72,
};

/** Inner width of a dense tile name at `viewportWidth`, matching styles.css. */
export function ownedNameClientWidth(viewportWidth = 360) {
  const { phoneMaxWidth, phoneColumns, screenPadX, gap, tilePadX } = OWNED_NAME_LAYOUT;
  const cols = viewportWidth < phoneMaxWidth ? phoneColumns : 4;
  const grid = viewportWidth - screenPadX * 2;
  const tile = (grid - gap * (cols - 1)) / cols;
  return tile - tilePadX * 2;
}

/**
 * Two-line wrap budget: `scrollWidth` of a nowrap name would exceed `clientWidth`,
 * so CSS wraps instead of ellipsizing. Conservative character-width model.
 */
export function ownedNameFits(name, viewportWidth = 360) {
  const { fontPx, lines, worstCharEm } = OWNED_NAME_LAYOUT;
  const client = ownedNameClientWidth(viewportWidth);
  const scroll = String(name).length * fontPx * worstCharEm;
  return scroll <= client * lines;
}

export function prefersDockedInspector() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(DESKTOP_INSPECTOR_MQ).matches;
}

export function itemTileGlyph(item) {
  return itemGlyph(item);
}

export function itemTileInitials(item) {
  const words = String(item?.name ?? '').split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const compact = words[0] ?? '?';
  return compact.slice(0, 2).toUpperCase();
}

/** Catalog chrome on an owned tile — never live stall, never feat bonus. */
export function itemTileChrome(item, qty) {
  return `✦${item.sell} · ×${formatNumber(qty)}`;
}

/** Live stall pip when catalog ✦ silently disagrees with the inspector. */
export function itemTileStallPip(item, liveUnit) {
  if (!item || !Number.isFinite(liveUnit) || liveUnit === item.sell) return '';
  return `stall ✦${liveUnit}`;
}

const SELL_QTY_MODES = new Set(['1', '10', 'keep1', 'dump']);

export function renderBankScreen(ctx) {
  const headerSub = el('p', { class: 'screen-sub' });
  const filter = { tab: DEFAULT_BANK_TAB, query: '' };
  let selectedId = null;
  let docked = null;
  let sellMode = !!ctx.sellMode;
  let sellQtyMode = SELL_QTY_MODES.has(ctx.sellQtyMode) ? ctx.sellQtyMode : '1';

  const theme = ctx.state.cosmetics?.bankTheme ?? 'default';
  const workspace = el('div', { class: 'bank-workspace' });
  const inspectorHost = el('aside', {
    class: 'bank-inspector',
    'aria-label': 'Item inspector',
  });
  const root = el('section', { class: `screen bank-screen theme-${theme}` },
    workspace, inspectorHost);

  const search = el('input', {
    type: 'search',
    class: 'bank-search',
    placeholder: 'Search name, lore, source…',
    'aria-label': 'Search bank',
  });
  search.addEventListener('input', (e) => {
    filter.query = e?.target?.value ?? search.value ?? '';
    syncGrid();
  });

  const tabBar = el('div', { class: 'bank-tabs', role: 'tablist', 'aria-label': 'Bank categories' });
  function paintTabs() {
    const allowed = new Set(visibleBankTabs(ctx.state.bank).map(([id]) => id));
    if (!allowed.has(filter.tab)) filter.tab = DEFAULT_BANK_TAB;
    clear(tabBar);
    for (const [id, label] of visibleBankTabs(ctx.state.bank)) {
      const on = id === filter.tab;
      const b = el('button', {
        class: `bank-tab${on ? ' active' : ''}`,
        type: 'button',
        role: 'tab',
        'data-tab': id,
        'aria-selected': on ? 'true' : 'false',
        onclick: () => {
          filter.tab = id;
          paintTabs();
          syncGrid();
        },
      }, label);
      tabBar.append(b);
    }
  }

  const emptyState = el('div', { class: 'empty-state bank-empty' },
    el('h2', { class: 'empty-title' }, 'The pack is light'),
    el('p', { class: 'empty-text' },
      'Stacks you carry live here. Gather along the fog-line — the Catalogue tab is the atlas of what still waits in the dark.'));

  const gridHost = el('div', { class: 'bank-grids' });
  const tiles = new Map(); // id -> { item, tile, qtyEl, chromeEl, pinMark, glyphEl, nameEl }

  const sellToggle = el('button', {
    type: 'button',
    class: 'btn btn-ghost bank-sell-toggle',
    'aria-pressed': 'false',
  }, 'Sell Mode');
  const qty1Btn = el('button', { type: 'button', class: 'bank-sell-qty-btn', 'data-qty': '1' }, '×1');
  const qty10Btn = el('button', { type: 'button', class: 'bank-sell-qty-btn', 'data-qty': '10' }, '×10');
  const keep1Btn = el('button', { type: 'button', class: 'bank-sell-qty-btn', 'data-qty': 'keep1' }, 'All-but-1');
  const dumpBtn = el('button', { type: 'button', class: 'bank-sell-qty-btn', 'data-qty': 'dump' }, 'Dump');
  const sellHint = el('p', { class: 'bank-sell-hint muted small' });
  const sellQtyRow = el('div', { class: 'bank-sell-qty', role: 'group', 'aria-label': 'Sell quantity' },
    qty1Btn, qty10Btn, keep1Btn, dumpBtn);

  function requestedQty(itemId) {
    return sellQtyForMode(sellQtyMode, bankCount(ctx.state.bank, itemId));
  }

  const qtyButtons = [[qty1Btn, '1'], [qty10Btn, '10'], [keep1Btn, 'keep1'], [dumpBtn, 'dump']];

  function paintSellBar() {
    root.classList.toggle('bank-selling', sellMode);
    sellToggle.className = `btn bank-sell-toggle ${sellMode ? 'btn-primary' : 'btn-ghost'}`;
    sellToggle.setAttribute('aria-pressed', sellMode ? 'true' : 'false');
    sellToggle.textContent = sellMode ? 'Selling' : 'Sell Mode';
    sellQtyRow.style.display = sellMode ? '' : 'none';
    sellHint.style.display = sellMode ? '' : 'none';
    for (const [btn, mode] of qtyButtons) {
      const on = sellQtyMode === mode;
      btn.className = `bank-sell-qty-btn${on ? ' active' : ''}`;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (!sellMode) {
      sellHint.textContent = '';
      return;
    }
    const verb = sellQtyMode === 'dump' ? 'dump'
      : sellQtyMode === 'keep1' ? 'sell all-but-1'
      : `sell ×${sellQtyMode}`;
    sellHint.textContent = `Tap a stack to ${verb}. Catalog ✦ on the tile; stall pip when they differ.`;
  }

  sellToggle.addEventListener('click', () => {
    sellMode = !sellMode;
    ctx.setSellMode?.(sellMode);
    paintSellBar();
    syncGrid();
  });
  for (const [btn, mode] of qtyButtons) {
    btn.addEventListener('click', () => {
      sellQtyMode = mode;
      ctx.setSellQtyMode?.(mode);
      paintSellBar();
      syncGrid();
    });
  }

  function inspect(itemId) {
    selectedId = itemId;
    for (const rec of tiles.values()) {
      rec.tile.classList.toggle('selected', rec.item.id === itemId);
    }
    const q = bankCount(ctx.state.bank, itemId);
    if (sellMode && q > 0) {
      sellFromGrid(itemId);
      return;
    }
    if (prefersDockedInspector()) {
      mountDocked(itemId);
      return;
    }
    if (q > 0) ctx.openSellSheet(itemId);
    else {
      const it = [...tiles.values()].find((r) => r.item.id === itemId)?.item;
      ctx.toast(`${it?.name ?? itemId}: not yet found. ${it?.flavor ?? ''}`, 'info');
    }
  }

  function sellFromGrid(itemId) {
    const rec = tiles.get(itemId);
    const item = rec?.item;
    if (!item || !ctx.sell) return;
    if (isLocked(ctx.state, itemId)) {
      ctx.toast(`Unlock ${item.name} to sell.`, 'warn');
      return;
    }
    const qty = requestedQty(itemId);
    if (qty <= 0) {
      if (sellQtyMode === 'keep1') ctx.toast(`Keeping the last ${item.name}.`, 'info');
      return;
    }
    if (needsSellConfirm(qty, item) && !sellConfirmPending(itemId)) {
      armSellConfirm(itemId, Date.now() + SELL_CONFIRM_WINDOW_MS);
      const verb = sellQtyMode === 'dump' ? 'dump'
        : sellQtyMode === 'keep1' ? 'sell all-but-1'
        : 'sell';
      ctx.toast(`Tap again to ${verb} ${item.name} ×${formatNumber(qty)}.`, 'warn');
      paintSellBar();
      return;
    }
    const res = ctx.sell(itemId, qty);
    clearSellConfirm(itemId);
    if (!res.ok) { ctx.toast(res.error ?? 'Could not sell.', 'warn'); return; }
    ctx.toast(soldToastMessage(item, res), 'success');
    if (prefersDockedInspector()) mountDocked(itemId);
  }

  function mountDocked(itemId) {
    docked?.dispose?.();
    clear(inspectorHost);
    const next = createItemInspector(ctx, itemId, {
      onEmpty: () => docked?.repaint?.(),
    });
    docked = next;
    if (!next) {
      paintInspectorEmpty();
      return;
    }
    inspectorHost.append(
      el('h2', { class: 'bank-inspector-title' }, next.title),
      next.node);
  }

  function paintInspectorEmpty() {
    docked?.dispose?.();
    docked = null;
    clear(inspectorHost);
    inspectorHost.append(
      el('h2', { class: 'bank-inspector-title' }, 'Inspector'),
      el('p', { class: 'muted' },
        'Tap a stack for lore, pin, or offer. Sell Mode sells from the grid. On a phone, inspect opens a sheet.'));
  }

  function makeTile(it) {
    const qtyEl = el('span', { class: 'bank-qty' });
    const chromeEl = el('span', { class: 'bank-chrome' });
    const stallEl = el('span', { class: 'bank-stall-pip' });
    const pinMark = el('span', { class: 'bank-pin' });
    const lockMark = el('span', { class: 'bank-lock', 'aria-hidden': 'true' });
    const glyphEl = el('span', { class: 'bank-glyph', 'aria-hidden': 'true' });
    const nameEl = el('span', { class: 'bank-name' }, it.name);
    const tile = el('button', {
      type: 'button',
      'data-item': it.id,
      onclick: () => inspect(it.id),
    }, pinMark, lockMark, qtyEl, glyphEl, nameEl, chromeEl, stallEl);
    return { item: it, tile, qtyEl, chromeEl, stallEl, pinMark, lockMark, glyphEl, nameEl };
  }

  function paintTile(rec, dense) {
    const { item: it, tile, qtyEl, chromeEl, stallEl, pinMark, lockMark, glyphEl, nameEl } = rec;
    const qty = bankCount(ctx.state.bank, it.id);
    const pinned = isPinned(ctx.state, it.id);
    const held = isLocked(ctx.state, it.id);
    const rarity = it.unique ? 'unique' : it.rare ? 'rare' : `tier-${it.tier ?? 1}`;
    const glyph = itemTileGlyph(it);
    const live = qty > 0 ? liveSellUnit(ctx.state, it.id) : it.sell;
    const stallPip = qty > 0 ? itemTileStallPip(it, live) : '';
    tile.className = [
      'bank-tile',
      dense ? 'bank-tile-dense' : 'bank-tile-catalogue',
      qty > 0 ? 'owned' : 'unowned',
      pinned ? 'pinned' : '',
      held ? 'locked' : '',
      stallPip ? 'stall-divergent' : '',
      selectedId === it.id ? 'selected' : '',
      `cat-${it.category}`,
      `glyph-${glyph}`,
      rarity,
    ].filter(Boolean).join(' ');
    const sellBit = qty > 0 ? `, catalog ✦${it.sell} each` : '';
    const stallBit = stallPip ? `, ${stallPip}` : '';
    const lockBit = held ? ', locked' : '';
    const action = sellMode && qty > 0 ? (held ? 'Locked' : 'Sell') : 'Inspect';
    tile.title = qty > 0 ? `${action} ${it.name}` : it.flavor;
    tile.setAttribute('aria-label', `${it.name}, ${qty} owned${sellBit}${stallBit}${lockBit}`);
    qtyEl.textContent = qty > 0 ? formatNumber(qty) : '—';
    qtyEl.className = dense ? 'bank-qty visually-hidden' : 'bank-qty';
    chromeEl.textContent = qty > 0 ? itemTileChrome(it, qty) : '';
    chromeEl.className = dense && qty > 0 ? 'bank-chrome' : 'bank-chrome visually-hidden';
    stallEl.textContent = stallPip;
    stallEl.className = dense && stallPip ? 'bank-stall-pip' : 'bank-stall-pip visually-hidden';
    pinMark.textContent = pinned ? '★' : '';
    lockMark.innerHTML = held ? filledIcon('lock') : '';
    lockMark.className = held ? 'bank-lock' : 'bank-lock visually-hidden';
    glyphEl.className = `bank-glyph bank-glyph-fill glyph-${glyph}`;
    glyphEl.innerHTML = filledIcon(glyph);
    if (!glyphEl.innerHTML) glyphEl.textContent = itemTileInitials(it);
    nameEl.textContent = it.name;
    nameEl.className = dense ? 'bank-name bank-name-dense' : 'bank-name';
  }

  function syncGrid() {
    const pins = ctx.state.bankPins ?? [];
    const visible = filterItems({
      items: ITEMS,
      bank: ctx.state.bank,
      tab: filter.tab,
      query: filter.query,
      pins,
    });
    const want = new Set(visible.map((i) => i.id));
    for (const [id, rec] of tiles) {
      if (!want.has(id)) {
        rec.tile.remove();
        tiles.delete(id);
      }
    }

    clear(gridHost);
    const catalogue = isCatalogueTab(filter.tab);
    const dense = !catalogue;
    if (!visible.length) {
      emptyState.style.display = '';
    } else {
      emptyState.style.display = 'none';
      if (catalogue) {
        const byCat = new Map();
        for (const it of visible) {
          const cat = it.category === 'oil' ? 'candle' : it.category;
          if (!byCat.has(cat)) byCat.set(cat, []);
          byCat.get(cat).push(it);
        }
        for (const [catId, catName] of ITEM_CATEGORIES) {
          if (catId === 'oil') continue;
          const group = byCat.get(catId);
          if (!group?.length) continue;
          const tilesHost = el('div', { class: 'bank-grid' });
          const grid = el('div', { class: 'bank-cat' },
            el('h2', { class: 'bank-cat-name' }, catName),
            tilesHost);
          for (const it of group) {
            const rec = tiles.get(it.id) ?? makeTile(it);
            tiles.set(it.id, rec);
            paintTile(rec, false);
            tilesHost.append(rec.tile);
          }
          gridHost.append(grid);
        }
      } else {
        const tilesHost = el('div', { class: 'bank-grid bank-grid-owned' });
        for (const it of visible) {
          const rec = tiles.get(it.id) ?? makeTile(it);
          tiles.set(it.id, rec);
          paintTile(rec, dense);
          tilesHost.append(rec.tile);
        }
        gridHost.append(tilesHost);
      }
    }
    if (selectedId && tiles.has(selectedId)) {
      tiles.get(selectedId).tile.classList.add('selected');
    }
  }

  const presetHost = el('div', { class: 'preset-list' });
  function paintPresets() {
    clear(presetHost);
    const presets = ctx.state.bankPresets ?? [];
    if (!presets.length) {
      presetHost.append(el('p', { class: 'muted small' },
        'No loadouts yet. Save owned stacks or gear as a checklist.'));
    }
    for (const p of presets) {
      const n = Object.keys(p.items ?? {}).length;
      presetHost.append(el('div', { class: 'preset-row' },
        el('span', {}, `${p.name} · ${n} kinds`),
        el('button', {
          class: 'btn btn-small',
          onclick: () => ctx.applyPreset?.(p.id),
        }, 'Pin loadout'),
        el('button', {
          class: 'btn btn-small btn-ghost',
          onclick: () => ctx.deletePreset?.(p.id),
        }, 'Delete')));
    }
  }

  workspace.append(
    el('header', { class: 'screen-head' },
      el('div', { class: 'bank-head-row' },
        el('h1', { class: 'screen-title' }, 'Bank'),
        sellToggle),
      headerSub),
    search, tabBar, sellQtyRow, sellHint, emptyState, gridHost,
    el('h2', { class: 'section-title' }, 'Loadouts'),
    el('p', { class: 'section-sub muted' }, 'Checklists only — applying a loadout never conjures items.'),
    el('div', { class: 'preset-actions' },
      el('button', {
        class: 'btn btn-ghost btn-wide',
        onclick: () => ctx.savePreset?.('loadout'),
      }, 'Save owned as loadout'),
      el('button', {
        class: 'btn btn-ghost btn-wide',
        onclick: () => ctx.savePreset?.('gear'),
      }, 'Save gear set')),
    presetHost,
    el('p', { class: 'footnote muted' },
      'Owned is the working pack. Catalogue is completion — tap it to see what still waits.'));

  paintInspectorEmpty();
  paintSellBar();

  function update() {
    let discovered = 0;
    for (const it of ITEMS) if (bankCount(ctx.state.bank, it.id) > 0) discovered++;
    const used = uniqueStackCount(ctx.state.bank);
    const cap = lanternRoom(ctx.state);
    headerSub.textContent =
      `${discovered} of ${ITEMS.length} known · ${used} / ${cap} · catalog worth ✦${formatNumber(bankSellValue(ctx.state.bank))}`;
    paintTabs();
    paintSellBar();
    syncGrid();
    paintPresets();
    docked?.repaint?.();
  }
  update();
  return { node: root, update };
}
