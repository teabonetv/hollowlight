// Settings → Reset all progress: first tap arms, second tap clears live
// storage so the next deserialize/boot is a fresh v5 envelope — not the
// old lumen. A 4s confirm timeout used to expire so the second tap only
// re-armed and never called resetGame.

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
  storageGet, wipeLiveProgress,
} = await import('../src/core/save.js');
const { createState, pushLog } = await import('../src/game/state.js');
const { cascadeAchievements } = await import('../src/game/systems/achievements.js');
const { showSettingsModal } = await import('../src/ui/modals.js');

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

function seedProgressedSave(store) {
  const old = createState({ nowMs: 1, rngSeed: 7 });
  old.lumen = 9999;
  old.stats.playtimeMs = 86_400_000;
  store.setItem(SAVE_KEY, serializeSave(old, 1));
  store.setItem(UI_KEY, JSON.stringify({ tab: 'bank' }));
  return old;
}

function openSettings(store, { onReset } = {}) {
  const mount = new FakeNode('div');
  showSettingsModal(mount, {
    isReducedMotion: () => false,
    setReducedMotion() {},
    exportSave: () => store.getItem(SAVE_KEY) ?? '',
    importSave: () => ({ ok: true }),
    resetGame() {
      wipeLiveProgress(store);
      onReset?.();
    },
    toast() {},
  });
  return mount;
}

function bootFreshEnvelope() {
  const fresh = createState({ nowMs: 3, rngSeed: 3 });
  cascadeAchievements(fresh, {
    onUnlock(a) { pushLog(fresh, `Feat lit: ${a.name}.`, 0); },
  });
  const json = serializeSave(fresh, 3);
  const { state } = deserializeSave(json);
  return { json, state, env: JSON.parse(json) };
}

test('first tap arms reset and does not wipe the save', () => {
  const store = fakeStorage();
  seedProgressedSave(store);
  let resets = 0;
  const mount = openSettings(store, { onReset: () => { resets += 1; } });

  const btn = dangerBtn(mount);
  assert.ok(btn, 'Danger control is present');
  assert.match(btn.textContent, /Reset all progress/);
  btn.click();

  assert.equal(resets, 0, 'arming tap must not call resetGame');
  assert.match(btn.textContent, /Tap again — this snuffs your flame/);
  const raw = storageGet(store);
  assert.ok(raw, 'save still on disk after arming');
  assert.equal(JSON.parse(raw).state.lumen, 9999);
  assert.equal(store.getItem(UI_KEY), JSON.stringify({ tab: 'bank' }));
});

test('second tap clears storage; next deserialize/boot is a fresh v5 save', () => {
  assert.equal(SAVE_VERSION, 5);
  const store = fakeStorage();
  seedProgressedSave(store);
  let resets = 0;
  const mount = openSettings(store, { onReset: () => { resets += 1; } });

  const btn = dangerBtn(mount);
  btn.click();
  assert.equal(resets, 0);
  assert.equal(JSON.parse(storageGet(store)).state.lumen, 9999);

  btn.click();
  assert.equal(resets, 1, 'second tap must fire resetGame');
  assert.equal(storageGet(store), null, 'hollowlight.save is gone');
  assert.equal(store.getItem(SAVE_KEY), null);
  assert.equal(store.getItem(UI_KEY), null, 'route chrome is gone too');

  const { env, state } = bootFreshEnvelope();
  assert.equal(env.version, 5);
  assert.equal(state.lumen, 35, 'true createState boot (starter 20 + feat grants)');
  assert.notEqual(state.lumen, 9999);
  assert.equal(state.stats.playtimeMs, 0);
});

test('export and import controls remain next to the Danger wipe', () => {
  const store = fakeStorage();
  seedProgressedSave(store);
  const mount = openSettings(store);
  const areas = mount.querySelectorAll('.save-textarea');
  assert.equal(areas.length, 2, 'export + import textareas');
  assert.match(mount.textContent, /Export save/);
  assert.match(mount.textContent, /Import save/);
  assert.match(mount.textContent, /Load save/);
  assert.match(mount.textContent, /Danger/);
});
