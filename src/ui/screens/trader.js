// Camp Trader & Keeper's Upgrades screens (F1c economy lane).
// Mobile-first at 360×640: full-width rows, ≥44px touch targets, thumb-zone
// actions at the bottom of each row, visible feedback on every tap via the
// shared .btn active states plus a toast per transaction.

import { el } from '../dom.js';
import { ITEMS_BY_ID } from '../../game/data/items.js';
import { TRADER_STOCK, stockCost } from '../../game/data/trader.js';
import { TRACKS } from '../../game/data/upgrades.js';
import * as camp from '../../game/systems/upgrades.js';
import { formatNumber } from '../../core/format.js';

function backButton(ctx) {
  return el('button', {
    class: 'btn btn-ghost btn-small',
    onclick: () => ctx.backToCamp(),
    'aria-label': 'Back to camp',
  }, '← Camp');
}

// ── Trader ─────────────────────────────────────────────────────────

function shelfRow(ctx, stock) {
  const item = ITEMS_BY_ID[stock.id];
  const affordable = ctx.state.lumen >= stock.cost;
  return el('div', { class: 'trade-row' },
    el('div', { class: 'trade-main' },
      el('span', { class: 'trade-name' }, item.name),
      el('span', { class: 'muted small' }, item.flavor),
      el('span', { class: 'chip chip-gold' }, `✦${stock.cost}`)),
    el('button', {
      class: `btn ${affordable ? 'btn-primary' : 'btn-disabled'}`,
      disabled: !affordable,
      onclick: () => ctx.traderBuy(stock.id),
      'aria-label': `Buy ${item.name} for ${stock.cost} lumen`,
    }, 'Buy'));
}

function sellRow(ctx, itemId, qty) {
  const item = ITEMS_BY_ID[itemId];
  return el('div', { class: 'trade-row trade-row-sell' },
    el('div', { class: 'trade-main' },
      el('span', { class: 'trade-name' },
        `${item.name} `, el('span', { class: 'gold' }, `×${formatNumber(qty)}`)),
      el('span', { class: 'muted small' }, `✦${item.sell} each`)),
    el('div', { class: 'trade-btns' },
      el('button', {
        class: 'btn',
        onclick: () => ctx.traderSell(itemId, 1),
        'aria-label': `Sell one ${item.name}`,
      }, 'Sell 1'),
      el('button', {
        class: 'btn',
        onclick: () => ctx.traderSell(itemId, qty),
        'aria-label': `Sell all ${qty} ${item.name}`,
      }, 'All')));
}

export function renderTraderScreen(ctx) {
  const { state } = ctx;

  const owned = TRADER_STOCK
    .map((s) => [s.id, state.bank[s.id] ?? 0])
    .filter(([, qty]) => qty > 0);
  // Any owned stack sells, stocked or not — everything gathered has a buyer.
  const otherOwned = Object.entries(state.bank)
    .filter(([id, qty]) => qty > 0 && !TRADER_STOCK.some((s) => s.id === id));

  const shelf = el('div', { class: 'trade-list' },
    TRADER_STOCK.map((s) => shelfRow(ctx, s)));

  const sellList = (owned.length + otherOwned.length) > 0
    ? el('div', { class: 'trade-list' },
      [...owned, ...otherOwned].map(([id, qty]) => sellRow(ctx, id, qty)))
    : el('div', { class: 'empty-state' },
      el('h2', { class: 'empty-title' }, 'Empty-handed'),
      el('p', { class: 'empty-text' },
        'Gather along the fog-line and your packs will fill. The trader buys everything you carry.'));

  return {
    node: el('section', { class: 'screen' },
      el('header', { class: 'screen-head detail-head' }, backButton(ctx)),
      el('header', { class: 'screen-head' },
        el('h1', { class: 'screen-title' }, 'The Camp Trader'),
        el('p', { class: 'screen-sub' },
          `Buys what you gather, sells what you need · purse ✦${formatNumber(state.lumen)}`)),
      el('h2', { class: 'bank-cat-name' }, 'Shelf — buy'),
      shelf,
      el('h2', { class: 'bank-cat-name' }, 'Your packs — sell'),
      sellList,
      el('p', { class: 'footnote muted' },
        'The trader pays fair but charges dear — buying back always costs more than selling brought.')),
    update: () => {},
  };
}

// ── Upgrades ───────────────────────────────────────────────────────

function trackCard(ctx, track) {
  const level = camp.upgradeLevel(ctx.state, track.id);
  const next = camp.nextTier(ctx.state, track.id);
  const maxed = !next;
  const chips = maxed ? [] : camp.costChips(next);
  const canPay = maxed ? false : camp.canAffordUpgrade(ctx.state, next);

  const levelDots = el('div', { class: 'track-dots', role: 'img', 'aria-label': `Level ${level} of ${track.tiers.length}` },
    track.tiers.map((_, i) => el('span', { class: `track-dot ${i < level ? 'lit' : ''}` })));

  return el('div', { class: 'card' },
    el('div', { class: 'action-head' },
      el('h3', { class: 'action-name' }, track.name),
      levelDots),
    el('p', { class: 'action-desc' }, track.desc),
    el('div', { class: 'action-foot' },
      maxed
        ? el('span', { class: 'chip chip-gold' }, 'Mastered')
        : el('span', { class: 'chips' },
          chips.map((c) => el('span', {
            class: `chip ${(c.id === 'lumen' ? 'chip-gold' : 'chip-cost')}${canPay ? '' : ' chip-short'}`,
          }, c.id === 'lumen' ? `✦${c.qty}` : `${c.name} ×${c.qty}`))),
      el('button', {
        class: `btn ${maxed || !canPay ? 'btn-disabled' : 'btn-primary'}`,
        style: maxed || canPay ? null : 'opacity:0.55',
        disabled: maxed || !canPay,
        onclick: () => ctx.buyUpgrade(track.id),
        'aria-label': maxed ? `${track.name} mastered` : `Upgrade ${track.name} for tier cost`,
      }, maxed ? 'Complete' : 'Upgrade')),
    maxed ? null : el('p', { class: 'muted small track-next' },
      `Next: ${track.perTier * 100}% stronger per tier · total now +${Math.round(Math.min(track.cap, track.perTier * level) * 100)}%`),
  );
}

export function renderUpgradesScreen(ctx) {
  return {
    node: el('section', { class: 'screen' },
      el('header', { class: 'screen-head detail-head' }, backButton(ctx)),
      el('header', { class: 'screen-head' },
        el('h1', { class: 'screen-title' }, "Keeper's Works"),
        el('p', { class: 'screen-sub' },
          `Permanent lantern-work, paid in Lumen · purse ✦${formatNumber(ctx.state.lumen)}`)),
      TRACKS.map((t) => trackCard(ctx, t)),
      el('p', { class: 'footnote muted' },
        'Works never reset. Each tier costs more than the last — spend wisely.')),
    update: () => {},
  };
}
