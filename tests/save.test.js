import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY, UI_KEY, SAVE_VERSION, serializeSave, deserializeSave, SaveError,
  adoptedSavedAt, storageGet, storageSet, storageRemove, wipeLiveProgress,
} from '../src/core/save.js';
import { createState, hydrateState } from '../src/game/state.js';

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

test('serialize → deserialize round-trips the state byte-for-byte (deep equal)', () => {
  const s = createState({ nowMs: 1_000_000, rngSeed: 424242 });
  s.lumen = 777;
  s.bank.fogwort = 99;
  hydrateState(s);
  s.skills.emberkeeping.xp = 5321;
  s.skills.emberkeeping.level = 8;
  s.actions.active['tend-flame'] = { progressMs: 1234 };
  s.log.push({ t: 5, text: 'kindled' });

  const json = serializeSave(s, 9_999_999);
  const parsed = deserializeSave(json);

  assert.deepEqual(parsed.state, s, 'deserialized state must deep-equal the original');
  assert.equal(parsed.savedAt, 9_999_999);
});

test('envelope is stamped with the current schema version', () => {
  const json = serializeSave(createState(), 0);
  assert.equal(JSON.parse(json).version, SAVE_VERSION);
});

test('corrupt JSON throws a typed SaveError with reason "corrupt"', () => {
  try {
    deserializeSave('{not json at all');
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e instanceof SaveError);
    assert.equal(e.reason, 'corrupt');
  }
});

test('structurally wrong payloads throw reason "malformed"', () => {
  for (const bad of ['null', '"str"', '{"version":1}', '{"version":1,"state":42}']) {
    assert.throws(() => deserializeSave(bad), SaveError);
    try { deserializeSave(bad); } catch (e) { assert.equal(e.reason, 'malformed'); }
  }
});

test('saves from NEWER versions are rejected, never silently mangled', () => {
  const json = JSON.stringify({ version: SAVE_VERSION + 900, savedAt: 0, state: {} });
  assert.throws(() => deserializeSave(json), (e) => e instanceof SaveError && e.reason === 'newer');
});

test('migration hook upgrades older saves in order', () => {
  const oldSave = JSON.stringify({
    version: 1,
    savedAt: 55,
    state: { lumen: 10, legacyField: true },
  });
  const migrations = [
    { from: 1, migrate: (s) => ({ ...s, migratedOnce: true }) },
    { from: 2, migrate: (s) => ({ ...s, migratedTwice: true }) },
  ];
  const { state } = deserializeSave(oldSave, { currentVersion: 3, migrations });
  assert.equal(state.migratedOnce, true);
  assert.equal(state.migratedTwice, true);
  assert.equal(state.lumen, 10, 'existing fields survive migration');
});

test('a gap in the migration path is reported as unmigratable', () => {
  const json = JSON.stringify({ version: 1, savedAt: 0, state: {} });
  assert.throws(
    () => deserializeSave(json, { currentVersion: 4, migrations: [] }),
    (e) => e instanceof SaveError && e.reason === 'unmigratable',
  );
});

test('S2 v2 saves migrate combat fields onto schema v3', () => {
  const json = JSON.stringify({
    version: 2,
    savedAt: 1,
    state: {
      lumen: 9,
      bankPins: [],
      bankPresets: [],
      store: { pressure: {}, pressureAt: {} },
      lanternIntegrity: 80,
    },
  });
  const { state } = deserializeSave(json);
  assert.equal(state.souls, 0);
  assert.ok(state.combat && typeof state.combat === 'object');
  assert.deepEqual(state.beacons.kindled, ['hearthway']);
  assert.equal(state.lumen, 9);
  assert.equal(state.lanternIntegrity, 80);
});

test('storage helpers tolerate throwing backends (private mode / quota)', () => {
  const evil = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('full'); },
    removeItem() { throw new Error('denied'); },
  };
  assert.equal(storageGet(evil), null);
  assert.equal(storageSet(evil, '{}'), false);
  assert.equal(storageRemove(evil, SAVE_KEY), false);
  wipeLiveProgress(evil);
});

test('storage set/get round-trip through a working backend', () => {
  const store = fakeStorage();
  storageSet(store, 'hello');
  assert.equal(storageGet(store), 'hello');
});

test('adoptedSavedAt honours the earlier of envelope and state stamps', () => {
  const now = 1_700_000_000_000;
  const threeHours = 3 * 3_600_000;
  assert.equal(adoptedSavedAt(now - threeHours, now), now - threeHours);
  assert.equal(adoptedSavedAt(now, now - threeHours), now - threeHours);
  assert.equal(adoptedSavedAt(0, now), now, 'missing envelope stamp does not rewind to epoch');
  assert.equal(adoptedSavedAt(now - threeHours, undefined), now - threeHours);
});

test('v5 envelope stays 5; missing lock hydrates; held stacks floor Times Found', () => {
  assert.equal(SAVE_VERSION, 5);
  const json = JSON.stringify({
    version: 5,
    savedAt: 1,
    state: {
      lumen: 20,
      bank: { tinderscrap: 4 },
      stats: { playtimeMs: 10 },
    },
  });
  const { state } = deserializeSave(json);
  assert.equal(state.schemaVersion ?? SAVE_VERSION, SAVE_VERSION);
  assert.deepEqual(state.bankLocks, []);
  assert.deepEqual(state.stats.itemFound, { tinderscrap: 4 });
  assert.deepEqual(state.stats.itemSold, {});
  assert.deepEqual(state.stats.itemLumen, {});
  const round = JSON.parse(serializeSave(state, 1));
  assert.equal(round.version, 5);
});

test('wipeLiveProgress drops live keys; next envelope is a fresh v5 save', () => {
  assert.equal(SAVE_VERSION, 5);
  const store = fakeStorage();
  const old = createState({ nowMs: 1, rngSeed: 1 });
  old.lumen = 80;
  old.bank.palecap = 3;
  storageSet(store, serializeSave(old, 1));
  store.setItem(UI_KEY, '{"tab":"bank"}');
  store.setItem('hollowlight.extra', 'stale');

  wipeLiveProgress(store);

  assert.equal(storageGet(store), null);
  assert.equal(store.getItem(SAVE_KEY), null);
  assert.equal(store.getItem(UI_KEY), null);
  assert.equal(store.getItem('hollowlight.extra'), null, 'any hollowlight.* key is live progress');

  const fresh = createState({ nowMs: 2, rngSeed: 2 });
  const json = serializeSave(fresh, 2);
  const env = JSON.parse(json);
  assert.equal(env.version, 5);
  const { state } = deserializeSave(json);
  assert.equal(state.lumen, 20, 'createState boot, not the wiped 80');
  assert.equal(state.bank.palecap ?? 0, 0);
});

test('v5 hydrate floors found to held qty and never invents sold history', () => {
  const json = JSON.stringify({
    version: 5,
    savedAt: 1,
    state: {
      lumen: 20,
      bank: { rushwick: 5, palecap: 1 },
      stats: {
        itemFound: { palecap: 10 },
        itemSold: { palecap: 9 },
      },
    },
  });
  const { state } = deserializeSave(json);
  assert.equal(SAVE_VERSION, 5);
  assert.equal(state.stats.itemFound.rushwick, 5, 'starter-like grant is counted as found');
  assert.equal(state.stats.itemFound.palecap, 10, 'found 10 / held 1 stays 10');
  assert.equal(state.stats.itemSold.palecap, 9);
});
