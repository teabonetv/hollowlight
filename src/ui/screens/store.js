// Hearthway General Store — buy/sell with live price curve, rare rotation,
// kindling bundle, offerings, and cosmetic dyes (no power).

import { el } from '../dom.js';
import { ITEMS_BY_ID } from '../../game/data/items.js';
import { KINDLING_BUNDLE, BANK_THEMES, ALWAYS_STOCK } from '../../game/data/store.js';
import { REPAIR_KITS } from '../../game/data/repairs.js';
import {
  currentShelfIds, liveBuyUnit, liveSellUnit, isOnShelf, maxAffordable, stepperQtys,
} from '../../game/systems/store.js';
import { bankCount, needsSellConfirm } from '../../game/systems/bank.js';
import { formatNumber } from '../../core/format.js';

function backButton(ctx) {
  return el('button', {
    class: 'btn btn-ghost btn-small',
    onclick: () => ctx.backToCamp(),
    'aria-label': 'Back to camp',
  }, '← Camp');
}

function qtyRow(ctx, itemId, mode) {
  const item = ITEMS_BY_ID[itemId];
  const owned = bankCount(ctx.state.bank, itemId);
  const cap = mode === 'buy' ? maxAffordable(ctx.state, itemId) : owned;
  const unit = mode === 'buy' ? liveBuyUnit(ctx.state, itemId) : liveSellUnit(ctx.state, itemId);
  const steps = stepperQtys(cap);
  return el('div', { class: 'qty-row' },
    steps.map((s) => el('button', {
      class: `btn ${s.enabled ? 'btn-primary' : 'btn-ghost btn-disabled'}`,
      disabled: !s.enabled,
      onclick: () => {
        if (!s.enabled) return;
        if (mode === 'buy') ctx.storeBuy(itemId, s.qty);
        else if (s.label === 'All' && needsSellConfirm(s.qty, item)) ctx.openSellSheet(itemId);
        else ctx.storeSell(itemId, s.qty);
      },
      'aria-label': `${mode} ${s.label} ${item.name}`,
    }, s.label === 'All' ? `All · ✦${formatNumber(unit * s.qty)}` : s.label)));
}

function shelfCard(ctx, itemId, rare) {
  const item = ITEMS_BY_ID[itemId];
  const buy = liveBuyUnit(ctx.state, itemId);
  const sell = liveSellUnit(ctx.state, itemId);
  const affordable = ctx.state.lumen >= buy;
  return el('article', { class: `card trade-card${rare ? ' trade-rare' : ''}` },
    el('div', { class: 'trade-main' },
      el('span', { class: 'trade-name' }, item.name, rare ? el('span', { class: 'chip chip-gold' }, 'Rare') : null),
      el('span', { class: 'muted small' }, item.flavor),
      el('span', { class: 'chip chip-gold' }, `Buy ✦${buy} · stall pays ✦${sell}`)),
    qtyRow(ctx, itemId, 'buy'),
    el('p', { class: 'muted small' }, affordable ? `Purse ✦${formatNumber(ctx.state.lumen)}` : 'Not enough Lumen for even one.'));
}

export function renderStoreScreen(ctx) {
  const { state } = ctx;
  const shelf = currentShelfIds(state);
  const always = new Set(ALWAYS_STOCK);

  const bundleAfford = state.lumen >= KINDLING_BUNDLE.cost;
  const bundle = el('article', { class: 'card trade-card' },
    el('h3', { class: 'action-name' }, KINDLING_BUNDLE.name),
    el('p', { class: 'action-desc' }, KINDLING_BUNDLE.flavor),
    el('button', {
      class: `btn btn-wide ${bundleAfford ? 'btn-primary' : 'btn-ghost btn-disabled'}`,
      disabled: !bundleAfford,
      onclick: () => ctx.buyKindlingBundle(),
    }, `Buy 8 Tinderscrap · ✦${KINDLING_BUNDLE.cost}`));

  const shelfCards = shelf.map((id) => shelfCard(ctx, id, !always.has(id)));

  const ownedIds = Object.keys(state.bank).filter((id) => (state.bank[id] ?? 0) > 0 && ITEMS_BY_ID[id]);
  const sellList = ownedIds.length
    ? ownedIds.map((id) => {
      const item = ITEMS_BY_ID[id];
      const qty = state.bank[id];
      const unit = liveSellUnit(state, id);
      return el('article', { class: 'card trade-card' },
        el('div', { class: 'trade-main' },
          el('span', { class: 'trade-name' }, `${item.name} ×${formatNumber(qty)}`),
          el('span', { class: 'muted small' }, `Stall pays ✦${unit} each (catalog ✦${item.sell})`)),
        qtyRow(ctx, id, 'sell'));
    })
    : [el('div', { class: 'empty-state' },
      el('h2', { class: 'empty-title' }, 'Empty-handed'),
      el('p', { class: 'empty-text' }, 'Gather along the fog-line. The stall buys everything you carry.'))];

  const dyes = el('div', { class: 'trade-list' },
    BANK_THEMES.map((t) => {
      const unlocked = (state.cosmetics?.unlocked ?? ['default']).includes(t.id);
      const equipped = (state.cosmetics?.bankTheme ?? 'default') === t.id;
      return el('div', { class: 'preset-row' },
        el('span', {}, t.name, equipped ? ' · wearing' : ''),
        el('button', {
          class: 'btn btn-small',
          onclick: () => ctx.buyTheme(t.id),
        }, equipped ? 'Wearing' : unlocked ? 'Wear' : `Unlock ✦${t.cost}`));
    }));

  return {
    node: el('section', { class: 'screen store-screen' },
      el('header', { class: 'screen-head detail-head' }, backButton(ctx)),
      el('header', { class: 'screen-head' },
        el('h1', { class: 'screen-title' }, 'Hearthway Stall'),
        el('p', { class: 'screen-sub' },
          `Buys what you gather, sells what you need · purse ✦${formatNumber(state.lumen)}`)),
      el('div', { class: 'store-board' },
        el('div', { class: 'store-col' },
          el('h2', { class: 'bank-cat-name' }, 'Emergency kindling'),
          bundle,
          el('h2', { class: 'bank-cat-name' }, 'Shelf — buy'),
          ...shelfCards),
        el('div', { class: 'store-col' },
          el('h2', { class: 'bank-cat-name' }, 'Your packs — sell'),
          ...sellList)),
      el('h2', { class: 'bank-cat-name' }, 'Tab dyes (cosmetic only)'),
      el('p', { class: 'muted small' }, 'Never extra slots. Never power. Lumen for pretty labels.'),
      dyes,
      el('p', { class: 'footnote muted' },
        'Selling floods the stall: prices sag toward a floor, then recover over playtime. Buying back always costs more than selling paid.')),
    update: () => {},
  };
}

export { REPAIR_KITS };
