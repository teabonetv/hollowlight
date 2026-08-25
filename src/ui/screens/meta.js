// Almanac: constellation, achievements, statistics, dailies, completion.
// Journal tab hosts this so Camp stays the 5-second "three next wants" hub
// without crowding the 5-button tab bar.

import { el, clear } from '../dom.js';
import { icon } from '../icons.js';
import { PERKS, PERK_BRANCHES, PERKS_BY_ID } from '../../game/data/perks.js';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES } from '../../game/data/achievements.js';
import { DAILY_POOL_BY_ID } from '../../game/data/dailies.js';
import { canUnlock, respecCostLumen, cheapestAvailable } from '../../game/systems/radiance.js';
import { isUnlocked } from '../../game/systems/achievements.js';
import { canReroll, taskProgress } from '../../game/systems/dailies.js';
import {
  categoryStats, totalCompletion, achievementCompletion, perkCompletion,
  closestAchievement,
} from '../../game/systems/completion.js';
import { statsRows } from '../../game/systems/stats.js';
import { formatNumber, formatDuration } from '../../core/format.js';

export function renderAlmanacScreen(ctx) {
  const view = ctx.almanacView?.() ?? 'overview';
  if (view === 'stars') return renderStars(ctx);
  if (view === 'achievements') return renderAchievements(ctx);
  if (view === 'stats') return renderStats(ctx);
  if (view === 'dailies') return renderDailies(ctx);
  if (view === 'log') return renderLog(ctx);
  return renderOverview(ctx);
}

function subnav(ctx, current) {
  const tabs = [
    ['overview', 'Log'],
    ['stars', 'Stars'],
    ['dailies', 'Embers'],
    ['achievements', 'Feats'],
    ['stats', 'Stats'],
  ];
  return el('div', { class: 'almanac-nav', role: 'tablist', 'aria-label': 'Almanac' },
    tabs.map(([id, label]) => el('button', {
      class: `almanac-tab ${current === id ? 'active' : ''}`,
      role: 'tab',
      'aria-selected': current === id ? 'true' : 'false',
      onclick: () => ctx.openAlmanac(id),
    }, label)));
}

function renderOverview(ctx) {
  const { state } = ctx;
  const tot = totalCompletion(state);
  const ach = achievementCompletion(state);
  const perks = perkCompletion(state);
  const cats = categoryStats(state);
  const next = closestAchievement(state);
  const perk = cheapestAvailable(state);

  const entries = [...(state.log ?? [])].reverse();
  const logBlock = entries.length
    ? el('div', { class: 'journal-list' },
      entries.slice(0, 8).map((e) => el('div', { class: 'journal-entry' },
        el('span', { class: 'journal-text' }, e.text),
        e.t ? el('span', { class: 'muted journal-time' }, formatDuration(e.t)) : null)))
    : el('div', { class: 'empty-state' },
      el('span', { class: 'empty-icon', html: icon('book') }),
      el('h2', { class: 'empty-title' }, 'Blank pages'),
      el('p', { class: 'empty-text' },
        'Level up, unlock crafts, kindle stars — the Almanac remembers every step of the journey.'));

  const root = el('section', { class: 'screen almanac' },
    el('header', { class: 'screen-head' },
      el('h1', { class: 'screen-title' }, 'Almanac'),
      el('p', { class: 'screen-sub' }, 'What is lit, and what still waits.')),
    subnav(ctx, 'overview'),
    el('div', { class: 'complete-hero' },
      el('span', { class: 'complete-pct' }, tot.label),
      el('span', { class: 'complete-label' }, 'total completion'),
      el('div', { class: 'complete-bar bar bar-lg' },
        el('span', { class: 'bar-fill', style: `width:${(tot.pct * 100).toFixed(1)}%` })),
      el('p', { class: 'muted small' },
        `Feats ${ach.done}/${ach.total} · Stars ${perks.done}/${perks.total}`)),
    el('div', { class: 'want-list' },
      perk ? wantRow('Next star', perk.name, `${perk.cost} Radiance`, () => ctx.openAlmanac('stars')) : null,
      next ? wantRow('Next feat', next.name, next.desc, () => ctx.openAlmanac('achievements')) : null,
      wantRow('Daily embers', 'Three tasks, one reroll', 'No streak. No punishment.', () => ctx.openAlmanac('dailies'))),
    el('h2', { class: 'section-title' }, 'By category'),
    el('div', { class: 'cat-list' },
      cats.map((c) => el('button', {
        class: 'cat-row',
        onclick: () => ctx.openAlmanac('achievements'),
      },
        el('span', { class: 'cat-name' }, c.name),
        el('span', { class: 'cat-pct' }, `${Math.floor(c.pct * 100)}%`),
        el('span', { class: 'bar bar-mini cat-bar' },
          el('span', { class: 'bar-fill', style: `width:${(c.pct * 100).toFixed(1)}%` }))))),
    el('h2', { class: 'section-title' }, 'Journal'),
    logBlock,
    el('button', { class: 'btn btn-ghost btn-wide', onclick: () => ctx.openAlmanac('log') }, 'Full journal'));

  return { node: root, update: () => {} };
}

function wantRow(kicker, title, detail, onClick) {
  return el('button', { class: 'want-row', onclick: onClick },
    el('span', { class: 'want-kicker' }, kicker),
    el('span', { class: 'want-title' }, title),
    el('span', { class: 'want-detail muted' }, detail));
}

function renderStars(ctx) {
  const { state } = ctx;
  const owned = new Set(state.perks?.owned ?? []);
  const cost = respecCostLumen(state);

  const root = el('section', { class: 'screen almanac' },
    el('header', { class: 'screen-head' },
      el('h1', { class: 'screen-title' }, 'Constellation'),
      el('p', { class: 'screen-sub' },
        el('span', { id: 'almanac-radiance-unspent' },
          `${formatNumber(state.radiance ?? 0)} Radiance unspent`),
        ` · ${owned.size}/${PERKS.length} stars`)),
    subnav(ctx, 'stars'));

  for (const branch of PERK_BRANCHES) {
    const nodes = PERKS.filter((p) => p.branch === branch.id);
    if (!nodes.length) continue;
    root.append(el('h2', { class: 'section-title' }, branch.name));
    const list = el('div', { class: 'perk-list' });
    for (const p of nodes) {
      list.append(perkCard(ctx, p, owned));
    }
    root.append(list);
  }

  const respecBtn = el('button', {
    class: 'btn btn-ghost btn-wide',
    onclick: () => ctx.respecPerks(),
  }, owned.size ? `Respec · ✦${cost} (refunds stars)` : 'Respec — nothing pinned');
  root.append(respecBtn);
  root.append(el('p', { class: 'footnote muted' },
    'Stars are permanent. Respec rearranges them for Lumen — your skills, bank, and levels stay.'));

  return {
    node: root,
    update() {
      const unspent = root.querySelector('#almanac-radiance-unspent');
      if (unspent) {
        unspent.textContent = `${formatNumber(ctx.state.radiance ?? 0)} Radiance unspent`;
      }
    },
  };
}

function perkCard(ctx, perk, owned) {
  const have = owned.has(perk.id);
  const gate = have ? { ok: false } : canUnlock(ctx.state, perk.id);
  const req = perk.requires.map((id) => PERKS_BY_ID[id]?.name ?? id).join(', ');
  const fx = perk.effects.map((e) => `+${Math.round(e.value * 100)}% ${e.stat}`).join(' · ');
  const btn = el('button', {
    class: `btn btn-wide ${have ? 'btn-ghost' : gate.ok ? 'btn-primary' : 'btn-ghost btn-disabled'}`,
    onclick: () => { if (!have) ctx.unlockPerk(perk.id); },
  }, have ? 'Kindled' : gate.ok ? `Kindle · ${perk.cost} Radiance` : (gate.error ?? `${perk.cost} Radiance`));

  return el('article', { class: `card perk-card ${have ? 'perk-owned' : ''} ${perk.capstone ? 'perk-cap' : ''}` },
    el('div', { class: 'perk-head' },
      el('h3', { class: 'perk-name' }, perk.name),
      perk.capstone ? el('span', { class: 'chip chip-gold' }, 'Capstone') : null),
    el('p', { class: 'perk-flavor muted' }, perk.flavor),
    el('p', { class: 'perk-fx' }, fx),
    req ? el('p', { class: 'perk-req muted small' }, `Needs ${req}`) : null,
    btn);
}

function renderAchievements(ctx) {
  const { state } = ctx;
  const ach = achievementCompletion(state);
  const root = el('section', { class: 'screen almanac' },
    el('header', { class: 'screen-head' },
      el('h1', { class: 'screen-title' }, 'Feats'),
      el('p', { class: 'screen-sub' }, `${ach.done} of ${ach.total} · ${Math.floor(ach.pct * 100)}%`)),
    subnav(ctx, 'achievements'));

  for (const cat of ACHIEVEMENT_CATEGORIES) {
    const list = ACHIEVEMENTS.filter((a) => a.category === cat.id);
    const done = list.filter((a) => isUnlocked(state, a.id)).length;
    root.append(el('h2', { class: 'section-title' }, `${cat.name} · ${done}/${list.length}`));
    const wrap = el('div', { class: 'feat-list' });
    for (const a of list) {
      const on = isUnlocked(state, a.id);
      wrap.append(el('article', { class: `card feat-card ${on ? 'feat-on' : ''}` },
        el('div', { class: 'feat-head' },
          el('h3', { class: 'feat-name' }, a.name),
          el('span', { class: `chip ${on ? 'chip-gold' : ''}` }, on ? 'Lit' : 'Dark')),
        el('p', { class: 'muted' }, a.desc),
        el('p', { class: 'feat-reward small' }, rewardLabel(a.reward))));
    }
    root.append(wrap);
  }
  return { node: root, update: () => {} };
}

function rewardLabel(r) {
  if (!r) return '';
  if (r.kind === 'lumen') return `Reward: ✦${r.qty}`;
  if (r.kind === 'radiance') return `Reward: ${r.qty} Radiance`;
  if (r.kind === 'title') return `Title: ${r.title}`;
  if (r.kind === 'frame') return `Lantern frame: ${r.name}`;
  if (r.kind === 'perk') return `Small perk: +${Math.round(r.value * 1000) / 10}% ${r.stat}`;
  return '';
}

function renderStats(ctx) {
  const rows = statsRows(ctx.state);
  const title = ctx.state.cosmetics?.activeTitle;
  const root = el('section', { class: 'screen almanac' },
    el('header', { class: 'screen-head' },
      el('h1', { class: 'screen-title' }, 'Statistics'),
      el('p', { class: 'screen-sub' }, title ? `As ${title}` : 'Honest counts. Nothing hidden.')),
    subnav(ctx, 'stats'),
    el('div', { class: 'stat-grid stats-page' },
      rows.map(([label, value, kind]) => el('div', { class: 'stat-cell' },
        el('span', { class: 'stat-value' }, formatStat(value, kind)),
        el('span', { class: 'stat-label' }, label)))),
    titleRow(ctx));
  return { node: root, update: () => {} };
}

function titleRow(ctx) {
  const titles = ctx.state.cosmetics?.titles ?? [];
  if (!titles.length) {
    return el('p', { class: 'footnote muted' }, 'Earn feats to wear a title.');
  }
  return el('div', { class: 'title-pick' },
    el('h2', { class: 'section-title' }, 'Titles'),
    ...titles.map((t) => el('button', {
      class: `btn btn-wide ${ctx.state.cosmetics.activeTitle === t ? 'btn-primary' : 'btn-ghost'}`,
      onclick: () => ctx.equipTitle(t),
    }, t)));
}

function formatStat(value, kind) {
  if (kind === 'duration') return formatDuration(value);
  if (kind === 'lumen') return `✦${formatNumber(value)}`;
  return formatNumber(value);
}

function renderDailies(ctx) {
  ctx.ensureDailies?.();
  const { state } = ctx;
  const pack = state.dailies;
  const cards = (pack?.tasks ?? []).map((t) => dailyCard(ctx, t));

  const root = el('section', { class: 'screen almanac' },
    el('header', { class: 'screen-head' },
      el('h1', { class: 'screen-title' }, 'Daily embers'),
      el('p', { class: 'screen-sub' }, pack?.dayKey ? `Offering for ${pack.dayKey} (UTC)` : 'Three tasks. One reroll. No streak.')),
    subnav(ctx, 'dailies'),
    el('p', { class: 'muted' },
      'Miss a day and nothing breaks. Tomorrow’s stars are simply different.'),
    el('div', { class: 'daily-list' }, cards),
    el('button', {
      class: `btn btn-wide ${canReroll(state) ? 'btn-ghost' : 'btn-ghost btn-disabled'}`,
      onclick: () => ctx.rerollDailies(),
    }, canReroll(state) ? 'Reroll once' : 'Already rerolled today'));

  return { node: root, update: () => {} };
}

function dailyCard(ctx, task) {
  const def = DAILY_POOL_BY_ID[task.id];
  const p = taskProgress(ctx.state, task);
  return el('article', { class: `card daily-card ${task.claimed ? 'daily-claimed' : p.done ? 'daily-ready' : ''}` },
    el('h3', { class: 'perk-name' }, def?.label ?? task.id),
    el('p', { class: 'muted' }, def?.hint ?? ''),
    el('div', { class: 'xp-block' },
      el('div', { class: 'xp-line' },
        el('span', {}, `${p.current} / ${p.need}`),
        el('span', { class: 'chip chip-gold' }, `${task.reward} Radiance`)),
      el('div', { class: 'bar' },
        el('span', { class: 'bar-fill', style: `width:${((p.need ? p.current / p.need : 0) * 100).toFixed(1)}%` }))),
    el('button', {
      class: `btn btn-wide ${task.claimed ? 'btn-ghost' : p.done ? 'btn-primary' : 'btn-ghost btn-disabled'}`,
      onclick: () => ctx.claimDaily(task.id),
    }, task.claimed ? 'Claimed' : p.done ? 'Claim sparks' : 'In progress'));
}

function renderLog(ctx) {
  const entries = [...(ctx.state.log ?? [])].reverse();
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
    node: el('section', { class: 'screen almanac' },
      el('header', { class: 'screen-head' },
        el('h1', { class: 'screen-title' }, 'Journal'),
        el('p', { class: 'screen-sub' }, 'A record of light carried.')),
      subnav(ctx, 'log'),
      list),
    update: () => {},
  };
}

/** Back-compat export used by ui-render tests. */
export function renderJournalScreen(ctx) {
  const view = ctx.almanacView?.() ?? 'log';
  if (view === 'log' || view === 'overview') {
    // Tests expect journal entries / empty-state on this screen.
    if (!ctx.almanacView) return renderLogBare(ctx);
  }
  return renderAlmanacScreen(ctx);
}

function renderLogBare(ctx) {
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
