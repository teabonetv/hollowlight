// Bank screen — weightless, tabbed, searchable grid with pins and loadouts.

import { el, clear } from '../dom.js';
import { ITEMS, ITEM_CATEGORIES, BANK_TABS } from '../../game/data/items.js';
import { bankCount, bankSellValue, filterItems, isPinned } from '../../game/systems/bank.js';
import { formatNumber } from '../../core/format.js';

export function renderBankScreen(ctx) {
  const headerSub = el('p', { class: 'screen-sub' });
  const tilePainters = [];
  const tileMeta = [];
  const filter = { tab: 'all', query: '' };

  const theme = ctx.state.cosmetics?.bankTheme ?? 'default';
  const root = el('section', { class: `screen bank-screen theme-${theme}` },
    el('header', { class: 'screen-head' },
      el('h1', { class: 'screen-title' }, 'Bank'),
      headerSub));

  const search = el('input', {
    type: 'search',
    class: 'bank-search',
    placeholder: 'Search name, lore, source…',
    'aria-label': 'Search bank',
  });
  search.addEventListener('input', (e) => {
    filter.query = e?.target?.value ?? search.value ?? '';
    applyFilter();
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
        applyFilter();
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

  root.append(search, tabBar);

  const cats = [];
  for (const [catId, catName] of ITEM_CATEGORIES) {
    if (catId === 'oil') continue;
    const items = ITEMS.filter((i) => i.category === catId || (catId === 'candle' && i.category === 'oil'));
    if (!items.length) continue;
    const tilesHost = el('div', { class: 'bank-grid' });
    const grid = el('div', { class: 'bank-cat' },
      el('h2', { class: 'bank-cat-name' }, catName),
      tilesHost);

    for (const it of items) {
      const qtyEl = el('span', { class: 'bank-qty' });
      const sellEl = el('span', { class: 'bank-sell muted' });
      const pinMark = el('span', { class: 'bank-pin' });
      const tile = el('button', {
        onclick: () => {
          const q = bankCount(ctx.state.bank, it.id);
          if (q > 0) ctx.openSellSheet(it.id);
          else ctx.toast(`${it.name}: not yet found. ${it.flavor}`, 'info');
        },
      }, pinMark, qtyEl, el('span', { class: 'bank-name' }, it.name), sellEl);
      tilesHost.append(tile);
      tileMeta.push({ item: it, tile, catEl: grid });

      tilePainters.push(() => {
        const qty = bankCount(ctx.state.bank, it.id);
        const pinned = isPinned(ctx.state, it.id);
        tile.className = `bank-tile ${qty > 0 ? 'owned' : 'unowned'}${pinned ? ' pinned' : ''}`;
        tile.title = qty > 0 ? `Sell ${it.name}` : it.flavor;
        tile.setAttribute('aria-label',
          `${it.name}, ${qty} owned${qty > 0 ? `, sells for ✦${it.sell} each` : ''}`);
        qtyEl.textContent = qty > 0 ? formatNumber(qty) : '—';
        sellEl.textContent = `✦${it.sell}${it.tier > 1 ? ` · T${it.tier}` : ''}`;
        pinMark.textContent = pinned ? '★' : '';
      });
    }
    root.append(grid);
    cats.push(grid);
  }

  function applyFilter() {
    const pins = ctx.state.bankPins ?? [];
    const visible = new Set(filterItems({
      items: ITEMS,
      bank: ctx.state.bank,
      tab: filter.tab,
      query: filter.query,
      pins,
    }).map((i) => i.id));
    const catHas = new Map();
    for (const { item, tile, catEl } of tileMeta) {
      const show = visible.has(item.id);
      tile.style.display = show ? '' : 'none';
      if (show) catHas.set(catEl, true);
    }
    for (const c of cats) c.style.display = catHas.get(c) ? '' : 'none';
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

  root.append(
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
      'Tap a lit stack for sources, uses, sell, and offerings. Pin favourites to the top of All.'));

  function update() {
    let discovered = 0;
    for (const it of ITEMS) if (bankCount(ctx.state.bank, it.id) > 0) discovered++;
    headerSub.textContent =
      `${discovered} of ${ITEMS.length} items known · worth ✦${formatNumber(bankSellValue(ctx.state.bank))}`;
    for (const paint of tilePainters) paint();
    paintTabs();
    applyFilter();
    paintPresets();
  }
  update();
  return { node: root, update };
}
