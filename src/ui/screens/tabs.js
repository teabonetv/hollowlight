// Camp, Bank, Map, Journal screens. Camp is a warm home hub; Bank is the
// item database teaser (owned stacks lit, undiscovered dimmed); Map shows the
// twelve-beacon pilgrim road with only Hearthway kindled; Journal is the log.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { ITEMS, ITEM_CATEGORIES } from '../../game/data/items.js';
import { bankCount, bankSellValue } from '../../game/systems/bank.js';
import { formatNumber, formatDuration } from '../../core/format.js';

export function renderCampScreen(ctx) {
  const { state } = ctx;
  const totalCycles = Object.values(state.actions.completed).reduce((a, b) => a + b, 0);

  const stats = [
    ['Lumen', formatNumber(state.lumen)],
    ['Flame units', formatNumber(state.flame)],
    ['Cycles worked', formatNumber(totalCycles)],
    ['Time by the flame', formatDuration(state.stats.playtimeMs)],
  ];

  return {
    node: el('section', { class: 'screen camp' },
      el('div', { class: 'sigil-wrap', 'aria-hidden': 'true' }, el('div', { class: 'sigil' })),
      el('h1', { class: 'camp-title' }, 'Hearthway Hollow'),
      el('p', { class: 'camp-flavor' },
        'The last ember of the Hollow sleeps in your lantern. Feed it, and carry its light down the pilgrim road.'),
      el('div', { class: 'stat-grid' },
        stats.map(([k, v]) => el('div', { class: 'stat-cell' },
          el('span', { class: 'stat-value' }, v),
          el('span', { class: 'stat-label' }, k)))),
      el('div', { class: 'camp-actions' },
        el('button', { class: 'btn btn-primary btn-wide', onclick: () => ctx.openSkill('emberkeeping') },
          'Tend the Flame'),
        el('button', { class: 'btn btn-ghost btn-wide', onclick: () => ctx.openSkill('foraging') },
          'Walk the fog-line')),
      el('p', { class: 'camp-hint muted' },
        'Offline progress keeps working while you rest — up to 12 hours, honestly counted.')),
    update: () => {},
  };
}

export function renderBankScreen(ctx) {
  const { state } = ctx;
  let discovered = 0;
  for (const it of ITEMS) if (bankCount(state.bank, it.id) > 0) discovered++;

  const root = el('section', { class: 'screen' },
    el('header', { class: 'screen-head' },
      el('h1', { class: 'screen-title' }, 'Bank'),
      el('p', { class: 'screen-sub' },
        `${discovered} of ${ITEMS.length} items known · worth ✦${formatNumber(bankSellValue(state.bank))}`)));

  for (const [catId, catName] of ITEM_CATEGORIES) {
    const items = ITEMS.filter((i) => i.category === catId);
    if (!items.length) continue;
    const grid = el('div', { class: 'bank-cat' },
      el('h2', { class: 'bank-cat-name' }, catName),
      el('div', { class: 'bank-grid' }));

    for (const it of items) {
      const qty = bankCount(state.bank, it.id);
      grid.children[1].append(el('button', {
        class: `bank-tile ${qty > 0 ? 'owned' : 'unowned'}`,
        title: it.flavor,
        onclick: () => ctx.toast(qty > 0
          ? `${it.name} ×${formatNumber(qty)} — sells for ✦${it.sell}`
          : `${it.name}: not yet found. ${it.flavor}`, 'info'),
        'aria-label': `${it.name}, ${qty} owned`,
      },
        el('span', { class: 'bank-qty' }, qty > 0 ? formatNumber(qty) : '—'),
        el('span', { class: 'bank-name' }, it.name),
        el('span', { class: 'bank-sell muted' }, `✦${it.sell}${it.tier > 1 ? ` · T${it.tier}` : ''}`)));
    }
    root.append(grid);
  }

  root.append(el('p', { class: 'footnote muted' },
    'Selling arrives with the general store in a later wave.'));
  return { node: root, update: () => {} };
}

const SETTLEMENTS = [
  'Hearthway Hollow', 'Vesper’s Rest', 'Tallowmere', 'The Sunken Shrift',
  'Emberfall Stacks', 'Choirgreen', 'Mourning Bridge', 'Lantern-Wake',
  'The Pale Steps', 'Starfell Abbey', 'Duskmere', 'The First Beacon',
];

export function renderMapScreen(ctx) {
  const road = el('ol', { class: 'map-road', role: 'list' });
  SETTLEMENTS.forEach((name, i) => {
    const lit = i === 0;
    road.append(el('li', {},
      el('button', {
        class: `map-node ${lit ? 'lit' : ''}`,
        'aria-label': `${name}${lit ? ', kindled' : ', dark'}`,
        onclick: () => ctx.toast(lit
          ? `${name} — your campfire burns here.`
          : `${name} waits in the dark. Relight it in a later wave.`, lit ? 'success' : 'info'),
      },
        el('span', { class: 'map-dot', html: lit ? icon('flame') : null }),
        el('span', { class: 'map-name' }, name))));
  });

  return {
    node: el('section', { class: 'screen' },
      el('header', { class: 'screen-head' },
        el('h1', { class: 'screen-title' }, 'The Pilgrim Road'),
        el('p', { class: 'screen-sub' }, 'Twelve beacons once held the dark off the Hollow.')),
      road,
      el('p', { class: 'footnote muted' },
        'One beacon kindled. Eleven sleep. Each will unlock new crafts when relit.')),
    update: () => {},
  };
}

export function renderJournalScreen(ctx) {
  const entries = [...ctx.state.log].reverse();

  const list = entries.length
    ? el('div', { class: 'journal-list' },
      entries.map((e) => el('div', { class: 'journal-entry' },
        el('span', { class: 'journal-text' }, e.text),
        e.t ? el('span', { class: 'muted journal-time' }, formatDuration(e.t)) : null)))
    : el('div', { class: 'empty-state' },
      el('span', { class: 'empty-icon', html: icon('book') }),
      el('h2', { class: 'empty-title' }, 'Blank pages'),
      el('p', { class: 'empty-text' },
        'Level up, unlock crafts, kindle beacons — the Journal remembers every step of the journey.'));

  return {
    node: el('section', { class: 'screen' },
      el('header', { class: 'screen-head' },
        el('h1', { class: 'screen-title' }, 'Journal'),
        el('p', { class: 'screen-sub' }, 'A record of light carried.')),
      list),
    update: () => {},
  };
}
