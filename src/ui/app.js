// App bootstrap and glue: loads/creates the save, runs the tick loop, wires
// the tab bar + HUD, flushes the save on gameplay mutations, autosaves playtime
// every 30s and on hide/unload, computes honest offline gains on load, and
// routes engine events into toasts + journal.
//
// Mutations (cycle complete, start/stop, sell, buy, claim, feats) flush
// hollowlight.save in the same frame AFTER evaluateAchievements, then the
// HUD snaps. Boot persists feat grants before the first paint (without
// restamping savedAt, so offline windows survive). The 30s interval only
// covers playtime ticking. Hide still persists; return still computes
// offline before restamp. While a recap is unclaimed, persist never
// restamps — reload must still offer the same away window. Idle away
// (≥ min threshold, including active {}) still opens the recap; Claim
// is the only close. The runner is frozen (stop + reset) until Claim,
// then held one beat so the HUD stays on the recap numbers.
//
// Everything DOM-facing lives behind boot(); importing this module from node
// stays side-effect free.

import { createEventBus } from '../core/event-bus.js';
import { createRng } from '../core/rng.js';
import { createTickLoop, TICK_MS } from '../core/tick-loop.js';
import { formatDuration, formatNoun, formatNumber } from '../core/format.js';
import {
  SAVE_KEY, UI_KEY, serializeSave, deserializeSave, SaveError, adoptedSavedAt,
  storageGet, storageSet, confirmedProgressReset,
} from '../core/save.js';
import {
  computeOfflineProgress, OFFLINE_MIN_AWAY_MS, previewOfflineClaim,
  shouldOfferOfflineRecap, creditsOfflineLabour,
} from '../core/offline.js';
import { createState, pushLog } from '../game/state.js';
import { ACTIONS_BY_ID } from '../game/data/actions.js';
import { ITEMS_BY_ID, DEFAULT_BANK_TAB } from '../game/data/items.js';
import { TRACKS_BY_ID } from '../game/data/upgrades.js';
import { SKILL_BY_ID } from '../game/data/skills.js';
import * as runner from '../game/systems/action-runner.js';
import * as camp from '../game/systems/upgrades.js';
import * as combat from '../game/systems/combat.js';
import { sellItems, togglePin as pinItem, toggleLock as lockItem, savePreset as writePreset, applyPreset as usePreset,
  deletePreset as dropPreset, captureBankSnapshot, captureGearSnapshot, resolveBankTab, STALL_TAB } from '../game/systems/bank.js';
import * as storeSys from '../game/systems/store.js';
import { offerItems } from '../game/systems/offerings.js';
import { repairLantern as doRepair } from '../game/systems/repairs.js';

import { el, clear } from './dom.js';
import { resetHuntScrollers } from './screens/combat.js';
import { icon } from './icons.js';
import { paintHud } from './hud.js';
import { createToaster } from './toast.js';
import { openModal, showOfflineModal, showSettingsModal, showSellSheet } from './modals.js';
import { renderSkillDetail } from './screens/skills.js';
import {
  renderCampScreen, renderBankScreen, renderMapScreen,
} from './screens/tabs.js';
import { renderAlmanacScreen } from './screens/meta.js';
import { hydrateState } from '../game/hydrate.js';
import { cascadeAchievements, featToastMessage, actionFeatToast } from '../game/systems/achievements.js';
import { unlockPerk, respecPerks } from '../game/systems/radiance.js';
import { ensureDailies, rerollDailies, claimDaily } from '../game/systems/dailies.js';
import { shouldRebuildScreen } from './live-paint.js';

const AUTOSAVE_MS = 30_000;
/** Hold live ticks after Claim so HUD stays on recap numbers for a beat. */
export const RECAP_THAW_MS = 800;
const UI_TABS = new Set(['camp', 'skills', 'bank', 'map', 'journal']);
const SELL_QTY_MODES = new Set(['1', '10', 'keep1', 'dump']);
const PACK_FULL_TOAST_MS = 8000;

function boot() {
  // ── persistent pieces ──────────────────────────────────────────
  let game;
  const bus = createEventBus();
  const reducedMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  const toaster = createToaster(document.getElementById('toasts'));

  const hudLumen = document.getElementById('hud-lumen');
  const hudFlame = document.getElementById('hud-flame');
  const hudRadiance = document.getElementById('hud-radiance');
  const hudKnown = document.getElementById('hud-known');
  const hudComplete = document.getElementById('hud-complete');
  const hudHollow = document.getElementById('hud-hollow');
  const screenRoot = document.getElementById('screen');
  const modalRoot = document.getElementById('modal-root');

  const ui = {
    tab: 'camp', skillId: null, lastSkillId: 'emberkeeping', almanac: 'overview', campView: null,
    bankTab: DEFAULT_BANK_TAB, sellMode: false, sellQtyMode: '1',
  };
  let liveUpdate = () => {};
  let sheetRepaint = null;
  let rng = createRng(1);
  let lastPackFullToastAt = 0;
  let recapOpen = false;
  let recapHold = false;
  let thawTimer = 0;
  // After a confirmed wipe, persist must no-op: pagehide/autosave would
  // otherwise write the old in-memory game back over the cleared keys.
  let progressWiped = false;
  let autosaveTimer = 0;
  let detachSaveWriters = () => {};

  function runnerFrozen() {
    return recapOpen || recapHold;
  }

  function freezeRunner() {
    recapHold = true;
    loop.stop();
    loop.reset();
  }

  function thawRunner() {
    recapHold = false;
    thawTimer = 0;
    if (!recapOpen && !document.hidden) loop.start();
  }

  function holdRunnerAfterClaim() {
    freezeRunner();
    if (thawTimer) clearTimeout(thawTimer);
    thawTimer = setTimeout(thawRunner, RECAP_THAW_MS);
  }

  // ── save / load / adopt ────────────────────────────────────────
  function persist({ stamp = true } = {}) {
    if (progressWiped) return;
    game.rngState = rng.getState();
    // Recap owns the save until Claim: autosave / hide / pagehide must
    // not rewrite savedAt to now while the modal is still unclaimed.
    if (stamp && !recapOpen) game.savedAt = Date.now();
    storageSet(window.localStorage, serializeSave(game, game.savedAt));
  }

  function freshGame() {
    return createState({
      nowMs: Date.now(),
      rngSeed: Math.floor(Math.random() * 0xFFFFFFFF),
    });
  }

  function adopt(stateObj, { paint = true } = {}) {
    game = hydrateState(stateObj);
    combat.ensureCombat(game);
    rng = createRng(game.rngState ?? 1);
    ensureDailies(game, Date.now());
    applyMotionClass();
    // Boot feats (and any hydrate-time unlocks) must land in hollowlight.save
    // before the first HUD paint — same eval, no later 30s flush.
    flushAchievementsQuiet();
    persist({ stamp: false });
    if (paint) {
      renderScreen();
      updateHud();
    }
  }

  /** @returns true when this boot created a brand-new save */
  function loadOrInit() {
    const raw = storageGet(window.localStorage);
    if (!raw) { adopt(freshGame(), { paint: false }); return true; }
    try {
      const { state, savedAt } = deserializeSave(raw);
      state.savedAt = adoptedSavedAt(savedAt, state.savedAt);
      adopt(state, { paint: false });
      return false;
    } catch (e) {
      const reason = e instanceof SaveError ? e.reason : 'unknown';
      // Never silently wipe: say what happened, let the player choose.
      const m = openModal(modalRoot, {
        title: 'The lantern flickered',
        body: el('p', {},
          'Your previous save could not be read ', el('em', {}, `(reason: ${reason})`),
          '. Begin anew — the road remains.'),
        persistent: true,
        actions: [el('button', {
          class: 'btn btn-primary',
          onclick: () => {
            try { window.localStorage.removeItem(SAVE_KEY); } catch {}
            m.close();
            adopt(freshGame());
          },
        }, 'Begin again')],
      });
      adopt(freshGame(), { paint: false });
      return true;
    }
  }

  // ── reduced motion ─────────────────────────────────────────────
  // A NEW save adopts the OS preference once; afterwards the player owns it.
  function applyMotionClass() {
    document.documentElement.classList.toggle('reduced-motion', !!game?.settings.reducedMotion);
  }

  // ── engine events → toasts + journal ───────────────────────────
  bus.on('levelup', ({ skillId, level }) => {
    const name = SKILL_BY_ID[skillId]?.name ?? skillId;
    toaster.push(`${name} reached level ${level}.`, 'success');
    pushLog(game, `${name} rose to level ${level}.`, game.stats.playtimeMs);
    renderScreen(); // Journal (and any open screen) shows the entry immediately
  });
  bus.on('unlock', ({ actionId }) => {
    const a = ACTIONS_BY_ID[actionId];
    if (!a) return;
    toaster.push(`New action unlocked: ${a.name}.`, 'success');
    pushLog(game, `Unlocked “${a.name}”.`, game.stats.playtimeMs);
    renderScreen();
  });
  bus.on('halted', ({ actionId, reason }) => {
    const a = ACTIONS_BY_ID[actionId];
    if (!a) return;
    toaster.push(`${a.name} stopped — ${reason}.`, 'warn');
    pushLog(game, `${a.name} halted: ${reason}.`, game.stats.playtimeMs);
    renderScreen();
  });
  // F1d Fix 1: a one-shot action (auto-restart off) finishing its final cycle
  // must repaint, so the button/progress bar agree with state.actions.active.
  bus.on('stopped', ({ actionId }) => {
    const a = ACTIONS_BY_ID[actionId];
    if (!a) return;
    toaster.push(`${a.name} complete.`, 'success');
    pushLog(game, `${a.name} finished its work.`, game.stats.playtimeMs);
    renderScreen();
  });
  bus.on('combat-kill', ({ enemyId, xp, souls }) => {
    toaster.push(`Fell a foe · +${xp} Combat XP, ${formatNoun(souls, 'soul')}.`, 'success');
    pushLog(game, `Combat: a foe (${enemyId}) fell.`, game.stats.playtimeMs);
  });
  bus.on('combat-death', ({ zoneId, lumen }) => {
    toaster.push(`You fall. ✦${lumen} spilled — walk back to recover it.`, 'warn');
    pushLog(game, `Fell on the ${zoneId} stretch. ✦${lumen} waits at the death-site.`, game.stats.playtimeMs);
    renderScreen();
  });
  bus.on('vigil-complete', ({ category, lumen }) => {
    toaster.push(`Vigil complete. ✦${lumen} for the lantern.`, 'success');
    pushLog(game, `A Vigil against ${category} is fulfilled.`, game.stats.playtimeMs);
  });
  bus.on('pack-full', () => {
    const now = Date.now();
    if (now - lastPackFullToastAt < PACK_FULL_TOAST_MS) return;
    lastPackFullToastAt = now;
    toaster.push("The lantern's hollow is full. Sell a stack to make room.", 'warn');
  });

  function collectFeats() {
    if (!game) return [];
    return cascadeAchievements(game, {
      onUnlock(a) {
        pushLog(game, `Feat lit: ${a.name}.`, game.stats.playtimeMs);
      },
    });
  }

  function toastFeats(newly) {
    for (const a of newly) toaster.push(featToastMessage(a), 'success');
  }

  function flushAchievementsQuiet() {
    const newly = collectFeats();
    toastFeats(newly);
    return newly.length;
  }

  function updateHud() {
    const unspent = document.getElementById('almanac-radiance-unspent');
    paintHud(hudLumen, hudFlame, game, hudRadiance, {
      unspentRadiance: unspent,
      hudKnown,
      hudComplete,
      hudHollow,
    });
  }

  // Evaluate feats, write hollowlight.save, then snap the HUD — never paint
  // from live state while the envelope still holds the pre-feat snapshot.
  // `actionToast`: one mutation, one line (buy/sell + feats). `holdToasts`:
  // caller will emit that line (grid/inspector sell).
  function afterMutation({ redraw = false, stamp = true, actionToast, holdToasts = false } = {}) {
    const newly = collectFeats();
    persist({ stamp });
    updateHud();
    if (shouldRebuildScreen(ui, { redraw, featUnlocks: newly.length })) renderScreen();
    else {
      liveUpdate();
      sheetRepaint?.();
    }
    if (!holdToasts) {
      if (actionToast) toaster.push(actionFeatToast(actionToast, newly), 'success');
      else toastFeats(newly);
    }
    return newly;
  }

  function rememberCraft(id) {
    if (id && SKILL_BY_ID[id]) ui.lastSkillId = id;
  }

  function skillsLanding() {
    const id = (ui.skillId && SKILL_BY_ID[ui.skillId])
      ? ui.skillId
      : (ui.lastSkillId && SKILL_BY_ID[ui.lastSkillId] ? ui.lastSkillId : 'emberkeeping');
    ui.skillId = id;
    rememberCraft(id);
    return id;
  }

  // ── screen routing ─────────────────────────────────────────────
  function buildScreen() {
    if (ui.tab === 'skills') return renderSkillDetail(ctx, skillsLanding());
    if (ui.tab === 'bank') return renderBankScreen(ctx);
    if (ui.tab === 'map') return renderMapScreen(ctx);
    if (ui.tab === 'journal') return renderAlmanacScreen(ctx);
    return renderCampScreen(ctx);
  }

  function renderScreen() {
    clear(screenRoot);
    const s = buildScreen();
    screenRoot.append(s.node);
    liveUpdate = s.update ?? (() => {});
  }

  function paintTabChrome(tab) {
    for (const b of document.querySelectorAll('.tabbar button')) {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  function writeUiRoute() {
    if (progressWiped) return;
    try {
      window.localStorage.setItem(UI_KEY, JSON.stringify({
        tab: ui.tab,
        skillId: ui.skillId,
        lastSkillId: ui.lastSkillId,
        almanac: ui.almanac,
        bankTab: resolveBankTab(ui.bankTab),
        sellMode: !!ui.sellMode,
        sellQtyMode: SELL_QTY_MODES.has(ui.sellQtyMode) ? ui.sellQtyMode : '1',
        bankLocks: [...(game?.bankLocks ?? [])],
      }));
    } catch { /* quota / private mode */ }
  }

  function readUiRoute() {
    try {
      const raw = window.localStorage.getItem(UI_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function applyUiRoute(saved) {
    if (!saved) return false;
    if (!UI_TABS.has(saved.tab)) return false;
    ui.tab = saved.tab;
    ui.lastSkillId = (saved.lastSkillId && SKILL_BY_ID[saved.lastSkillId])
      ? saved.lastSkillId
      : 'emberkeeping';
    ui.skillId = (saved.tab === 'skills' && saved.skillId && SKILL_BY_ID[saved.skillId])
      ? saved.skillId
      : (saved.tab === 'skills' ? ui.lastSkillId : null);
    rememberCraft(ui.skillId);
    ui.almanac = typeof saved.almanac === 'string' ? saved.almanac : 'overview';
    ui.campView = null;
    if (saved.campView === 'store') {
      ui.tab = 'bank';
      ui.bankTab = STALL_TAB;
      ui.skillId = null;
    } else {
      ui.bankTab = resolveBankTab(saved.bankTab);
    }
    ui.sellMode = !!saved.sellMode;
    ui.sellQtyMode = SELL_QTY_MODES.has(saved.sellQtyMode) ? saved.sellQtyMode : '1';
    if (Array.isArray(saved.bankLocks) && game) {
      game.bankLocks ??= [];
      for (const id of saved.bankLocks) {
        if (typeof id === 'string' && !game.bankLocks.includes(id)) game.bankLocks.push(id);
      }
    }
    return true;
  }

  function showRoute() {
    paintTabChrome(ui.tab);
    renderScreen();
    screenRoot.scrollTop = 0;
    for (const n of screenRoot.children) {
      if (typeof n.scrollTop === 'number') n.scrollTop = 0;
    }
    writeUiRoute();
  }

  function setTab(tab) {
    rememberCraft(ui.skillId);
    ui.tab = tab;
    ui.campView = null;
    ui.skillId = tab === 'skills'
      ? (ui.lastSkillId && SKILL_BY_ID[ui.lastSkillId] ? ui.lastSkillId : 'emberkeeping')
      : null;
    if (tab === 'bank') ui.bankTab = DEFAULT_BANK_TAB;
    if (tab === 'journal') {
      ui.almanac = ui.almanac && ui.almanac !== 'overview' ? ui.almanac : 'overview';
      game.stats.almanacOpens = (game.stats.almanacOpens ?? 0) + 1;
    }
    if (tab === 'map') game.stats.mapOpens = (game.stats.mapOpens ?? 0) + 1;
    showRoute();
    afterMutation({ stamp: false });
  }

  /** Hollow chip → owned grid. Melvor's Bank N/MAX is this door. */
  function openBank(tab = DEFAULT_BANK_TAB) {
    if (recapOpen) return;
    ui.tab = 'bank';
    ui.skillId = null;
    ui.campView = null;
    ui.bankTab = resolveBankTab(tab);
    showRoute();
    afterMutation({ stamp: false });
  }

  /** Known chip → Almanac Items found-log. Melvor's Completion Log is this door. */
  function openFoundLog() {
    if (recapOpen) return;
    ctx.openAlmanac('log-items');
  }

  // ── ctx handed to screens & modals ─────────────────────────────
  const ctx = {
    get state() { return game; },
    toast: (m, t) => toaster.push(m, t),
    actionStatus: (id) => runner.actionStatus(game, id),
    toggleAction(actionId) {
      if (game.actions.active[actionId]) {
        runner.stopAction(game, actionId);
        afterMutation({ redraw: true });
        return;
      }
      const res = runner.startAction(game, actionId);
      if (!res.ok) { toaster.push(res.error, 'warn'); return; }
      afterMutation({ redraw: true });
    },
    setAutoRestart(id, on) { runner.setAutoRestart(game, id, on); afterMutation(); },
    // ── F1c economy: selling + Keeper's Camp upgrades ──────────────
    sell(itemId, qty) {
      const res = sellItems(game, itemId, qty);
      if (res.ok) res.feats = afterMutation({ holdToasts: true });
      else res.feats = [];
      return res;
    },
    get bankTab() { return ui.bankTab; },
    setBankTab(tab) { ui.bankTab = resolveBankTab(tab); writeUiRoute(); },
    openBank,
    get sellMode() { return ui.sellMode; },
    setSellMode(on) { ui.sellMode = !!on; writeUiRoute(); },
    get sellQtyMode() { return ui.sellQtyMode; },
    setSellQtyMode(mode) {
      if (SELL_QTY_MODES.has(mode)) ui.sellQtyMode = mode;
      writeUiRoute();
    },
    openSellSheet(itemId) {
      const ref = showSellSheet(modalRoot, ctx, itemId);
      sheetRepaint = () => ref?.repaint?.();
      const orig = ref.close;
      ref.close = () => { sheetRepaint = null; orig(); };
    },
    openStore() {
      ui.tab = 'bank';
      ui.bankTab = STALL_TAB;
      ui.skillId = null;
      ui.campView = null;
      showRoute();
    },
    backToCamp() { ui.campView = null; ui.tab = 'camp'; showRoute(); },
    storeBuy(itemId, qty) {
      const res = storeSys.buyFromStore(game, itemId, qty);
      if (!res.ok) { toaster.push(res.error ?? 'Could not buy.', 'warn'); return res; }
      afterMutation({ actionToast: `Bought ${res.bought} for ✦${res.spent}.` });
      renderScreen();
      return res;
    },
    storeSell(itemId, qty) {
      const res = ctx.sell(itemId, qty);
      if (!res.ok) return res;
      const item = ITEMS_BY_ID[itemId];
      const line = item
        ? `Sold ${item.name} ×${res.sold} for ✦${formatNumber(res.gained)}.`
        : `Sold ×${res.sold} for ✦${formatNumber(res.gained)}.`;
      toaster.push(actionFeatToast(line, res.feats), 'success');
      renderScreen();
      return res;
    },
    buyKindlingBundle() {
      const res = storeSys.buyKindlingBundle(game);
      if (!res.ok) { toaster.push(res.error ?? 'Could not buy.', 'warn'); return res; }
      afterMutation({
        actionToast: `Kindling bundle — eight handfuls of Tinderscrap. −✦${res.spent}.`,
      });
      renderScreen();
      return res;
    },
    offer(itemId, qty) {
      const res = offerItems(game, itemId, qty);
      if (res.ok) afterMutation();
      return res;
    },
    repairLantern(kitId) {
      const res = doRepair(game, kitId);
      if (!res.ok) { toaster.push(res.error ?? 'Could not repair.', 'warn'); return res; }
      toaster.push(`Lantern ${res.integrity}/100.`, 'success');
      afterMutation();
      renderScreen();
      return res;
    },
    togglePin(itemId) {
      pinItem(game, itemId);
      afterMutation();
    },
    toggleLock(itemId) {
      lockItem(game, itemId);
      writeUiRoute();
      afterMutation();
    },
    savePreset(kind) {
      const items = kind === 'gear' ? captureGearSnapshot(game.bank) : captureBankSnapshot(game.bank);
      const name = kind === 'gear' ? 'Gear set' : 'Loadout';
      writePreset(game, name, items, { kind: kind === 'gear' ? 'gear' : 'loadout' });
      toaster.push(`${name} saved.`, 'success');
      afterMutation();
      renderScreen();
    },
    applyPreset(id) {
      const res = usePreset(game, id);
      if (!res.ok) { toaster.push(res.error, 'warn'); return; }
      const miss = res.missing.length;
      toaster.push(miss ? `Pinned. Missing ${miss} stacks.` : 'Loadout pinned — you have every stack.', miss ? 'warn' : 'success');
      afterMutation();
      renderScreen();
    },
    deletePreset(id) {
      dropPreset(game, id);
      afterMutation();
      renderScreen();
    },
    buyTheme(themeId) {
      const res = storeSys.buyTheme(game, themeId);
      if (!res.ok) { toaster.push(res.error ?? 'Could not dye.', 'warn'); return res; }
      toaster.push(res.spent ? `Tab dye unlocked. Cosmetic only. −✦${res.spent}.` : 'Tab dye equipped.', 'success');
      afterMutation();
      renderScreen();
      return res;
    },
    buyUpgrade(trackId) {
      const res = camp.buyUpgrade(game, trackId);
      if (!res.ok) { toaster.push(res.error ?? 'Could not buy that.', 'warn'); return res; }
      const track = TRACKS_BY_ID[trackId];
      toaster.push(`${track.name} — ${res.tier.name}. The camp brightens.`, 'success');
      pushLog(game, `Upgraded ${track.name}: ${res.tier.name} (${camp.upgradeLevel(game, trackId)}/${track.tiers.length}).`, game.stats.playtimeMs);
      afterMutation({ redraw: true });
      return res;
    },
    openSkill(id) {
      ui.tab = 'skills';
      ui.skillId = SKILL_BY_ID[id] ? id : 'emberkeeping';
      rememberCraft(ui.skillId);
      ui.campView = null;
      showRoute();
    },
    openSkillsList() {
      ui.tab = 'skills';
      ui.skillId = ui.lastSkillId && SKILL_BY_ID[ui.lastSkillId] ? ui.lastSkillId : 'emberkeeping';
      showRoute();
    },
    almanacView: () => ui.almanac,
    openAlmanac(view = 'overview') {
      ui.tab = 'journal';
      ui.almanac = view;
      ui.skillId = null;
      ui.campView = null;
      if (view === 'stars') game.stats.starsOpens = (game.stats.starsOpens ?? 0) + 1;
      game.stats.almanacOpens = (game.stats.almanacOpens ?? 0) + 1;
      showRoute();
      afterMutation({ stamp: false });
    },
    ensureDailies() { ensureDailies(game, Date.now()); },
    rerollDailies() {
      const res = rerollDailies(game, Date.now());
      if (!res.ok) { toaster.push(res.error, 'warn'); return; }
      toaster.push('The embers shift.', 'info');
      afterMutation({ redraw: true });
    },
    claimDaily(id) {
      const res = claimDaily(game, id);
      if (!res.ok) { toaster.push(res.error, 'warn'); return; }
      toaster.push(`+${res.sparks} Radiance from a daily ember.`, 'success');
      afterMutation({ redraw: true });
    },
    unlockPerk(id) {
      const res = unlockPerk(game, id);
      if (!res.ok) { toaster.push(res.error, 'warn'); return; }
      toaster.push(`Star kindled: ${res.perk.name}.`, 'success');
      pushLog(game, `Kindled the star “${res.perk.name}”.`, game.stats.playtimeMs);
      afterMutation({ redraw: true });
    },
    respecPerks() {
      const res = respecPerks(game);
      if (!res.ok) { toaster.push(res.error, 'warn'); return; }
      toaster.push(`Stars rearranged. ✦${res.cost} paid, ${res.refund} Radiance returned.`, 'success');
      afterMutation({ redraw: true });
    },
    equipTitle(title) {
      game.cosmetics ??= { titles: [], frames: ['plain'], lanternFrame: 'plain', activeTitle: null };
      game.cosmetics.activeTitle = title;
      afterMutation({ redraw: true });
    },
    startFight(enemyId) {
      const res = combat.startFight(game, enemyId);
      if (!res.ok) return res;
      afterMutation();
      renderScreen();
      resetHuntScrollers(screenRoot);
      return res;
    },
    fleeFight() {
      const res = combat.fleeFight(game);
      afterMutation();
      renderScreen();
      resetHuntScrollers(screenRoot);
      return res;
    },
    dismissLastStation() {
      const res = combat.dismissLastStation(game);
      if (!res.ok) toaster.push(res.error ?? "The lantern's hollow is full. Sell a stack to make room.", 'warn');
      afterMutation();
      renderScreen();
      return res;
    },
    takeAllLootTray() {
      const res = combat.takeAllLootTray(game);
      if (res.blocked) toaster.push(res.error ?? "The lantern's hollow is full. Sell a stack to make room.", 'warn');
      afterMutation();
      return res;
    },
    eatFood(itemId) {
      const res = combat.eatFood(game, itemId);
      if (res.ok) afterMutation();
      return res;
    },
    selectFood(itemId) {
      const res = combat.selectFood(game, itemId);
      if (res.ok) afterMutation();
      return res;
    },
    cycleFood() {
      const res = combat.cycleFood(game);
      if (res.ok) afterMutation();
      return res;
    },
    recoverLumen(zoneId) {
      const res = combat.recoverLumen(game, zoneId);
      if (res.ok) afterMutation();
      return res;
    },
    assignVigil() {
      const res = combat.assignVigil(game);
      if (res.ok) afterMutation();
      return res;
    },
    setCombatStyle(styleId) {
      const res = combat.setStyle(game, styleId);
      if (res.ok) afterMutation();
      return res;
    },
    equipWeapon(itemId) {
      const res = combat.equipWeapon(game, itemId);
      if (res.ok) afterMutation();
      return res;
    },
    setCombatAutoContinue(on) {
      combat.ensureCombat(game).autoContinue = !!on;
      afterMutation();
    },
    resumeCombat() {
      combat.resumeCombat(game);
      afterMutation();
    },
    isReducedMotion: () => !!game.settings.reducedMotion,
    setReducedMotion(on) { game.settings.reducedMotion = !!on; persist(); applyMotionClass(); },
    exportSave() { game.rngState = rng.getState(); return serializeSave(game, game.savedAt); },
    importSave(json) {
      try {
        const { state } = deserializeSave(json);
        // Imported saves are stamped as saved-now: no surprise offline popups.
        state.savedAt = Date.now();
        adopt(state);
        persist();
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: e instanceof SaveError ? e.reason : 'invalid' };
      }
    },
    resetGame() {
      // Two-tap confirm already happened. Block every save writer, unhook
      // pagehide/hide/autosave, then destroy keys and reload a genuine
      // createState boot. Clear-then-reload without the persist block is
      // not a wipe — unload rewrites hollowlight.save from memory.
      confirmedProgressReset(window.localStorage, {
        beginReset: () => { progressWiped = true; },
        detachWriters: () => detachSaveWriters(),
        reload: () => { window.location.reload(); },
      });
    },
  };

  // ── offline progress (boot + tab-hidden returns) ───────────────
  function offerOffline() {
    if (recapOpen) return;
    const res = computeOfflineProgress({
      state: game,
      nowMs: Date.now(),
      lastSavedAt: game.savedAt,
      actionsById: ACTIONS_BY_ID,
    });
    // Always recap when away ≥ min, including idle / feats-only. Swallowing
    // empty-away lets persist restamp savedAt and the window never returns.
    if (!shouldOfferOfflineRecap(res)) return;
    const featPreview = previewOfflineClaim(res);

    const levels = [...res.levelUps];
    recapOpen = true;
    freezeRunner();
    showOfflineModal(modalRoot, { ...res, featPreview }, {
      onClaim: () => {
        recapOpen = false;
        game = hydrateState(res.nextState);
        combat.ensureCombat(game);
        rng = createRng(game.rngState ?? 1);
        ensureDailies(game, Date.now());
        applyMotionClass();
        // Work Went On tracks full-span idle labour, not a feats-only /
        // fuel-halt sliver. Recap-open wall time is not play — do not merge
        // leaked ticks into Time by the Flame. Claim is the only apply.
        if (creditsOfflineLabour(res)) {
          game.stats.offlineClaims = (game.stats.offlineClaims ?? 0) + 1;
          pushLog(game,
            `Returned after ${formatDuration(res.awayMs)} — the work went on without you.`,
            game.stats.playtimeMs);
        } else {
          pushLog(game,
            `Returned after ${formatDuration(res.awayMs)}.`,
            game.stats.playtimeMs);
        }
        for (const lu of levels) bus.emit('levelup', lu);
        afterMutation({ redraw: true });
        holdRunnerAfterClaim();
      },
    });
  }

  // ── the tick ───────────────────────────────────────────────────
  const loop = createTickLoop({
    stepMs: TICK_MS,
    onTick(dtMs) {
      if (runnerFrozen()) return;
      const events = runner.tickActions(game, dtMs, rng);
      events.push(...combat.tickCombat(game, dtMs));
      game.stats.playtimeMs += dtMs;
      for (const ev of events) bus.emit(ev.type, ev);
      const newly = flushAchievementsQuiet();
      // Cycle / halt / stop / feat grants mutate wallet — flush before HUD
      // paint so a reload cannot drop HUD-visible work. An unpaused fight
      // also flushes every tick (≤100ms) so painted HP matches the save
      // mid-blow. Playtime-only ticks wait for the 30s interval.
      if (events.length > 0 || newly > 0 || combat.combatShouldFlush(game)) {
        persist({ stamp: true });
      }
      updateHud();
      liveUpdate();
      sheetRepaint?.();
    },
  });

  // ── wire static chrome ─────────────────────────────────────────
  document.querySelectorAll('.tabbar button').forEach((b) => {
    b.addEventListener('click', () => setTab(b.dataset.tab));
  });
  document.getElementById('btn-settings').addEventListener('click', () => {
    if (recapOpen) return;
    game.stats.settingsOpens = (game.stats.settingsOpens ?? 0) + 1;
    showSettingsModal(modalRoot, ctx);
    afterMutation({ stamp: false });
  });
  hudKnown?.addEventListener('click', () => openFoundLog());
  hudHollow?.addEventListener('click', () => openBank('owned'));

  function persistOnPageHide() { persist(); }
  function onVisibilityChange() {
    if (document.hidden) {
      loop.stop();
      // Stamp the hide moment with the LIVE runner state (F1d Fix 1): the
      // offline calculator reads next.actions.active from this save, so the
      // running action and its progressMs must be on disk before any absence.
      persist();
    } else {
      // Absence while hidden counts as idle time — credit it honestly.
      // Compute BEFORE anything restamps game.savedAt, so hidden time counts.
      // persist() itself will not restamp while recapOpen, so a reload with
      // the modal still up keeps the away window instead of a zero-away boot.
      if (Date.now() - game.savedAt >= OFFLINE_MIN_AWAY_MS) offerOffline();
      persist();
      if (!runnerFrozen()) loop.start();
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', persistOnPageHide);
  autosaveTimer = setInterval(persist, AUTOSAVE_MS);
  detachSaveWriters = () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', persistOnPageHide);
    if (autosaveTimer) {
      clearInterval(autosaveTimer);
      autosaveTimer = 0;
    }
    try { loop.stop(); } catch { /* loop may not have started */ }
  };

  // ── go ─────────────────────────────────────────────────────────
  const firstBoot = loadOrInit();
  if (firstBoot) {
    game.settings.reducedMotion = reducedMedia.matches;
    applyMotionClass();
    persist();
  }
  const restored = applyUiRoute(readUiRoute());
  if (combat.fightWouldResume(game)) {
    if (!restored || (ui.tab === 'skills' && ui.skillId === 'combat')) {
      ui.tab = 'skills';
      ui.skillId = 'combat';
      ui.lastSkillId = 'combat';
      ui.campView = null;
    }
  } else if (!restored) {
    ui.tab = 'camp';
    ui.skillId = null;
    ui.campView = null;
  }
  showRoute();
  // Fight HUD mounts paused (Resume is explicit). Persist boot feats so
  // HUD==save without restamping the offline window.
  afterMutation({ stamp: false });
  // Boot guard: index.html reveals #boot-fallback only on a real module
  // failure (or a 45s hang). A late boot still hides it if it ever flashed.
  window.__HOLLOWLIGHT_BOOTED = true;
  const staleFallback = typeof document !== 'undefined'
    ? document.getElementById('boot-fallback') : null;
  if (staleFallback) {
    staleFallback.hidden = true;
    staleFallback.setAttribute('hidden', '');
  }
  if (Date.now() - game.savedAt >= OFFLINE_MIN_AWAY_MS) offerOffline();
  if (!runnerFrozen()) loop.start();
}

if (typeof document !== 'undefined') {
  const start = () => {
    try {
      boot();
    } catch (err) {
      try { window.__HOLLOWLIGHT_BOOT_FAIL?.(); } catch { /* overlay is best-effort */ }
      throw err;
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}
