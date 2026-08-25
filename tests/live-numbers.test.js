// Regression: HUD pills, camp stat cells, and Bank qty/worth must match the
// save after sell / cycle complete / upgrade buy / offline claim — without
// remounting the screen. The live F1e bug painted those on route/boot only
// (and HUD tween-restarted on every tick), so hollowlight.save was honest
// while the pixels lied.

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

const { createState } = await import('../src/game/state.js');
const { createRng } = await import('../src/core/rng.js');
const { serializeSave, deserializeSave } = await import('../src/core/save.js');
const { computeOfflineProgress } = await import('../src/core/offline.js');
const { ACTIONS_BY_ID } = await import('../src/game/data/actions.js');
const { ITEMS_BY_ID } = await import('../src/game/data/items.js');
const runner = await import('../src/game/systems/action-runner.js');
const { sellItems, bankCount, bankSellValue } = await import('../src/game/systems/bank.js');
const { liveSellUnit } = await import('../src/game/systems/store.js');
const { buyUpgrade } = await import('../src/game/systems/upgrades.js');
const { formatNumber } = await import('../src/core/format.js');
const { paintHud } = await import('../src/ui/hud.js');
const tabs = await import('../src/ui/screens/tabs.js');

function roundTrip(state) {
  const { state: saved } = deserializeSave(serializeSave(state, state.savedAt ?? 0));
  return saved;
}

function mount(state) {
  const hudLumen = new FakeNode('span');
  const hudFlame = new FakeNode('span');
  const ctx = {
    state,
    toast() {},
    openSellSheet() {},
    buyUpgrade: (id) => buyUpgrade(state, id),
  };
  const camp = tabs.renderCampScreen(ctx);
  const bank = tabs.renderBankScreen(ctx);

  function refresh() {
    paintHud(hudLumen, hudFlame, state);
    camp.update();
    bank.update();
  }
  refresh();
  return { state, hudLumen, hudFlame, camp, bank, refresh };
}

function campCell(session, label) {
  const cells = session.camp.node.querySelectorAll('.stat-cell');
  const cell = cells.find((c) => (c.textContent ?? '').includes(label));
  assert.ok(cell, `camp cell “${label}” present`);
  return cell.querySelector('.stat-value').textContent;
}

function fogwortTile(session) {
  return session.bank.node.querySelectorAll('.bank-tile')
    .find((t) => /Fogwort/.test(t.textContent ?? ''));
}

function assertViewsMatchSave(session, { fogwortQty } = {}) {
  const saved = roundTrip(session.state);
  const { refresh, hudLumen, hudFlame } = session;
  // Re-paint the way the tick loop does (many times) — must not drift.
  for (let i = 0; i < 8; i++) refresh();

  assert.equal(hudLumen.textContent, `✦ ${formatNumber(saved.lumen)}`, 'HUD lumen matches save');
  assert.equal(hudFlame.textContent, `${formatNumber(saved.flame)} flame`, 'HUD flame matches save');
  assert.equal(campCell(session, 'Lumen'), formatNumber(saved.lumen), 'camp LUMEN matches save');
  assert.equal(campCell(session, 'Flame units'), formatNumber(saved.flame), 'camp FLAME matches save');
  const cycles = Object.values(saved.actions.completed).reduce((a, b) => a + b, 0);
  assert.equal(campCell(session, 'Cycles worked'), formatNumber(cycles), 'camp CYCLES matches save');

  const header = session.bank.node.querySelector('.screen-sub').textContent;
  assert.match(header, new RegExp(`worth ✦${formatNumber(bankSellValue(saved.bank))}`));
  assert.equal(bankSellValue(session.state.bank), bankSellValue(saved.bank));

  if (fogwortQty !== undefined) {
    const tile = fogwortTile(session);
    assert.equal(bankCount(saved.bank, 'fogwort'), fogwortQty);
    if (fogwortQty > 0) {
      assert.ok(tile, 'owned Fogwort stays on the working grid');
      const qtyText = tile.querySelector('.bank-qty').textContent;
      assert.equal(qtyText, formatNumber(fogwortQty));
      assert.equal(tile.classList.contains('owned'), true);
    } else {
      assert.equal(tile, undefined, 'sold-out Fogwort leaves the working grid');
    }
  }
}

test('Sell 1 / 10 / All redraw HUD, camp cells, and Bank qty/worth without remount', () => {
  const state = createState({ rngSeed: 11 });
  state.bank.fogwort = 3301;
  state.lumen = 20;
  const session = mount(state);
  const unit = ITEMS_BY_ID.fogwort.sell;

  sellItems(state, 'fogwort', 1);
  session.refresh();
  assertViewsMatchSave(session, { fogwortQty: 3300 });
  assert.equal(state.lumen, 20 + unit);

  sellItems(state, 'fogwort', 10);
  session.refresh();
  assertViewsMatchSave(session, { fogwortQty: 3290 });

  const liveUnit = liveSellUnit(state, 'fogwort');
  const lumenBeforeAll = state.lumen;
  const all = sellItems(state, 'fogwort', 3290);
  assert.equal(all.ok, true);
  assert.equal(all.gained, 3290 * liveUnit);
  session.refresh();
  assertViewsMatchSave(session, { fogwortQty: 0 });
  assert.equal(state.lumen, lumenBeforeAll + all.gained);
});

test('a completed Tend cycle updates HUD + camp stats to the save (no remount)', () => {
  const state = createState({ rngSeed: 12 });
  const session = mount(state);
  const rng = createRng(state.rngState);
  const started = runner.startAction(state, 'tend-flame');
  assert.equal(started.ok, true);
  runner.tickActions(state, 4000, rng);
  state.stats.playtimeMs += 4000;
  session.refresh();

  assert.equal(state.lumen, 21);
  assert.equal(state.flame, 2);
  assert.equal(state.actions.completed['tend-flame'], 1);
  assertViewsMatchSave(session);
});

test("buying Keeper's Satchel snaps HUD and camp lumen to the save", () => {
  const state = createState({ rngSeed: 13 });
  state.lumen = 50;
  state.bank.fogwort = 15;
  const session = mount(state);
  const res = buyUpgrade(state, 'foraging-satchel');
  assert.equal(res.ok, true);
  session.refresh();
  assert.equal(state.lumen, 20);
  assertViewsMatchSave(session, { fogwortQty: 0 });
});

test('offline claim paints HUD, camp, and Bank from nextState without remount', () => {
  const state = createState({ nowMs: 0, rngSeed: 14 });
  const started = runner.startAction(state, 'tend-flame');
  assert.equal(started.ok, true);
  state.savedAt = 0;

  const res = computeOfflineProgress({
    state,
    nowMs: 5 * 60_000,
    lastSavedAt: 0,
    actionsById: ACTIONS_BY_ID,
  });
  assert.equal(res.hasGains, true);

  const session = mount(state);
  // Claim: swap in nextState the way the modal does, then refresh live views.
  Object.assign(state, res.nextState);
  session.refresh();
  assert.ok(state.lumen > 20);
  assertViewsMatchSave(session);
});

test('repeated HUD paints after +1 lumen never stick on the previous integer', () => {
  const hudLumen = new FakeNode('span');
  const hudFlame = new FakeNode('span');
  const state = { lumen: 20, flame: 0 };
  paintHud(hudLumen, hudFlame, state);
  state.lumen = 21;
  state.flame = 2;
  for (let i = 0; i < 12; i++) paintHud(hudLumen, hudFlame, state);
  assert.equal(hudLumen.textContent, '✦ 21');
  assert.equal(hudFlame.textContent, '2 flame');
});
