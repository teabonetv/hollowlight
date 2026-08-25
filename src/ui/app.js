// App bootstrap and glue: loads/creates the save, runs the tick loop, wires
// the tab bar + HUD, autosaves every 30s and on hide/unload, computes honest
// offline gains on load, and routes engine events into toasts + journal.
//
// Everything DOM-facing lives behind boot(); importing this module from node
// stays side-effect free.

import { createEventBus } from '../core/event-bus.js';
import { createRng } from '../core/rng.js';
import { createTickLoop, TICK_MS } from '../core/tick-loop.js';
import { formatNumber, formatDuration } from '../core/format.js';
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
import { sellItems } from '../game/systems/bank.js';

import { el, clear } from './dom.js';
import { icon } from './icons.js';
import { createToaster } from './toast.js';
import { openModal, showOfflineModal, showSettingsModal, showSellSheet } from './modals.js';
import { renderSkillsScreen, renderSkillDetail } from './screens/skills.js';
import {
  renderCampScreen, renderBankScreen, renderMapScreen,
} from './screens/tabs.js';
import { renderAlmanacScreen } from './screens/meta.js';
import { hydrateState } from '../game/hydrate.js';
import { evaluateAchievements } from '../game/systems/achievements.js';
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

  const ui = { tab: 'camp', skillId: null, almanac: 'overview' };
  let liveUpdate = () => {};
  let rng = createRng(1);

  // ── save / load / adopt ────────────────────────────────────────
  function persist() {
    game.rngState = rng.getState();
    game.savedAt = Date.now();
    storageSet(window.localStorage, serializeSave(game, game.savedAt));
  }

  function freshGame() {
    return createState({
      nowMs: Date.now(),
      rngSeed: Math.floor(Math.random() * 0xFFFFFFFF),
    });
  }

  function adopt(stateObj) {
    game = hydrateState(stateObj);
    rng = createRng(game.rngState ?? 1);
    ensureDailies(game, Date.now());
    applyMotionClass();
    renderScreen();
    updateHud();
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

  function flushAchievementsQuiet() {
    if (!game) return;
    const newly = evaluateAchievements(game);
    for (const a of newly) {
      toaster.push(`Feat: ${a.name}.`, 'success');
      pushLog(game, `Feat lit: ${a.name}.`, game.stats.playtimeMs);
    }
    return newly.length;
  }
  function flushAchievements() {
    const n = flushAchievementsQuiet();
    if (n) { updateHud(); renderScreen(); }
  }

  // ── HUD ────────────────────────────────────────────────────────
  // Lumen counts UP to its new value after sells/purchases (F1c feedback);
  // reduced motion skips straight to the number.
  let shownLumen = null;
  let lumenAnimId = 0;
  function paintLumen(v) {
    hudLumen.textContent = `✦ ${formatNumber(v)}`;
  }
  function updateHud() {
    const target = game.lumen;
    if (shownLumen === null || shownLumen === target || game.settings.reducedMotion) {
      shownLumen = target;
      paintLumen(target);
    } else {
      startLumenCountUp(shownLumen, target);
    }
    hudFlame.textContent = `${formatNumber(game.flame)} flame`;
    if (hudRadiance) hudRadiance.textContent = `✧ ${formatNumber(game.radiance ?? 0)}`;
  }
  function startLumenCountUp(from, to) {
    globalThis.cancelAnimationFrame?.(lumenAnimId);
    const t0 = performance.now();
    const DUR_MS = 450;
    const frame = (t) => {
      const p = Math.min(1, (t - t0) / DUR_MS);
      shownLumen = Math.round(from + (to - from) * p);
      paintLumen(shownLumen);
      if (p < 1) lumenAnimId = requestAnimationFrame(frame);
    };
    lumenAnimId = requestAnimationFrame(frame);
  }

  // ── screen routing ─────────────────────────────────────────────
  function buildScreen() {
    if (ui.tab === 'skills') {
      return ui.skillId ? renderSkillDetail(ctx, ui.skillId) : renderSkillsScreen(ctx);
    }
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

  function setTab(tab) {
    ui.tab = tab;
    ui.skillId = null;
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
    flushAchievements();
  }

  // ── ctx handed to screens & modals ─────────────────────────────
  const ctx = {
    get state() { return game; },
    toast: (m, t) => toaster.push(m, t),
    actionStatus: (id) => runner.actionStatus(game, id),
    toggleAction(actionId) {
      if (game.actions.active[actionId]) {
        runner.stopAction(game, actionId);
        persist();
        renderScreen();
        return;
      }
      const res = runner.startAction(game, actionId);
      if (!res.ok) { toaster.push(res.error, 'warn'); return; }
      persist();
      renderScreen();
    },
    setAutoRestart(id, on) { runner.setAutoRestart(game, id, on); persist(); },
    // ── F1c economy: selling + Keeper's Camp upgrades ──────────────
    sell(itemId, qty) {
      const res = sellItems(game, itemId, qty);
      if (res.ok) { persist(); updateHud(); flushAchievementsQuiet(); }
      return res;
    },
    openSellSheet(itemId) {
      showSellSheet(modalRoot, ctx, itemId);
    },
    buyUpgrade(trackId) {
      const res = camp.buyUpgrade(game, trackId);
      if (!res.ok) { toaster.push(res.error ?? 'Could not buy that.', 'warn'); return res; }
      const track = TRACKS_BY_ID[trackId];
      toaster.push(`${track.name} — ${res.tier.name}. The camp brightens.`, 'success');
      pushLog(game, `Upgraded ${track.name}: ${res.tier.name} (${camp.upgradeLevel(game, trackId)}/${track.tiers.length}).`, game.stats.playtimeMs);
      persist();
      updateHud();
      renderScreen();
      flushAchievements();
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
      flushAchievements();
    },
    ensureDailies() { ensureDailies(game, Date.now()); },
    rerollDailies() {
      const res = rerollDailies(game, Date.now());
      if (!res.ok) { toaster.push(res.error, 'warn'); return; }
      toaster.push('The embers shift.', 'info');
      persist();
      renderScreen();
      flushAchievements();
    },
    claimDaily(id) {
      const res = claimDaily(game, id);
      if (!res.ok) { toaster.push(res.error, 'warn'); return; }
      toaster.push(`+${res.sparks} Radiance from a daily ember.`, 'success');
      persist();
      updateHud();
      renderScreen();
      flushAchievements();
    },
    unlockPerk(id) {
      const res = unlockPerk(game, id);
      if (!res.ok) { toaster.push(res.error, 'warn'); return; }
      toaster.push(`Star kindled: ${res.perk.name}.`, 'success');
      pushLog(game, `Kindled the star “${res.perk.name}”.`, game.stats.playtimeMs);
      persist();
      updateHud();
      renderScreen();
      flushAchievements();
    },
    respecPerks() {
      const res = respecPerks(game);
      if (!res.ok) { toaster.push(res.error, 'warn'); return; }
      toaster.push(`Stars rearranged. ✦${res.cost} paid, ${res.refund} Radiance returned.`, 'success');
      persist();
      updateHud();
      renderScreen();
      flushAchievements();
    },
    equipTitle(title) {
      game.cosmetics ??= { titles: [], frames: ['plain'], lanternFrame: 'plain', activeTitle: null };
      game.cosmetics.activeTitle = title;
      persist();
      renderScreen();
      flushAchievements();
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
  function offerOffline() {
    const res = computeOfflineProgress({
      state: game,
      nowMs: Date.now(),
      lastSavedAt: game.savedAt,
      actionsById: ACTIONS_BY_ID,
    });
    console.error('[probe] offerOffline ran; away=', res.awayMs, 'hasGains=', res.hasGains, 'savedAt=', game.savedAt, 'now=', Date.now());
    if (!res.hasGains) return;

    const levels = [...res.levelUps];
    showOfflineModal(modalRoot, res, {
      onClaim: () => {
        const livePlay = game.stats.playtimeMs;
        adopt(res.nextState);
        const extraLive = Math.max(0, livePlay - (res.originalPlaytimeMs ?? livePlay));
        game.stats.playtimeMs += extraLive;
        game.stats.offlineClaims = (game.stats.offlineClaims ?? 0) + 1;
        persist();
        pushLog(game,
          `Returned after ${formatDuration(res.awayMs)} — the work went on without you.`,
          game.stats.playtimeMs);
        for (const lu of levels) bus.emit('levelup', lu);
        flushAchievements();
        updateHud();
        renderScreen();
      },
    });
  }

  // ── the tick ───────────────────────────────────────────────────
  const loop = createTickLoop({
    stepMs: TICK_MS,
    onTick(dtMs) {
      const events = runner.tickActions(game, dtMs, rng);
      game.stats.playtimeMs += dtMs;
      for (const ev of events) bus.emit(ev.type, ev);
      flushAchievementsQuiet();
      updateHud();
      liveUpdate();
    },
  });

  // ── wire static chrome ─────────────────────────────────────────
  document.querySelectorAll('.tabbar button').forEach((b) => {
    b.addEventListener('click', () => setTab(b.dataset.tab));
  });
  document.getElementById('btn-settings').addEventListener('click', () => {
    game.stats.settingsOpens = (game.stats.settingsOpens ?? 0) + 1;
    showSettingsModal(modalRoot, ctx);
    flushAchievements();
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
  setTab('camp');
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
