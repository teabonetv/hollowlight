import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/game/state.js';
import { offerItems, sparksFor } from '../src/game/systems/offerings.js';
import { ITEMS_BY_ID } from '../src/game/data/items.js';
import { repairLantern, lanternIntegrity, applyEmberkeepingWear, repairNeedLabel } from '../src/game/systems/repairs.js';
import { REPAIR_KITS_BY_ID } from '../src/game/data/repairs.js';
import { buyTheme } from '../src/game/systems/store.js';
import { ACTIONS_BY_ID } from '../src/game/data/actions.js';
import { completeCycle } from '../src/game/systems/action-runner.js';
import { createRng } from '../src/core/rng.js';
import { BANK_THEMES } from '../src/game/data/store.js';

test('offering burns goods for Radiance and is atomic', () => {
  const s = createState({ rngSeed: 1 });
  s.bank.fogwort = 3;
  const per = sparksFor(ITEMS_BY_ID.fogwort);
  const res = offerItems(s, 'fogwort', 2);
  assert.equal(res.ok, true);
  assert.equal(res.sparks, per * 2);
  assert.equal(s.bank.fogwort, 1);
  assert.equal(s.radiance, per * 2);

  s.bank.fogwort = 0;
  const lumen = s.lumen;
  const rad = s.radiance;
  assert.equal(offerItems(s, 'fogwort', 1).ok, false);
  assert.equal(s.lumen, lumen);
  assert.equal(s.radiance, rad);
});

test('emberkeeping wear never halts; repairs restore integrity for Lumen+goods', () => {
  const s = createState({ rngSeed: 2 });
  assert.equal(lanternIntegrity(s), 100);
  applyEmberkeepingWear(s, ACTIONS_BY_ID['tend-flame']);
  assert.equal(lanternIntegrity(s), 99);

  // A full tend cycle also wears (via completeCycle).
  completeCycle(s, ACTIONS_BY_ID['tend-flame'], createRng(1));
  assert.equal(lanternIntegrity(s), 98);

  s.lumen = 10;
  s.bank.tinderscrap = 40;
  const res = repairLantern(s, 'wick-patch');
  assert.equal(res.ok, true);
  assert.equal(s.lanternIntegrity, 100);
  assert.equal(s.lumen, 0);
});

test('Wick patch names Tinderscrap when the bank is short', () => {
  const s = createState({ rngSeed: 4 });
  s.lanternIntegrity = 70;
  s.lumen = 145;
  s.bank.tinderscrap = 2;
  const kit = REPAIR_KITS_BY_ID['wick-patch'];
  assert.equal(repairNeedLabel(s, kit), 'Need Tinderscrap ×8');
  const res = repairLantern(s, 'wick-patch');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'Need Tinderscrap ×8');
  assert.equal(s.lanternIntegrity, 70);
  assert.equal(s.lumen, 145);
});

test('tab dyes spend Lumen and never grant bank slots or power', () => {
  const s = createState({ rngSeed: 3 });
  s.lumen = BANK_THEMES.find((t) => t.id === 'dusk').cost;
  const dusk = buyTheme(s, 'dusk');
  assert.equal(dusk.ok, true);
  assert.equal(s.cosmetics.bankTheme, 'dusk');
  assert.equal(s.lumen, 0);
  assert.equal(s.stats.lumenSpent, BANK_THEMES.find((t) => t.id === 'dusk').cost);
  assert.ok(!('bankSlots' in s), 'no slot field — bank stays weightless');
});
