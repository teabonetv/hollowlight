// Camp, Bank, Map, Journal screens. Camp is a warm home hub; Bank is the
// item database teaser (owned stacks lit, undiscovered dimmed); Map shows the
// twelve-beacon pilgrim road with only Hearthway kindled; Journal is the log.

import { el, clear } from '../dom.js';
import { icon } from '../icons.js';
import { TRACKS } from '../../game/data/upgrades.js';
import { REPAIR_KITS } from '../../game/data/repairs.js';
import { KINDLING_BUNDLE } from '../../game/data/store.js';
import { bankCount } from '../../game/systems/bank.js';
import { lanternIntegrity } from '../../game/systems/repairs.js';
import * as camp from '../../game/systems/upgrades.js';
import { formatNumber, formatDuration } from '../../core/format.js';
import { renderBankScreen } from './bank.js';

export { renderBankScreen };

function campCycles(state) {
  return Object.values(state.actions.completed).reduce((a, b) => a + b, 0);
}

export function renderCampScreen(ctx) {
  const lumenVal = el('span', { class: 'stat-value' });
  const flameVal = el('span', { class: 'stat-value' });
  const cyclesVal = el('span', { class: 'stat-value' });
  const timeVal = el('span', { class: 'stat-value' });

  const trackRefs = TRACKS.map((t) => buildTrackCard(ctx, t));
  const emptyBanner = el('div', { class: 'empty-state camp-empty' },
    el('span', { class: 'empty-icon', html: icon('camp') }),
    el('p', { class: 'empty-text' }, 'Nothing upgraded yet — the lantern hungers.'));

  const tinderBanner = el('div', { class: 'empty-state camp-starve' });
  const repairCard = buildRepairCard(ctx);

  const root = el('section', { class: 'screen camp' },
    el('div', { class: 'sigil-wrap', 'aria-hidden': 'true' }, el('div', { class: 'sigil' })),
    el('h1', { class: 'camp-title' }, 'Hearthway Hollow'),
    el('p', { class: 'camp-flavor' },
      'The last ember of the Hollow sleeps in your lantern. Feed it, and carry its light down the pilgrim road.'),
    el('div', { class: 'stat-grid' },
      el('div', { class: 'stat-cell' }, lumenVal, el('span', { class: 'stat-label' }, 'Lumen')),
      el('div', { class: 'stat-cell' }, flameVal, el('span', { class: 'stat-label' }, 'Flame units')),
      el('div', { class: 'stat-cell' }, cyclesVal, el('span', { class: 'stat-label' }, 'Cycles worked')),
      el('div', { class: 'stat-cell' }, timeVal, el('span', { class: 'stat-label' }, 'Time by the flame'))),
    el('div', { class: 'camp-actions' },
      el('button', { class: 'btn btn-primary btn-wide', onclick: () => ctx.openSkill('emberkeeping') },
        'Tend the Flame'),
      el('button', { class: 'btn btn-ghost btn-wide', onclick: () => ctx.openSkill('foraging') },
        'Walk the fog-line'),
      el('button', { class: 'btn btn-ghost btn-wide', onclick: () => ctx.openStore?.() },
        'The General Store')),

    tinderBanner,

    el('h2', { class: 'section-title' }, 'The Lantern'),
    el('p', { class: 'section-sub muted' }, 'Repairs spend scrap and Lumen. A cracked chimney still burns — just poorer.'),
    repairCard.node,

    // ── The Keeper's Camp — upgrade tracks (F1c economy sink) ──
    el('h2', { class: 'section-title' }, "The Keeper's Camp"),
    el('p', { class: 'section-sub muted' }, 'Spend what the road gives you. The camp gives it back.'),
    emptyBanner,
    el('div', { class: 'track-list' }, trackRefs.map((r) => r.node)),
    el('p', { class: 'footnote muted' },
      'Sell what you gather at the Bank; spend it here. Offline progress keeps working while you rest — up to 12 hours, honestly counted.'));

  function paintStats() {
    const s = ctx.state;
    lumenVal.textContent = formatNumber(s.lumen);
    flameVal.textContent = formatNumber(s.flame);
    cyclesVal.textContent = formatNumber(campCycles(s));
    timeVal.textContent = formatDuration(s.stats.playtimeMs);

    const tinder = bankCount(s.bank, 'tinderscrap');
    if (tinder <= 0) {
      tinderBanner.style.display = '';
      clear(tinderBanner);
      tinderBanner.append(
        el('p', { class: 'empty-text' },
          `Kindling is gone — the stall still sells Tinderscrap, and a ${KINDLING_BUNDLE.name} is ✦${KINDLING_BUNDLE.cost} for eight handfuls. Or walk the fog-line; herbs carry dry tinder home.`),
        el('button', { class: 'btn btn-primary btn-wide', onclick: () => ctx.openStore?.() },
          'Buy kindling at the stall'));
    } else if (tinder < 8) {
      tinderBanner.style.display = '';
      clear(tinderBanner);
      tinderBanner.append(
        el('p', { class: 'empty-text' },
          `Only ${formatNumber(tinder)} Tinderscrap left. Forage the fog-line (30% tinder) or buy a bundle before Tend goes dark.`));
    } else {
      tinderBanner.style.display = 'none';
    }
  }

  function update() {
    paintStats();
    const anyOwned = TRACKS.some((t) => camp.upgradeLevel(ctx.state, t.id) > 0);
    emptyBanner.style.display = anyOwned ? 'none' : '';
    for (const r of trackRefs) r.update();
    repairCard.update();
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

function buildRepairCard(ctx) {
  const integrityLine = el('span', { class: 'track-effect' });
  const kitsHost = el('div', { class: 'repair-kits' });

  function paint() {
    const i = lanternIntegrity(ctx.state);
    integrityLine.textContent = `Integrity ${i}/100`;
    clear(kitsHost);
    for (const kit of REPAIR_KITS) {
      const btn = el('button', {
        class: 'btn btn-ghost btn-wide',
        onclick: () => ctx.repairLantern?.(kit.id),
      }, `${kit.name} · +${kit.restore} · ✦${kit.lumen}`);
      kitsHost.append(el('div', { class: 'repair-row' },
        el('p', { class: 'track-flavor muted' }, kit.flavor),
        btn));
    }
  }
  paint();
  return {
    node: el('article', { class: 'card repair-card' },
      el('div', { class: 'track-head' },
        el('span', { class: 'skill-icon glyph-flame', html: icon('flame') }),
        el('span', { class: 'track-title' },
          el('h3', { class: 'track-name' }, 'Lantern glass'),
          integrityLine)),
      kitsHost),
    update: paint,
  };
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
