// Almanac: constellation, achievements, statistics, dailies, completion.
// Journal tab hosts this so Camp stays the 5-second "three next wants" hub
// without crowding the 5-button tab bar.

import { el, clear } from '../dom.js';
import { icon } from '../icons.js';
import { PERKS, PERK_BRANCHES, PERKS_BY_ID } from '../../game/data/perks.js';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES } from '../../game/data/achievements.js';
import { SKILL_BY_ID } from '../../game/data/skills.js';
import { ITEMS_BY_ID } from '../../game/data/items.js';
import { itemGlyph } from '../../game/data/item-glyphs.js';
import { DAILY_POOL_BY_ID } from '../../game/data/dailies.js';
import { canUnlock, respecCostLumen, cheapestAvailable } from '../../game/systems/radiance.js';
import { isUnlocked } from '../../game/systems/achievements.js';
import { canReroll, taskProgress } from '../../game/systems/dailies.js';
import {
  totalCompletion, trueCompletion, achievementCompletion,
  closestAchievement, logCategoryStats,
  skillLogDetails, masteryLogDetails, itemsLogDetails,
  logFeatAchievements, formatCompletionPct,
} from '../../game/systems/completion.js';
import { statsRows } from '../../game/systems/stats.js';
import { formatNumber, formatDuration } from '../../core/format.js';

/**
 * 360×640 Almanac Items (Known door). Chrome must leave two full
 * Still-in-the-dark rows above --tab-h (tab top 577).
 * Lockstep with styles.css `.screen.log-items` rules.
 */
export const LOG_ITEMS_360 = {
  viewportH: 640,
  tabbarH: 63, // --tab-h 62 + 1px border → tab top 577
  topbarH: 105, // 360 wrapped Known/Hollow HUD
  screenPadTop: 18,
  screenGap: 4,
  headH: 44, // back + title + 6/137 on one row
  navH: 44,
  foundHeadH: 16,
  foundCols: 6,
  foundTileH: 48, // glyph + ×N at 360; name lives on inspect
  foundGap: 4,
  missingHeadH: 16,
  missingCols: 4,
  missingTileH: 50, // measured ~49px after compact mystery chrome
  missingGap: 6,
};

/** Times Found on an Almanac Items tile — ×N, never a binary Found sticker. */
export function formatLogTimesFound(timesFound) {
  return `×${formatNumber(timesFound ?? 0)}`;
}

/** First `rows` of Still-in-the-dark `?` tiles vs the 360 tab bar. */
export function logItemsMissingRowsVsTab({ foundCount = 6, rows = 2 } = {}) {
  const C = LOG_ITEMS_360;
  const tabTop = C.viewportH - C.tabbarH;
  const foundRows = Math.max(0, Math.ceil(foundCount / C.foundCols));
  const foundGridH = foundRows === 0
    ? 0
    : foundRows * C.foundTileH + Math.max(0, foundRows - 1) * C.foundGap;
  let y = C.topbarH + C.screenPadTop;
  y += C.headH + C.screenGap;
  y += C.navH + C.screenGap;
  y += C.foundHeadH + C.screenGap;
  y += foundGridH + C.screenGap;
  y += C.missingHeadH + C.screenGap;
  const missingTop = y;
  const line = [];
  for (let i = 0; i < rows; i++) {
    const top = missingTop + i * (C.missingTileH + C.missingGap);
    const bottom = top + C.missingTileH;
    line.push({ top, bottom, index: i + 1 });
  }
  const row2 = line[1] ?? line[0];
  return {
    tabTop,
    missingTop,
    rows: line,
    row2Bottom: row2?.bottom ?? missingTop,
    fits: line.length > 0 && line.every((r) => r.bottom < tabTop),
  };
}

export function renderAlmanacScreen(ctx) {
  const view = ctx.almanacView?.() ?? 'overview';
  if (view === 'stars') return renderStars(ctx);
  if (view === 'achievements') return renderAchievements(ctx);
  if (view === 'stats') return renderStats(ctx);
  if (view === 'dailies') return renderDailies(ctx);
  if (view === 'log') return renderLog(ctx);
  if (view === 'log-skills') return renderLogSkills(ctx);
  if (view === 'log-mastery') return renderLogMastery(ctx);
  if (view === 'log-items') return renderLogItems(ctx);
  if (view === 'log-feats') return renderLogFeats(ctx);
  return renderOverview(ctx);
}

function navCurrent(view) {
  if (view === 'overview' || view === 'log' || view === 'stats' || String(view).startsWith('log-')) {
    return 'overview';
  }
  return view;
}

function subnav(ctx, current) {
  const tabs = [
    ['overview', 'Log'],
    ['stars', 'Stars'],
    ['dailies', 'Embers'],
    ['achievements', 'Feats'],
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
  const logCats = logCategoryStats(state);
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
    subnav(ctx, navCurrent('overview')),
    el('div', { class: 'complete-hero' },
      el('span', { class: 'complete-pct' }, tot.label),
      el('span', { class: 'complete-label' }, 'total completion'),
      el('div', { class: 'complete-bar bar bar-lg' },
        el('span', { class: 'bar-fill', style: `width:${(tot.pct * 100).toFixed(1)}%` })),
      el('p', { class: 'muted small' },
        logCats.map((c) => `${c.name} ${formatCompletionPct(c.pct)}`).join(' · '))),
    el('div', { class: 'want-list' },
      perk ? wantRow('Next star', perk.name, `${perk.cost} Radiance`, () => ctx.openAlmanac('stars')) : null,
      next ? wantRow('Next feat', next.name, next.desc, () => ctx.openAlmanac('achievements')) : null,
      wantRow('Daily embers', 'Three tasks, one reroll', 'No streak. No punishment.', () => ctx.openAlmanac('dailies')),
      wantRow('Statistics', 'Playtime, sells, titles', 'Honest counts. Nothing hidden.', () => ctx.openAlmanac('stats'))),
    el('h2', { class: 'section-title' }, 'Completion log'),
    el('div', { class: 'cat-list' },
      logCats.map((c) => el('button', {
        class: 'cat-row',
        dataset: { logBucket: c.id },
        'data-log-bucket': c.id,
        onclick: () => ctx.openAlmanac(`log-${c.id}`),
      },
        el('span', { class: 'cat-name' }, c.name),
        el('span', { class: 'cat-pct' }, `${formatCompletionPct(c.pct)} · ${c.done}/${c.total}`),
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
    subnav(ctx, navCurrent('stats')),
    el('button', {
      class: 'btn btn-ghost btn-wide log-back',
      onclick: () => ctx.openAlmanac('overview'),
      'aria-label': 'Back to Almanac log',
    }, '← Log'),
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
  const worn = ctx.state.cosmetics?.activeTitle;
  const selected = titles.includes(worn) ? worn : titles[0];
  const picker = el('select', {
    id: 'title-select',
    class: 'title-select',
    'aria-label': 'Titles',
    'aria-labelledby': 'title-pick-heading',
    onchange: (e) => ctx.equipTitle(e.target.value),
  }, titles.map((t) => el('option', {
    value: t,
    selected: t === selected,
  }, t)));
  picker.value = selected;
  return el('div', { class: 'title-pick' },
    el('h2', { class: 'section-title', id: 'title-pick-heading' }, 'Titles'),
    el('div', { class: 'title-pick-control' }, picker));
}

function formatStat(value, kind) {
  if (kind === 'duration') return formatDuration(value);
  if (kind === 'lumen') return `✦${formatNumber(value)}`;
  return formatNumber(value);
}

function taskIdKey(tasks) {
  return (tasks ?? []).map((t) => t.id).join('\0');
}

function renderDailies(ctx) {
  ctx.ensureDailies?.();
  const list = el('div', { class: 'daily-list' });
  const daySub = el('p', { class: 'screen-sub' }, '');
  const rerollBtn = el('button', {
    class: 'btn btn-wide btn-ghost daily-reroll',
    onclick: () => ctx.rerollDailies(),
  }, '');

  const root = el('section', { class: 'screen almanac' },
    el('header', { class: 'screen-head' },
      el('h1', { class: 'screen-title' }, 'Daily embers'),
      daySub),
    subnav(ctx, 'dailies'),
    el('p', { class: 'muted' },
      'Miss a day and nothing breaks. Tomorrow’s stars are simply different.'),
    list,
    rerollBtn);

  /** @type {Array<{ node: object, update: () => void, taskId: string }>} */
  let cards = [];
  let mountedKey = null;

  function syncCards(tasks) {
    const want = tasks ?? [];
    const key = taskIdKey(want);
    if (key === mountedKey) {
      for (const c of cards) c.update();
      return;
    }
    const byId = new Map(cards.map((c) => [c.taskId, c]));
    clear(list);
    cards = want.map((t) => {
      const existing = byId.get(t.id);
      if (existing) {
        existing.update();
        list.append(existing.node);
        return existing;
      }
      const created = dailyCard(ctx, t.id);
      list.append(created.node);
      return created;
    });
    mountedKey = key;
  }

  function paintReroll() {
    const ok = canReroll(ctx.state);
    rerollBtn.className = `btn btn-wide daily-reroll ${ok ? 'btn-ghost' : 'btn-ghost btn-disabled'}`;
    rerollBtn.textContent = ok ? 'Reroll once' : 'Already rerolled today';
    if (ok) rerollBtn.removeAttribute('disabled');
    else rerollBtn.setAttribute('disabled', 'true');
    rerollBtn.setAttribute('aria-disabled', ok ? 'false' : 'true');
  }

  function paint() {
    ctx.ensureDailies?.();
    const live = ctx.state.dailies;
    daySub.textContent = live?.dayKey
      ? `Offering for ${live.dayKey} (UTC)`
      : 'Three tasks. One reroll. No streak.';
    syncCards(live?.tasks);
    paintReroll();
  }
  paint();

  return { node: root, update: paint };
}

function dailyCard(ctx, taskId) {
  const title = el('h3', { class: 'perk-name' }, '');
  const hint = el('p', { class: 'muted' }, '');
  const progress = el('span', { class: 'daily-progress' }, '');
  const rewardChip = el('span', { class: 'chip chip-gold' }, '');
  const fill = el('span', { class: 'bar-fill', style: 'width:0%' });
  const btn = el('button', {
    class: 'btn btn-wide daily-claim',
    dataset: { emberId: taskId },
    'data-ember-id': taskId,
    onclick: () => {
      const slot = ctx.state.dailies?.tasks?.find((t) => t.id === taskId);
      if (!slot || slot.claimed) return;
      const p = taskProgress(ctx.state, slot);
      if (p.done) ctx.claimDaily(taskId);
    },
  }, '');
  const card = el('article', {
    class: 'card daily-card',
    dataset: { emberId: taskId },
    'data-ember-id': taskId,
  },
    title,
    hint,
    el('div', { class: 'xp-block' },
      el('div', { class: 'xp-line' }, progress, rewardChip),
      el('div', { class: 'bar' }, fill)),
    btn);

  function update() {
    const slot = ctx.state.dailies?.tasks?.find((t) => t.id === taskId);
    if (!slot) return;
    const def = DAILY_POOL_BY_ID[slot.id];
    const p = taskProgress(ctx.state, slot);
    const claimed = !!slot.claimed;
    const ready = !claimed && p.done;
    const idle = !claimed && !p.done;
    title.textContent = def?.label ?? slot.id;
    hint.textContent = def?.hint ?? '';
    progress.textContent = `${p.current} / ${p.need}`;
    rewardChip.textContent = `${slot.reward} Radiance`;
    fill.style.width = `${((p.need ? p.current / p.need : 0) * 100).toFixed(1)}%`;
    card.className = `card daily-card ${claimed ? 'daily-claimed' : ready ? 'daily-ready' : ''}`;
    btn.className = `btn btn-wide daily-claim ${claimed ? 'btn-ghost btn-disabled' : ready ? 'btn-primary' : 'btn-ghost btn-disabled'}`;
    btn.textContent = claimed ? 'Claimed' : ready ? 'Claim sparks' : 'In progress';
    if (claimed || idle) {
      btn.setAttribute('disabled', 'true');
      btn.setAttribute('aria-disabled', 'true');
    } else {
      btn.removeAttribute('disabled');
      btn.setAttribute('aria-disabled', 'false');
    }
  }
  update();
  return { node: card, update, btn, taskId };
}

function logHero(ctx, bucketId, title, blurb) {
  const row = logCategoryStats(ctx.state).find((c) => c.id === bucketId);
  const pctLabel = row ? formatCompletionPct(row.pct) : '0%';
  return [
    el('header', { class: 'screen-head' },
      el('h1', { class: 'screen-title' }, title),
      el('p', { class: 'screen-sub' },
        row ? `${pctLabel} · ${row.done}/${row.total} — ${blurb}` : blurb)),
    subnav(ctx, navCurrent(`log-${bucketId}`)),
    el('button', {
      class: 'btn btn-ghost btn-wide log-back',
      onclick: () => ctx.openAlmanac('overview'),
    }, '← Completion log'),
  ];
}

function mysteryMark() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.2 2.4c-.7.4-1.3.8-1.3 1.7V14"/><circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none"/></svg>';
}

function logTile({
  id, name, glyph, done = 0, total = 99, frac, mystery = false, locked = false,
  timesFound, onInspect,
}) {
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  const timesLabel = timesFound != null ? formatLogTimesFound(timesFound) : null;
  const fracText = mystery ? '?' : locked ? 'Locked' : (timesLabel ?? frac ?? `${done}/${total}`);
  const label = mystery ? '?' : name;
  const aria = mystery ? 'Unknown item'
    : timesFound != null ? `${name}, found ${timesLabel}`
    : `${name}, ${fracText}`;
  const known = timesFound != null;
  const inspectable = known && typeof onInspect === 'function';
  return el(inspectable ? 'button' : 'div', {
    type: inspectable ? 'button' : undefined,
    class: `log-tile${mystery ? ' log-tile-mystery' : ''}${locked ? ' log-tile-locked' : ''}${known ? ' log-tile-known' : ''}`,
    dataset: { logRow: id, ...(known ? { timesFound: String(timesFound) } : {}) },
    'data-log-row': id,
    ...(known ? { 'data-times-found': String(timesFound) } : {}),
    'aria-label': aria,
    onclick: inspectable ? () => onInspect(id) : undefined,
  },
    el('span', { class: 'log-tile-icon', html: mystery ? mysteryMark() : icon(glyph ?? 'star') }),
    el('span', { class: 'log-tile-name' }, label),
    el('span', { class: `log-tile-frac${known ? ' log-tile-times' : ''}` }, fracText),
    mystery || locked || known ? null : el('span', { class: 'bar bar-mini cat-bar' },
      el('span', { class: 'bar-fill', style: `width:${(pct * 100).toFixed(1)}%` })));
}

function renderLogSkills(ctx) {
  const rows = skillLogDetails(ctx.state);
  return {
    node: el('section', { class: 'screen almanac' },
      ...logHero(ctx, 'skills', 'Skills', 'each live craft toward 99'),
      el('div', { class: 'log-tile-grid', 'data-log-drill': 'skills' },
        rows.map((r) => logTile({
          id: r.id,
          name: r.name,
          glyph: r.glyph ?? SKILL_BY_ID[r.id]?.glyph,
          done: r.done,
          total: r.total,
          locked: r.locked,
        })))),
    update: () => {},
  };
}

function renderLogMastery(ctx) {
  const rows = masteryLogDetails(ctx.state);
  return {
    node: el('section', { class: 'screen almanac' },
      ...logHero(ctx, 'mastery', 'Mastery', 'per-action practice to 99'),
      el('div', { class: 'log-tile-grid', 'data-log-drill': 'mastery' },
        rows.map((r) => logTile({
          id: r.id,
          name: r.name,
          glyph: r.glyph,
          done: r.done,
          total: r.total,
        })))),
    update: () => {},
  };
}

function renderLogItems(ctx) {
  const { found, missing } = itemsLogDetails(ctx.state);
  const tot = trueCompletion(ctx.state);
  const foundBlock = found.length
    ? el('div', { class: 'log-tile-grid', 'data-log-drill': 'items-found' },
      found.map((r) => logTile({
        id: r.id,
        name: r.name,
        glyph: itemGlyph(ITEMS_BY_ID[r.id]),
        done: 1,
        total: 1,
        timesFound: r.timesFound,
        onInspect: (id) => ctx.openSellSheet?.(id),
      })))
    : el('div', { class: 'empty-state log-items-empty' },
      el('span', { class: 'empty-icon', html: icon('book') }),
      el('h2', { class: 'empty-title' }, 'Nothing found in play'),
      el('p', { class: 'empty-text' },
        'Times Found writes the line. Gather, hunt, or buy — dumping a stack never un-knows it.'));
  const missingBlock = missing.length
    ? el('div', { class: 'log-tile-grid log-missing', 'data-log-drill': 'items-missing' },
      missing.map((r) => logTile({
        id: r.id,
        name: r.name,
        mystery: true,
        done: 0,
        total: 1,
      })))
    : el('p', { class: 'footnote muted' }, 'Every name in the book is lit.');

  return {
    node: el('section', { class: 'screen almanac log-items' },
      el('header', { class: 'screen-head log-items-head' },
        el('button', {
          class: 'btn btn-ghost log-back',
          onclick: () => ctx.openAlmanac('overview'),
          'aria-label': 'Back to completion log',
        }, '←'),
        el('h1', { class: 'screen-title' }, 'Items'),
        el('p', { class: 'screen-sub' },
          el('span', { class: 'true-complete-pct', 'data-true-complete': 'items' }, tot.label),
          ` · ${tot.done}/${tot.total}`)),
      subnav(ctx, navCurrent('log-items')),
      el('h2', { class: 'section-title' }, `Found · ${found.length}`),
      foundBlock,
      el('h2', { class: 'section-title' }, `Still in the dark · ${missing.length}`),
      missingBlock),
    update: () => {},
  };
}

function renderLogFeats(ctx) {
  const { state } = ctx;
  const listAll = logFeatAchievements();
  const root = el('section', { class: 'screen almanac' },
    ...logHero(ctx, 'feats', 'Feats', 'lit names in the book — visits do not pad this mean'),
    el('p', { class: 'muted small' },
      'Opening a page is remembered on the Feats tab. It does not raise this book.'));

  for (const cat of ACHIEVEMENT_CATEGORIES) {
    const list = listAll.filter((a) => a.category === cat.id);
    if (!list.length) continue;
    const done = list.filter((a) => isUnlocked(state, a.id)).length;
    root.append(el('h2', { class: 'section-title' }, `${cat.name} · ${done}/${list.length}`));
    const wrap = el('div', { class: 'feat-list log-feat-grid', 'data-log-drill': `feats-${cat.id}` });
    for (const a of list) {
      const on = isUnlocked(state, a.id);
      wrap.append(el('article', {
        class: `card feat-card ${on ? 'feat-on' : ''}`,
        dataset: { logRow: a.id },
        'data-log-row': a.id,
      },
        el('div', { class: 'feat-head' },
          el('h3', { class: 'feat-name' }, a.name),
          el('span', { class: `chip ${on ? 'chip-gold' : ''}` }, on ? 'Lit' : 'Dark')),
        el('p', { class: 'muted' }, a.desc)));
    }
    root.append(wrap);
  }
  return { node: root, update: () => {} };
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
