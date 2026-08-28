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
  /**
   * Leftover unpaid leftover-loot box (not leftover-actions). Header 44 +
   * pad 12 + gap 6 + 103px bank-item portrait (56px glyph + name + qty).
   * Soul / lumen sit as compact wallet in the well head — not 103px
   * loot-tiles. Acc / leftover-kit stay on unpaid leftover. leftover-well
   * packs Knife + styles into one 44px band so leftover-loot can spend its
   * empty floor (live critic 184 vs leftover 167) instead of collapsing
   * chrome. Empty well ghosts the hollow pack (n slots), not a gold
   * rectangle. Hunt another is a sibling under leftover-actions — not
   * inside leftover-loot — so leftover-loot can match the live well.
   * S1s 140 was leftover-actions; leftover-loot then lost the flex race
   * to 90px. Do not grow this toward Melvor's 400px drawer.
   */
  leftoverWellMin: 184,
  leftoverWellAcc: 22,
  leftoverWellKit: 44,
  leftoverTileMinW: 56,
  leftoverTileMinH: 103,
  leftoverGlyph: 56,
  leftoverWellHead: 44,
  leftoverLootPad: 6,
  leftoverLootInnerGap: 6,
  leftoverActionsGap: 0,
  leftoverActionsMin: 184,
  /** leftover-live #screen pad-top 2 + gap 0 (fight-live is pad 8 + gap 4). */
  leftoverLiveStationTop: 107,
  /**
   * Unpaid leftover kill-log. One wrapping .log-line (12px × 1.2 × 2 = 28.8)
   * plus pad. Must not shrink: leftover-loot holds 56px portraits by stealing
   * leftover chrome (fighters / hidden craft-nav / leftover-live pad), not the log.
   */
  leftoverWellLogWrap: 36,
  leftoverWellFighter: 14,
  leftoverWellGap: 0,
  leftoverWellKicker: 11,
  /**
   * Live unpaid well — same leftover-loot room as post-kill (56px glyphs),
   * not the v54 32px chip strip under Keep hunting.
   */
  fightLoot: 184,
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
 * leftover-station is height-capped to the hub. Unpaid leftover keeps Acc /
 * Knife / styles (Melvor loot lives with the fight) and spends leftover-loot
 * empty floor on that chrome so leftover is still a room, not a 90px
 * overflow:hidden drawer. lootH is leftover-loot (header + portraits), not
 * leftover-actions. Hunt another sits under leftover-actions as a sibling —
 * leftover-loot does not pay its 44px. Unpaid leftover keeps a readable
 * kill-log (≥ leftoverWellLogWrap) by compacting leftover chrome —
 * leftover-loot stays ≥ leftoverWellMin ≥ leftoverTileMinH, glyphs 56,
 * and ≥ the live unpaid well (critic 184). leftover-live hides craft-nav so
 * leftover-loot inherits that 44px as empty floor. .cockpit-fill is
 * display:none in well mode so its gaps cannot tax the portraits.
 * oilBuy: dry leftover paints a 44px stall buy on the oil row.
 * No-loot leftover-actions stays a 44px Hunt another row.
 */
export function leftoverLogVsTab({ loot = true, oilBuy = false } = {}) {
  const C = COMBAT_360;
  const box = cockpitLogVsTab('leftover');
  const stationTop = loot ? (C.leftoverLiveStationTop ?? C.leftoverStationTop) : C.leftoverStationTop;
  const oilH = oilBuy ? (C.oilBuy ?? 44) : C.oil;
  const fighterH = C.leftoverFighter ?? C.fighter;
  const gap = C.leftoverGap ?? C.gap;
  const clearance = C.tabClearance ?? 8;
  const wellMin = C.leftoverWellMin ?? 184;
  const headH = C.leftoverWellHead ?? C.hunt;
  const actionsGap = C.leftoverActionsGap ?? 0;
  const tileMinH = C.leftoverTileMinH ?? 103;
  const glyphH = C.leftoverGlyph ?? 56;
  const lootPad = C.leftoverLootPad ?? 6;
  const lootInnerGap = C.leftoverLootInnerGap ?? 6;
  const actionsMin = C.leftoverActionsMin ?? wellMin;

  if (loot) {
    // leftover-well log stays readable; leftover-actions is the well only.
    // Hunt another is a sibling under leftover-loot, not inside it.
    // cockpit-fill is display:none. Compact leftover fighters / kicker / gap.
    const wrapH = C.leftoverWellLogWrap ?? 36;
    const wellFighterH = C.leftoverWellFighter ?? fighterH;
    const wellGap = C.leftoverWellGap ?? 0;
    const kickerH = C.leftoverWellKicker ?? C.kicker;
    const accH = C.leftoverWellAcc ?? C.leftoverAcc ?? C.acc;
    const kitH = C.leftoverWellKit ?? C.hand;
    const logBottom = box.logBottom;
    const logTop = logBottom - wrapH;
    let y = stationTop;
    y += kickerH + wellGap;
    y += wellFighterH + wellGap;
    y += wellFighterH + wellGap;
    y += accH + wellGap;
    y += oilH + wellGap;
    const eatTop = y;
    const eatBottom = y + C.eat;
    y = eatBottom + wellGap;
    y += kitH + wellGap;
    const lootTop = y;
    const anotherBottom = logTop - wellGap;
    const anotherTop = anotherBottom - C.hunt;
    const lootBottom = anotherTop - actionsGap;
    const lootH = lootBottom - lootTop;
    const wellTop = lootTop;
    const wellBottom = lootBottom;
    const wellH = lootH;
    const takeTop = lootTop + lootPad;
    const takeBottom = takeTop + headH;
    const tileTop = takeBottom + lootInnerGap;
    const tileBottom = tileTop + tileMinH;
    const glyphTop = tileTop + 8;
    const glyphBottom = glyphTop + glyphH;
    const wellClears = wellBottom <= box.tabTop - clearance
      && anotherBottom <= box.tabTop - clearance
      && takeBottom <= box.tabTop - clearance
      && lootBottom <= box.tabTop - clearance
      && anotherTop >= lootBottom;
    const portraitsFit = lootH >= wellMin
      && lootH >= tileMinH
      && tileBottom <= lootBottom
      && glyphBottom <= lootBottom
      && glyphH >= 56;
    return {
      ...box,
      wrapH,
      logTop,
      loot,
      lootH,
      lootTop,
      lootBottom,
      tileTop,
      tileBottom,
      tileH: tileMinH,
      glyphH,
      glyphTop,
      glyphBottom,
      oilBuy,
      oilH,
      fillH: wellH,
      wellH,
      wellMin,
      wellTop,
      wellBottom,
      wellGap: box.tabTop - wellBottom,
      actionsMin,
      stationTop,
      stationBottom: box.logBottom,
      eatTop,
      eatBottom,
      takeTop,
      takeBottom,
      anotherTop,
      anotherBottom,
      clearance,
      // Portraits and a readable leftover kill-log both sit above tab−8.
      fits: portraitsFit && wellClears && logBottom <= box.tabTop - clearance
        && wrapH >= 36 && eatBottom < box.tabTop && wellH >= actionsMin
        && anotherTop >= lootBottom && lootH >= wellMin,
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
    wellMin,
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
 * Live 360 fight geometry. Unpaid loot is the leftover well (56px glyphs,
 * Hollow, Take all) sitting on the living fight — not a 32px chip strip.
 * Keep hunting stays; it is not the loot furniture. Eat / Fall back stay
 * above tab 577; well bottom ≤ tab−8. Unpaid live borrows leftover-well
 * compact chrome (fighters / Acc / packed kit / 36px log) so the well can
 * stay ≥ leftoverWellMin instead of collapsing to a strip to 'fit'.
 */
export function fightLogVsTab({ loot = false } = {}) {
  const C = COMBAT_360;
  const clearance = C.tabClearance ?? 8;
  const keepH = C.fightKeep ?? C.keep;
  const stationTop = C.leftoverStationTop;

  // Empty live well still occupies leftoverWellMin — same furniture as piled.
  const wrapH = C.leftoverWellLogWrap ?? 36;
  const box = cockpitLogVsTab('fight');
  const logBottom = box.logBottom;
  const logTop = logBottom - wrapH;
  const wellGap = C.leftoverWellGap ?? 0;
  const fighterH = C.leftoverWellFighter ?? C.fighter;
  const accH = C.leftoverWellAcc ?? C.leftoverAcc ?? C.acc;
  const oilH = C.oil;
  const kitH = C.leftoverWellKit ?? C.hand;
  const wellMin = C.leftoverWellMin ?? 184;
  const tileMinH = C.leftoverTileMinH ?? 103;
  const glyphH = C.leftoverGlyph ?? 56;
  const lootPad = C.leftoverLootPad ?? 6;
  const lootInnerGap = C.leftoverLootInnerGap ?? 6;
  const headH = C.leftoverWellHead ?? C.hunt;
  let y = stationTop;
  y += fighterH + wellGap;
  y += fighterH + wellGap;
  y += accH + wellGap;
  y += oilH + wellGap;
  const eatTop = y;
  const eatBottom = y + C.eat;
  y = eatBottom + wellGap;
  y += kitH + wellGap;
  y += keepH + wellGap;
  const lootTop = y;
  const lootBottom = logTop - wellGap;
  const lootH = lootBottom - lootTop;
  const takeTop = lootTop + lootPad;
  const takeBottom = takeTop + headH;
  const tileTop = takeBottom + lootInnerGap;
  const tileBottom = tileTop + tileMinH;
  const glyphTop = tileTop + 8;
  const glyphBottom = glyphTop + glyphH;
  const trayClears = lootBottom <= box.tabTop - clearance;
  const portraitsFit = lootH >= wellMin
    && lootH >= tileMinH
    && tileBottom <= lootBottom
    && glyphBottom <= lootBottom
    && glyphH >= 56;
  return {
    ...box,
    wrapH,
    logTop,
    loot: !!loot,
    lootH,
    keepH,
    clearance,
    fillH: lootH,
    wellH: lootH,
    wellMin,
    wellTop: lootTop,
    wellBottom: lootBottom,
    wellGap: box.tabTop - lootBottom,
    stationTop,
    stationBottom: logBottom,
    eatTop,
    eatBottom,
    fleeBottom: eatBottom,
    trayTop: lootTop,
    trayBottom: lootBottom,
    trayGap: box.tabTop - lootBottom,
    tileTop,
    tileBottom,
    tileH: tileMinH,
    glyphH,
    glyphTop,
    glyphBottom,
    takeTop,
    takeBottom,
    fits: portraitsFit && trayClears && logBottom <= box.tabTop - clearance
      && eatBottom < box.tabTop && wrapH >= 36,
  };
}

/**
 * Eat + Hunt-this-foe on one 360 row. Food is a loaf chip (glyph + two-line
 * Lantern-loaf / +14 · n), not an ellipsized fake <select>. Well header is
 * Hollow meter + wallet chips + Take all; Hunt another is full-width under
 * the well.
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
  const tray = wrap.querySelector('.fight-loot') ?? wrap.querySelector('.leftover-loot');
  const another = wrap.querySelector('.leftover-another');
  const hunt = wrap.querySelector('.leftover-hunt');
  const flee = wrap.querySelector('.flee-btn');
  const held = wrap.querySelector('.encounter-held');
  const logBox = wrap.querySelector('.combat-log');

  function applyMode(next) {
    const leftover = isLeftover(next);
    const unpaid = leftoverHasUngranted(next, ctx);
    const well = showLootWell(next, ctx);
    wrap.classList.toggle('leftover-station', leftover);
    wrap.classList.toggle('leftover-well', well);
    if (leftover) {
      wrap.setAttribute('aria-label', unpaid ? 'Loot to collect' : 'After the hunt');
    } else {
      wrap.setAttribute('aria-label', 'Loot to collect');
    }
    if (kicker) {
      kicker.textContent = leftover ? combat.leftoverKicker(next.lastStation) : '';
      setHidden(kicker, !leftover);
    }
    setHidden(keep, leftover);
    setHidden(flee, leftover);
    setHidden(hunt, !leftover);
    setHidden(another, !leftover);
    setHidden(actions, leftover && !unpaid);
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
      if (tray) fillLootWell(tray, ctx, next, paint);
      fillLogBox(logBox, leftover ? leftoverLog(next) : next.log, leftover ? 4 : 12);
    },
  };
}

function buildFight(ctx, st, paint) {
  const leftover = isLeftover(st);
  const unpaid = leftoverHasUngranted(st, ctx);
  const well = showLootWell(st, ctx);
  const foe = foeVitals(st);
  const wrap = el('div', {
    class: `combat-fight${leftover ? ' leftover-station' : ''}${well ? ' leftover-well' : ''}`.trim(),
  });
  wrap.setAttribute('aria-label', leftover && !unpaid ? 'After the hunt' : 'Loot to collect');

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

  wrap.append(fighterBlock({
    title: 'You',
    hp: st.playerHp,
    max: st.playerMaxHp,
    fillClass: 'hp-you',
  }));

  wrap.append(fighterBlock({
    title: foe.name,
    hp: foe.hp,
    max: foe.max,
    fillClass: 'hp-foe',
  }));

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

function fighterBlock({ title, hp, max, fillClass, compact = false }) {
  const frac = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  return el('div', { class: `fighter ${compact ? 'fighter-compact' : ''}`.trim() },
    el('div', { class: 'fighter-head' },
      el('strong', {}, title),
      el('span', { class: 'muted fighter-hp' }, `${hp} / ${max}`)),
    el('div', { class: `bar bar-lg hp-bar`, role: 'progressbar', 'aria-label': `${title} vitality` },
      el('span', { class: `bar-fill ${fillClass}`, style: `width:${(frac * 100).toFixed(1)}%` })));
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
  return ungrantedTrayEntries(st.lootTray ?? ctx.state.combat?.lootTray ?? []).length > 0;
}

function showLootWell(st, ctx) {
  return !isLeftover(st) || leftoverHasUngranted(st, ctx);
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

function trayEntries(tray) {
  return (tray ?? []).filter((e) => e && e.qty > 0);
}

function ungrantedTrayEntries(tray) {
  return trayEntries(tray).filter((e) => e.granted === false);
}

function trayFingerprint(entries) {
  return entries.map((e) => `${e.kind}:${e.id ?? ''}:${e.qty}`).join('|');
}

function trayWalletEntries(entries) {
  return (entries ?? []).filter((e) => e.kind === 'soul' || e.kind === 'lumen');
}

function trayItemEntries(entries) {
  return (entries ?? []).filter((e) => e.kind === 'item');
}

function walletChip(entry) {
  if (entry.kind === 'soul') {
    const label = formatNoun(entry.qty, 'soul');
    return el('span', {
      class: 'loot-wallet-chip loot-wallet-soul',
      'data-loot-kind': 'soul',
      'aria-label': `${label} unpaid`,
    }, label);
  }
  const label = `✦${formatNumber(entry.qty)}`;
  return el('span', {
    class: 'loot-wallet-chip loot-wallet-lumen',
    'data-loot-kind': 'lumen',
    'aria-label': `${label} Lumen unpaid`,
  }, label);
}

function lootWalletLine(entries) {
  if (!entries.length) return null;
  const line = el('span', { class: 'loot-wallet' });
  for (const e of entries) line.append(walletChip(e));
  return line;
}

/** Named 56px portrait for a bank-item tray row. Wallet never uses this. */
function trayTileSpec(entry) {
  const item = entry.id ? ITEMS_BY_ID[entry.id] : null;
  const name = item?.name ?? entry.name ?? entry.id ?? 'Loot';
  return {
    kind: 'item',
    id: entry.id ?? name,
    glyph: itemGlyph(item),
    name,
    qtyLabel: `×${formatNumber(entry.qty)}`,
    aria: `${name} ×${formatNumber(entry.qty)} unpaid`,
  };
}

function lootTile(entry, ctx) {
  const spec = trayTileSpec(entry);
  const inspectable = spec.id && ITEMS_BY_ID[spec.id];
  const attrs = {
    class: `loot-tile loot-item${inspectable ? ' loot-inspectable' : ''} glyph-${spec.glyph}`,
    'data-loot-kind': 'item',
    'data-loot-id': spec.id ?? '',
    'aria-label': spec.aria,
  };
  if (inspectable) {
    attrs.type = 'button';
    attrs.onclick = () => inspectLootItem(ctx, spec, entry);
  }
  return el(inspectable ? 'button' : 'div', attrs,
    el('span', {
      class: `loot-glyph bank-glyph bank-glyph-fill glyph-${spec.glyph}`,
      html: filledIcon(spec.glyph),
      'aria-hidden': 'true',
    }),
    el('span', { class: 'loot-copy' },
      el('span', { class: 'loot-name' }, spec.name),
      el('span', { class: 'loot-qty' }, spec.qtyLabel)));
}

function inspectLootItem(ctx, spec, entry) {
  if (!spec?.id) return;
  const opts = {
    unpaid: entry?.granted === false,
    trayQty: entry?.qty ?? 0,
  };
  if (ctx.openSellSheet) ctx.openSellSheet(spec.id, opts);
  else if (ctx.inspectLoot) ctx.inspectLoot(spec.id, { name: spec.name, qty: opts.trayQty, unpaid: opts.unpaid });
  else ctx.toast?.(`${spec.name} ${spec.qtyLabel}`, 'info');
}

function lootGhostSlot() {
  return el('div', {
    class: 'loot-ghost',
    'aria-hidden': 'true',
    'data-loot-kind': 'ghost',
  });
}

function lootItemGrid(items, ctx, ghostCount) {
  const grid = el('div', {
    class: `leftover-loot-chips loot-tray-grid${ghostCount > 0 ? ' is-ghost-pack' : ''}`,
  });
  for (const e of items) grid.append(lootTile(e, ctx));
  for (let i = 0; i < ghostCount; i++) grid.append(lootGhostSlot());
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

function leftoverActionsRow(ctx, st, paint) {
  const leftover = isLeftover(st);
  const unpaid = leftoverHasUngranted(st, ctx);
  const row = el('div', { class: 'leftover-actions' });
  setHidden(row, leftover && !unpaid);
  row.append(mountLootWell(ctx, st, paint));
  return row;
}

function mountLootWell(ctx, st, paint) {
  const row = el('div', { class: 'fight-loot leftover-tray leftover-loot' });
  fillLootWell(row, ctx, st, paint);
  return row;
}

/** Same well live and leftover: Hollow meter, wallet chips, 56px item tiles, Take all. */
function fillLootWell(row, ctx, st, paint) {
  const leftover = isLeftover(st);
  const pending = ungrantedTrayEntries(st.lootTray ?? ctx.state.combat?.lootTray ?? []);
  const items = trayItemEntries(pending);
  const wallet = trayWalletEntries(pending);
  const showChrome = !leftover || pending.length > 0;
  row.classList.toggle('is-empty', pending.length === 0);
  row.classList.toggle('leftover-loot', showChrome);
  row.classList.add('fight-loot');
  if (!showChrome) {
    clear(row);
    if (row.dataset) row.dataset.lootFp = '';
    row.setAttribute('hidden', '');
    row.setAttribute('aria-hidden', 'true');
    row.removeAttribute('aria-label');
    return;
  }
  const meter = hollowPressureCopy(ctx.state);
  const ghostCount = items.length === 0 ? lanternRoom(ctx.state) : 0;
  row.removeAttribute('hidden');
  row.removeAttribute('aria-hidden');
  row.setAttribute('aria-label', pending.length
    ? `Loot to collect · ${meter}`
    : `Loot well · ${meter}`);
  const fp = `${trayFingerprint(pending)}|${meter}|empty:${pending.length === 0}|ghosts:${ghostCount}`;
  if (row.dataset?.lootFp === fp
    && row.querySelector('.leftover-take')
    && row.querySelector('.loot-well-meter')
    && row.querySelector('.loot-tray-grid')) {
    return;
  }
  if (row.dataset) row.dataset.lootFp = fp;
  clear(row);
  const head = el('div', { class: 'loot-well-head' });
  const take = takeAllBtn(ctx, paint);
  if (!pending.length) {
    take.setAttribute('aria-disabled', 'true');
    take.classList.add('btn-disabled');
  }
  head.append(el('span', { class: 'loot-well-meter' }, meter));
  const walletLine = lootWalletLine(wallet);
  if (walletLine) head.append(walletLine);
  head.append(take);
  row.append(head);
  row.append(lootItemGrid(items, ctx, ghostCount));
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
