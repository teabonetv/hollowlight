// Camp, Bank, Map, Journal screens. Camp is a warm home hub; Bank is the
// item database teaser (owned stacks lit, undiscovered dimmed); Map shows the
// twelve-beacon pilgrim road with only Hearthway kindled; Journal is the log.

import { el, clear } from '../dom.js';
import { icon } from '../icons.js';
import { ITEMS, ITEM_CATEGORIES, ITEMS_BY_ID } from '../../game/data/items.js';
import { ACTIONS } from '../../game/data/actions.js';
import { TRACKS, TRACKS_BY_ID } from '../../game/data/upgrades.js';
import { bankCount, bankSellValue } from '../../game/systems/bank.js';
import * as camp from '../../game/systems/upgrades.js';
import { formatNumber, formatDuration } from '../../core/format.js';
import { ZONES } from '../../game/data/combat/zones.js';
import { isBeaconKindled } from '../../game/systems/combat.js';

export function renderCampScreen(ctx) {
  const { state } = ctx;
  const totalCycles = Object.values(state.actions.completed).reduce((a, b) => a + b, 0);

  const stats = [
    ['Lumen', formatNumber(state.lumen)],
    ['Flame units', formatNumber(state.flame)],
    ['Cycles worked', formatNumber(totalCycles)],
    ['Time by the flame', formatDuration(state.stats.playtimeMs)],
  ];

  const trackRefs = TRACKS.map((t) => buildTrackCard(ctx, t));
  const emptyBanner = el('div', { class: 'empty-state camp-empty' },
    el('span', { class: 'empty-icon', html: icon('camp') }),
    el('p', { class: 'empty-text' }, 'Nothing upgraded yet — the lantern hungers.'));

  const root = el('section', { class: 'screen camp' },
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
        'Walk the fog-line'),
      el('button', { class: 'btn btn-ghost btn-wide', onclick: () => ctx.openSkill('combat') },
        'Face the pale-things')),

    // ── The Keeper's Camp — upgrade tracks (F1c economy sink) ──
    el('h2', { class: 'section-title' }, "The Keeper's Camp"),
    el('p', { class: 'section-sub muted' }, 'Spend what the road gives you. The camp gives it back.'),
    emptyBanner,
    el('div', { class: 'track-list' }, trackRefs.map((r) => r.node)),
    el('p', { class: 'footnote muted' },
      'Sell what you gather at the Bank; spend it here. Offline progress keeps working while you rest — up to 12 hours, honestly counted.'));

  function update() {
    const anyOwned = TRACKS.some((t) => camp.upgradeLevel(ctx.state, t.id) > 0);
    emptyBanner.style.display = anyOwned ? 'none' : '';
    for (const r of trackRefs) r.update();
  }
  update();

  return { node: root, update };
}

/** Human label for a track's current summed effect, e.g. “+10% action speed”. */
function effectLabel(track, fraction) {
  const pct = Math.round(fraction * 100);
  if (track.effect === 'speed') return `+${pct}% action speed`;
  if (track.effect === 'yield') return `+${pct}% bonus finds while gathering`;
  return `+${pct}% XP from every task`;
}

function buildTrackCard(ctx, track) {
  const level = () => camp.upgradeLevel(ctx.state, track.id);
  const maxed = () => level() >= track.tiers.length;

  const effectLine = el('span', { class: 'track-effect' });
  const tierName = el('span', { class: 'track-tier-name' });
  const tierFlavor = el('p', { class: 'track-flavor muted' });
  const costChips = el('span', { class: 'chips' });
  const buyBtn = el('button', {
    class: 'btn btn-primary btn-wide',
    onclick: () => ctx.buyUpgrade(track.id),
  });

  function paint() {
    const frac = camp.trackEffectFraction(ctx.state, track);
    // Unowned: promise the per-tier gain. Owned: state the current total.
    effectLine.textContent = level() > 0
      ? `${effectLabel(track, frac)} now`
      : `${effectLabel(track, track.perTier)} per tier`;

    clearTier();
    if (maxed()) {
      tierName.textContent = `${track.tiers[track.tiers.length - 1].name} — complete`;
      tierFlavor.textContent = 'This lantern-work is finished. The light keeps.';
      buyBtn.style.display = 'none';
      return;
    }

    const next = camp.nextTier(ctx.state, track.id);
    buyBtn.style.display = '';
    tierName.textContent = `Next · ${next.name}`;
    tierFlavor.textContent = next.flavor;

    clear(costChips);
    for (const c of camp.costChips(next)) {
      const have = c.id === 'lumen' ? ctx.state.lumen : bankCount(ctx.state.bank, c.id);
      costChips.append(el('span', {
        class: `chip ${have >= c.qty ? 'chip-cost' : 'chip-cost chip-short'}`,
        title: c.name,
      },
      c.id === 'lumen' ? `✦${formatNumber(c.qty)}` : `${c.name} ×${formatNumber(c.qty)}`));
    }
    const affordable = camp.canAffordUpgrade(ctx.state, next);
    buyBtn.textContent = affordable
      ? `Upgrade · ${next.name}`
      : 'Need materials';
    buyBtn.className = `btn btn-wide ${affordable ? 'btn-primary' : 'btn-ghost btn-disabled'}`;
    buyBtn.setAttribute('aria-disabled', affordable ? 'false' : 'true');
  }

  function clearTier() {
    tierName.textContent = '';
    tierFlavor.textContent = '';
    clear(costChips);
  }

  paint();

  return {
    node: el('article', { class: 'card track-card' },
      el('div', { class: 'track-head' },
        el('span', { class: `skill-icon glyph-${track.glyph}`, html: icon(track.glyph) }),
        el('span', { class: 'track-title' },
          el('h3', { class: 'track-name' }, `${track.name}${level() > 0 ? ` · ${['I', 'II', 'III', 'IV', 'V', 'VI'][level() - 1] ?? level()}` : ''}`),
          effectLine)),
      tierName,
      tierFlavor,
      el('div', { class: 'action-chips' }, costChips),
      buyBtn),
    update: paint,
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
        title: qty > 0 ? `Sell ${it.name}` : it.flavor,
        onclick: () => qty > 0
          ? ctx.openSellSheet(it.id)
          : ctx.toast(`${it.name}: not yet found. ${it.flavor}`, 'info'),
        'aria-label': `${it.name}, ${qty} owned${qty > 0 ? `, sells for ✦${it.sell} each` : ''}`,
      },
        el('span', { class: 'bank-qty' }, qty > 0 ? formatNumber(qty) : '—'),
        el('span', { class: 'bank-name' }, it.name),
        el('span', { class: 'bank-sell muted' }, `✦${it.sell}${it.tier > 1 ? ` · T${it.tier}` : ''}`)));
    }
    root.append(grid);
  }

  root.append(el('p', { class: 'footnote muted' },
    'Tap a lit stack to sell it — every coin goes back into the camp.'));
  return { node: root, update: () => {} };
}

export function renderMapScreen(ctx) {
  const road = el('ol', { class: 'map-road', role: 'list' });
  ZONES.forEach((z) => {
    const lit = isBeaconKindled(ctx.state, z.beaconId);
    road.append(el('li', {},
      el('button', {
        class: `map-node ${lit ? 'lit' : ''}`,
        'aria-label': `${z.settlement}${lit ? ', kindled' : ', dark'}`,
        onclick: () => {
          if (lit) {
            ctx.openSkill?.('combat');
            ctx.toast(`${z.settlement} — the fog-line is walkable from here.`, 'success');
          } else {
            ctx.toast(`${z.settlement} waits in the dark. Relight it in a later wave.`, 'info');
          }
        },
      },
        el('span', { class: 'map-dot', html: lit ? icon('flame') : null }),
        el('span', { class: 'map-name' }, z.settlement))));
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
