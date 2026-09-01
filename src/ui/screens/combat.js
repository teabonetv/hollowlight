// Combat surface: zone list, hunt cards, live fight (HP, timers, styles,
// eat/oil, log), vigils, death-site recovery. Mobile-first; every control
// is a ≥44px tap. No hover-only info.

import { el, clear } from '../dom.js';
import { filledIcon, icon } from '../icons.js';
import { formatNumber, formatSeconds, formatNoun } from '../../core/format.js';
import { ZONE_BY_ID } from '../../game/data/combat/zones.js';
import { huntRoadZones, roadSubtitle } from '../../game/data/world/settlements.js';
import { STYLES, STYLE_BY_ID } from '../../game/data/combat/styles.js';
import { FOOD } from '../../game/data/combat/consumables.js';
import { VIGIL_CATEGORY_BY_ID, VIGIL_TIER_BY_N } from '../../game/data/combat/vigils.js';
import { ITEMS_BY_ID } from '../../game/data/items.js';
import { itemGlyph } from '../../game/data/item-glyphs.js';
import { enemiesInZone, bossOfZone, ENEMIES_BY_ID } from '../../game/data/enemies/index.js';
import { foePortraitSrc } from '../../game/data/enemies/portraits.js';
import { bankCount } from '../../game/systems/bank.js';
import { buyFromStore, liveBuyUnit } from '../../game/systems/store.js';
import * as combat from '../../game/systems/combat.js';
import { HuntSatchel } from './hunt-satchel.js';

export { HuntSatchel };

/**
 * 360×640 fight / leftover budget. Must stay in lockstep with combat.css:
 * topbar ≈52, --tab-h 62, fight-live #screen pad 8, 44px taps.
 * leftover-live / fight-live hide .craft-nav (Emberkeeping / Foraging / Combat).
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
  leftoverStationTop: 117, // 360 wrapped topbar 105 + pad 8 + gap 4; craft-nav hidden
  kicker: 14,
  fighter: 26,
  leftoverFighter: 22,
  acc: 26,
  leftoverAcc: 22,
  oil: 14,
  oilBuy: 44,
  eat: 44,
  /** Leftover/live food chip: loaf glyph 28 + gap + "Lantern-loaf" two-line. */
  eatChipMin: 108,
  /** Hunt Fog-rat / Hunt Pale Moth sitting after Eat on the 44px eat-row. */
  leftoverHuntMin: 88,
  hand: 44,
  styles: 44,
  keep: 44,
  /** Live Keep hunting — 44px keep + 32px tray sat 550.6–582.6 over tab 577 (v54). */
  fightKeep: 32,
  hunt: 44,
  loot: 44,
  /** Compact Hunt satchel chip on live + leftover. Not a 184px leftover-well. */
  satchelChip: 44,
  leftoverWellAcc: 16,
  leftoverWellKit: 44,
  leftoverTileMinW: 56,
  leftoverTileMinH: 103,
  leftoverGlyph: 56,
  leftoverWellHead: 44,
  leftoverLootPad: 6,
  leftoverLootInnerGap: 6,
  leftoverActionsGap: 0,
  leftoverActionsMin: 44,
  /** leftover-live #screen pad-top 0 (fight-live is pad 8). */
  leftoverLiveStationTop: 105,
  leftoverWellLogWrap: 36,
  leftoverWellFighter: 48,
  leftoverWellBar: 12,
  leftoverWellFoeTile: 48,
  leftoverWellOil: 12,
  leftoverWellGap: 0,
  leftoverWellKicker: 0,
  /** Live unpaid loot furniture is the satchel chip, not leftover-well 184. */
  fightLoot: 44,
  fightGap: 2,
  fightFighter: 48,
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
 * Leftover 360 geometry after kill. Unpaid leftover keeps Acc / Knife / styles
 * on the fight cockpit (leftover-as-mode). Loot furniture is a 44px satchel
 * chip — named tiles live in the satchel sheet, not a 184px leftover-well.
 * Hunt another sits under leftover-actions. oilBuy: dry leftover paints a
 * 44px stall buy on the oil row. Empty leftover hides the chip.
 */
export function leftoverLogVsTab({ loot = true, oilBuy = false } = {}) {
  const C = COMBAT_360;
  const box = cockpitLogVsTab('leftover');
  const stationTop = loot ? (C.leftoverLiveStationTop ?? C.leftoverStationTop) : C.leftoverStationTop;
  const oilH = oilBuy ? (C.oilBuy ?? 44) : C.oil;
  const fighterH = C.leftoverFighter ?? C.fighter;
  const gap = C.leftoverGap ?? C.gap;
  const clearance = C.tabClearance ?? 8;
  const chipH = C.satchelChip ?? C.fightLoot ?? 44;
  const tileMinH = C.leftoverTileMinH ?? 103;
  const glyphH = C.leftoverGlyph ?? 56;
  const actionsMin = C.leftoverActionsMin ?? chipH;

  if (loot) {
    const wrapH = C.logWrapLeftover ?? 100;
    const accH = C.leftoverAcc ?? C.acc;
    const logBottom = box.logBottom;
    const logTop = logBottom - wrapH;
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
    const lootTop = y;
    const lootBottom = y + chipH;
    y = lootBottom + gap;
    const anotherTop = y;
    const anotherBottom = y + C.hunt;
    const lootH = chipH;
    const chipClears = lootBottom <= box.tabTop - clearance
      && anotherBottom <= box.tabTop - clearance
      && anotherTop >= lootBottom;
    return {
      ...box,
      wrapH,
      logTop,
      loot,
      lootH,
      lootTop,
      lootBottom,
      tileTop: null,
      tileBottom: null,
      tileH: tileMinH,
      glyphH,
      glyphTop: null,
      glyphBottom: null,
      oilBuy,
      oilH,
      fillH: Math.max(0, logTop - anotherBottom),
      wellH: lootH,
      wellMin: chipH,
      wellTop: lootTop,
      wellBottom: lootBottom,
      wellGap: box.tabTop - lootBottom,
      actionsMin,
      stationTop,
      stationBottom: box.logBottom,
      eatTop,
      eatBottom,
      takeTop: lootTop,
      takeBottom: lootBottom,
      anotherTop,
      anotherBottom,
      clearance,
      fits: chipClears && logBottom <= box.tabTop - clearance
        && wrapH >= 36 && eatBottom < box.tabTop
        && lootH === chipH && lootH < 80,
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
    lootTop: null,
    lootBottom: null,
    tileTop: null,
    tileBottom: null,
    tileH: 0,
    glyphH: 0,
    oilBuy,
    oilH,
    fillH,
    wellH: 0,
    wellMin: chipH,
    wellTop: null,
    wellBottom: null,
    wellGap: null,
    actionsMin,
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
 * Live 360 fight geometry. Unpaid loot is a 44px satchel chip — named tiles
 * live in the satchel sheet. Empty hides the chip. Keep hunting stays; it is
 * not the loot furniture. Eat / Fall back stay above tab 577.
 */
export function fightLogVsTab({ loot = false } = {}) {
  const C = COMBAT_360;
  const clearance = C.tabClearance ?? 8;
  const keepH = C.fightKeep ?? C.keep;
  const stationTop = C.leftoverStationTop;
  const wrapH = C.logWrapFight ?? 64;
  const box = cockpitLogVsTab('fight');
  const logBottom = box.logBottom;
  const logTop = logBottom - wrapH;
  const gap = C.fightGap ?? 0;
  const fighterH = C.fighter;
  const accH = C.fightAcc ?? C.acc;
  const oilH = C.fightOil ?? C.oil;
  const chipH = C.satchelChip ?? C.fightLoot ?? 44;
  const tileMinH = C.leftoverTileMinH ?? 103;
  const glyphH = C.leftoverGlyph ?? 56;
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
  const lootTop = y;
  const lootH = loot ? chipH : 0;
  const lootBottom = loot ? lootTop + chipH : lootTop;
  const trayClears = !loot || lootBottom <= box.tabTop - clearance;
  return {
    ...box,
    wrapH,
    logTop,
    loot: !!loot,
    lootH,
    keepH,
    clearance,
    fillH: Math.max(0, logTop - lootBottom),
    wellH: lootH,
    wellMin: chipH,
    wellTop: loot ? lootTop : null,
    wellBottom: loot ? lootBottom : null,
    wellGap: loot ? box.tabTop - lootBottom : null,
    stationTop,
    stationBottom: logBottom,
    eatTop,
    eatBottom,
    fleeBottom: eatBottom,
    trayTop: loot ? lootTop : null,
    trayBottom: loot ? lootBottom : null,
    trayGap: loot ? box.tabTop - lootBottom : null,
    tileTop: null,
    tileBottom: null,
    tileH: tileMinH,
    glyphH,
    glyphTop: null,
    glyphBottom: null,
    takeTop: loot ? lootTop : null,
    takeBottom: loot ? lootBottom : null,
    fits: trayClears && logBottom <= box.tabTop - clearance
      && eatBottom < box.tabTop && wrapH >= 36
      && (!loot || (lootH === chipH && lootH < 80)),
  };
}

/**
 * Eat + Hunt-this-foe on one 360 row. Food is a loaf chip (glyph + two-line
 * Lantern-loaf / +14 · n), not an ellipsized fake <select>. Unpaid loot is a
 * satchel chip; Hunt another is full-width under leftover-actions.
 */
export function leftoverHuntRowVs360() {
  const C = COMBAT_360;
  const viewportW = C.viewportW ?? 360;
  const padX = C.screenPadX ?? 16;
  const contentW = viewportW - padX * 2;
  const gap = 6;
  const chipMin = C.eatChipMin ?? 108;
  const huntW = C.leftoverHuntMin ?? 88;
  const eatUsed = chipMin + C.eat + huntW + gap * 2;
  const satchelUsed = 110;
  const actionsUsed = C.hunt;
  const anotherRight = padX + contentW;
  return {
    viewportW,
    contentW,
    eatUsed,
    actionsUsed,
    wellHeadUsed: satchelUsed,
    anotherRight,
    eatFits: eatUsed < contentW,
    actionsFits: actionsUsed < contentW,
    wellHeadFits: satchelUsed < contentW,
    fits: eatUsed < contentW && actionsUsed < contentW && satchelUsed < contentW
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

function inCockpit(st) {
  return !!st.fighting || !!st.lastStation;
}

export function renderCombatPanel(ctx) {
  combat.ensureCombat(ctx.state);
  const root = el('div', { class: 'combat-root' });
  let wasCockpit = false;
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
    const entering = inCockpit(st) && !wasCockpit;
    const leaving = !inCockpit(st) && wasCockpit;
    clear(root);
    fightView = null;
    // Do not resumeCombat() here — reload pause must stay visible until Resume.
    // leftover-as-mode: lastStation stays on the fight cockpit. Killing must
    // not remount Acc / kit / loaf into a leftover room.
    if (inCockpit(st)) {
      fightView = mountFight(ctx, st, paint);
      root.append(fightView.node);
    } else {
      root.append(buildLobby(ctx, st, paint));
    }
    if (entering || leaving) resetHuntScrollers(root);
    wasCockpit = inCockpit(st);
    syncScreenFlags();
  }

  function refreshFight() {
    const st = combat.combatStatus(ctx.state);
    if (!inCockpit(st) || !fightView) {
      paint();
      return;
    }
    if (st.fighting && !!st.paused !== !!fightView.paused) {
      paint();
      return;
    }
    fightView.sync(st);
    wasCockpit = true;
    syncScreenFlags();
  }

  paint();

  return {
    node: root,
    update() {
      const st = combat.combatStatus(ctx.state);
      if (fightView && inCockpit(st)) refreshFight();
      else if (inCockpit(st) || wasCockpit) paint();
    },
  };
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

function eatPickParts(id, n) {
  const food = FOOD[id];
  const heal = combat.foodHeal(id);
  const glyph = itemGlyph(ITEMS_BY_ID[id]);
  return {
    food,
    heal,
    glyph,
    name: food?.name ?? id,
    meta: `+${heal} · ${n}`,
  };
}

/** Loaf chip: glyph + two-line name / heal·qty. Never a native <select>. */
function fillEatPick(pick, id, n) {
  if (!pick || !id) return;
  const { glyph, name, meta } = eatPickParts(id, n);
  let glyphEl = pick.querySelector('.eat-glyph');
  let nameEl = pick.querySelector('.eat-food-name');
  let metaEl = pick.querySelector('.eat-food-meta');
  if (!glyphEl || !nameEl || !metaEl) {
    clear(pick);
    glyphEl = el('span', {
      class: `eat-glyph bank-glyph bank-glyph-fill glyph-${glyph}`,
      html: filledIcon(glyph),
      'aria-hidden': 'true',
    });
    nameEl = el('span', { class: 'eat-food-name' }, `${name} `);
    metaEl = el('span', { class: 'eat-food-meta' }, meta);
    pick.append(glyphEl, el('span', { class: 'eat-copy' }, nameEl, metaEl));
  } else {
    glyphEl.className = `eat-glyph bank-glyph bank-glyph-fill glyph-${glyph}`;
    glyphEl.innerHTML = filledIcon(glyph);
    nameEl.textContent = `${name} `;
    metaEl.textContent = meta;
  }
  pick.setAttribute('data-food-id', id);
  pick.setAttribute('data-food-count', String(n));
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
  if (id && pick) fillEatPick(pick, id, bankCount(ctx.state.bank, id));
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
  for (const z of huntRoadZones()) {
    const unlock = combat.zoneUnlock(ctx.state, z.id);
    const btn = el('button', {
      class: `chip-btn ${z.id === zoneId ? 'on' : ''} ${unlock.ok ? '' : 'locked'}`,
      'data-zone': z.id,
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
    el('p', { class: 'section-sub muted' }, roadSubtitle(ctx.state)),
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
    el('p', { class: 'section-sub muted' }, roadSubtitle(ctx.state)),
    el('h3', { class: 'track-name' }, z.stretch),
    el('p', { class: 'action-desc' }, z.flavor),
    el('p', { class: 'muted small' },
      `Requires Combat ${z.levelReq}${unlock.kindled ? '' : ' · kindled beacon'}.`),
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

function isLeftover(st) {
  return !st.fighting && !!st.lastStation;
}

function huntTargetFrom(st) {
  if (st.lastStation?.enemyId) return st.lastStation;
  if (st.foe?.id) return { enemyId: st.foe.id, enemyName: st.foe.name };
  return null;
}

function foeVitals(st) {
  if (isLeftover(st)) return combat.leftoverFoeVitals(st.lastStation);
  return {
    name: st.foe?.name ?? 'Foe',
    hp: st.foe?.hp ?? 0,
    max: st.foe?.maxHp ?? 1,
  };
}

function cockpitKit(ctx, st) {
  if (st.fighting) return st.cockpit;
  const vs = st.lastStation?.enemyId ? ENEMIES_BY_ID[st.lastStation.enemyId] : null;
  return combat.fightCockpit(ctx.state, vs) ?? st.cockpit;
}

function setHidden(node, hide) {
  if (!node) return;
  if (hide) node.setAttribute('hidden', '');
  else node.removeAttribute('hidden');
}

function mountFight(ctx, st, paint) {
  const wrap = buildFight(ctx, st, paint);
  const kicker = wrap.querySelector('.leftover-kicker');
  const fighters = wrap.querySelectorAll('.fighter');
  const you = fighters[0];
  const foeBlock = fighters[1];
  const foeTitle = foeBlock?.querySelector('strong');
  const acc = wrap.querySelector('.acc-station');
  const oil = wrap.querySelector('.oil-line');
  const eat = wrap.querySelector('.eat-row');
  const keep = wrap.querySelector('.combat-keep');
  const keepBox = keep?.querySelector('input');
  const actions = wrap.querySelector('.leftover-actions');
  const chip = wrap.querySelector('.satchel-chip');
  const another = wrap.querySelector('.leftover-another');
  const hunt = wrap.querySelector('.leftover-hunt');
  const flee = wrap.querySelector('.flee-btn');
  const held = wrap.querySelector('.encounter-held');
  const logBox = wrap.querySelector('.combat-log');

  function applyMode(next) {
    const leftover = isLeftover(next);
    const unpaid = leftoverHasUngranted(next, ctx);
    wrap.classList.toggle('leftover-station', leftover);
    wrap.classList.remove('leftover-well');
    if (leftover) {
      wrap.setAttribute('aria-label', unpaid ? 'Loot to collect' : 'After the hunt');
    } else {
      wrap.setAttribute('aria-label', unpaid ? 'Loot to collect' : 'Hunt');
    }
    if (kicker) {
      kicker.textContent = leftover ? combat.leftoverKicker(next.lastStation) : '';
      setHidden(kicker, !leftover);
    }
    setHidden(keep, leftover);
    setHidden(flee, leftover);
    setHidden(hunt, !leftover);
    setHidden(another, !leftover);
    setHidden(actions, !unpaid);
    setHidden(held, leftover || !next.paused);
    if (keepBox) keepBox.checked = !!next.autoContinue;
  }

  applyMode(st);

  return {
    node: wrap,
    paused: !!st.paused,
    sync(next) {
      applyMode(next);
      const leftover = isLeftover(next);
      const foe = foeVitals(next);
      syncFighter(you, next.playerHp, next.playerMaxHp);
      syncFighter(foeBlock, foe.hp, foe.max);
      if (foeTitle) foeTitle.textContent = foe.name;
      syncAccStation(acc, cockpitKit(ctx, next), leftover ? {} : {
        you: next.playerNextMs,
        they: next.foe?.nextActMs ?? 0,
      });
      syncOil(oil, ctx, next, paint);
      syncEatRow(eat, ctx, next);
      syncLeftoverHunt(hunt, ctx, next);
      if (chip) HuntSatchel.fillChip(chip, ctx, next);
      fillLogBox(logBox, leftover ? leftoverLog(next) : next.log, leftover ? 4 : 12);
    },
  };
}

function buildFight(ctx, st, paint) {
  const leftover = isLeftover(st);
  const unpaid = leftoverHasUngranted(st, ctx);
  const foe = foeVitals(st);
  const wrap = el('div', {
    class: `combat-fight${leftover ? ' leftover-station' : ''}`.trim(),
  });
  wrap.setAttribute('aria-label', leftover && !unpaid ? 'After the hunt' : unpaid ? 'Loot to collect' : 'Hunt');

  if (st.paused && st.fighting) {
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

  const kicker = el('p', { class: 'leftover-kicker' },
    leftover ? combat.leftoverKicker(st.lastStation) : '');
  setHidden(kicker, !leftover);
  wrap.append(kicker);

  const pair = el('div', { class: 'fight-pair' });
  pair.append(fighterBlock({
    title: 'You',
    hp: st.playerHp,
    max: st.playerMaxHp,
    fillClass: 'hp-you',
  }));
  pair.append(fighterBlock({
    title: foe.name,
    hp: foe.hp,
    max: foe.max,
    fillClass: 'hp-foe',
    portrait: foePortraitSrc(foeIdOf(st)),
    glyph: foePortraitSrc(foeIdOf(st)) ? null : foeMark(st),
  }));
  wrap.append(pair);

  wrap.append(accStation(cockpitKit(ctx, st), '', leftover ? {} : {
    you: st.playerNextMs,
    they: st.foe?.nextActMs ?? 0,
  }));

  wrap.append(oilBlock(ctx, st, paint));
  wrap.append(eatRow(ctx, st, paint));

  const kit = el('div', { class: 'leftover-kit' });
  kit.append(handChip(ctx, st, paint));
  kit.append(styleRow(ctx, st, paint));
  wrap.append(kit);

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
  setHidden(keep, leftover);
  wrap.append(keep);

  wrap.append(leftoverActionsRow(ctx, st, paint));
  const another = leftoverAnother(ctx, paint);
  setHidden(another, !leftover);
  wrap.append(another);
  wrap.append(el('div', { class: 'cockpit-fill', 'aria-hidden': 'true' }));
  wrap.append(logPanel(leftover ? leftoverLog(st) : st.log, { lines: leftover ? 4 : 12 }));
  return wrap;
}

/** Geometric filled mark when a foe has no cockpit PNG. */
function foeMark(_st) {
  return 'sword';
}

function foeIdOf(st) {
  return st.foe?.id ?? st.lastStation?.enemyId ?? null;
}

function fighterBlock({ title, hp, max, fillClass, glyph = null, portrait = null, compact = false }) {
  const frac = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  const vitals = el('div', { class: 'fighter-vitals' },
    el('div', { class: 'fighter-head' },
      el('strong', {}, title),
      el('span', { class: 'muted fighter-hp' }, `${hp} / ${max}`)),
    el('div', { class: `bar bar-lg hp-bar`, role: 'progressbar', 'aria-label': `${title} vitality` },
      el('span', { class: `bar-fill ${fillClass}`, style: `width:${(frac * 100).toFixed(1)}%` })));
  const role = (glyph || portrait) ? 'fighter-foe' : 'fighter-you';
  const block = el('div', { class: `fighter ${role}${compact ? ' fighter-compact' : ''}`.trim() });
  if (portrait) {
    block.append(el('span', { class: 'foe-tile foe-art', 'aria-hidden': 'true' },
      el('img', {
        src: portrait,
        alt: '',
        width: '48',
        height: '48',
        decoding: 'async',
      })));
  } else if (glyph) {
    block.append(el('span', {
      class: `foe-tile bank-glyph bank-glyph-fill glyph-${glyph}`,
      html: filledIcon(glyph),
      'aria-hidden': 'true',
    }));
  }
  block.append(vitals);
  return block;
}

function eatRow(ctx, st, paint) {
  const leftover = isLeftover(st);
  const hunt = huntTargetFrom(st);
  const dry = leftover && combat.oilSipsRemaining(ctx.state) <= 0;
  const row = el('div', { class: 'eat-row' });
  const id = combat.selectedFoodId(ctx.state);
  if (!id) {
    row.append(el('p', { class: 'muted small eat-empty' }, 'No food in the pack.'));
    const tools = el('div', { class: 'eat-slot' });
    const flee = fleeButton(ctx, paint);
    setHidden(flee, leftover);
    tools.append(flee);
    if (hunt) {
      const btn = leftoverHunt(ctx, paint);
      setHidden(btn, !leftover);
      tools.append(btn);
    }
    row.append(tools);
    return row;
  }
  const n = bankCount(ctx.state.bank, id);
  const food = FOOD[id];
  const heal = combat.foodHeal(id);
  const full = st.playerHp >= st.playerMaxHp;
  const owned = combat.ownedFoodIds(ctx.state);
  const slot = el('div', { class: 'eat-slot' });
  const pick = owned.length > 1
    ? el('button', {
      class: 'btn btn-ghost eat-pick',
      type: 'button',
      'aria-label': `Cycle food, ${food.name} +${heal}`,
      onclick: () => {
        if (ctx.cycleFood) ctx.cycleFood();
        else combat.cycleFood(ctx.state);
        paint();
      },
    })
    : el('span', { class: 'eat-pick eat-pick-solo' });
  fillEatPick(pick, id, n);
  slot.append(pick);
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
  const flee = fleeButton(ctx, paint);
  setHidden(flee, leftover);
  slot.append(flee);
  if (hunt) {
    const btn = leftoverHunt(ctx, paint);
    setHidden(btn, !leftover);
    slot.append(btn);
  }
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
  if (ctx?.state) combat.settleWalletOnlyTray(ctx.state);
  const next = ctx?.state ? combat.combatStatus(ctx.state) : st;
  return HuntSatchel.showChip(next, ctx);
}

export function unpaidLootTapNote(name) {
  return HuntSatchel.unpaidTapNote(name);
}

function oilBlock(ctx, st, paint) {
  const leftover = isLeftover(st);
  const sips = combat.oilSipsRemaining(ctx.state);
  const dry = sips <= 0;
  if (leftover) return leftoverOilRow(ctx, st, paint, { sips, dry });
  return el('div', { class: `oil-line ${st.lanternFed ? 'muted' : 'danger'}` },
    lanternCopy(st, ctx.state));
}

function syncOil(oil, ctx, st, paint) {
  if (!oil) return;
  const leftover = isLeftover(st);
  const sips = combat.oilSipsRemaining(ctx.state);
  const dry = sips <= 0;
  if (leftover && dry) {
    oil.className = 'oil-line danger leftover-dry leftover-oil-row';
    if (!oil.querySelector('.leftover-oil-buy')) {
      clear(oil);
      oil.append(el('span', { class: 'leftover-dry-copy' }, 'Need oil'));
      oil.append(el('button', {
        class: 'btn leftover-oil-buy',
        type: 'button',
        onclick: () => {
          let res;
          if (ctx.storeBuy) res = ctx.storeBuy('wick-oil', 1);
          else res = buyFromStore(ctx.state, 'wick-oil', 1);
          if (!res?.ok) ctx.toast?.(res?.error ?? 'Could not buy wick-oil.', 'warn');
          paint();
        },
      }, `Wick-oil ✦${formatNumber(liveBuyUnit(ctx.state, 'wick-oil'))}`));
    }
    return;
  }
  oil.className = leftover
    ? 'oil-line muted'
    : `oil-line ${st.lanternFed ? 'muted' : 'danger'}`;
  oil.textContent = leftover
    ? `${formatNoun(sips, 'lantern sip')} remaining`
    : lanternCopy(st, ctx.state);
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

function leftoverActionsRow(ctx, st, paint) {
  const unpaid = leftoverHasUngranted(st, ctx);
  const row = el('div', { class: 'leftover-actions' });
  setHidden(row, !unpaid);
  row.append(HuntSatchel.mountChip(ctx, st, paint));
  return row;
}

function leftoverLog(st) {
  const pinned = st.lastStation?.log;
  if (Array.isArray(pinned) && pinned.length) return pinned;
  return st.log ?? [];
}

function leftoverHunt(ctx, paint) {
  const target = huntTargetFrom(combat.combatStatus(ctx.state));
  const name = target?.enemyName ?? (target?.enemyId ? ENEMIES_BY_ID[target.enemyId]?.name : null) ?? 'this foe';
  const leftover = isLeftover(combat.combatStatus(ctx.state));
  const dry = leftover && combat.oilSipsRemaining(ctx.state) <= 0;
  return el('button', {
    class: `btn leftover-hunt ${dry ? 'btn-ghost btn-disabled' : 'btn-primary'}`,
    type: 'button',
    disabled: dry ? true : undefined,
    'aria-disabled': dry ? 'true' : 'false',
    onclick: () => {
      const last = ctx.state.combat.lastStation;
      const enemyId = last?.enemyId ?? ctx.state.combat.foe?.id;
      if (!enemyId) return;
      if (ctx.state.combat.fighting) return;
      if (combat.oilSipsRemaining(ctx.state) <= 0) {
        ctx.toast?.('The lantern is dry — buy wick-oil at the stall before a stretch.', 'warn');
        return;
      }
      const res = ctx.startFight(enemyId);
      if (!res.ok) ctx.toast(res.error, 'warn');
      paint();
    },
  }, `Hunt ${name}`);
}

function syncLeftoverHunt(btn, ctx, st) {
  if (!btn) return;
  const leftover = isLeftover(st);
  const target = huntTargetFrom(st);
  const enemy = target?.enemyId ? ENEMIES_BY_ID[target.enemyId] : null;
  const name = target?.enemyName ?? enemy?.name ?? 'this foe';
  btn.textContent = `Hunt ${name}`;
  const dry = leftover && combat.oilSipsRemaining(ctx.state) <= 0;
  btn.disabled = !!dry;
  if (dry) btn.setAttribute('disabled', '');
  else btn.removeAttribute('disabled');
  btn.setAttribute('aria-disabled', dry ? 'true' : 'false');
  btn.classList.toggle('btn-ghost', dry);
  btn.classList.toggle('btn-disabled', dry);
  btn.classList.toggle('btn-primary', !dry);
  setHidden(btn, !leftover);
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
