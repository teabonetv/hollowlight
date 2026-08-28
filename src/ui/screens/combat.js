// Combat surface: zone list, hunt cards, live fight (HP, timers, styles,
// eat/oil, log), vigils, death-site recovery. Mobile-first; every control
// is a ≥44px tap. No hover-only info.

import { el, clear } from '../dom.js';
import { filledIcon, icon } from '../icons.js';
import { formatNumber, formatSeconds, formatNoun } from '../../core/format.js';
import { ZONES, ZONE_BY_ID } from '../../game/data/combat/zones.js';
import { STYLES, STYLE_BY_ID } from '../../game/data/combat/styles.js';
import { FOOD } from '../../game/data/combat/consumables.js';
import { VIGIL_CATEGORY_BY_ID, VIGIL_TIER_BY_N } from '../../game/data/combat/vigils.js';
import { ITEMS_BY_ID } from '../../game/data/items.js';
import { itemGlyph } from '../../game/data/item-glyphs.js';
import { enemiesInZone, bossOfZone, ENEMIES_BY_ID } from '../../game/data/enemies/index.js';
import { bankCount, uniqueStackCount, lanternRoom } from '../../game/systems/bank.js';
import { buyFromStore, liveBuyUnit } from '../../game/systems/store.js';
import * as combat from '../../game/systems/combat.js';

/**
 * 360×640 fight / leftover budget. Must stay in lockstep with combat.css:
 * topbar ≈52, --tab-h 62, fight-live #screen pad 8, detail-head 44, 44px taps.
 */
export const COMBAT_360 = {
  viewportH: 640,
  viewportW: 360,
  screenPadX: 16,
  topbarH: 52,
  tabbarH: 63, // --tab-h 62 + 1px border → tab top 577 at vh=640
  /** Live unpaid .fight-loot bottom must sit this far above tab top 577. */
  tabClearance: 8,
  screenPadTop: 8,
  screenPadBottom: 8,
  lobbyPadTop: 18,
  screenGap: 16,
  detailHead: 44,
  xpBlock: 40,
  lobbyHead: 50,
  gap: 3,
  leftoverGap: 1,
  leftoverStationTop: 161, // 360 wrapped topbar 105 + pad 8 + detail-head 44 + gap 4
  kicker: 14,
  fighter: 26,
  leftoverFighter: 22,
  acc: 26,
  leftoverAcc: 22,
  oil: 14,
  oilBuy: 44,
  eat: 44,
  hand: 44,
  styles: 44,
  keep: 44,
  /** Live Keep hunting — 44px keep + 32px tray sat 550.6–582.6 over tab 577 (v54). */
  fightKeep: 32,
  hunt: 44,
  loot: 44,
  /**
   * Leftover unpaid well min-height (header 44 + portrait floor 56 + Hunt another 44).
   * Acc / hand / styles collapse so this room can exist above tab 577.
   */
  leftoverWellMin: 140,
  leftoverTileMinW: 56,
  leftoverTileMinH: 80,
  leftoverGlyph: 56,
  leftoverWellHead: 44,
  /** Live unpaid tray — leftover-loot 44px sat 543–587 (v49). v54 compact 32px sat 550.6–582.6. */
  fightLoot: 32,
  fightGap: 2,
  fightFighter: 34, // head + bar-lg 12, not leftover's 22
  fightAcc: 28, // live cockpit pad 2 + chip 26; leftover stays leftoverAcc
  fightOil: 16,
  souls: 32,
  zoneChips: 44,
  huntCardAboveBtn: 140,
  logLine: 15, // 12px × 1.2, rounded up for subpixel wraps
  logGap: 1,
  logPadY: 6,
  logLinesLeftover: 4,
  logWrapFight: 64,
  /** Two 28.8px wraps + two singles + pad/gaps; 88px clips line 4. */
  logWrapLeftover: 100,
  leftoverKillWrapRows: 2,
  /** Kill line + oil line wrap; two later singles. Newest-first leftover log. */
  leftoverLogWrapRows: [2, 2, 1, 1],
};

/** Log box vs tab bar on a 360×640 fight or leftover cockpit (flex-pinned). */
export function cockpitLogVsTab(kind = 'leftover') {
  const C = COMBAT_360;
  const tabTop = C.viewportH - C.tabbarH;
  const screenBottom = tabTop - C.screenPadBottom;
  const wrapH = kind === 'leftover' ? C.logWrapLeftover : C.logWrapFight;
  const logBottom = screenBottom;
  const logTop = logBottom - wrapH;
  const padTop = C.logPadY / 2;
  const n = kind === 'leftover' ? C.logLinesLeftover : 4;
  const wrapRows = kind === 'leftover' ? C.leftoverLogWrapRows : null;
  const lines = [];
  let y = logTop + padTop;
  for (let i = 0; i < n; i++) {
    const rows = wrapRows?.[i] ?? (kind === 'leftover' && i === 0 ? C.leftoverKillWrapRows : 1);
    const top = y;
    // A wrapping .log-line is one block; wrap rows do not add logGap.
    const bottom = y + rows * C.logLine;
    lines.push({ top, bottom, index: i + 1, rows });
    y = bottom + C.logGap;
  }
  const line4 = lines[3] ?? lines[lines.length - 1];
  const leftoverFits = kind !== 'leftover'
    || (lines.every((l) => l.bottom < tabTop && l.bottom <= logBottom) && line4.bottom < tabTop);
  return {
    logTop,
    logBottom,
    tabTop,
    wrapH,
    lines,
    line4Bottom: line4?.bottom ?? logBottom,
    fits: logBottom < tabTop && leftoverFits,
  };
}

/**
 * Leftover 360 geometry after kill (loot well) or Fall back (no pile).
 * leftover-station is height-capped to the hub. Unpaid leftover collapses
 * Acc / Knife / styles and spends that height on a loot well so leftover is a
 * room, not a 44px filmstrip. .cockpit-fill still exists (flex 0 in well mode)
 * so oil buy / logWrap.bottom cannot shove into the tab.
 * oilBuy: dry leftover paints a 44px stall buy on the oil row.
 * No-loot leftover-actions stays a 44px Hunt another row.
 */
export function leftoverLogVsTab({ loot = true, oilBuy = false } = {}) {
  const C = COMBAT_360;
  const box = cockpitLogVsTab('leftover');
  const stationTop = C.leftoverStationTop;
  const oilH = oilBuy ? (C.oilBuy ?? 44) : C.oil;
  const fighterH = C.leftoverFighter ?? C.fighter;
  const gap = C.leftoverGap ?? C.gap;
  const clearance = C.tabClearance ?? 8;
  const wellMin = C.leftoverWellMin ?? 140;
  const headH = C.leftoverWellHead ?? C.hunt;

  if (loot) {
    const chromeBlocks = 6; // kicker, 2 fighters, oil, eat, well
    const chrome = C.kicker + 2 * fighterH + oilH + C.eat;
    const chromeGaps = gap * (chromeBlocks - 1);
    const wellH = (box.logTop - stationTop) - chrome - chromeGaps;
    let y = stationTop;
    y += C.kicker + gap;
    y += fighterH + gap;
    y += fighterH + gap;
    y += oilH + gap;
    const eatTop = y;
    const eatBottom = y + C.eat;
    y = eatBottom + gap;
    const wellTop = y;
    const wellBottom = wellTop + wellH;
    const takeTop = wellTop;
    const takeBottom = wellTop + headH;
    const anotherTop = wellBottom - C.hunt;
    const anotherBottom = wellBottom;
    const wellClears = wellBottom <= box.tabTop - clearance
      && anotherBottom <= box.tabTop - clearance
      && takeBottom <= box.tabTop - clearance;
    return {
      ...box,
      loot,
      lootH: wellH,
      oilBuy,
      oilH,
      fillH: wellH,
      wellH,
      wellMin,
      wellTop,
      wellBottom,
      wellGap: box.tabTop - wellBottom,
      stationTop,
      stationBottom: box.logBottom,
      eatTop,
      eatBottom,
      takeTop,
      takeBottom,
      anotherTop,
      anotherBottom,
      clearance,
      fits: box.fits && wellH >= wellMin && box.logBottom < box.tabTop
        && eatBottom < box.tabTop && wellClears,
    };
  }

  const actionsH = C.loot;
  const accH = C.leftoverAcc ?? C.acc;
  const chromeBlocks = 9;
  const chrome = C.kicker + 2 * fighterH + accH + oilH + C.eat + C.hand + C.styles + actionsH;
  const chromeGaps = gap * (chromeBlocks - 1);
  const fillH = (box.logTop - stationTop) - chrome - chromeGaps;
  let y = stationTop;
  y += C.kicker + gap;
  y += fighterH + gap;
  y += fighterH + gap;
  y += accH + gap;
  y += oilH + gap;
  const eatTop = y;
  const eatBottom = y + C.eat;
  y = eatBottom + gap;
  y += C.hand + gap;
  y += C.styles + gap;
  const anotherTop = y;
  const anotherBottom = y + actionsH;
  return {
    ...box,
    loot,
    lootH: 0,
    oilBuy,
    oilH,
    fillH,
    wellH: 0,
    wellMin,
    wellTop: null,
    wellBottom: null,
    wellGap: null,
    stationTop,
    stationBottom: box.logBottom,
    eatTop,
    eatBottom,
    takeTop: null,
    takeBottom: null,
    anotherTop,
    anotherBottom,
    clearance,
    fits: box.fits && fillH >= 0 && box.logBottom < box.tabTop
      && eatBottom < box.tabTop && anotherBottom < box.tabTop,
  };
}

/**
 * Live 360 fight geometry. Compact unpaid tray (not leftover 44px) sits above
 * the log; Eat / Fall back stay on the eat row, all above tab 577 with ≥8px gap.
 * v49: leftover-loot 44px on the live pull measured 543–587. v54: compact 32px
 * tray measured 550.6–582.6 (craft-nav + keep 44) — 5.6px under the tab.
 */
export function fightLogVsTab({ loot = false } = {}) {
  const C = COMBAT_360;
  const box = cockpitLogVsTab('fight');
  const stationTop = C.leftoverStationTop;
  const gap = C.fightGap ?? C.gap;
  const fighterH = C.fightFighter ?? C.fighter;
  const accH = C.fightAcc ?? C.acc;
  const oilH = C.fightOil ?? C.oil;
  const keepH = C.fightKeep ?? C.keep;
  const clearance = C.tabClearance ?? 8;
  const lootH = loot ? (C.fightLoot ?? C.loot) : 0;
  const chromeBlocks = 8 + (loot ? 1 : 0);
  const chrome = 2 * fighterH + accH + oilH + C.eat + C.hand + C.styles + keepH + lootH;
  const chromeGaps = gap * (chromeBlocks - 1);
  const fillH = (box.logTop - stationTop) - chrome - chromeGaps;
  let y = stationTop;
  y += fighterH + gap;
  y += fighterH + gap;
  y += accH + gap;
  y += oilH + gap;
  const eatTop = y;
  const eatBottom = y + C.eat;
  y = eatBottom + gap;
  y += C.hand + gap;
  y += C.styles + gap;
  y += keepH + gap;
  const trayTop = loot ? y : null;
  const trayBottom = loot ? y + lootH : null;
  const trayClears = trayBottom == null || trayBottom <= box.tabTop - clearance;
  return {
    ...box,
    loot,
    lootH,
    keepH,
    clearance,
    fillH,
    stationTop,
    stationBottom: box.logBottom,
    eatTop,
    eatBottom,
    fleeBottom: eatBottom,
    trayTop,
    trayBottom,
    trayGap: trayBottom == null ? null : box.tabTop - trayBottom,
    fits: box.fits && fillH >= 0 && box.logBottom < box.tabTop
      && eatBottom < box.tabTop
      && trayClears,
  };
}

/** Eat + Hunt-this-foe on one 360 row; well header is Hollow meter + Take all; Hunt another is full-width under the well. */
export function leftoverHuntRowVs360() {
  const C = COMBAT_360;
  const viewportW = C.viewportW ?? 360;
  const padX = C.screenPadX ?? 16;
  const contentW = viewportW - padX * 2;
  const gap = 6;
  const eatUsed = C.eat + C.hunt + gap * 2;
  const wellHeadUsed = 110 + (C.leftoverWellHead ?? C.loot) + gap;
  const actionsUsed = C.hunt;
  const anotherRight = padX + contentW;
  return {
    viewportW,
    contentW,
    eatUsed,
    actionsUsed,
    wellHeadUsed,
    anotherRight,
    eatFits: eatUsed < contentW,
    actionsFits: actionsUsed < contentW,
    wellHeadFits: wellHeadUsed < contentW,
    fits: eatUsed < contentW && actionsUsed < contentW && wellHeadUsed < contentW
      && anotherRight <= viewportW,
  };
}

/** Pale Moth Hunt button bottom on the 360 combat lobby (no leftover). */
export function lobbyFirstHuntBottom() {
  const C = COMBAT_360;
  /* Hunt sits on the card head, not under flavor. */
  const y = C.topbarH + C.lobbyPadTop + C.lobbyHead + C.screenGap + C.xpBlock + C.screenGap
    + C.souls + 14 + C.zoneChips + 8 + 12 + C.hunt;
  return { huntBottom: y, tabTop: C.viewportH - C.tabbarH, fits: y < C.viewportH - C.tabbarH };
}

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
  let fightView = null;

  function syncScreenFlags() {
    let screen = root.parentNode;
    while (screen && !screen.classList?.contains?.('screen')) screen = screen.parentNode;
    if (!screen?.classList) return;
    const fighting = !!ctx.state.combat?.fighting;
    const leftover = !fighting && !!ctx.state.combat?.lastStation;
    screen.classList.toggle('fight-live', fighting);
    screen.classList.toggle('leftover-live', leftover);
  }

  function paint() {
    const st = combat.combatStatus(ctx.state);
    const enteringFight = !!st.fighting && !wasFighting;
    const leavingFight = !st.fighting && wasFighting;
    clear(root);
    fightView = null;
    // Do not resumeCombat() here — reload pause must stay visible until Resume.
    if (st.fighting) {
      fightView = mountFight(ctx, st, paint);
      root.append(fightView.node);
    } else {
      root.append(buildHub(ctx, st, paint));
    }
    if (enteringFight || leavingFight) resetHuntScrollers(root);
    wasFighting = !!st.fighting;
    syncScreenFlags();
  }

  function refreshFight() {
    const st = combat.combatStatus(ctx.state);
    if (!st.fighting || !fightView) {
      paint();
      return;
    }
    if (!!st.paused !== !!fightView.paused) {
      paint();
      return;
    }
    fightView.sync(st);
  }

  paint();

  return {
    node: root,
    update() {
      const fighting = !!ctx.state.combat?.fighting;
      if (fighting && wasFighting) refreshFight();
      else if (fighting || wasFighting) paint();
    },
  };
}

function buildHub(ctx, st, paint) {
  const leftover = leftoverStation(ctx, st, paint);
  if (leftover) {
    const wrap = el('div', { class: 'combat-hub leftover-hub' });
    wrap.append(leftover);
    return wrap;
  }
  return buildLobby(ctx, st, paint);
}

function buildLobby(ctx, st, paint) {
  const wrap = el('div', { class: 'combat-lobby' });
  wrap.append(soulsLine(ctx, st));
  const spilled = deathBanner(ctx, st, paint);
  if (spilled) wrap.append(spilled);
  const dry = combat.oilSipsRemaining(ctx.state) <= 0;
  if (dry) {
    wrap.append(el('p', { class: 'oil-line danger lobby-oil' }, 'Need oil'));
  }
  const zoneId = ctx.state.combat.zoneId || 'hearthway';
  wrap.append(zonePicker(ctx, zoneId, paint, { heading: false }));
  wrap.append(huntList(ctx, zoneId, paint));
  wrap.append(el('p', { class: 'combat-intro muted' },
    'Strike, Shot, or Rite — pick a stretch, keep the lantern fed, and do not let the pale-things finish a sentence.'));
  wrap.append(vigilCard(ctx, st, paint));
  wrap.append(handSlot(ctx, st, paint));
  wrap.append(zoneFlavor(ctx, zoneId));
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

function accYouText(kit, youMs) {
  if (!kit) return 'Acc —';
  const you = rangeLabel(kit.playerMinHit, kit.playerMaxHit);
  const youClock = clockLabel(youMs ?? kit.playerSpeedMs);
  return `Acc ${kit.hitPct}% · ${you}${youClock ? ` · ${youClock}` : ''}`;
}

function accTheyText(kit, theyMs) {
  if (!kit) return 'they —';
  const they = rangeLabel(kit.foeMinHit, kit.foeMaxHit);
  const theyClock = clockLabel(theyMs ?? kit.foeSpeedMs);
  return `they ${kit.foeHitPct}% · ${they}${theyClock ? ` · ${theyClock}` : ''}`;
}

function accStation(kit, extraClass = '', clocks = {}) {
  const row = el('div', { class: `acc-station fight-cockpit ${extraClass}`.trim() });
  row.append(
    el('span', { class: 'chip acc-chip' }, accYouText(kit, clocks.you)),
    el('span', { class: 'chip-sep', 'aria-hidden': 'true' }, ' / '),
    el('span', { class: 'chip they-chip' }, accTheyText(kit, clocks.they)),
  );
  return row;
}

function syncAccStation(row, kit, clocks = {}) {
  if (!row) return;
  const you = row.querySelector('.acc-chip');
  const they = row.querySelector('.they-chip');
  if (you) you.textContent = accYouText(kit, clocks.you);
  if (they) they.textContent = accTheyText(kit, clocks.they);
}

function syncFighter(block, hp, max) {
  if (!block) return;
  const label = block.querySelector('.fighter-hp');
  const fill = block.querySelector('.bar-fill');
  if (label) label.textContent = `${hp} / ${max}`;
  if (fill) {
    const frac = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
    fill.style.width = `${(frac * 100).toFixed(1)}%`;
  }
}

function fillLogBox(box, log, lines) {
  if (!box) return;
  clear(box);
  const shown = [...(log ?? [])].slice(-lines).reverse();
  if (!shown.length) {
    box.append(el('p', { class: 'muted' }, 'The fog holds its breath.'));
    return;
  }
  for (const line of shown) {
    box.append(el('p', { class: `log-line log-${line.kind ?? 'info'}` }, line.text));
  }
}

function syncEatRow(row, ctx, st) {
  if (!row) return;
  const btn = row.querySelector('.eat-btn');
  if (btn) {
    const full = st.playerHp >= st.playerMaxHp;
    btn.classList.toggle('btn-ghost', full);
    btn.classList.toggle('btn-disabled', full);
    btn.classList.toggle('btn-primary', !full);
    btn.setAttribute('aria-disabled', full ? 'true' : 'false');
  }
  const id = combat.selectedFoodId(ctx.state);
  const pick = row.querySelector('.eat-pick');
  if (id && pick) {
    const n = bankCount(ctx.state.bank, id);
    const food = FOOD[id];
    const heal = combat.foodHeal(id);
    pick.textContent = `${food.name} +${heal} · ${n}`;
  }
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

function zonePicker(ctx, zoneId, paint, { heading = true } = {}) {
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
  if (!heading) return list;
  return el('div', {},
    el('h2', { class: 'section-title combat-h' }, 'Stretches'),
    el('p', { class: 'section-sub muted' }, 'Twelve beacons. Only Hearthway is kindled.'),
    list);
}

function huntList(ctx, zoneId, paint) {
  const unlock = combat.zoneUnlock(ctx.state, zoneId);
  if (!unlock.ok) {
    return el('div', { class: 'empty-state' },
      el('span', { class: 'empty-icon', html: icon('sword') }),
      el('h2', { class: 'empty-title' }, 'Unkindled'),
      el('p', { class: 'empty-text' }, unlock.reason));
  }
  const list = el('div', { class: 'hunt-list' });
  for (const enemy of enemiesInZone(zoneId)) {
    list.append(huntCard(ctx, enemy, paint));
  }
  return list;
}

function zoneFlavor(ctx, zoneId) {
  const z = ZONE_BY_ID[zoneId];
  const unlock = combat.zoneUnlock(ctx.state, zoneId);
  const wrap = el('div', { class: 'zone-body' });
  wrap.append(
    el('h2', { class: 'section-title combat-h' }, 'Stretches'),
    el('p', { class: 'section-sub muted' }, 'Twelve beacons. Only Hearthway is kindled.'),
    el('h3', { class: 'track-name' }, z.stretch),
    el('p', { class: 'action-desc' }, z.flavor),
    el('p', { class: 'muted small' },
      `Requires Combat ${z.levelReq}${z.kindled ? '' : ' · kindled beacon'}.`),
  );
  if (!unlock.ok) return wrap;
  const stretch = combat.ensureCombat(ctx.state).stretchKills[zoneId] ?? 0;
  const boss = bossOfZone(zoneId);
  wrap.append(el('p', { class: 'muted small' },
    boss
      ? (combat.guardianStirred(ctx.state, zoneId)
        ? `${boss.name} will stand.`
        : `${boss.name} stirs after ${boss.stirKills} kills on this stretch (${stretch}/${boss.stirKills}).`)
      : ''));
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
    el('div', { class: 'hunt-head' },
      el('div', { class: 'hunt-who' },
        el('h2', { class: 'action-name' }, enemy.name),
        el('span', { class: 'mastery-badge' }, enemy.boss ? 'Guardian' : enemy.category)),
      el('button', {
        class: `btn hunt-go ${blocked ? 'btn-ghost btn-disabled' : 'btn-primary'}`,
        onclick: start,
        'aria-disabled': blocked ? 'true' : 'false',
      }, btnLabel)),
    el('p', { class: 'action-desc' }, enemy.flavor),
    chipRow('chips', [
      el('span', { class: 'chip' }, `${enemy.hp} HP`),
      el('span', { class: 'chip' }, `${formatSeconds(enemy.speedMs)} / blow`),
      el('span', { class: 'chip chip-xp' }, `${enemy.xp} XP`),
      el('span', { class: 'chip chip-gold' }, formatNoun(enemy.souls, 'soul')),
      el('span', { class: 'chip' }, `weak to ${STYLE_BY_ID[enemy.weakness]?.name ?? enemy.weakness}`),
      el('span', { class: 'chip' }, `resists ${STYLE_BY_ID[enemy.resist]?.name ?? enemy.resist}`),
      kills ? el('span', { class: 'chip' }, `${kills} slain`) : null,
    ]));
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

function mountFight(ctx, st, paint) {
  const wrap = buildFight(ctx, st, paint);
  const fighters = wrap.querySelectorAll('.fighter');
  const you = fighters[0];
  const foeBlock = fighters[1];
  const foeTitle = foeBlock?.querySelector('strong');
  const acc = wrap.querySelector('.acc-station');
  const oil = wrap.querySelector('.oil-line');
  const eat = wrap.querySelector('.eat-row');
  const tray = wrap.querySelector('.fight-loot');
  const logBox = wrap.querySelector('.combat-log');

  return {
    node: wrap,
    paused: !!st.paused,
    sync(next) {
      syncFighter(you, next.playerHp, next.playerMaxHp);
      syncFighter(foeBlock, next.foe?.hp ?? 0, next.foe?.maxHp ?? 1);
      if (foeTitle) foeTitle.textContent = next.foe?.name ?? 'Foe';
      syncAccStation(acc, next.cockpit, {
        you: next.playerNextMs,
        they: next.foe?.nextActMs ?? 0,
      });
      if (oil) {
        oil.textContent = lanternCopy(next, ctx.state);
        oil.className = `oil-line ${next.lanternFed ? 'muted' : 'danger'}`;
      }
      syncEatRow(eat, ctx, next);
      if (tray) fillFightLoot(tray, ctx, next, paint);
      fillLogBox(logBox, next.log, 12);
    },
  };
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

  wrap.append(mountFightLoot(ctx, st, paint));
  wrap.append(el('div', { class: 'cockpit-fill', 'aria-hidden': 'true' }));
  wrap.append(logPanel(st.log));
  return wrap;
}

function fighterBlock({ title, hp, max, fillClass, compact = false }) {
  const frac = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  return el('div', { class: `fighter ${compact ? 'fighter-compact' : ''}`.trim() },
    el('div', { class: 'fighter-head' },
      el('strong', {}, title),
      el('span', { class: 'muted fighter-hp' }, `${hp} / ${max}`)),
    el('div', { class: `bar bar-lg hp-bar`, role: 'progressbar', 'aria-label': `${title} vitality` },
      el('span', { class: `bar-fill ${fillClass}`, style: `width:${(frac * 100).toFixed(1)}%` })));
}

function eatRow(ctx, st, paint, { flee = false, hunt = null, dry = false } = {}) {
  const row = el('div', { class: 'eat-row' });
  const id = combat.selectedFoodId(ctx.state);
  if (!id) {
    row.append(el('p', { class: 'muted small eat-empty' }, 'No food in the pack.'));
    const tools = el('div', { class: 'eat-slot' });
    if (flee) tools.append(fleeButton(ctx, paint));
    if (hunt) tools.append(leftoverHunt(ctx, hunt, dry, paint));
    if (tools.children.length) row.append(tools);
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
    type: 'button',
    'aria-disabled': full ? 'true' : 'false',
    onclick: () => {
      const now = combat.combatStatus(ctx.state);
      if (now.playerHp >= now.playerMaxHp) {
        ctx.toast?.('Already whole.', 'info');
        return;
      }
      const foodId = combat.selectedFoodId(ctx.state) ?? id;
      const res = ctx.eatFood(foodId);
      if (!res.ok) ctx.toast(res.error, 'warn');
      paint();
    },
  }, 'Eat'));
  if (flee) slot.append(fleeButton(ctx, paint));
  if (hunt) slot.append(leftoverHunt(ctx, hunt, dry, paint));
  row.append(slot);
  return row;
}

function fleeButton(ctx, paint) {
  return el('button', {
    class: 'btn btn-stop flee-btn',
    type: 'button',
    onclick: () => { ctx.fleeFight(); paint(); },
  }, 'Fall back');
}

function leftoverHasUngranted(st, ctx) {
  return ungrantedTrayEntries(st.lootTray ?? ctx.state.combat?.lootTray ?? []).length > 0;
}

function leftoverStation(ctx, st, paint) {
  const last = st.lastStation;
  if (!last) return null;
  const unpaid = leftoverHasUngranted(st, ctx);
  const wrap = el('article', {
    class: `combat-fight leftover-station${unpaid ? ' leftover-well' : ''}`,
    'aria-label': unpaid ? 'Loot to collect' : 'After the hunt',
  });
  wrap.append(el('p', { class: 'leftover-kicker' }, combat.leftoverKicker(last)));
  wrap.append(fighterBlock({
    title: 'You',
    hp: st.playerHp,
    max: st.playerMaxHp,
    fillClass: 'hp-you',
  }));
  const foe = combat.leftoverFoeVitals(last);
  wrap.append(fighterBlock({
    title: foe.name,
    hp: foe.hp,
    max: foe.max,
    fillClass: 'hp-foe',
  }));
  // Unpaid leftover spends Acc / Knife / styles on the loot well. Kit returns
  // after Take all so Hunt-this-foe can still change stance before the next pull.
  if (!unpaid) {
    const vs = last.enemyId ? ENEMIES_BY_ID[last.enemyId] : null;
    wrap.append(accStation(combat.fightCockpit(ctx.state, vs) ?? st.cockpit));
  }
  const sips = combat.oilSipsRemaining(ctx.state);
  const dry = sips <= 0;
  wrap.append(leftoverOilRow(ctx, st, paint, { sips, dry }));
  wrap.append(eatRow(ctx, st, paint, { hunt: last, dry }));
  if (!unpaid) {
    wrap.append(handChip(ctx, st, paint));
    wrap.append(styleRow(ctx, st, paint));
  }
  wrap.append(leftoverActionsRow(ctx, st, paint));
  wrap.append(el('div', { class: 'cockpit-fill', 'aria-hidden': 'true' }));
  wrap.append(logPanel(leftoverLog(st), { lines: 4 }));
  return wrap;
}

function leftoverOilRow(ctx, st, paint, { sips, dry }) {
  if (!dry) {
    return el('p', { class: 'oil-line muted' },
      `${formatNoun(sips, 'lantern sip')} remaining`);
  }
  const unit = liveBuyUnit(ctx.state, 'wick-oil');
  const row = el('div', { class: 'oil-line danger leftover-dry leftover-oil-row' });
  row.append(el('span', { class: 'leftover-dry-copy' }, 'Need oil'));
  row.append(el('button', {
    class: 'btn leftover-oil-buy',
    type: 'button',
    onclick: () => {
      let res;
      if (ctx.storeBuy) res = ctx.storeBuy('wick-oil', 1);
      else res = buyFromStore(ctx.state, 'wick-oil', 1);
      if (!res?.ok) ctx.toast?.(res?.error ?? 'Could not buy wick-oil.', 'warn');
      paint();
    },
  }, `Wick-oil ✦${formatNumber(unit)}`));
  return row;
}

function trayEntries(tray) {
  return (tray ?? []).filter((e) => e && e.qty > 0);
}

function ungrantedTrayEntries(tray) {
  return trayEntries(tray).filter((e) => e.granted === false);
}

function trayFingerprint(entries) {
  return entries.map((e) => `${e.kind}:${e.id ?? ''}:${e.qty}`).join('|');
}

/** Noun + portrait for a tray row. Souls/Lumen are wallet drops, not bank items. */
function trayTileSpec(entry) {
  if (entry.kind === 'soul') {
    return {
      kind: 'soul',
      id: 'soul',
      glyph: 'spark',
      name: formatNoun(entry.qty, 'soul'),
      qtyLabel: `×${formatNumber(entry.qty)}`,
      aria: formatNoun(entry.qty, 'soul'),
    };
  }
  if (entry.kind === 'lumen') {
    return {
      kind: 'lumen',
      id: 'lumen',
      glyph: 'star',
      name: 'Lumen',
      qtyLabel: `✦${formatNumber(entry.qty)}`,
      aria: `✦${formatNumber(entry.qty)} Lumen`,
    };
  }
  const item = entry.id ? ITEMS_BY_ID[entry.id] : null;
  const name = item?.name ?? entry.name ?? entry.id ?? 'Loot';
  return {
    kind: 'item',
    id: entry.id ?? name,
    glyph: itemGlyph(item),
    name,
    qtyLabel: `×${formatNumber(entry.qty)}`,
    aria: `${name} ×${formatNumber(entry.qty)}`,
  };
}

function lootTile(entry) {
  const spec = trayTileSpec(entry);
  return el('div', {
    class: `loot-tile loot-${spec.kind} glyph-${spec.glyph}`,
    'data-loot-kind': spec.kind,
    'data-loot-id': spec.id ?? '',
    'aria-label': spec.aria,
  },
    el('span', {
      class: `loot-glyph bank-glyph bank-glyph-fill glyph-${spec.glyph}`,
      html: filledIcon(spec.glyph),
      'aria-hidden': 'true',
    }),
    el('span', { class: 'loot-copy' },
      el('span', { class: 'loot-name' }, spec.name),
      el('span', { class: 'loot-qty' }, spec.qtyLabel)));
}

function lootTileRow(entries) {
  const grid = el('div', { class: 'leftover-loot-chips loot-tray-grid' });
  for (const e of entries) grid.append(lootTile(e));
  return grid;
}

function takeAllBtn(ctx, paint) {
  return el('button', {
    class: 'btn btn-ghost leftover-take',
    type: 'button',
    onclick: () => {
      const res = ctx.takeAllLootTray
        ? ctx.takeAllLootTray()
        : combat.takeAllLootTray(ctx.state);
      if (res?.blocked) ctx.toast?.(res.error, 'warn');
      paint();
    },
  }, 'Take all');
}

function hollowPressureCopy(state) {
  return `Hollow ${uniqueStackCount(state?.bank)}/${lanternRoom(state)}`;
}

function leftoverLootRow(ctx, st, paint) {
  const tray = ungrantedTrayEntries(st.lootTray ?? ctx.state.combat?.lootTray ?? []);
  if (!tray.length) return null;
  const meter = hollowPressureCopy(ctx.state);
  const row = el('div', {
    class: 'leftover-loot leftover-tray',
    'aria-label': `Loot to collect · ${meter}`,
  });
  const head = el('div', { class: 'loot-well-head' });
  head.append(
    el('span', { class: 'loot-well-meter' }, meter),
    takeAllBtn(ctx, paint),
  );
  row.append(head);
  row.append(lootTileRow(tray));
  return row;
}

function leftoverActionsRow(ctx, st, paint) {
  const row = el('div', { class: 'leftover-actions' });
  const loot = leftoverLootRow(ctx, st, paint);
  if (loot) row.append(loot);
  row.append(leftoverAnother(ctx, paint));
  return row;
}

function mountFightLoot(ctx, st, paint) {
  const row = el('div', { class: 'fight-loot leftover-tray' });
  fillFightLoot(row, ctx, st, paint);
  return row;
}

function fillFightLoot(row, ctx, st, paint) {
  const pending = ungrantedTrayEntries(st.lootTray ?? ctx.state.combat?.lootTray ?? []);
  row.classList.toggle('is-empty', pending.length === 0);
  row.classList.toggle('leftover-loot', pending.length > 0);
  if (!pending.length) {
    clear(row);
    if (row.dataset) row.dataset.lootFp = '';
    row.setAttribute('hidden', '');
    row.setAttribute('aria-hidden', 'true');
    row.removeAttribute('aria-label');
    return;
  }
  row.removeAttribute('hidden');
  row.removeAttribute('aria-hidden');
  row.setAttribute('aria-label', 'Loot to collect');
  const fp = trayFingerprint(pending);
  if (row.dataset?.lootFp === fp && row.querySelector('.loot-tile') && row.querySelector('.leftover-take')) {
    return;
  }
  if (row.dataset) row.dataset.lootFp = fp;
  clear(row);
  row.append(lootTileRow(pending));
  row.append(takeAllBtn(ctx, paint));
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
    class: `btn leftover-hunt ${dry ? 'btn-ghost btn-disabled' : 'btn-primary'}`,
    type: 'button',
    disabled: dry ? true : undefined,
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
  }, `Hunt ${name}`);
}

function leftoverAnother(ctx, paint) {
  return el('button', {
    class: 'btn btn-ghost leftover-another',
    type: 'button',
    onclick: () => {
      const res = ctx.dismissLastStation
        ? ctx.dismissLastStation()
        : combat.dismissLastStation(ctx.state);
      if (!res?.ok) ctx.toast?.(res?.error, 'warn');
      paint();
    },
  }, 'Hunt another');
}

function logPanel(log, { lines = 12 } = {}) {
  const box = el('div', { class: 'combat-log', 'aria-label': 'Combat log' });
  fillLogBox(box, log, lines);
  return el('div', { class: 'log-wrap' }, el('h3', { class: 'log-h' }, 'Log'), box);
}
