// Settings → Reset all progress: first tap arms; second tap destroys live
// storage, blocks the pagehide writer, and the next boot is a genuine
// createState envelope. A short playthrough already sits on starter
// ✦35 / Known 6 / ~4% — "still 35 lumen" is not proof of a wipe. Tests
// dirty the save first (gain lumen, stall buy, tick, leftover + fight).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeNode, FakeText } from './helpers/fake-node.mjs';

globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => new FakeText(s),
  addEventListener() {},
  removeEventListener() {},
};
globalThis.requestAnimationFrame = (fn) => 0;
try { globalThis.navigator = {}; } catch { /* node ≥21 read-only */ }

const {
  SAVE_KEY, UI_KEY, SAVE_VERSION, serializeSave, deserializeSave,
  storageGet, storageSet, confirmedProgressReset,
} = await import('../src/core/save.js');
const { createState, pushLog, STARTER_BANK } = await import('../src/game/state.js');
const { cascadeAchievements } = await import('../src/game/systems/achievements.js');
const { sellItems } = await import('../src/game/systems/bank.js');
const { buyFromStore } = await import('../src/game/systems/store.js');
const { startAction, tickActions } = await import('../src/game/systems/action-runner.js');
const { createRng } = await import('../src/core/rng.js');
const { ensureCombat, pushLeftoverTray } = await import('../src/game/systems/combat.js');
const { showSettingsModal } = await import('../src/ui/modals.js');
const {
  paintHud, formatKnownChip, formatHollowChip, formatTrueCompletionChip,
} = await import('../src/ui/hud.js');
const { formatNumber } = await import('../src/core/format.js');

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
  };
}

function dangerBtn(mount) {
  return mount.querySelector('.btn-danger');
}

function newSaveState() {
  const fresh = createState({ nowMs: 3, rngSeed: 3 });
  cascadeAchievements(fresh, {
    onUnlock(a) { pushLog(fresh, `Feat lit: ${a.name}.`, 0); },
  });
  return fresh;
}

function dirtyPlaythrough() {
  const s = createState({ nowMs: 1, rngSeed: 7 });
  cascadeAchievements(s, {
    onUnlock(a) { pushLog(s, `Feat lit: ${a.name}.`, 0); },
  });
  const starterLumen = s.lumen;
  assert.equal(starterLumen, 35, 'minute-zero is still the starter kit');

  const sold = sellItems(s, 'fogwort', 2);
  assert.equal(sold.ok, true, 'gain lumen by selling');
  assert.ok(s.lumen > starterLumen, 'wallet moved off starter 35');

  const bought = buyFromStore(s, 'palecap', 1);
  assert.equal(bought.ok, true, 'stall buy of a non-starter item');
  assert.ok((s.bank.palecap ?? 0) >= 1);
  assert.equal(STARTER_BANK.palecap, undefined);

  const started = startAction(s, 'tend-flame');
  assert.equal(started.ok, true);
  tickActions(s, 900, createRng(11));
  assert.ok(s.actions.active['tend-flame']?.progressMs > 0, 'ticked a running action');

  ensureCombat(s);
  s.combat.fighting = true;
  s.combat.foe = { id: 'ash-moth', hp: 8, maxHp: 8 };
  s.combat.paused = false;
  pushLeftoverTray(s, [{ kind: 'item', id: 'graveresin', qty: 2, granted: false }]);
  s.combat.lastStation = { enemyId: 'ash-moth', hp: 8, log: [] };

  return { state: s, starterLumen };
}

function openSettings(store, { onReset } = {}) {
  const mount = new FakeNode('div');
  showSettingsModal(mount, {
    isReducedMotion: () => false,
    setReducedMotion() {},
    exportSave: () => store.getItem(SAVE_KEY) ?? '',
    importSave: () => ({ ok: true }),
    resetGame() { onReset?.(); },
    toast() {},
  });
  return mount;
}

function paintPills(state) {
  const hudLumen = new FakeNode('span');
  const hudFlame = new FakeNode('span');
  const hudRadiance = new FakeNode('span');
  const hudKnown = new FakeNode('button');
  const hudComplete = new FakeNode('span');
  const hudHollow = new FakeNode('button');
  paintHud(hudLumen, hudFlame, state, hudRadiance, { hudKnown, hudComplete, hudHollow });
  return { hudLumen, hudKnown, hudComplete, hudHollow };
}

test('first tap arms reset and does not wipe a dirty save', () => {
  const store = fakeStorage();
  const { state: dirty } = dirtyPlaythrough();
  storageSet(store, serializeSave(dirty, 1));
  store.setItem(UI_KEY, JSON.stringify({ tab: 'bank' }));

  let resets = 0;
  const mount = openSettings(store, { onReset: () => { resets += 1; } });
  const btn = dangerBtn(mount);
  assert.ok(btn, 'Danger control is present');
  assert.match(btn.textContent, /Reset all progress/);
  btn.click();

  assert.equal(resets, 0, 'arming tap must not call resetGame');
  assert.match(btn.textContent, /Tap again — this snuffs your flame/);
  const raw = storageGet(store);
  const env = JSON.parse(raw);
  assert.equal(env.state.lumen, dirty.lumen);
  assert.ok((env.state.bank.palecap ?? 0) >= 1, 'stall buy still on disk');
  assert.equal(store.getItem(UI_KEY), JSON.stringify({ tab: 'bank' }));
});

test('second tap wipes a dirty save; pagehide cannot write it back', () => {
  assert.equal(SAVE_VERSION, 5);
  const store = fakeStorage();
  const { state: dirty, starterLumen } = dirtyPlaythrough();
  const dirtyLumen = dirty.lumen;
  assert.ok(dirtyLumen !== starterLumen);
  assert.ok((dirty.bank.palecap ?? 0) >= 1);
  assert.equal(dirty.combat.fighting, true);
  assert.ok((dirty.combat.lootTray ?? []).length > 0);

  storageSet(store, serializeSave(dirty, 1));
  store.setItem(UI_KEY, JSON.stringify({ tab: 'skills' }));

  let resetting = false;
  let reloads = 0;
  let detached = false;
  function persist() {
    if (resetting) return;
    storageSet(store, serializeSave(dirty, Date.now()));
  }

  const mount = openSettings(store, {
    onReset() {
      confirmedProgressReset(store, {
        beginReset: () => { resetting = true; },
        detachWriters: () => {
          detached = true;
          persist(); // last hide/pagehide during detach must no-op
        },
        reload: () => {
          reloads += 1;
          persist(); // unload after reload starts
        },
      });
      persist(); // pagehide that still fires
    },
  });

  const btn = dangerBtn(mount);
  btn.click();
  persist(); // autosave while armed keeps the dirty envelope
  assert.equal(JSON.parse(storageGet(store)).state.lumen, dirtyLumen);
  assert.ok((JSON.parse(storageGet(store)).state.bank.palecap ?? 0) >= 1);

  btn.click();
  assert.equal(detached, true, 'save writers unhooked');
  assert.equal(reloads, 1);
  assert.equal(storageGet(store), null, 'hollowlight.save is gone after pagehide');
  assert.equal(store.getItem(UI_KEY), null);

  const fresh = newSaveState();
  const json = serializeSave(fresh, 3);
  const { state } = deserializeSave(json);
  const env = JSON.parse(json);
  assert.equal(env.version, 5);
  assert.equal(state.lumen, starterLumen, 'lands on minute-zero lumen, not the dirty wallet');
  assert.notEqual(state.lumen, dirtyLumen);
  assert.equal(state.bank.palecap ?? 0, 0, 'stall buy is gone');
  assert.equal(state.bank.fogwort, STARTER_BANK.fogwort, 'starter pack restored');
  assert.equal(state.actions.active['tend-flame'], undefined, 'ticked action is gone');
  assert.equal(state.combat.fighting, false, 'no fight');
  assert.equal(state.combat.foe, null);
  assert.equal((state.combat.lootTray ?? []).length, 0, 'no leftover tray');
  assert.equal(state.combat.lastStation, null);

  const newHud = paintPills(state);
  const dirtyHud = paintPills(dirty);
  assert.equal(newHud.hudLumen.textContent, `✦ ${formatNumber(starterLumen)}`);
  assert.notEqual(newHud.hudLumen.textContent, dirtyHud.hudLumen.textContent);
  assert.equal(newHud.hudKnown.textContent, formatKnownChip(fresh));
  assert.notEqual(newHud.hudKnown.textContent, formatKnownChip(dirty));
  assert.equal(newHud.hudComplete.textContent, formatTrueCompletionChip(fresh));
  assert.equal(newHud.hudHollow.textContent, formatHollowChip(fresh));
  assert.notEqual(newHud.hudHollow.textContent, formatHollowChip(dirty));
});

test('export and import controls remain next to the Danger wipe', () => {
  const store = fakeStorage();
  const { state: dirty } = dirtyPlaythrough();
  storageSet(store, serializeSave(dirty, 1));
  const mount = openSettings(store);
  const areas = mount.querySelectorAll('.save-textarea');
  assert.equal(areas.length, 2, 'export + import textareas');
  assert.match(mount.textContent, /Export save/);
  assert.match(mount.textContent, /Import save/);
  assert.match(mount.textContent, /Load save/);
  assert.match(mount.textContent, /Danger/);
});
