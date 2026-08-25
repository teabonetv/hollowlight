// App bootstrap and glue: loads/creates the save, runs the tick loop, wires
// the tab bar + HUD, flushes the save on gameplay mutations, autosaves playtime
// every 30s and on hide/unload, computes honest offline gains on load, and
// routes engine events into toasts + journal.
//
// Mutations (cycle complete, start/stop, sell, buy, claim) flush
// hollowlight.save in the same frame. The 30s interval only covers playtime
// ticking. Hide still persists; return still computes offline before restamp.
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
  renderCampScreen, renderBankScreen, renderMapScreen, renderJournalScreen,
} from './screens/tabs.js';
import { renderStoreScreen } from './screens/store.js';

const AUTOSAVE_MS = 30_000;

function boot() {
  // ── persistent pieces ──────────────────────────────────────────
  let game;
  const bus = createEventBus();
  const reducedMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  const toaster = createToaster(document.getElementById('toasts'));

  const hudLumen = document.getElementById('hud-lumen');
  const hudFlame = document.getElementById('hud-flame');
  const screenRoot = document.getElementById('screen');
  const modalRoot = document.getElementById('modal-root');

  const ui = { tab: 'camp', skillId: null, campView: null };
  let liveUpdate = () => {};
  let sheetRepaint = null;
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
    game = stateObj;
    rng = createRng(game.rngState ?? 1);
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

  // ── HUD ────────────────────────────────────────────────────────
  // Snap to the live save. A rAF count-up used to restart on every tick and
  // leave the pills mid-lerp while hollowlight.save was already correct.
  function updateHud() {
    paintHud(hudLumen, hudFlame, game);
  }

  function afterMutation() {
    persist();
    updateHud();
    liveUpdate();
    sheetRepaint?.();
  }

  // ── screen routing ─────────────────────────────────────────────
  function buildScreen() {
    if (ui.tab === 'skills') {
      return ui.skillId ? renderSkillDetail(ctx, ui.skillId) : renderSkillsScreen(ctx);
    }
    if (ui.tab === 'bank') return renderBankScreen(ctx);
    if (ui.tab === 'map') return renderMapScreen(ctx);
    if (ui.tab === 'journal') return renderJournalScreen(ctx);
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
    for (const b of document.querySelectorAll('.tabbar button')) {
      b.classList.toggle('active', b.dataset.tab === tab);
      b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
    }
    renderScreen();
    screenRoot.scrollTop = 0;
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
      toaster.push('Kindling bundle — eight handfuls of Tinderscrap.', 'success');
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
      toaster.push(res.spent ? 'Tab dye unlocked. Cosmetic only.' : 'Tab dye equipped.', 'success');
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
      afterMutation();
      renderScreen();
      return res;
    },
    openSkill(id) { ui.tab = 'skills'; ui.skillId = id; renderScreen(); },
    openSkillsList() { ui.skillId = null; renderScreen(); },
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
        adopt(res.nextState);
        game.stats.offlineClaims++;
        pushLog(game,
          `Returned after ${formatDuration(res.awayMs)} — the work went on without you.`,
          game.stats.playtimeMs);
        for (const lu of levels) bus.emit('levelup', lu);
        persist();
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
      updateHud();
      liveUpdate();
      sheetRepaint?.();
      // Cycle / halt / stop mutate bank, lumen, xp — flush now so a reload
      // cannot drop HUD-visible completions. Playtime-only ticks wait for
      // the 30s interval (or hide/pagehide).
      if (events.length > 0) persist();
    },
  });

  // ── wire static chrome ─────────────────────────────────────────
  document.querySelectorAll('.tabbar button').forEach((b) => {
    b.addEventListener('click', () => setTab(b.dataset.tab));
  });
  document.getElementById('btn-settings').addEventListener('click', () => {
    showSettingsModal(modalRoot, ctx);
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
