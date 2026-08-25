// Bank screen — owned-first dense grid, catalogue opt-in, desktop inspector.

import { el, clear } from '../dom.js';
import { ITEMS, ITEM_CATEGORIES, BANK_TABS, DEFAULT_BANK_TAB } from '../../game/data/items.js';
import {
  bankCount, bankSellValue, filterItems, isPinned, isCatalogueTab,
} from '../../game/systems/bank.js';
import { formatNumber } from '../../core/format.js';
import { createItemInspector } from '../item-inspector.js';

const DESKTOP_INSPECTOR_MQ = '(min-width: 900px)';

export function prefersDockedInspector() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(DESKTOP_INSPECTOR_MQ).matches;
}

export function renderBankScreen(ctx) {
  const headerSub = el('p', { class: 'screen-sub' });
  const filter = { tab: DEFAULT_BANK_TAB, query: '' };
  let selectedId = null;
  let docked = null;

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
  const tabBtns = [];
  for (const [id, label] of BANK_TABS) {
    const b = el('button', {
      class: 'bank-tab',
      type: 'button',
      role: 'tab',
      'data-tab': id,
      onclick: () => {
        filter.tab = id;
        paintTabs();
        syncGrid();
      },
    }, label);
    tabBtns.push(b);
    tabBar.append(b);
  }
  function tabIdOf(b) {
    return b.attrs?.['data-tab'] ?? b.dataset?.tab;
  }
  function paintTabs() {
    for (const b of tabBtns) {
      const on = tabIdOf(b) === filter.tab;
      b.className = `bank-tab${on ? ' active' : ''}`;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  const emptyState = el('div', { class: 'empty-state bank-empty' },
    el('h2', { class: 'empty-title' }, 'The pack is light'),
    el('p', { class: 'empty-text' },
      'Stacks you carry live here. Gather along the fog-line — the Catalogue tab is the atlas of what still waits in the dark.'));

  const gridHost = el('div', { class: 'bank-grids' });
  const tiles = new Map(); // id -> { item, tile, qtyEl, sellEl, pinMark, catEl }

  function inspect(itemId) {
    selectedId = itemId;
    for (const rec of tiles.values()) {
      rec.tile.classList.toggle('selected', rec.item.id === itemId);
    }
    if (prefersDockedInspector()) {
      mountDocked(itemId);
      return;
    }
    const q = bankCount(ctx.state.bank, itemId);
    if (q > 0) ctx.openSellSheet(itemId);
    else {
      const it = [...tiles.values()].find((r) => r.item.id === itemId)?.item;
      ctx.toast(`${it?.name ?? itemId}: not yet found. ${it?.flavor ?? ''}`, 'info');
    }
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
        'Tap a stack to inspect, sell, pin, or offer. On a phone this opens a sheet.'));
  }

  function makeTile(it) {
    const qtyEl = el('span', { class: 'bank-qty' });
    const sellEl = el('span', { class: 'bank-sell muted' });
    const pinMark = el('span', { class: 'bank-pin' });
    const tile = el('button', {
      type: 'button',
      onclick: () => inspect(it.id),
    }, pinMark, qtyEl, el('span', { class: 'bank-name' }, it.name), sellEl);
    return { item: it, tile, qtyEl, sellEl, pinMark };
  }

  function paintTile(rec) {
    const { item: it, tile, qtyEl, sellEl, pinMark } = rec;
    const qty = bankCount(ctx.state.bank, it.id);
    const pinned = isPinned(ctx.state, it.id);
    tile.className = `bank-tile ${qty > 0 ? 'owned' : 'unowned'}${pinned ? ' pinned' : ''}${selectedId === it.id ? ' selected' : ''}`;
    tile.title = qty > 0 ? `Inspect ${it.name}` : it.flavor;
    tile.setAttribute('aria-label',
      `${it.name}, ${qty} owned${qty > 0 ? `, sells for ✦${it.sell} each` : ''}`);
    qtyEl.textContent = qty > 0 ? formatNumber(qty) : '—';
    sellEl.textContent = `✦${it.sell}${it.tier > 1 ? ` · T${it.tier}` : ''}`;
    pinMark.textContent = pinned ? '★' : '';
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
            paintTile(rec);
            tilesHost.append(rec.tile);
          }
          gridHost.append(grid);
        }
      } else {
        const tilesHost = el('div', { class: 'bank-grid bank-grid-owned' });
        for (const it of visible) {
          const rec = tiles.get(it.id) ?? makeTile(it);
          tiles.set(it.id, rec);
          paintTile(rec);
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
    search, tabBar, emptyState, gridHost,
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

  function update() {
    let discovered = 0;
    for (const it of ITEMS) if (bankCount(ctx.state.bank, it.id) > 0) discovered++;
    headerSub.textContent =
      `${discovered} of ${ITEMS.length} items known · worth ✦${formatNumber(bankSellValue(ctx.state.bank))}`;
    paintTabs();
    syncGrid();
    paintPresets();
    docked?.repaint?.();
  }
  update();
  return { node: root, update };
}
