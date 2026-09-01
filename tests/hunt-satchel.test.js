import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FakeNode, FakeText } from './helpers/fake-node.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const screenStub = new FakeNode('main');
screenStub.setAttribute('id', 'screen');
const modalRoot = new FakeNode('div');
modalRoot.setAttribute('id', 'modal-root');

globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => new FakeText(s),
  getElementById: (id) => {
    if (id === 'screen') return screenStub;
    if (id === 'modal-root') return modalRoot;
    return null;
  },
  querySelectorAll: (sel) => [
    ...screenStub.querySelectorAll(sel),
    ...modalRoot.querySelectorAll(sel),
  ],
  addEventListener() {},
  removeEventListener() {},
};
globalThis.requestAnimationFrame = (fn) => { if (typeof fn === 'function') fn(); return 0; };
try { globalThis.navigator = {}; } catch { /* node ≥21 */ }

const { createState } = await import('../src/game/state.js');
const { SAVE_VERSION } = await import('../src/core/save.js');
const { renderSkillDetail } = await import('../src/ui/screens/skills.js');
const combat = await import('../src/game/systems/combat.js');
const { HuntSatchel } = await import('../src/ui/screens/hunt-satchel.js');

function makeCtx(state) {
  while (modalRoot.firstChild) modalRoot.removeChild(modalRoot.firstChild);
  return {
    state,
    modalRoot,
    toast() {},
    startFight: (id) => combat.startFight(state, id),
    fleeFight: () => combat.fleeFight(state),
    takeAllLootTray: () => combat.takeAllLootTray(state),
    dismissLastStation: () => combat.dismissLastStation(state),
  };
}

function killFoe(state, enemyId, encounterSeed = 1) {
  state.combat.autoContinue = false;
  combat.startFight(state, enemyId, { encounterSeed });
  let kill = null;
  for (let i = 0; i < 80 && !kill; i++) {
    if (state.combat.foe) state.combat.foe.hp = 1;
    state.combat.player.nextActMs = 0;
    const events = combat.tickCombat(state, 100);
    kill = events.find((e) => e.type === 'combat-kill') ?? kill;
  }
  return kill;
}

function satchelSheet(ctx) {
  const mount = ctx?.modalRoot ?? modalRoot;
  return mount.querySelector('.satchel-sheet') ?? mount.querySelector('.sheet-overlay');
}

test('SAVE_VERSION stays 5', () => {
  assert.equal(SAVE_VERSION, 5);
});

test('leftoverWellMin / 184 well geometry stays gone', () => {
  const ui = readFileSync(join(here, 'combat-ui.test.js'), 'utf8');
  assert.equal(ui.includes('leftoverWellMin'), false);
  assert.doesNotMatch(ui, /leftover-well.{0,80}184|184px leftover-well|min-height:\s*184px/);
  const combatUi = readFileSync(join(here, '../src/ui/screens/combat.js'), 'utf8');
  assert.doesNotMatch(combatUi, /leftoverWellMin/);
  assert.match(combatUi, /satchel chip/);
});

test('moth / wallet-only kill → no chip, no sheet; wallet granted without drawer', () => {
  const state = createState({ rngSeed: 4 });
  const lumen0 = state.lumen;
  const souls0 = state.souls;
  assert.ok(killFoe(state, 'pale-moth'));
  const named = HuntSatchel.itemEntries(HuntSatchel.ungranted(state.combat.lootTray));
  assert.equal(named.length, 0, 'this seed is a wallet-only Pale Moth kill');
  assert.ok(state.souls > souls0, 'soul granted on kill');
  assert.ok(state.lumen > lumen0, 'lumen granted on kill');
  assert.equal(HuntSatchel.unpaidCount(combat.combatStatus(state), { state }), 0);

  const ctx = makeCtx(state);
  const scr = renderSkillDetail(ctx, 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover, 'leftover cockpit still paints');
  const chip = leftover.querySelector('.satchel-chip');
  if (chip) {
    assert.equal(chip.getAttribute('hidden') != null || chip.classList.contains('is-empty'), true,
      'wallet-only kill hides the satchel chip');
    chip.click();
  }
  assert.equal(satchelSheet(ctx), null, 'wallet-only kill must not open a sheet of nothing');
  assert.equal(HuntSatchel.openSheet(ctx, () => {}), null);
});

test('Fog-rat named unpaid → chip and sheet with named Fogwort tile', () => {
  const state = createState({ rngSeed: 4 });
  const lumen0 = state.lumen;
  const souls0 = state.souls;
  assert.ok(killFoe(state, 'fog-rat'));
  const wort = (state.combat.lootTray ?? []).find((e) => e.kind === 'item' && e.id === 'fogwort' && e.granted === false);
  assert.ok(wort, 'Fog-rat kill lands ungranted Fogwort');
  assert.equal(HuntSatchel.unpaidCount(combat.combatStatus(state), { state }), 1,
    'n is named drops only, not soul+lumen');
  assert.equal(state.lumen, lumen0, 'wallet stays unpaid while named loot sits');
  assert.equal(state.souls, souls0);

  const ctx = makeCtx(state);
  const scr = renderSkillDetail(ctx, 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  const chip = leftover.querySelector('.satchel-chip');
  assert.ok(chip);
  assert.equal(chip.getAttribute('hidden'), null);
  assert.equal(chip.textContent, 'Satchel · 1');
  chip.click();
  const sheet = satchelSheet(ctx);
  assert.ok(sheet, 'named unpaid opens the satchel sheet');
  const tile = sheet.querySelector('.loot-tile.loot-item');
  assert.ok(tile, 'named tile is in the grid');
  assert.match(tile.querySelector('.loot-name')?.textContent ?? '', /Fogwort/);
  assert.match(tile.querySelector('.loot-qty')?.textContent ?? '', /×1|x1/i);
  assert.ok(sheet.querySelector('.leftover-take'), 'Take all stays on the sheet');
  assert.match(sheet.querySelector('.loot-wallet')?.textContent ?? '', /soul|✦/);
});

test('Take all still grants named Fogwort and hides the empty satchel', () => {
  const state = createState({ rngSeed: 4 });
  const bank0 = state.bank.fogwort ?? 0;
  const lumen0 = state.lumen;
  const souls0 = state.souls;
  assert.ok(killFoe(state, 'fog-rat'));
  const ctx = makeCtx(state);
  const scr = renderSkillDetail(ctx, 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  leftover.querySelector('.satchel-chip').click();
  const take = satchelSheet(ctx).querySelector('.leftover-take')
    ?? satchelSheet(ctx).querySelector('.satchel-take');
  assert.ok(take);
  take.click();
  assert.deepEqual(state.combat.lootTray, []);
  assert.equal(state.bank.fogwort ?? 0, bank0 + 1);
  assert.ok(state.lumen > lumen0);
  assert.ok(state.souls > souls0);
  assert.equal(HuntSatchel.unpaidCount(combat.combatStatus(state), ctx), 0);
  const after = scr.node.querySelector('.leftover-station') ?? scr.node.querySelector('.combat-fight');
  const chip = after?.querySelector('.satchel-chip');
  if (chip) {
    assert.equal(chip.getAttribute('hidden') != null || chip.classList.contains('is-empty'), true,
      'empty named satchel hides after Take all');
  }
  chip?.click();
  assert.equal(satchelSheet(ctx), null, 'empty satchel does not open a sheet of nothing');
});

test('wallet-only tray without a kill still settles and does not count as n', () => {
  const state = createState({ rngSeed: 1 });
  const lumen0 = state.lumen;
  state.combat.lootTray = [
    { kind: 'soul', qty: 1, granted: false },
    { kind: 'lumen', qty: 2, name: 'Lumen', granted: false },
  ];
  assert.equal(HuntSatchel.unpaidCount(combat.combatStatus(state), { state }), 0);
  assert.equal(HuntSatchel.showChip(combat.combatStatus(state), { state }), false);
  const paid = combat.settleWalletOnlyTray(state);
  assert.equal(paid.skipped, undefined);
  assert.ok(paid.granted.length >= 1);
  assert.equal(state.souls, 1);
  assert.equal(state.lumen, lumen0 + 2);
  assert.deepEqual(state.combat.lootTray, []);
});
