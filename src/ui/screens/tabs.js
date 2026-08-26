// Camp, Bank, Map, Journal screens. Camp is a warm home hub; Bank is an
// owned-first pack with an opt-in Catalogue; Map shows the twelve-beacon
// pilgrim road with only Hearthway kindled; Journal is the log.

import { el, clear } from '../dom.js';
import { icon } from '../icons.js';
import { TRACKS } from '../../game/data/upgrades.js';
import { REPAIR_KITS } from '../../game/data/repairs.js';
import { KINDLING_BUNDLE } from '../../game/data/store.js';
import { bankCount } from '../../game/systems/bank.js';
import { lanternIntegrity, canAffordRepair, repairNeedLabel, repairCostChips } from '../../game/systems/repairs.js';
import * as camp from '../../game/systems/upgrades.js';
import { formatNumber, formatDuration } from '../../core/format.js';
import { nextWants, totalCompletion } from '../../game/systems/completion.js';
import { DAILY_POOL_BY_ID } from '../../game/data/dailies.js';
import { taskProgress } from '../../game/systems/dailies.js';
import { ZONES } from '../../game/data/combat/zones.js';
import { isBeaconKindled } from '../../game/systems/combat.js';
import { renderBankScreen } from './bank.js';

export { renderBankScreen };
export { renderJournalScreen } from './meta.js';

function campCycles(state) {
  return Object.values(state.actions.completed).reduce((a, b) => a + b, 0);
}

export function renderCampScreen(ctx) {
  const { state } = ctx;
  ctx.ensureDailies?.();
  const wants = nextWants(state);
  const title = state.cosmetics?.activeTitle;

  const lumenVal = el('span', { class: 'stat-value' });
  const radianceVal = el('span', { class: 'stat-value' });
  const flameVal = el('span', { class: 'stat-value' });
  const timeVal = el('span', { class: 'stat-value' });
  const cyclesVal = el('span', { class: 'stat-value' });
  const completeVal = el('span', { class: 'stat-value' });


  const trackRefs = TRACKS.map((t) => buildTrackCard(ctx, t));
  const emptyBanner = el('div', { class: 'empty-state camp-empty' },
    el('span', { class: 'empty-icon', html: icon('camp') }),
    el('p', { class: 'empty-text' }, 'Nothing upgraded yet — the lantern hungers.'));

  const tinderBanner = el('div', { class: 'empty-state camp-starve' });
  const repairCard = buildRepairCard(ctx);

  const root = el('section', { class: 'screen camp' },
    el('div', { class: 'sigil-wrap', 'aria-hidden': 'true' }, el('div', { class: 'sigil' })),
    el('h1', { class: 'camp-title' }, 'Hearthway Hollow'),
    title ? el('p', { class: 'camp-title-worn' }, title) : null,
    el('p', { class: 'camp-flavor' },
      'The last ember of the Hollow sleeps in your lantern. Feed it, and carry its light down the pilgrim road.'),
    el('div', { class: 'stat-grid' },
      el('div', { class: 'stat-cell stat-complete' }, completeVal, el('span', { class: 'stat-label' }, 'Completion')),
      el('div', { class: 'stat-cell' }, lumenVal, el('span', { class: 'stat-label' }, 'Lumen')),
      el('div', { class: 'stat-cell' }, radianceVal, el('span', { class: 'stat-label' }, 'Radiance')),
      el('div', { class: 'stat-cell' }, flameVal, el('span', { class: 'stat-label' }, 'Flame units')),
      el('div', { class: 'stat-cell' }, timeVal, el('span', { class: 'stat-label' }, 'Time by the flame')),
      el('div', { class: 'stat-cell' }, cyclesVal, el('span', { class: 'stat-label' }, 'Cycles worked')),
    ),
    el('h2', { class: 'section-title' }, 'Waiting for you'),
    el('p', { class: 'section-sub muted' }, 'Three things to want next — always.'),
    el('div', { class: 'want-list camp-wants' },
      wants.length
        ? wants.map((w) => el('button', {
          class: 'want-row',
          onclick: () => {
            if (w.go === 'skills') ctx.openSkill?.(w.skillId ?? 'emberkeeping');
            else ctx.openAlmanac?.(w.go);
          },
        },
          el('span', { class: 'want-title' }, w.title),
          el('span', { class: 'want-detail muted' }, w.detail)))
        : el('p', { class: 'muted' }, 'The road is quiet. Tend the flame.')),
    dailyStrip(ctx),
    el('div', { class: 'camp-actions' },
      el('button', { class: 'btn btn-primary btn-wide', onclick: () => ctx.openSkill('emberkeeping') },
        'Tend the Flame'),
      el('button', { class: 'btn btn-ghost btn-wide', onclick: () => ctx.openSkill('foraging') },
        'Walk the fog-line'),
      el('button', { class: 'btn btn-ghost btn-wide', onclick: () => ctx.openStore?.() },
        'The General Store'),
      el('button', { class: 'btn btn-ghost btn-wide', onclick: () => ctx.openSkill('combat') },
        'Face the pale-things'),
      el('button', { class: 'btn btn-ghost btn-wide', onclick: () => ctx.openAlmanac?.('stars') },
        'Open the constellation')),

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
    radianceVal.textContent = formatNumber(s.radiance ?? 0);
    flameVal.textContent = formatNumber(s.flame);
    cyclesVal.textContent = formatNumber(campCycles(s));
    timeVal.textContent = formatDuration(s.stats.playtimeMs);
    completeVal.textContent = totalCompletion(s).label;

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

function dailyStrip(ctx) {
  const pack = ctx.state.dailies;
  const tasks = pack?.tasks ?? [];
  if (!tasks.length) return el('p', { class: 'muted small' }, 'Daily embers kindle on load.');
  return el('div', { class: 'daily-strip' },
    el('button', { class: 'daily-strip-head', onclick: () => ctx.openAlmanac?.('dailies') },
      el('span', { class: 'section-title', style: 'margin:0' }, 'Daily embers'),
      el('span', { class: 'muted small' }, 'tap to open')),
    ...tasks.map((t) => {
      const def = DAILY_POOL_BY_ID[t.id];
      const p = taskProgress(ctx.state, t);
      return el('button', {
        class: `daily-chip ${t.claimed ? 'claimed' : p.done ? 'ready' : ''}`,
        onclick: () => ctx.openAlmanac?.('dailies'),
      },
        el('span', {}, def?.label ?? t.id),
        el('span', { class: 'muted' }, t.claimed ? 'claimed' : `${p.current}/${p.need}`));
    }));
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
      : camp.upgradeNeedLabel(ctx.state, next);
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
  const rows = REPAIR_KITS.map((kit) => {
    const costChips = el('span', { class: 'chips' });
    const btn = el('button', {
      class: 'btn btn-wide',
      type: 'button',
      dataset: { repairId: kit.id },
      onclick: () => {
        if (btn.getAttribute('aria-disabled') === 'true') return;
        ctx.repairLantern?.(kit.id);
      },
    }, `${kit.name} · +${kit.restore} · ✦${kit.lumen}`);
    return {
      kit,
      btn,
      costChips,
      node: el('div', { class: 'repair-row' },
        el('p', { class: 'track-flavor muted' }, kit.flavor),
        el('div', { class: 'action-chips' }, costChips),
        btn),
    };
  });

  function paint() {
    const i = lanternIntegrity(ctx.state);
    integrityLine.textContent = `Integrity ${i}/100`;
    for (const row of rows) {
      const { kit, btn, costChips } = row;
      clear(costChips);
      for (const c of repairCostChips(kit)) {
        const have = c.id === 'lumen' ? ctx.state.lumen : bankCount(ctx.state.bank, c.id);
        costChips.append(el('span', {
          class: `chip ${have >= c.qty ? 'chip-cost' : 'chip-cost chip-short'}`,
          title: c.name,
        },
        c.id === 'lumen' ? `✦${formatNumber(c.qty)}` : `${c.name} ×${formatNumber(c.qty)}`));
      }
      const whole = i >= 100;
      const affordable = !whole && canAffordRepair(ctx.state, kit.id);
      btn.textContent = affordable
        ? `${kit.name} · +${kit.restore} · ✦${kit.lumen}`
        : repairNeedLabel(ctx.state, kit);
      btn.className = `btn btn-wide ${affordable ? 'btn-primary' : 'btn-ghost btn-disabled'}`;
      btn.setAttribute('aria-disabled', affordable ? 'false' : 'true');
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
      el('div', { class: 'repair-kits' }, rows.map((r) => r.node))),
    update: paint,
  };
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
