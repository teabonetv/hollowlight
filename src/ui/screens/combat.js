// Combat surface: zone list, hunt cards, live fight (HP, timers, styles,
// eat/oil, log), vigils, death-site recovery. Mobile-first; every control
// is a ≥44px tap. No hover-only info.

import { el, clear } from '../dom.js';
import { icon } from '../icons.js';
import { formatNumber, formatSeconds } from '../../core/format.js';
import { ZONES, ZONE_BY_ID } from '../../game/data/combat/zones.js';
import { STYLES, STYLE_BY_ID } from '../../game/data/combat/styles.js';
import { FOOD, FOOD_ORDER, OILS } from '../../game/data/combat/consumables.js';
import { VIGIL_CATEGORY_BY_ID, VIGIL_TIER_BY_N } from '../../game/data/combat/vigils.js';
import { enemiesInZone, bossOfZone } from '../../game/data/enemies/index.js';
import { bankCount } from '../../game/systems/bank.js';
import * as combat from '../../game/systems/combat.js';

export function renderCombatPanel(ctx) {
  combat.ensureCombat(ctx.state);
  const root = el('div', { class: 'combat-root' });
  const refs = { paint: () => {} };

  function paint() {
    clear(root);
    const st = combat.combatStatus(ctx.state);
    if (st.fighting) root.append(buildFight(ctx, st, paint));
    else root.append(buildHub(ctx, st, paint));
  }
  let wasFighting = !!ctx.state.combat?.fighting;
  refs.paint = paint;
  paint();

  return {
    node: root,
    update() {
      const fighting = !!ctx.state.combat?.fighting;
      if (fighting || wasFighting) paint();
      wasFighting = fighting;
    },
  };
}

function buildHub(ctx, st, paint) {
  const wrap = el('div', { class: 'combat-hub' });

  wrap.append(el('p', { class: 'combat-intro muted' },
    'Strike, Shot, or Rite — pick a stretch, keep the lantern fed, and do not let the pale-things finish a sentence.'));

  wrap.append(soulsLine(st));
  wrap.append(deathBanner(ctx, st, paint));
  wrap.append(vigilCard(ctx, st, paint));

  const zoneId = ctx.state.combat.zoneId || 'hearthway';
  wrap.append(zonePicker(ctx, zoneId, paint));
  wrap.append(zoneBody(ctx, zoneId, paint));
  return wrap;
}

function soulsLine(st) {
  return el('div', { class: 'combat-meta' },
    el('span', { class: 'chip chip-gold' }, `${formatNumber(st.souls)} souls`),
    el('span', { class: 'chip' }, st.lanternDry ? 'lantern dry' : 'lantern ready'));
}

function deathBanner(ctx, st, paint) {
  const zoneId = ctx.state.combat.zoneId || 'hearthway';
  const here = combat.deathPileAt(ctx.state, zoneId);
  const site = st.deathSite;
  if (!here && !site) return null;

  const box = el('div', { class: 'card combat-death' });
  if (here > 0) {
    box.append(
      el('h3', { class: 'track-name' }, 'Spilled Lumen'),
      el('p', { class: 'action-desc' },
        `✦${formatNumber(here)} lies on this stretch where you fell. Nothing permanent was taken — walk it back into your pocket.`),
      el('button', {
        class: 'btn btn-primary btn-wide',
        onclick: () => {
          const res = ctx.recoverLumen(zoneId);
          if (!res.ok) ctx.toast(res.error, 'warn');
          else ctx.toast(`Recovered ✦${res.gained}.`, 'success');
          paint();
        },
      }, `Gather ✦${formatNumber(here)}`),
    );
  } else if (site) {
    const name = ZONE_BY_ID[site.zoneId]?.settlement ?? site.zoneId;
    box.append(
      el('h3', { class: 'track-name' }, 'Spilled Lumen'),
      el('p', { class: 'action-desc' },
        `✦${formatNumber(site.lumen)} waits at ${name}. Open that stretch to gather it.`),
    );
  }
  return box;
}

function vigilCard(ctx, st, paint) {
  const v = st.vigils.current;
  const card = el('article', { class: 'card vigil-card' },
    el('div', { class: 'action-head' },
      el('h2', { class: 'action-name' }, 'Vigil'),
      el('span', { class: 'mastery-badge' },
        v ? `Tier ${v.tier}` : `Next tier ${st.vigils.nextTier}`)));

  if (v) {
    const cat = VIGIL_CATEGORY_BY_ID[v.category];
    const spec = VIGIL_TIER_BY_N[v.tier];
    card.append(
      el('p', { class: 'action-desc' },
        `Sworn against ${cat?.name ?? v.category}. ${v.kills} / ${v.required} fallen.`),
      el('div', { class: 'bar bar-lg', role: 'progressbar' },
        el('span', { class: 'bar-fill', style: `width:${Math.min(100, (v.kills / v.required) * 100).toFixed(1)}%` })),
      spec ? el('p', { class: 'muted small' },
        `Completion: ✦${spec.lumen}, ${spec.souls} souls, ${spec.xp} Combat XP.`) : null,
    );
  } else {
    card.append(
      el('p', { class: 'action-desc' },
        'A sworn hunt. The first Vigil names pale-things on the Hearthway fog-line — later tiers ask more, and pay more.'),
      el('button', {
        class: 'btn btn-primary btn-wide',
        onclick: () => {
          const res = ctx.assignVigil();
          if (!res.ok) ctx.toast(res.error, 'warn');
          else {
            const cat = VIGIL_CATEGORY_BY_ID[res.vigil.category];
            ctx.toast(`Vigil sworn: ${cat?.name ?? res.vigil.category}.`, 'success');
          }
          paint();
        },
      }, 'Swear a Vigil'),
    );
  }
  return card;
}

function zonePicker(ctx, zoneId, paint) {
  const list = el('div', { class: 'zone-chips' });
  for (const z of ZONES) {
    const unlock = combat.zoneUnlock(ctx.state, z.id);
    const btn = el('button', {
      class: `chip-btn ${z.id === zoneId ? 'on' : ''} ${unlock.ok ? '' : 'locked'}`,
      onclick: () => {
        ctx.state.combat.zoneId = z.id;
        paint();
      },
    }, z.settlement);
    list.append(btn);
  }
  return el('div', {},
    el('h2', { class: 'section-title combat-h' }, 'Stretches'),
    el('p', { class: 'section-sub muted' }, 'Twelve beacons. Only Hearthway is kindled.'),
    list);
}

function zoneBody(ctx, zoneId, paint) {
  const z = ZONE_BY_ID[zoneId];
  const unlock = combat.zoneUnlock(ctx.state, zoneId);
  const wrap = el('div', { class: 'zone-body' });
  wrap.append(
    el('h3', { class: 'track-name' }, z.stretch),
    el('p', { class: 'action-desc' }, z.flavor),
    el('p', { class: 'muted small' },
      `Requires Combat ${z.levelReq}${z.kindled ? '' : ' · kindled beacon'}.`),
  );

  if (!unlock.ok) {
    wrap.append(el('div', { class: 'empty-state' },
      el('span', { class: 'empty-icon', html: icon('sword') }),
      el('h2', { class: 'empty-title' }, 'Unkindled'),
      el('p', { class: 'empty-text' }, unlock.reason)));
    return wrap;
  }

  const stretch = combat.ensureCombat(ctx.state).stretchKills[zoneId] ?? 0;
  const boss = bossOfZone(zoneId);
  wrap.append(el('p', { class: 'muted small' },
    boss
      ? (combat.guardianStirred(ctx.state, zoneId)
        ? `${boss.name} will stand.`
        : `${boss.name} stirs after ${boss.stirKills} kills on this stretch (${stretch}/${boss.stirKills}).`)
      : ''));

  const list = el('div', { class: 'hunt-list' });
  for (const enemy of enemiesInZone(zoneId)) {
    list.append(huntCard(ctx, enemy, paint));
  }
  wrap.append(list);
  return wrap;
}

function huntCard(ctx, enemy, paint) {
  const lockedBoss = enemy.boss && !combat.guardianStirred(ctx.state, enemy.zoneId);
  const kills = ctx.state.combat.kills[enemy.id] ?? 0;
  const btnLabel = lockedBoss
    ? `Locked · ${enemy.stirKills} kills`
    : enemy.boss ? 'Challenge' : 'Hunt';

  const start = () => {
    if (lockedBoss) {
      ctx.toast(`${enemy.name} will not face a stranger yet.`, 'info');
      return;
    }
    const res = ctx.startFight(enemy.id);
    if (!res.ok) ctx.toast(res.error, 'warn');
    paint();
  };

  return el('article', { class: `card hunt-card ${enemy.boss ? 'boss-card' : ''}` },
    el('div', { class: 'action-head' },
      el('h2', { class: 'action-name' }, enemy.name),
      el('span', { class: 'mastery-badge' }, enemy.boss ? 'Guardian' : enemy.category)),
    el('p', { class: 'action-desc' }, enemy.flavor),
    el('div', { class: 'chips' },
      el('span', { class: 'chip' }, `${enemy.hp} HP`),
      el('span', { class: 'chip' }, `${formatSeconds(enemy.speedMs)} / blow`),
      el('span', { class: 'chip chip-xp' }, `${enemy.xp} XP`),
      el('span', { class: 'chip chip-gold' }, `${enemy.souls} souls`),
      el('span', { class: 'chip' }, `weak to ${STYLE_BY_ID[enemy.weakness]?.name ?? enemy.weakness}`),
      el('span', { class: 'chip' }, `resists ${STYLE_BY_ID[enemy.resist]?.name ?? enemy.resist}`),
      kills ? el('span', { class: 'chip' }, `${kills} slain`) : null),
    el('button', {
      class: `btn btn-wide ${lockedBoss ? 'btn-ghost btn-disabled' : 'btn-primary'}`,
      onclick: start,
      'aria-disabled': lockedBoss ? 'true' : 'false',
    }, btnLabel));
}

function buildFight(ctx, st, paint) {
  const enemy = st.enemy;
  const foe = st.foe;
  const wrap = el('div', { class: 'combat-fight' });

  wrap.append(el('p', { class: 'muted small' },
    `${ZONE_BY_ID[st.zoneId]?.settlement ?? ''} · seed ${ctx.state.combat.encounterSeed}`));

  wrap.append(fighterBlock({
    title: 'You',
    sub: `${STYLE_BY_ID[st.style]?.name ?? st.style} · ${formatSeconds(st.playerSpeedMs)} / blow`,
    hp: st.playerHp,
    max: st.playerMaxHp,
    next: st.playerNextMs,
    speed: st.playerSpeedMs,
    fillClass: 'hp-you',
  }));

  wrap.append(fighterBlock({
    title: foe?.name ?? 'Foe',
    sub: enemy
      ? `${st.phase?.phase?.name ? st.phase.phase.name + ' · ' : ''}${STYLE_BY_ID[enemy.style]?.name ?? ''} · weak to ${STYLE_BY_ID[enemy.weakness]?.name ?? ''}`
      : '',
    hp: foe?.hp ?? 0,
    max: foe?.maxHp ?? 1,
    next: foe?.nextActMs ?? 0,
    speed: enemy ? combat.foeSpeedMs(enemy, st.phase?.phase) : 1,
    fillClass: 'hp-foe',
  }));

  wrap.append(el('p', { class: `oil-line ${st.lanternDry ? 'danger' : 'muted'}` },
    st.lanternDry
      ? 'Lantern dry — the fog bites. Drink oil or fall back.'
      : `Lantern fed · next sip in ${formatSeconds(st.oilMs)}`));

  const styles = el('div', { class: 'style-row' });
  for (const s of STYLES) {
    styles.append(el('button', {
      class: `btn style-btn ${st.style === s.id ? 'btn-primary on' : 'btn-ghost'}`,
      onclick: () => { ctx.setCombatStyle(s.id); paint(); },
      'aria-pressed': st.style === s.id ? 'true' : 'false',
    }, s.name));
  }
  wrap.append(styles);

  wrap.append(eatRow(ctx, st, paint));

  const keep = el('label', { class: 'auto-toggle combat-keep' });
  const input = el('input', { type: 'checkbox' });
  input.checked = st.autoContinue;
  keep.append(input, el('span', { class: 'switch' }), el('span', { class: 'auto-text' }, 'Keep hunting this foe'));
  keep.addEventListener('click', (e) => {
    e.preventDefault();
    ctx.state.combat.autoContinue = !ctx.state.combat.autoContinue;
    paint();
  });
  wrap.append(keep);

  wrap.append(el('button', {
    class: 'btn btn-stop btn-wide',
    onclick: () => { ctx.fleeFight(); paint(); },
  }, 'Fall back'));

  wrap.append(el('p', { class: 'muted small' },
    'Auto-eat and auto-brew will arrive with a later camp purchase. Until then, eat with your own hand.'));

  wrap.append(logPanel(st.log));
  return wrap;
}

function fighterBlock({ title, sub, hp, max, next, speed, fillClass }) {
  const frac = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  const tFrac = speed > 0 ? Math.max(0, Math.min(1, 1 - next / speed)) : 0;
  return el('div', { class: 'fighter' },
    el('div', { class: 'fighter-head' },
      el('strong', {}, title),
      el('span', { class: 'muted' }, `${hp} / ${max}`)),
    el('p', { class: 'muted small' }, sub),
    el('div', { class: `bar bar-lg hp-bar`, role: 'progressbar', 'aria-label': `${title} vitality` },
      el('span', { class: `bar-fill ${fillClass}`, style: `width:${(frac * 100).toFixed(1)}%` })),
    el('div', { class: 'action-barline' },
      el('div', { class: 'bar', role: 'progressbar', 'aria-label': `${title} next blow` },
        el('span', { class: 'bar-fill atk-fill', style: `width:${(tFrac * 100).toFixed(1)}%` })),
      el('span', { class: 'bar-time' }, next > 0 ? formatSeconds(next) : 'now')));
}

function eatRow(ctx, st, paint) {
  const row = el('div', { class: 'eat-row' });
  for (const id of FOOD_ORDER) {
    const n = bankCount(ctx.state.bank, id);
    const food = FOOD[id];
    row.append(el('button', {
      class: `btn ${n > 0 && st.playerHp < st.playerMaxHp ? 'btn-primary' : 'btn-ghost'} eat-btn`,
      onclick: () => {
        const res = ctx.eatFood(id);
        if (!res.ok) ctx.toast(res.error, 'warn');
        paint();
      },
    }, `${food.name} +${food.heal} · ${n}`));
  }
  const oilN = OIL_ORDER_COUNT(ctx.state);
  row.append(el('span', { class: 'chip' }, `oil ×${oilN}`));
  return row;
}

function OIL_ORDER_COUNT(state) {
  let n = 0;
  for (const id of Object.keys(OILS)) n += bankCount(state.bank, id);
  return n;
}

function logPanel(log) {
  const lines = [...(log ?? [])].slice(-12).reverse();
  const box = el('div', { class: 'combat-log', 'aria-label': 'Combat log' });
  if (!lines.length) {
    box.append(el('p', { class: 'muted' }, 'The fog holds its breath.'));
    return el('div', {}, el('h3', { class: 'log-h' }, 'Log'), box);
  }
  for (const line of lines) {
    box.append(el('p', { class: `log-line log-${line.kind ?? 'info'}` }, line.text));
  }
  return el('div', {}, el('h3', { class: 'log-h' }, 'Log'), box);
}
