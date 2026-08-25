// Bank screen — owned-first dense grid that sells from the tiles.
// Catalogue stays opt-in; desktop docks an inspector; phone uses a sheet.

import { el, clear } from '../dom.js';
import { icon } from '../icons.js';
import { ITEMS, ITEM_CATEGORIES, DEFAULT_BANK_TAB } from '../../game/data/items.js';
import { itemGlyph } from '../../game/data/item-glyphs.js';
import {
  bankCount, bankSellValue, filterItems, isPinned, isCatalogueTab, visibleBankTabs,
  needsSellConfirm,
} from '../../game/systems/bank.js';
import { formatNumber } from '../../core/format.js';
import { createItemInspector } from '../item-inspector.js';
import {
  sellConfirmPending, clearSellConfirm, armSellConfirm, SELL_CONFIRM_WINDOW_MS,
} from '../sell-confirm.js';

const DESKTOP_INSPECTOR_MQ = '(min-width: 900px)';

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

export function renderBankScreen(ctx) {
  const headerSub = el('p', { class: 'screen-sub' });
  const filter = { tab: DEFAULT_BANK_TAB, query: '' };
  let selectedId = null;
  let docked = null;
  let sellMode = false;
  let sellQtyMode = '1'; // '1' | '10' | 'dump'

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
  const dumpBtn = el('button', { type: 'button', class: 'bank-sell-qty-btn', 'data-qty': 'dump' }, 'Dump');
  const sellHint = el('p', { class: 'bank-sell-hint muted small' });
  const sellQtyRow = el('div', { class: 'bank-sell-qty', role: 'group', 'aria-label': 'Sell quantity' },
    qty1Btn, qty10Btn, dumpBtn);
  const sellBar = el('div', { class: 'bank-sell-bar' }, sellToggle, sellQtyRow, sellHint);

  function requestedQty(itemId) {
    const owned = bankCount(ctx.state.bank, itemId);
    if (sellQtyMode === 'dump') return owned;
    if (sellQtyMode === '10') return Math.min(10, owned);
    return Math.min(1, owned);
  }

  function paintSellBar() {
    root.classList.toggle('bank-selling', sellMode);
    sellToggle.className = `btn bank-sell-toggle ${sellMode ? 'btn-primary' : 'btn-ghost'}`;
    sellToggle.setAttribute('aria-pressed', sellMode ? 'true' : 'false');
    sellToggle.textContent = sellMode ? 'Selling' : 'Sell Mode';
    sellQtyRow.style.display = sellMode ? '' : 'none';
    for (const [btn, mode] of [[qty1Btn, '1'], [qty10Btn, '10'], [dumpBtn, 'dump']]) {
      const on = sellQtyMode === mode;
      btn.className = `bank-sell-qty-btn${on ? ' active' : ''}`;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (!sellMode) {
      sellHint.textContent = 'Tap a stack for lore, pin, or offer. Sell Mode sells from the grid.';
      return;
    }
    const verb = sellQtyMode === 'dump' ? 'dump' : `sell ×${sellQtyMode}`;
    sellHint.textContent = `Tap a stack to ${verb}. Catalog ✦ on the tile; the inspector stays for lore.`;
  }

  sellToggle.addEventListener('click', () => {
    sellMode = !sellMode;
    paintSellBar();
    syncGrid();
  });
  for (const [btn, mode] of [[qty1Btn, '1'], [qty10Btn, '10'], [dumpBtn, 'dump']]) {
    btn.addEventListener('click', () => {
      sellQtyMode = mode;
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
    const qty = requestedQty(itemId);
    if (qty <= 0) return;
    if (needsSellConfirm(qty, item) && !sellConfirmPending(itemId)) {
      armSellConfirm(itemId, Date.now() + SELL_CONFIRM_WINDOW_MS);
      ctx.toast(`Tap again to ${sellQtyMode === 'dump' ? 'dump' : 'sell'} ${item.name} ×${formatNumber(qty)}.`, 'warn');
      paintSellBar();
      return;
    }
    const res = ctx.sell(itemId, qty);
    clearSellConfirm(itemId);
    if (!res.ok) { ctx.toast(res.error ?? 'Could not sell.', 'warn'); return; }
    ctx.toast(`Sold ${item.name} ×${res.sold} for ✦${formatNumber(res.gained)}.`, 'success');
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
    const pinMark = el('span', { class: 'bank-pin' });
    const glyphEl = el('span', { class: 'bank-glyph', 'aria-hidden': 'true' });
    const nameEl = el('span', { class: 'bank-name' }, it.name);
    const tile = el('button', {
      type: 'button',
      'data-item': it.id,
      onclick: () => inspect(it.id),
    }, pinMark, qtyEl, glyphEl, nameEl, chromeEl);
    return { item: it, tile, qtyEl, chromeEl, pinMark, glyphEl, nameEl };
  }

  function paintTile(rec, dense) {
    const { item: it, tile, qtyEl, chromeEl, pinMark, glyphEl, nameEl } = rec;
    const qty = bankCount(ctx.state.bank, it.id);
    const pinned = isPinned(ctx.state, it.id);
    const rarity = it.unique ? 'unique' : it.rare ? 'rare' : `tier-${it.tier ?? 1}`;
    const glyph = itemTileGlyph(it);
    tile.className = [
      'bank-tile',
      dense ? 'bank-tile-dense' : 'bank-tile-catalogue',
      qty > 0 ? 'owned' : 'unowned',
      pinned ? 'pinned' : '',
      selectedId === it.id ? 'selected' : '',
      `cat-${it.category}`,
      `glyph-${glyph}`,
      rarity,
    ].filter(Boolean).join(' ');
    const sellBit = qty > 0 ? `, catalog ✦${it.sell} each` : '';
    const action = sellMode && qty > 0 ? 'Sell' : 'Inspect';
    tile.title = qty > 0 ? `${action} ${it.name}` : it.flavor;
    tile.setAttribute('aria-label', `${it.name}, ${qty} owned${sellBit}`);
    qtyEl.textContent = qty > 0 ? formatNumber(qty) : '—';
    qtyEl.className = dense ? 'bank-qty visually-hidden' : 'bank-qty';
    chromeEl.textContent = qty > 0 ? itemTileChrome(it, qty) : '';
    chromeEl.className = dense && qty > 0 ? 'bank-chrome' : 'bank-chrome visually-hidden';
    pinMark.textContent = pinned ? '★' : '';
    glyphEl.className = `bank-glyph glyph-${glyph}`;
    glyphEl.innerHTML = icon(glyph);
    if (!glyphEl.innerHTML) glyphEl.textContent = itemTileInitials(it);
    nameEl.textContent = it.name;
    nameEl.className = dense ? 'bank-name visually-hidden' : 'bank-name';
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
      el('h1', { class: 'screen-title' }, 'Bank'),
      headerSub),
    search, tabBar, sellBar, emptyState, gridHost,
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
    headerSub.textContent =
      `${discovered} of ${ITEMS.length} items known · catalog worth ✦${formatNumber(bankSellValue(ctx.state.bank))}`;
    paintTabs();
    paintSellBar();
    syncGrid();
    paintPresets();
    docked?.repaint?.();
  }
  update();
  return { node: root, update };
}
