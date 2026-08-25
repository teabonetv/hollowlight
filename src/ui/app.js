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
// offline before restamp.
//
// Everything DOM-facing lives behind boot(); importing this module from node
// stays side-effect free.

import { createEventBus } from '../core/event-bus.js';
import { createRng } from '../core/rng.js';
import { createTickLoop, TICK_MS } from '../core/tick-loop.js';
import { formatDuration, formatNoun } from '../core/format.js';
import {
  SAVE_KEY, serializeSave, deserializeSave, SaveError,
  storageGet, storageSet,
} from '../core/save.js';
import { computeOfflineProgress, OFFLINE_MIN_AWAY_MS } from '../core/offline.js';
import { createState, pushLog } from '../game/state.js';
import { ACTIONS_BY_ID } from '../game/data/actions.js';
import { TRACKS_BY_ID } from '../game/data/upgrades.js';
import { SKILL_BY_ID } from '../game/data/skills.js';
import * as runner from '../game/systems/action-runner.js';
import * as camp from '../game/systems/upgrades.js';
import * as combat from '../game/systems/combat.js';
import { sellItems, togglePin as pinItem, savePreset as writePreset, applyPreset as usePreset,
  deletePreset as dropPreset, captureBankSnapshot, captureGearSnapshot } from '../game/systems/bank.js';
import * as storeSys from '../game/systems/store.js';
import { offerItems } from '../game/systems/offerings.js';
import { repairLantern as doRepair } from '../game/systems/repairs.js';

import { el, clear } from './dom.js';
import { icon } from './icons.js';
import { paintHud } from './hud.js';
import { createToaster } from './toast.js';
import { openModal, showOfflineModal, showSettingsModal, showSellSheet } from './modals.js';
import { renderSkillsScreen, renderSkillDetail } from './screens/skills.js';
import {
  renderCampScreen, renderBankScreen, renderMapScreen,
} from './screens/tabs.js';
import { renderAlmanacScreen } from './screens/meta.js';
import { renderStoreScreen } from './screens/store.js';
import { hydrateState } from '../game/hydrate.js';
import { cascadeAchievements, featToastMessage } from '../game/systems/achievements.js';
import { unlockPerk, respecPerks } from '../game/systems/radiance.js';
import { ensureDailies, rerollDailies, claimDaily } from '../game/systems/dailies.js';

const AUTOSAVE_MS = 30_000;

function boot() {
  // ── persistent pieces ──────────────────────────────────────────
  let game;
  const bus = createEventBus();
  const reducedMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  const toaster = createToaster(document.getElementById('toasts'));

  const hudLumen = document.getElementById('hud-lumen');
  const hudFlame = document.getElementById('hud-flame');
  const hudRadiance = document.getElementById('hud-radiance');
  const screenRoot = document.getElementById('screen');
  const modalRoot = document.getElementById('modal-root');

  const ui = { tab: 'camp', skillId: null, almanac: 'overview', campView: null };
  let liveUpdate = () => {};
  let sheetRepaint = null;
  let rng = createRng(1);

  // ── save / load / adopt ────────────────────────────────────────
  function persist({ stamp = true } = {}) {
    game.rngState = rng.getState();
    if (stamp) game.savedAt = Date.now();
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
    if (!raw) { adopt(freshGame()); return true; }
    try {
      const { state } = deserializeSave(raw);
      adopt(state);
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
      adopt(freshGame());
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

  function flushAchievementsQuiet() {
    if (!game) return 0;
    const newly = cascadeAchievements(game, {
      onUnlock(a) {
        toaster.push(featToastMessage(a), 'success');
        pushLog(game, `Feat lit: ${a.name}.`, game.stats.playtimeMs);
      },
    });
    return newly.length;
  }

  function updateHud() {
    const unspent = document.getElementById('almanac-radiance-unspent');
    paintHud(hudLumen, hudFlame, game, hudRadiance, { unspentRadiance: unspent });
  }

  // Evaluate feats, write hollowlight.save, then snap the HUD — never paint
  // from live state while the envelope still holds the pre-feat snapshot.
  function afterMutation({ redraw = false, stamp = true } = {}) {
    const n = flushAchievementsQuiet();
    persist({ stamp });
    updateHud();
    if (redraw || n) renderScreen();
    else {
      liveUpdate();
      sheetRepaint?.();
    }
    return n;
  }

  // ── screen routing ─────────────────────────────────────────────
  function buildScreen() {
    if (ui.tab === 'skills') {
      return ui.skillId ? renderSkillDetail(ctx, ui.skillId) : renderSkillsScreen(ctx);
    }
    if (ui.tab === 'bank') return renderBankScreen(ctx);
    if (ui.tab === 'map') return renderMapScreen(ctx);
    if (ui.tab === 'journal') return renderAlmanacScreen(ctx);
    if (ui.campView === 'store') return renderStoreScreen(ctx);
    return renderCampScreen(ctx);
  }

  function renderScreen() {
    clear(screenRoot);
    const s = buildScreen();
    screenRoot.append(s.node);
    liveUpdate = s.update ?? (() => {});
  }

  function setTab(tab) {
    ui.tab = tab;
    ui.skillId = null;
    ui.campView = null;
    if (tab === 'journal') {
      ui.almanac = ui.almanac && ui.almanac !== 'overview' ? ui.almanac : 'overview';
      game.stats.almanacOpens = (game.stats.almanacOpens ?? 0) + 1;
    }
    if (tab === 'map') game.stats.mapOpens = (game.stats.mapOpens ?? 0) + 1;
    for (const b of document.querySelectorAll('.tabbar button')) {
      b.classList.toggle('active', b.dataset.tab === tab);
      b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
    }
    renderScreen();
    screenRoot.scrollTop = 0;
    afterMutation({ stamp: false });
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
      if (res.ok) afterMutation();
      return res;
    },
    openSellSheet(itemId) {
      const ref = showSellSheet(modalRoot, ctx, itemId);
      sheetRepaint = () => ref?.repaint?.();
      const orig = ref.close;
      ref.close = () => { sheetRepaint = null; orig(); };
    },
    openStore() { ui.tab = 'camp'; ui.campView = 'store'; renderScreen(); },
    backToCamp() { ui.campView = null; ui.tab = 'camp'; renderScreen(); },
    storeBuy(itemId, qty) {
      const res = storeSys.buyFromStore(game, itemId, qty);
      if (!res.ok) { toaster.push(res.error ?? 'Could not buy.', 'warn'); return res; }
      toaster.push(`Bought ${res.bought} for ✦${res.spent}.`, 'success');
      afterMutation();
      renderScreen();
      return res;
    },
    storeSell(itemId, qty) {
      const res = ctx.sell(itemId, qty);
      if (res.ok) renderScreen();
      return res;
    },
    buyKindlingBundle() {
      const res = storeSys.buyKindlingBundle(game);
      if (!res.ok) { toaster.push(res.error ?? 'Could not buy.', 'warn'); return res; }
      toaster.push(`Kindling bundle — eight handfuls of Tinderscrap. −✦${res.spent}.`, 'success');
      afterMutation();
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
    openSkill(id) { ui.tab = 'skills'; ui.skillId = id; renderScreen(); },
    openSkillsList() { ui.skillId = null; renderScreen(); },
    almanacView: () => ui.almanac,
    openAlmanac(view = 'overview') {
      ui.tab = 'journal';
      ui.almanac = view;
      if (view === 'stars') game.stats.starsOpens = (game.stats.starsOpens ?? 0) + 1;
      game.stats.almanacOpens = (game.stats.almanacOpens ?? 0) + 1;
      for (const b of document.querySelectorAll('.tabbar button')) {
        b.classList.toggle('active', b.dataset.tab === 'journal');
        b.setAttribute('aria-selected', b.dataset.tab === 'journal' ? 'true' : 'false');
      }
      renderScreen();
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
      return res;
    },
    fleeFight() {
      const res = combat.fleeFight(game);
      afterMutation();
      renderScreen();
      return res;
    },
    eatFood(itemId) {
      const res = combat.eatFood(game, itemId);
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
      try { window.localStorage.removeItem(SAVE_KEY); } catch {}
      adopt(freshGame());
      persist();
      toaster.push('A new flame is kindled.', 'success');
    },
  };

  // ── offline progress (boot + tab-hidden returns) ───────────────
  function previewOfflineClaim(res) {
    const preview = structuredClone(res.nextState);
    preview.stats ??= {};
    preview.stats.offlineClaims = (preview.stats.offlineClaims ?? 0) + 1;
    const beforeL = preview.lumen;
    const beforeR = preview.radiance ?? 0;
    const newly = cascadeAchievements(preview, {
      onUnlock(a) {
        pushLog(preview, `Feat lit: ${a.name}.`, preview.stats.playtimeMs ?? 0);
      },
    });
    return {
      feats: newly,
      lumen: preview.lumen - beforeL,
      radiance: (preview.radiance ?? 0) - beforeR,
    };
  }

  function offerOffline() {
    const res = computeOfflineProgress({
      state: game,
      nowMs: Date.now(),
      lastSavedAt: game.savedAt,
      actionsById: ACTIONS_BY_ID,
    });
    const featPreview = previewOfflineClaim(res);
    if (!res.hasReport && featPreview.feats.length === 0) return;
    // Don't pop a recap solely for the "claimed once" feat when nothing ran.
    if (!res.hasReport && featPreview.feats.length === 1 && featPreview.feats[0].id === 't-off-1') {
      return;
    }

    const levels = [...res.levelUps];
    showOfflineModal(modalRoot, { ...res, featPreview }, {
      onClaim: () => {
        const livePlay = game.stats.playtimeMs;
        game = hydrateState(res.nextState);
        combat.ensureCombat(game);
        rng = createRng(game.rngState ?? 1);
        ensureDailies(game, Date.now());
        applyMotionClass();
        const extraLive = Math.max(0, livePlay - (res.originalPlaytimeMs ?? livePlay));
        game.stats.playtimeMs += extraLive;
        game.stats.offlineClaims = (game.stats.offlineClaims ?? 0) + 1;
        pushLog(game,
          `Returned after ${formatDuration(res.awayMs)} — the work went on without you.`,
          game.stats.playtimeMs);
        for (const lu of levels) bus.emit('levelup', lu);
        afterMutation({ redraw: true });
      },
    });
  }

  // ── the tick ───────────────────────────────────────────────────
  const loop = createTickLoop({
    stepMs: TICK_MS,
    onTick(dtMs) {
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
    game.stats.settingsOpens = (game.stats.settingsOpens ?? 0) + 1;
    showSettingsModal(modalRoot, ctx);
    afterMutation({ stamp: false });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      loop.stop();
      // Stamp the hide moment with the LIVE runner state (F1d Fix 1): the
      // offline calculator reads next.actions.active from this save, so the
      // running action and its progressMs must be on disk before any absence.
      persist();
    } else {
      // Absence while hidden counts as idle time — credit it honestly.
      // Compute BEFORE anything restamps game.savedAt, so hidden time counts;
      // then stamp the return so a crash mid-modal can never double-count.
      if (Date.now() - game.savedAt >= OFFLINE_MIN_AWAY_MS) offerOffline();
      persist();
      loop.start();
    }
  });
  window.addEventListener('pagehide', persist);
  setInterval(persist, AUTOSAVE_MS);

  // ── go ─────────────────────────────────────────────────────────
  const firstBoot = loadOrInit();
  if (firstBoot) {
    game.settings.reducedMotion = reducedMedia.matches;
    applyMotionClass();
    persist();
  }
  if (combat.fightWouldResume(game)) {
    ui.tab = 'skills';
    ui.skillId = 'combat';
    ui.campView = null;
    for (const b of document.querySelectorAll('.tabbar button')) {
      b.classList.toggle('active', b.dataset.tab === 'skills');
      b.setAttribute('aria-selected', b.dataset.tab === 'skills' ? 'true' : 'false');
    }
    renderScreen();
    screenRoot.scrollTop = 0;
    // Fight HUD mounts paused (Resume is explicit). Persist boot feats so
    // HUD==save without restamping the offline window.
    afterMutation({ stamp: false });
  } else {
    setTab('camp');
  }
  // Boot guard for index.html's fallback screen (F1d Fix 3): the inline boot
  // watchdog reveals a retry screen if this flag isn't set within 8s.
  window.__HOLLOWLIGHT_BOOTED = true;
  const staleFallback = typeof document !== 'undefined'
    ? document.getElementById('boot-fallback') : null;
  staleFallback?.setAttribute('hidden', '');
  if (Date.now() - game.savedAt >= OFFLINE_MIN_AWAY_MS) offerOffline();
  loop.start();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
