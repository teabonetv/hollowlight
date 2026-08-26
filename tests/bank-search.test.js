import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, hydrateState } from '../src/game/state.js';
import { ITEMS, ITEMS_BY_ID, validateItems } from '../src/game/data/items.js';
import { serializeSave, deserializeSave, SAVE_VERSION } from '../src/core/save.js';
import {
  matchesQuery, filterItems, savePreset, applyPreset, getPreset, deletePreset,
  captureBankSnapshot, captureGearSnapshot, togglePin, isPinned, visibleBankTabs,
} from '../src/game/systems/bank.js';

test('search matches name, id, category, flavor, sources, uses — and ignores case', () => {
  const fog = ITEMS_BY_ID.fogwort;
  assert.equal(matchesQuery(fog, ''), true);
  assert.equal(matchesQuery(fog, 'FOG'), true);
  assert.equal(matchesQuery(fog, 'herb'), true);
  assert.equal(matchesQuery(fog, 'grey herb'), true);
  assert.equal(matchesQuery(fog, 'gather herbs'), true);
  assert.equal(matchesQuery(fog, 'lamp-oil'), true);
  assert.equal(matchesQuery(fog, 'zzzz-nope'), false);
});

test('filterItems: owned / pinned / category / query compose', () => {
  const bank = { fogwort: 2, palecap: 0 };
  const pins = ['palecap'];
  const owned = filterItems({ items: ITEMS, bank, tab: 'owned', query: '', pins });
  assert.ok(owned.every((i) => (bank[i.id] ?? 0) > 0));
  assert.ok(owned.some((i) => i.id === 'fogwort'));

  const pinned = filterItems({ items: ITEMS, bank, tab: 'pinned', query: '', pins });
  assert.deepEqual(pinned.map((i) => i.id), ['palecap']);

  const herbs = filterItems({ items: ITEMS, bank, tab: 'herb', query: 'fog', pins: [] });
  assert.ok(herbs.every((i) => i.category === 'herb'));
  assert.ok(herbs.some((i) => i.id === 'fogwort'));

  const light = filterItems({ items: ITEMS, bank: { 'tallow-candle': 1 }, tab: 'candle', query: '', pins: [] });
  assert.ok(light.every((i) => i.category === 'candle' || i.category === 'oil'));
  assert.ok(light.length >= 1);

  const ghosts = filterItems({ items: ITEMS, bank, tab: 'all', query: '', pins: [] });
  assert.ok(ghosts.some((i) => (bank[i.id] ?? 0) === 0), 'Catalogue still lists unowned items');
  const workingHerbs = filterItems({ items: ITEMS, bank, tab: 'herb', query: '', pins: [] });
  assert.ok(workingHerbs.every((i) => (bank[i.id] ?? 0) > 0), 'without state, category tabs fall back to occupancy');
});

test('category tabs follow known, not occupancy', () => {
  const s = createState({ rngSeed: 1 });
  delete s.bank['lantern-loaf'];
  const food = filterItems({ items: ITEMS, bank: s.bank, tab: 'consumable', query: '', state: s });
  assert.ok(food.some((i) => i.id === 'lantern-loaf'), 'dumped loaf stays on Food');
  const ids = visibleBankTabs(s.bank, s).map(([id]) => id);
  assert.ok(ids.includes('consumable'));
  assert.equal(ids.includes('fish'), false);
  assert.equal(ids.includes('gem'), false);
});

test('visibleBankTabs keep core chips and drop empty categories', () => {
  const bank = { fogwort: 2, tinderscrap: 1 };
  const tabs = visibleBankTabs(bank);
  const ids = tabs.map(([id]) => id);
  assert.deepEqual(ids.slice(0, 3), ['owned', 'pinned', 'all']);
  assert.ok(ids.includes('herb'));
  assert.ok(ids.includes('fuel'));
  assert.equal(ids.includes('fish'), false);
  assert.equal(ids.includes('gem'), false);
});

test('pins toggle and sort pinned items to the front of All', () => {
  const s = createState({ rngSeed: 1 });
  assert.equal(isPinned(s, 'fogwort'), false);
  togglePin(s, 'fogwort');
  assert.equal(isPinned(s, 'fogwort'), true);
  const listed = filterItems({ items: ITEMS, bank: s.bank, tab: 'all', query: '', pins: s.bankPins });
  assert.equal(listed[0].id, 'fogwort');
});

test('preset save/load is a checklist: apply pins, never conjures items', () => {
  const s = createState({ rngSeed: 2 });
  const snap = captureBankSnapshot(s.bank);
  const p = savePreset(s, 'Morning pack', snap, { kind: 'loadout' });
  assert.equal(getPreset(s, p.id).name, 'Morning pack');

  s.bank = {}; // emptied
  const res = applyPreset(s, p.id);
  assert.equal(res.ok, true);
  assert.ok(res.missing.length >= 1, 'reports missing stacks');
  assert.equal(s.bank.tinderscrap, undefined, 'did not spawn tinder');
  assert.ok(s.bankPins.includes('tinderscrap'));

  assert.equal(deletePreset(s, p.id), true);
  assert.equal(getPreset(s, p.id), null);
});

test('gear snapshot only captures category:gear', () => {
  const bank = { 'flint-striker': 1, fogwort: 9 };
  const g = captureGearSnapshot(bank);
  assert.deepEqual(g, { 'flint-striker': 1 });
});

test('every registry row has a source, a use, unique ids, and integer sell', () => {
  assert.deepEqual(validateItems(), []);
  assert.ok(ITEMS.length >= 110 && ITEMS.length <= 150, `got ${ITEMS.length} items (S2 ~120 + S1 combat ids)`);
  for (const it of ITEMS) {
    assert.ok(it.sources.length >= 1, it.id);
    assert.ok(it.uses.length >= 1, it.id);
  }
});

test('expanded registry + presets + store pressure round-trip through save v2', () => {
  const s = createState({ nowMs: 50, rngSeed: 99 });
  s.bank['emberstone'] = 3;
  s.bankPins = ['fogwort'];
  savePreset(s, 'Test', { fogwort: 4 }, { kind: 'loadout' });
  s.store.pressure.fogwort = 0.3;
  s.store.pressureAt.fogwort = 10;
  s.lanternIntegrity = 77;
  s.cosmetics.bankTheme = 'dusk';
  s.cosmetics.unlocked = ['default', 'dusk'];
  s.radiance = 4;
  hydrateState(s);

  const json = serializeSave(s, 123);
  assert.equal(JSON.parse(json).version, SAVE_VERSION);
  const { state } = deserializeSave(json);
  assert.deepEqual(state, s);
  assert.equal(state.bank.emberstone, 3);
  assert.equal(state.bankPresets[0].name, 'Test');
});

test('schema v1 saves migrate pins/store/lantern/cosmetics', () => {
  const json = JSON.stringify({
    version: 1,
    savedAt: 1,
    state: { lumen: 9, bank: { fogwort: 1 } },
  });
  const { state } = deserializeSave(json);
  assert.deepEqual(state.bankPins, []);
  assert.deepEqual(state.bankPresets, []);
  assert.ok(state.store.pressure);
  assert.equal(state.lanternIntegrity, 100);
  assert.equal(state.cosmetics.bankTheme, 'default');
  assert.equal(state.lumen, 9);
});
