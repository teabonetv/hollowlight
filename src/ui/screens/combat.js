// Combat surface: zone list, hunt cards, live fight (HP, timers, styles,
// eat/oil, log), vigils, death-site recovery. Mobile-first; every control
// is a ≥44px tap. No hover-only info.

import { el, clear } from '../dom.js';
import { icon } from '../icons.js';
import { formatNumber, formatSeconds, formatNoun } from '../../core/format.js';
import { ZONES, ZONE_BY_ID } from '../../game/data/combat/zones.js';
import { STYLES, STYLE_BY_ID } from '../../game/data/combat/styles.js';
import { FOOD } from '../../game/data/combat/consumables.js';
import { VIGIL_CATEGORY_BY_ID, VIGIL_TIER_BY_N } from '../../game/data/combat/vigils.js';
import { ITEMS_BY_ID } from '../../game/data/items.js';
import { enemiesInZone, bossOfZone, ENEMIES_BY_ID } from '../../game/data/enemies/index.js';
import { bankCount } from '../../game/systems/bank.js';
import * as combat from '../../game/systems/combat.js';

/** Zero #screen and fight-adjacent scrollers so the cockpit is the first 360 frame. */
export function resetHuntScrollers(root) {
  const zero = (node) => {
    if (!node) return;
    if (typeof node.scrollTop === 'number') node.scrollTop = 0;
    if (typeof node.scrollLeft === 'number') node.scrollLeft = 0;
  };
  const doc = typeof document !== 'undefined' ? document : null;
  const screen = doc?.getElementById?.('screen') ?? null;
  zero(screen);
  const take = (list) => {
    if (!list) return;
    for (const n of list) zero(n);
  };
  try { take(doc?.querySelectorAll?.('.combat-log')); } catch { /* shim */ }
  try { take(doc?.querySelectorAll?.('.zone-chips')); } catch { /* shim */ }
  try { take(screen?.querySelectorAll?.('.combat-log')); } catch { /* shim */ }
  try { take(screen?.querySelectorAll?.('.zone-chips')); } catch { /* shim */ }
  try { take(root?.querySelectorAll?.('.combat-log')); } catch { /* shim */ }
  try { take(root?.querySelectorAll?.('.zone-chips')); } catch { /* shim */ }
}

export function renderCombatPanel(ctx) {
  combat.ensureCombat(ctx.state);
  const root = el('div', { class: 'combat-root' });
  let wasFighting = false;

  function paint() {
    const st = combat.combatStatus(ctx.state);
    const enteringFight = !!st.fighting && !wasFighting;
    const leavingFight = !st.fighting && wasFighting;
    clear(root);
    // Do not resumeCombat() here — reload pause must stay visible until Resume.
    if (st.fighting) root.append(buildFight(ctx, st, paint));
    else root.append(buildHub(ctx, st, paint));
    if (enteringFight || leavingFight) resetHuntScrollers(root);
    wasFighting = !!st.fighting;
  }
  paint();

  return {
    node: root,
    update() {
      const fighting = !!ctx.state.combat?.fighting;
      if (fighting || wasFighting) paint();
    },
  };
}

function buildHub(ctx, st, paint) {
  const wrap = el('div', { class: 'combat-hub' });
  const leftover = leftoverStation(ctx, st, paint);
  if (leftover) wrap.append(leftover);
  else wrap.append(el('p', { class: 'combat-intro muted' },
    'Strike, Shot, or Rite — pick a stretch, keep the lantern fed, and do not let the pale-things finish a sentence.'));

  if (!leftover) wrap.append(soulsLine(ctx, st));
  const spilled = deathBanner(ctx, st, paint);
  if (spilled) wrap.append(spilled);
  wrap.append(vigilCard(ctx, st, paint));
  if (!leftover) wrap.append(handSlot(ctx, st, paint));

  const zoneId = ctx.state.combat.zoneId || 'hearthway';
  wrap.append(zonePicker(ctx, zoneId, paint));
  wrap.append(zoneBody(ctx, zoneId, paint));
  return wrap;
}

function chipRow(className, chips) {
  const parts = chips.filter(Boolean);
  const row = el('div', { class: className });
  parts.forEach((chip, i) => {
    if (i) row.append(el('span', { class: 'chip-sep', 'aria-hidden': 'true' }, ' · '));
    row.append(chip);
  });
  return row;
}

function rangeLabel(min, max) {
  if (min == null || max == null) return '—';
  return `${min}–${max}`;
}

function clockLabel(ms) {
  if (ms == null || !Number.isFinite(ms)) return '';
  return formatSeconds(ms);
}

function accStation(kit, extraClass = '', clocks = {}) {
  const row = el('div', { class: `acc-station fight-cockpit ${extraClass}`.trim() });
  if (!kit) {
    row.append(
      el('span', { class: 'chip acc-chip' }, 'Acc —'),
      el('span', { class: 'chip-sep', 'aria-hidden': 'true' }, ' / '),
      el('span', { class: 'chip they-chip' }, 'they —'),
    );
    return row;
  }
  const you = rangeLabel(kit.playerMinHit, kit.playerMaxHit);
  const they = rangeLabel(kit.foeMinHit, kit.foeMaxHit);
  const youClock = clockLabel(clocks.you ?? kit.playerSpeedMs);
  const theyClock = clockLabel(clocks.they ?? kit.foeSpeedMs);
  row.append(
    el('span', { class: 'chip acc-chip' }, `Acc ${kit.hitPct}% · ${you}${youClock ? ` · ${youClock}` : ''}`),
    el('span', { class: 'chip-sep', 'aria-hidden': 'true' }, ' / '),
    el('span', { class: 'chip they-chip' }, `they ${kit.foeHitPct}% · ${they}${theyClock ? ` · ${theyClock}` : ''}`),
  );
  return row;
}

function weaponToggleLabel(weapon) {
  if (!weapon) return 'Unarmed';
  if (weapon.id === 'wick-knife') return 'Knife';
  return ITEMS_BY_ID[weapon.id]?.name ?? weapon.id;
}

function handSlot(ctx, st, paint) {
  const held = combat.heldWeapon(ctx.state);
  const off = combat.playerOffense(ctx.state, st.style ?? ctx.state.combat.player.style);
  const owned = combat.ownedWeapons(ctx.state);
  const kit = st.cockpit ?? combat.fightCockpit(ctx.state);
  const card = el('article', { class: 'card weapon-card' },
    el('div', { class: 'action-head' },
      el('h2', { class: 'action-name' }, 'Hand'),
      el('span', { class: 'mastery-badge' }, held ? (ITEMS_BY_ID[held.id]?.name ?? held.id) : 'Unarmed')));

  card.append(el('p', { class: 'action-desc' },
    held
      ? `${ITEMS_BY_ID[held.id]?.name ?? held.id} — ${STYLE_BY_ID[held.style]?.name ?? held.style} ${held.minDmg}–${held.maxDmg} · ${formatSeconds(held.speedMs)} / blow · +${held.accuracy} acc.`
      : `Unarmed ${STYLE_BY_ID[st.style]?.name ?? st.style} ${off.minDmg}–${off.maxDmg} · ${formatSeconds(off.speedMs)} / blow.`));
  card.append(accStation(kit, 'kit-line'));

  if (held && held.style !== st.style) {
    card.append(el('p', { class: 'muted small' },
      `The ${ITEMS_BY_ID[held.id]?.name ?? 'weapon'} is a ${STYLE_BY_ID[held.style]?.name ?? held.style} tool. Shift style to use it, or you strike unarmed.`));
  }

  const row = el('div', { class: 'weapon-row' });
  const unarmedBtn = el('button', {
    class: `btn ${held ? 'btn-ghost' : 'btn-primary on'}`,
    onclick: () => {
      ctx.equipWeapon?.('unarmed');
      paint();
    },
  }, 'Unarmed');
  row.append(unarmedBtn);
  for (const w of owned) {
    const on = held?.id === w.id;
    row.append(el('button', {
      class: `btn ${on ? 'btn-primary on' : 'btn-ghost'}`,
      onclick: () => {
        ctx.equipWeapon?.(w.id);
        paint();
      },
    }, ITEMS_BY_ID[w.id]?.name ?? w.id));
  }
  if (!owned.length) {
    card.append(el('p', { class: 'muted small' }, 'No weapon in the bank. The wick-knife is a Strike, if you still hold it.'));
  }
  card.append(row);
  return card;
}

function soulsLine(ctx, st) {
  const sips = combat.oilSipsRemaining(ctx.state);
  const fed = combat.lanternIsFed(ctx.state);
  return chipRow('combat-meta chips', [
    el('span', { class: 'chip chip-gold' }, formatNoun(st.souls, 'soul')),
    el('span', { class: `chip ${fed ? '' : 'chip-warn'}` }, fed ? 'lantern ready' : 'lantern dry'),
    el('span', { class: `chip ${sips > 0 ? '' : 'chip-warn'}` }, formatNoun(sips, 'lantern sip')),
  ]);
}

function deathBanner(ctx, st, paint) {
  const zoneId = ctx.state.combat.zoneId || 'hearthway';
  const here = combat.deathPileAt(ctx.state, zoneId);
  const site = st.deathSite;
  const spilledHere = here > 0;
  const spilledElsewhere = !!(site && site.lumen > 0 && !spilledHere);
  if (!spilledHere && !spilledElsewhere) return null;

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
        `Sworn against ${cat?.name ?? v.category} on ${ZONE_BY_ID[v.zoneId]?.stretch ?? ZONE_BY_ID[ctx.state.combat.zoneId]?.stretch ?? 'this stretch'}. ${v.kills} / ${v.required} fallen.`),
      el('div', { class: 'bar bar-lg', role: 'progressbar' },
        el('span', { class: 'bar-fill', style: `width:${Math.min(100, (v.kills / v.required) * 100).toFixed(1)}%` })),
      spec ? el('p', { class: 'muted small' },
        `Completion: ✦${spec.lumen}, ${formatNoun(spec.souls, 'soul')}, ${spec.xp} Combat XP.`) : null,
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
  const sips = combat.oilSipsRemaining(ctx.state);
  const dry = sips <= 0;
  const blocked = lockedBoss || dry;
  const btnLabel = lockedBoss
    ? `Locked · ${enemy.stirKills} kills`
    : dry
      ? 'Need oil'
      : enemy.boss ? 'Challenge' : 'Hunt';

  const start = () => {
    if (lockedBoss) {
      ctx.toast(`${enemy.name} will not face a stranger yet.`, 'info');
      return;
    }
    if (dry) {
      ctx.toast('The lantern is dry — buy wick-oil at the stall before a stretch.', 'warn');
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
    chipRow('chips', [
      el('span', { class: 'chip' }, `${enemy.hp} HP`),
      el('span', { class: 'chip' }, `${formatSeconds(enemy.speedMs)} / blow`),
      el('span', { class: 'chip chip-xp' }, `${enemy.xp} XP`),
      el('span', { class: 'chip chip-gold' }, formatNoun(enemy.souls, 'soul')),
      el('span', { class: 'chip' }, `weak to ${STYLE_BY_ID[enemy.weakness]?.name ?? enemy.weakness}`),
      el('span', { class: 'chip' }, `resists ${STYLE_BY_ID[enemy.resist]?.name ?? enemy.resist}`),
      kills ? el('span', { class: 'chip' }, `${kills} slain`) : null,
      el('span', { class: `chip ${dry ? 'chip-warn' : ''}` }, `${formatNoun(sips, 'sip')} before Hunt`),
    ]),
    el('button', {
      class: `btn btn-wide ${blocked ? 'btn-ghost btn-disabled' : 'btn-primary'}`,
      onclick: start,
      'aria-disabled': blocked ? 'true' : 'false',
    }, btnLabel));
}

function lanternCopy(st, state) {
  const sips = st.oilSips ?? combat.oilSipsRemaining(state);
  if (!combat.lanternIsFed(state) || sips <= 0) {
    return 'Need oil — Lantern dry. The fog gathers.';
  }
  return `Lantern fed · ${formatNoun(sips, 'sip')} · next in ${formatSeconds(st.oilMs)}`;
}

function handRing(ctx) {
  const held = combat.heldWeapon(ctx.state);
  const owned = combat.ownedWeapons(ctx.state);
  const ring = [
    { id: 'unarmed', label: 'Unarmed' },
    ...owned.map((w) => ({
      id: w.id,
      label: w.id === (held?.id ?? null)
        ? (ITEMS_BY_ID[w.id]?.name ?? w.id)
        : weaponToggleLabel(w),
    })),
  ];
  const currentId = held?.id ?? 'unarmed';
  const idx = Math.max(0, ring.findIndex((o) => o.id === currentId));
  const selected = ring[idx];
  const alt = ring.length > 1 ? ring[(idx + 1) % ring.length] : null;
  return { selected, alt };
}

function handChip(ctx, st, paint) {
  const { selected, alt } = handRing(ctx);
  const row = el('div', { class: 'hand-chip' });
  const toggles = el('div', { class: 'hand-chip-toggles' });
  toggles.append(el('button', {
    class: 'btn btn-primary on',
    'aria-pressed': 'true',
    onclick: () => {},
  }, selected.label));
  if (alt) {
    toggles.append(el('button', {
      class: 'btn btn-ghost',
      'aria-pressed': 'false',
      onclick: () => {
        ctx.equipWeapon?.(alt.id);
        paint();
      },
    }, alt.label));
  }
  row.append(toggles);
  return row;
}

function styleRow(ctx, st, paint) {
  const styles = el('div', { class: 'style-row' });
  for (const s of STYLES) {
    styles.append(el('button', {
      class: `btn style-btn ${st.style === s.id ? 'btn-primary on' : 'btn-ghost'}`,
      onclick: () => { ctx.setCombatStyle(s.id); paint(); },
      'aria-pressed': st.style === s.id ? 'true' : 'false',
    }, s.name));
  }
  return styles;
}

function buildFight(ctx, st, paint) {
  const foe = st.foe;
  const wrap = el('div', { class: 'combat-fight' });

  if (st.paused) {
    wrap.append(el('div', { class: 'encounter-held' },
      el('p', { class: 'encounter-held-copy' }, 'Encounter held — same seed.'),
      el('button', {
        class: 'btn btn-primary',
        onclick: () => {
          if (ctx.resumeCombat) ctx.resumeCombat();
          else combat.resumeCombat(ctx.state);
          paint();
        },
      }, 'Resume')));
  }

  wrap.append(fighterBlock({
    title: 'You',
    hp: st.playerHp,
    max: st.playerMaxHp,
    fillClass: 'hp-you',
  }));

  wrap.append(fighterBlock({
    title: foe?.name ?? 'Foe',
    hp: foe?.hp ?? 0,
    max: foe?.maxHp ?? 1,
    fillClass: 'hp-foe',
  }));

  wrap.append(accStation(st.cockpit, '', {
    you: st.playerNextMs,
    they: foe?.nextActMs ?? 0,
  }));

  wrap.append(el('p', { class: `oil-line ${st.lanternFed ? 'muted' : 'danger'}` },
    lanternCopy(st, ctx.state)));

  wrap.append(eatRow(ctx, st, paint, { flee: true }));

  wrap.append(handChip(ctx, st, paint));

  wrap.append(styleRow(ctx, st, paint));

  const keep = el('label', { class: 'auto-toggle combat-keep' });
  const input = el('input', { type: 'checkbox' });
  input.checked = !!st.autoContinue;
  keep.append(input, el('span', { class: 'switch' }), el('span', { class: 'auto-text' }, 'Keep hunting this foe'));
  keep.addEventListener('click', (e) => {
    e.preventDefault();
    const next = !ctx.state.combat.autoContinue;
    if (ctx.setCombatAutoContinue) ctx.setCombatAutoContinue(next);
    else ctx.state.combat.autoContinue = next;
    paint();
  });
  wrap.append(keep);

  wrap.append(el('p', { class: 'muted small' },
    'Auto-eat and auto-brew will arrive with a later camp purchase. Until then, eat with your own hand.'));

  wrap.append(logPanel(st.log));
  return wrap;
}

function fighterBlock({ title, hp, max, fillClass, compact = false }) {
  const frac = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  return el('div', { class: `fighter ${compact ? 'fighter-compact' : ''}`.trim() },
    el('div', { class: 'fighter-head' },
      el('strong', {}, title),
      el('span', { class: 'muted' }, `${hp} / ${max}`)),
    el('div', { class: `bar bar-lg hp-bar`, role: 'progressbar', 'aria-label': `${title} vitality` },
      el('span', { class: `bar-fill ${fillClass}`, style: `width:${(frac * 100).toFixed(1)}%` })));
}

function eatRow(ctx, st, paint, { flee = false } = {}) {
  const row = el('div', { class: 'eat-row' });
  const id = combat.selectedFoodId(ctx.state);
  if (!id) {
    row.append(el('p', { class: 'muted small eat-empty' }, 'No food in the pack.'));
    if (flee) row.append(fleeButton(ctx, paint));
    return row;
  }
  const n = bankCount(ctx.state.bank, id);
  const food = FOOD[id];
  const heal = combat.foodHeal(id);
  const full = st.playerHp >= st.playerMaxHp;
  const owned = combat.ownedFoodIds(ctx.state);
  const label = `${food.name} +${heal} · ${n}`;
  const slot = el('div', { class: 'eat-slot' });
  if (owned.length > 1) {
    slot.append(el('button', {
      class: 'btn btn-ghost eat-pick',
      type: 'button',
      'aria-label': `Cycle food, ${food.name} +${heal}`,
      onclick: () => {
        if (ctx.cycleFood) ctx.cycleFood();
        else combat.cycleFood(ctx.state);
        paint();
      },
    }, label));
  } else {
    slot.append(el('span', { class: 'eat-pick eat-pick-solo' }, label));
  }
  slot.append(el('button', {
    class: `btn eat-btn ${full ? 'btn-ghost btn-disabled' : 'btn-primary'}`,
    'aria-disabled': full ? 'true' : 'false',
    onclick: () => {
      if (full) {
        ctx.toast?.('Already whole.', 'info');
        return;
      }
      const res = ctx.eatFood(id);
      if (!res.ok) ctx.toast(res.error, 'warn');
      paint();
    },
  }, 'Eat'));
  if (flee) slot.append(fleeButton(ctx, paint));
  row.append(slot);
  return row;
}

function fleeButton(ctx, paint) {
  return el('button', {
    class: 'btn btn-stop flee-btn',
    onclick: () => { ctx.fleeFight(); paint(); },
  }, 'Fall back');
}

function leftoverStation(ctx, st, paint) {
  const last = st.lastStation;
  if (!last) return null;
  const wrap = el('article', { class: 'card leftover-station', 'aria-label': 'After the hunt' });
  wrap.append(el('p', { class: 'leftover-kicker' }, combat.leftoverKicker(last)));
  wrap.append(fighterBlock({
    title: 'You',
    hp: st.playerHp,
    max: st.playerMaxHp,
    fillClass: 'hp-you',
    compact: true,
  }));
  const vs = last.enemyId ? ENEMIES_BY_ID[last.enemyId] : null;
  wrap.append(accStation(combat.fightCockpit(ctx.state, vs) ?? st.cockpit));
  const sips = combat.oilSipsRemaining(ctx.state);
  const dry = sips <= 0;
  wrap.append(el('p', { class: `oil-line ${dry ? 'danger leftover-dry' : 'muted'}` },
    dry ? 'Need oil' : `${formatNoun(sips, 'lantern sip')} remaining`));
  wrap.append(eatRow(ctx, st, paint));
  wrap.append(handChip(ctx, st, paint));
  wrap.append(styleRow(ctx, st, paint));
  const loot = leftoverLootRow(last);
  if (loot) wrap.append(loot);
  wrap.append(leftoverHunt(ctx, last, dry, paint));
  wrap.append(logPanel(leftoverLog(st), { lines: 4 }));
  return wrap;
}

function leftoverLootRow(last) {
  if (last.ended !== 'kill') return null;
  const chips = [];
  if (last.souls) chips.push(el('span', { class: 'chip chip-gold' }, formatNoun(last.souls, 'soul')));
  for (const d of last.loot ?? []) {
    if (d.kind === 'lumen') {
      chips.push(el('span', { class: 'chip chip-gold' }, `✦${formatNumber(d.qty)}`));
    } else {
      chips.push(el('span', { class: 'chip' }, `${d.name ?? d.id} ×${d.qty}`));
    }
  }
  if (!chips.length) chips.push(el('span', { class: 'chip' }, 'nothing but quiet'));
  return chipRow('leftover-loot chips', chips);
}

function leftoverLog(st) {
  const pinned = st.lastStation?.log;
  if (Array.isArray(pinned) && pinned.length) return pinned;
  return st.log ?? [];
}

function leftoverHunt(ctx, last, dry, paint) {
  const enemy = last.enemyId ? ENEMIES_BY_ID[last.enemyId] : null;
  const name = last.enemyName ?? enemy?.name ?? 'this foe';
  return el('button', {
    class: `btn btn-wide leftover-hunt ${dry ? 'btn-ghost btn-disabled' : 'btn-primary'}`,
    'aria-disabled': dry ? 'true' : 'false',
    onclick: () => {
      if (!last.enemyId) return;
      if (dry) {
        ctx.toast?.('The lantern is dry — buy wick-oil at the stall before a stretch.', 'warn');
        return;
      }
      const res = ctx.startFight(last.enemyId);
      if (!res.ok) ctx.toast(res.error, 'warn');
      paint();
    },
  }, dry ? 'Need oil' : `Hunt ${name}`);
}

function logPanel(log, { lines = 12 } = {}) {
  const shown = [...(log ?? [])].slice(-lines).reverse();
  const box = el('div', { class: 'combat-log', 'aria-label': 'Combat log' });
  if (!shown.length) {
    box.append(el('p', { class: 'muted' }, 'The fog holds its breath.'));
    return el('div', { class: 'log-wrap' }, el('h3', { class: 'log-h' }, 'Log'), box);
  }
  for (const line of shown) {
    box.append(el('p', { class: `log-line log-${line.kind ?? 'info'}` }, line.text));
  }
  return el('div', { class: 'log-wrap' }, el('h3', { class: 'log-h' }, 'Log'), box);
}
