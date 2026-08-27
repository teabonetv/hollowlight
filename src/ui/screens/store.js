// Hearthway General Store — buy with live price curve, rare rotation,
// kindling bundle, and cosmetic dyes (no power). Sell lives on Bank Owned.

import { el } from '../dom.js';
import { ITEMS_BY_ID } from '../../game/data/items.js';
import { KINDLING_BUNDLE, BANK_THEMES, ALWAYS_STOCK } from '../../game/data/store.js';
import { REPAIR_KITS } from '../../game/data/repairs.js';
import {
  currentShelfIds, liveBuyUnit, liveSellUnit, maxAffordable, stepperQtys,
} from '../../game/systems/store.js';
import { bankCount } from '../../game/systems/bank.js';
import { formatNumber } from '../../core/format.js';

function qtyRow(ctx, itemId) {
  const item = ITEMS_BY_ID[itemId];
  const cap = maxAffordable(ctx.state, itemId);
  const unit = liveBuyUnit(ctx.state, itemId);
  const steps = stepperQtys(cap);
  return el('div', { class: 'qty-row' },
    steps.map((s) => el('button', {
      class: `btn ${s.enabled ? 'btn-primary' : 'btn-ghost btn-disabled'}`,
      disabled: !s.enabled,
      onclick: () => {
        if (!s.enabled) return;
        ctx.storeBuy(itemId, s.qty);
      },
      'aria-label': `buy ${s.label} ${item.name}`,
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
    qtyRow(ctx, itemId),
    el('p', { class: 'muted small' }, affordable ? `Purse ✦${formatNumber(ctx.state.lumen)}` : 'Not enough Lumen for even one.'));
}

/** Stall board: kindling, shelf, dyes. Sell stays on Bank Owned. */
export function renderStoreBoard(ctx) {
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

  return el('div', { class: 'store-board-wrap' },
    el('header', { class: 'screen-head' },
      el('h1', { class: 'screen-title' }, 'Hearthway Stall'),
      el('p', { class: 'screen-sub' },
        `Buys what you gather, sells what you need · purse ✦${formatNumber(state.lumen)}`)),
    el('div', { class: 'store-board' },
      el('div', { class: 'store-col' },
        el('h2', { class: 'bank-cat-name' }, 'Emergency kindling'),
        bundle,
        el('h2', { class: 'bank-cat-name' }, 'Shelf — buy'),
        ...shelfCards)),
    el('h2', { class: 'bank-cat-name' }, 'Tab dyes (cosmetic only)'),
    el('p', { class: 'muted small' }, 'Never extra slots. Never power. Lumen for pretty labels.'),
    dyes,
    el('p', { class: 'footnote muted' },
      'Selling floods the stall from Owned: prices sag toward a floor, then recover over playtime. Buying back always costs more than selling paid.'));
}

export function renderStoreScreen(ctx) {
  return {
    node: el('section', { class: 'screen store-screen' }, renderStoreBoard(ctx)),
    update: () => {},
  };
}

export { REPAIR_KITS };
