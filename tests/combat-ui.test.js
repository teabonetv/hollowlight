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
const { serializeSave, deserializeSave, SAVE_VERSION } = await import('../src/core/save.js');
const { renderSkillDetail, renderSkillsScreen } = await import('../src/ui/screens/skills.js');
const { cockpitLogVsTab, leftoverLogVsTab, fightLogVsTab, leftoverHuntRowVs360, lobbyFirstHuntBottom, COMBAT_360, unpaidLootTapNote, HuntSatchel } = await import('../src/ui/screens/combat.js');
const combat = await import('../src/game/systems/combat.js');
const runner = await import('../src/game/systems/action-runner.js');
const { buyFromStore } = await import('../src/game/systems/store.js');
const { ITEMS } = await import('../src/game/data/items.js');
const { uniqueStackCount, lanternRoom, canAcceptStack } = await import('../src/game/systems/bank.js');
const { paintHud } = await import('../src/ui/hud.js');
const { createItemInspector } = await import('../src/ui/item-inspector.js');

function makeCtx(state) {
  const inspected = [];
  const inspectedOpts = [];
  const toasts = [];
  while (modalRoot.firstChild) modalRoot.removeChild(modalRoot.firstChild);
  return {
    state,
    inspected,
    inspectedOpts,
    toasts,
    modalRoot,
    toast(msg, kind) { toasts.push({ msg, kind }); },
    openSkill() {},
    openSkillsList() {},
    actionStatus: (id) => runner.actionStatus(state, id),
    startFight: (id) => combat.startFight(state, id),
    fleeFight: () => combat.fleeFight(state),
    eatFood: (id) => combat.eatFood(state, id),
    recoverLumen: (z) => combat.recoverLumen(state, z),
    assignVigil: () => combat.assignVigil(state, { categoryId: 'pale', seed: 1 }),
    setCombatStyle: (id) => combat.setStyle(state, id),
    equipWeapon: (id) => combat.equipWeapon(state, id),
    resumeCombat: () => combat.resumeCombat(state),
    setCombatAutoContinue: (on) => { state.combat.autoContinue = !!on; },
    selectFood: (id) => combat.selectFood(state, id),
    cycleFood: () => combat.cycleFood(state),
    dismissLastStation: () => combat.dismissLastStation(state),
    takeAllLootTray: () => combat.takeAllLootTray(state),
    storeBuy: (id, qty) => buyFromStore(state, id, qty),
    openSellSheet(id, opts = {}) { inspected.push(id); inspectedOpts.push(opts); },
    inspectLoot(id, opts = {}) { inspected.push(id); inspectedOpts.push(opts); },
    sell: () => ({ ok: false }),
    togglePin() {},
    toggleLock() {},
  };
}

function trayItems(tray) {
  return (tray ?? []).filter((e) => e.kind === 'item');
}

function trayWallet(tray) {
  return (tray ?? []).filter((e) => e.kind === 'soul' || e.kind === 'lumen');
}

function ensureUnpaidItem(state, id = 'fogwort', qty = 1) {
  const tray = state.combat.lootTray ?? (state.combat.lootTray = []);
  if (!tray.some((e) => e.kind === 'item' && e.id === id && e.granted === false)) {
    tray.push({ kind: 'item', id, qty, name: ITEMS.find((i) => i.id === id)?.name ?? id, granted: false });
  }
  return tray;
}

/** Look lock: one leftover-loot note in the satchel sheet. Toast-only fails. */
function assertUnpaidWellNote(host, tile, ctx, { live = false } = {}) {
  assert.equal(ctx.toasts.length, 0, 'unpaid tap must not HUD-toast');
  assert.deepEqual(ctx.inspected, [], 'unpaid tap must not open a sell sheet');
  const sheet = satchelSheet(ctx);
  assert.ok(sheet, 'satchel sheet is open');
  const body = sheet.querySelector('.satchel-body') ?? sheet.querySelector('.leftover-loot');
  assert.ok(body, 'satchel body');
  const note = body.querySelector('.loot-unpaid-note');
  assert.ok(note, 'satchel sheet must show the unpaid note');
  assert.equal(sheet.querySelectorAll('.loot-unpaid-note').length, 1);
  assert.equal(body.querySelectorAll('.loot-unpaid-note').length, 1);
  assert.equal(note.textContent, unpaidLootTapNote('Fogwort'));
  assert.ok(body.contains(note), 'note sits on satchel body');
  const chips = body.querySelector('.leftover-loot-chips') ?? body.querySelector('.loot-tray-grid');
  assert.ok(chips, 'satchel chips');
  assert.ok(chips.contains(note), 'note is in leftover-loot-chips, not #toasts');
  assert.equal(note.getAttribute('role'), null, 'role=status is mirrored into #toasts');
  assert.equal(tile.querySelector('.loot-unpaid-hint'), null);
  assert.doesNotMatch(tile.textContent ?? '', /still in the tray/, 'tile must not wrap the sentence');
  assert.match(tile.querySelector('.loot-name')?.textContent ?? '', /Fogwort/);
  assert.match(tile.querySelector('.loot-qty')?.textContent ?? '', /×1|x1/i);
  assert.equal(sheet.querySelector('.sell-1-btn'), null);
  assert.equal(sheet.querySelector('.sell-pin-btn'), null);
  assert.equal(sheet.querySelector('.sell-lock-btn'), null);
  if (!live) {
    assert.ok(host.classList.contains('leftover-station'), 'leftover-as-mode holds');
  }
}

function satchelSheet(ctx) {
  const mount = ctx?.modalRoot ?? modalRoot;
  return mount.querySelector('.satchel-sheet') ?? mount.querySelector('.sheet-overlay');
}

function leftoverTake(_host) {
  const sheet = satchelSheet();
  return sheet?.querySelector('.leftover-take')
    ?? modalRoot.querySelector('.leftover-take')
    ?? null;
}

function takeAllFromSatchel(host) {
  if (!satchelSheet()) {
    const chip = host?.querySelector?.('.satchel-chip');
    assert.ok(chip, 'satchel chip to open before Take all');
    chip.click();
  }
  const take = leftoverTake(host);
  assert.ok(take, 'Take all lives in the satchel sheet');
  take.click();
  return take;
}

function assertFightSatchel(host) {
  assert.equal(host.querySelector('.leftover-take'), null, 'Take all lives in the sheet');
  assert.equal(host.querySelector('.loot-well-meter'), null, 'Hollow meter lives in the sheet');
  assert.equal(host.querySelector('.loot-tile'), null, 'named tiles live in the sheet');
}

function assertNoSatchel(host) {
  assertFightSatchel(host);
  const chip = host.querySelector('.satchel-chip');
  if (!chip) return;
  assert.equal(chip.getAttribute('hidden') != null || chip.classList.contains('is-empty'), true,
    'empty hides the satchel chip');
}

function assertSatchelChip(host, n) {
  const chip = host.querySelector('.satchel-chip');
  assert.ok(chip, 'satchel chip is mounted');
  assert.equal(chip.getAttribute('hidden'), null, 'unpaid chip is visible');
  if (n != null) assert.match(chip.textContent ?? '', new RegExp(`Satchel · ${n}`));
  else assert.match(chip.textContent ?? '', /Satchel · \d+/);
  assertFightSatchel(host);
  return chip;
}

function unpaidN(state, ctx) {
  return HuntSatchel.unpaidCount(combat.combatStatus(state), ctx ?? { state });
}

function openSatchel(host, ctx) {
  const chip = host.querySelector('.satchel-chip');
  assert.ok(chip, 'satchel chip to open');
  chip.click();
  const sheet = satchelSheet(ctx);
  assert.ok(sheet, 'chip opens the satchel sheet');
  assert.ok(sheet.classList.contains('satchel-sheet') || sheet.classList.contains('sheet-overlay'));
  return sheet;
}

function assertSatchelFurniture(sheet, { minItemTiles = 0, expectWallet = true } = {}) {
  const body = sheet.querySelector('.satchel-body') ?? sheet.querySelector('.leftover-loot');
  assert.ok(body, 'satchel body');
  assert.equal(body.querySelector('.chip-sep'), null, 'loot is furniture, not a · receipt');
  const grid = body.querySelector('.loot-tray-grid');
  assert.ok(grid, 'item grid is mounted');
  assert.equal(grid.querySelectorAll('.chip').length, 0, 'item grid is not receipt chips');
  const itemTiles = body.querySelectorAll('.loot-tile.loot-item');
  const allTiles = body.querySelectorAll('.loot-tile');
  assert.equal(allTiles.length, itemTiles.length, 'soul/lumen are not loot-tiles');
  assert.equal(body.querySelector('.loot-tile.loot-soul'), null, 'souls are wallet, not portraits');
  assert.equal(body.querySelector('.loot-tile.loot-lumen'), null, 'lumen is wallet, not portraits');
  if (minItemTiles > 0) {
    assert.ok(itemTiles.length >= minItemTiles, `expected ≥${minItemTiles} item portraits, got ${itemTiles.length}`);
    for (const tile of itemTiles) {
      const glyph = tile.querySelector('.loot-glyph');
      assert.ok(glyph, '56px portrait glyph');
      assert.match(glyph.innerHTML ?? '', /<svg/i);
      assert.match(glyph.className, /bank-glyph/);
      const name = (tile.querySelector('.loot-name')?.textContent ?? '').trim();
      const qty = (tile.querySelector('.loot-qty')?.textContent ?? '').trim();
      assert.ok(name.length > 0, 'tile shows a name');
      assert.ok(qty.length > 0, 'tile shows a qty');
    }
  }
  if (expectWallet) {
    const wallet = body.querySelector('.loot-wallet');
    assert.ok(wallet, 'wallet sits in the satchel head');
    assert.match(wallet.textContent ?? '', /soul|✦/);
    assert.equal(wallet.classList.contains('loot-tile'), false);
  }
  assert.ok(sheet.querySelector('.leftover-take'), 'Take all stays on the sheet');
  assert.equal(body.querySelectorAll('.loot-ghost').length, 0, 'satchel has no ghost pack');
  const meter = body.querySelector('.loot-well-meter');
  assert.ok(meter, 'Hollow pressure sits in the satchel sheet');
  assert.match(meter.textContent ?? '', /Hollow \d+\/\d+/);
  assert.equal(/100/.test(meter.textContent ?? ''), false, 'Hollow is 12, not a Melvor 100-slot clone');
  return { body, tiles: itemTiles, itemTiles, wallet: body.querySelector('.loot-wallet'), take: sheet.querySelector('.leftover-take') };
}

function assertNoGhostPack(tray) {
  const grid = tray.querySelector('.loot-tray-grid');
  assert.ok(grid, 'empty grid furniture');
  assert.equal(grid.classList.contains('is-ghost-pack'), false, 'empty well has no ghost pack');
  assert.equal(tray.querySelectorAll('.loot-ghost').length, 0, 'no fake hollow slots');
  return grid;
}

test('skills list marks combat live and five skills still future', () => {
  const scr = renderSkillsScreen(makeCtx(createState({ rngSeed: 1 })));
  const rows = scr.node.querySelectorAll('.skill-row');
  assert.equal(rows.length, 8);
  assert.equal(rows.filter((r) => r.matchesSelector('.skill-row-future')).length, 5);
});

test('combat skill detail shows Hearthway hunts, not a coming-soon panel', () => {
  const state = createState({ rngSeed: 2 });
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  assert.equal(scr.node.querySelectorAll('.empty-state').length, 0);
  assert.match(scr.node.textContent ?? '', /Pale Moth/);
  assert.match(scr.node.textContent ?? '', /Hearth-Warden/);
  assert.match(scr.node.textContent ?? '', /Hunt/);
});

test('skills craft subnav offers a tap through to combat', () => {
  const opened = [];
  const ctx = makeCtx(createState({ rngSeed: 3 }));
  ctx.openSkill = (id) => opened.push(id);
  const scr = renderSkillDetail(ctx, 'emberkeeping');
  const combatTab = scr.node.querySelectorAll('.craft-tab')
    .find((b) => b.getAttribute('data-skill') === 'combat');
  assert.ok(combatTab, 'Combat is a craft tab');
  combatTab.click();
  assert.deepEqual(opened, ['combat']);
});

test('a live fight paints HP, styles, eat, flee, weapon, cockpit, and a log', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const text = scr.node.textContent ?? '';
  assert.match(text, /Pale Moth/);
  assert.match(text, /Strike/);
  assert.match(text, /Wick-knife/);
  assert.match(text, /Fall back/);
  assert.match(text, /Lantern-loaf/);
  assert.match(text, /Acc \d+%/);
  assert.match(text, /they \d+%/);
  assert.match(text, /\d+–\d+/);
  assert.equal((text.match(/Acc \d+%/g) ?? []).length, 1, 'one kit line, not Hand + cockpit');
  assert.equal(scr.node.querySelectorAll('.weapon-card').length, 0);
  assert.ok(scr.node.querySelector('.hand-chip'));
  assert.ok(scr.node.querySelector('.acc-station'));
  assert.ok(scr.node.querySelector('.combat-log'));
  scr.update();
});

test('in-fight first screen is HP, kit, oil, eat — Hand is a chip', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const fight = scr.node.querySelector('.combat-fight');
  assert.ok(fight);
  const classes = fight.children.map((c) => c.className);
  const iFighter = classes.findIndex((c) => /\bfight-pair\b/.test(c) || /\bfighter\b/.test(c));
  const iKit = classes.findIndex((c) => /\bacc-station\b/.test(c) || /\bfight-cockpit\b/.test(c));
  const iOil = classes.findIndex((c) => /\boil-line\b/.test(c));
  const iEat = classes.findIndex((c) => /\beat-row\b/.test(c));
  const iKitWrap = classes.findIndex((c) => /\bleftover-kit\b/.test(c));
  const iHand = iKitWrap >= 0 ? iKitWrap : classes.findIndex((c) => /\bhand-chip\b/.test(c));
  assert.ok(iFighter >= 0 && iKit > iFighter && iOil > iKit && iEat > iOil, 'HP then kit then oil then eat');
  assert.ok(iHand > iEat, 'weapon chip sits after the cockpit');
  assert.equal(fight.querySelectorAll('.fighter').length, 2);
  assert.match(fight.querySelector('.eat-row')?.textContent ?? '', /Fall back/);
  assert.equal(classes.filter((c) => /\bflee-btn\b/.test(c) && /\bbtn-wide\b/.test(c)).length, 0);
  assert.match(fight.textContent ?? '', /You/);
  assert.match(fight.textContent ?? '', /Pale Moth/);
  assert.match(fight.textContent ?? '', /Lantern-loaf/);
  assert.equal(/weak to/.test(fight.textContent ?? ''), false, 'flavor stays off the first fight frame');
  const hand = fight.querySelector('.hand-chip')?.textContent ?? '';
  assert.equal(/\bHand\b/.test(hand), false);
  assert.match(hand, /Wick-knife/);
  assert.match(hand, /Unarmed/);
  assert.equal((hand.match(/Unarmed/g) ?? []).length, 1, 'never Unarmed Unarmed Knife');
  assert.equal(fight.querySelector('.hand-chip')?.querySelectorAll('button').length, 2);
});

test('0 oil never paints Lantern fed; hub chip is dry not ready', () => {
  const state = createState({ rngSeed: 2 });
  state.bank['wick-oil'] = 0;
  state.bank['lamp-oil'] = 0;
  const hub = renderSkillDetail(makeCtx(state), 'combat');
  const hubText = hub.node.textContent ?? '';
  assert.match(hubText, /lantern dry/);
  assert.equal(/lantern ready/.test(hubText), false);
  assert.match(hubText, /0 lantern sips/);
  assert.match(hubText, / · /);

  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  const fight = renderSkillDetail(makeCtx(state), 'combat');
  const fightText = fight.node.textContent ?? '';
  assert.equal(/Lantern fed/.test(fightText), false);
  assert.match(fightText, /Lantern dry/);
});

test('in-fight Acc chip moves when Knife is dropped or style shifts', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  const ctx = makeCtx(state);
  const scr = renderSkillDetail(ctx, 'combat');
  const accOf = () => {
    const line = scr.node.querySelector('.combat-fight')?.querySelector('.acc-station')?.textContent ?? '';
    const m = line.match(/Acc (\d+)% · (\d+)–(\d+)/);
    assert.ok(m, line);
    return { pct: Number(m[1]), min: Number(m[2]), max: Number(m[3]), line };
  };
  const knife = accOf();
  const unarmedBtn = scr.node.querySelector('.hand-chip')?.querySelectorAll('button')
    .find((b) => /Unarmed/.test(b.textContent ?? '') && b.getAttribute('aria-pressed') !== 'true');
  unarmedBtn.click();
  const bare = accOf();
  assert.ok(bare.pct < knife.pct || bare.max < knife.max, `${knife.line} → ${bare.line}`);
  const rite = scr.node.querySelector('.combat-fight')?.querySelectorAll('button')
    .find((b) => (b.textContent ?? '') === 'Rite');
  rite.click();
  const riteAcc = accOf();
  assert.ok(riteAcc.line !== bare.line, `${bare.line} → ${riteAcc.line}`);
  assert.match(riteAcc.line, /Acc \d+% · \d+–\d+(?: · [\d.]+s)? \/ they \d+% · \d+–\d+/);
});

test('hand card hit % changes when the wick-knife is unequipped', () => {
  const armed = createState({ rngSeed: 4 });
  const aText = renderSkillDetail(makeCtx(armed), 'combat').node.textContent ?? '';
  const aAcc = aText.match(/Acc (\d+)%/);
  assert.ok(aAcc);

  const bare = createState({ rngSeed: 4 });
  combat.equipWeapon(bare, 'unarmed');
  const bText = renderSkillDetail(makeCtx(bare), 'combat').node.textContent ?? '';
  const bAcc = bText.match(/Acc (\d+)%/);
  assert.ok(bAcc);
  assert.ok(Number(aAcc[1]) > Number(bAcc[1]));
});

test('after N combat ticks painted HP equals deserialized save HP', () => {
  const state = createState({ rngSeed: 4 });
  state.combat.autoContinue = false;
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  combat.resumeCombat(state);
  for (let i = 0; i < 18; i++) combat.tickCombat(state, 100);
  const json = serializeSave(state, 12);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const { state: saved } = deserializeSave(json);
  assert.equal(saved.combat.player.hp, state.combat.player.hp);
  assert.equal(saved.combat.foe.hp, state.combat.foe.hp);
  const painted = scr.node.textContent ?? '';
  assert.match(painted, new RegExp(`${state.combat.player.hp} / ${combat.playerMaxHp(state)}`));
  assert.match(painted, new RegExp(`${state.combat.foe.hp} / ${state.combat.foe.maxHp}`));
});

test('hub HTML does not print null when deathSite is empty', () => {
  const state = createState({ rngSeed: 2 });
  assert.equal(state.combat.deathSite, null);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const html = scr.node.innerHTML ?? '';
  const text = scr.node.textContent ?? '';
  assert.equal(html.includes('>null<'), false);
  assert.equal(/\bnull\b/.test(text), false);
  assert.match(text, /lantern sip/);
  assert.match(text, /Wick-knife/);
});

test('eat row always prints the food heal constant, never pending +0', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  const max = combat.playerMaxHp(state);
  state.combat.player.hp = max;
  assert.equal(combat.eatHealAmount(state, 'lantern-loaf'), 0);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const eat = scr.node.querySelector('.eat-row')?.textContent ?? '';
  assert.match(eat, /Lantern-loaf \+14 · 8/);
  assert.equal(/\+0/.test(eat), false, 'owned food never paints +0');
  const btn = scr.node.querySelector('.eat-btn');
  assert.ok(btn);
  assert.equal(btn.getAttribute('aria-disabled'), 'true');
  assert.ok(btn.classList.contains('btn-disabled'));
});

test('eat button label is the food constant even when pending heal is smaller', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  state.combat.player.hp = 32;
  const pending = combat.eatHealAmount(state, 'lantern-loaf');
  assert.equal(pending, 8);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const eat = scr.node.querySelector('.eat-row')?.textContent ?? '';
  assert.match(eat, /Lantern-loaf \+14 · 8/);
  assert.equal(new RegExp(`Lantern-loaf \\+${pending}`).test(eat), false);
});

test('mid-fight deserialize stays paused until Resume; paint does not auto-resume', () => {
  const live = createState({ rngSeed: 4 });
  combat.startFight(live, 'pale-moth', { encounterSeed: 1 });
  const { state } = deserializeSave(serializeSave(live, 9));
  assert.equal(combat.fightWouldResume(state), true);
  assert.equal(state.combat.paused, true);
  const hp = state.combat.player.hp;
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const text = scr.node.textContent ?? '';
  assert.match(text, /Pale Moth/);
  assert.match(text, /Encounter held/);
  assert.match(text, /Resume/);
  assert.equal(state.combat.paused, true, 'paint must not resumeCombat');
  combat.tickCombat(state, 8000);
  assert.equal(state.combat.player.hp, hp);
  const resume = scr.node.querySelectorAll('button').find((b) => /Resume/.test(b.textContent ?? ''));
  assert.ok(resume);
  resume.click();
  assert.equal(state.combat.paused, false);
  assert.equal(state.combat.fighting, true);
});

test('Hunt at 0 lantern sips is not a normal pull', () => {
  const state = createState({ rngSeed: 2 });
  state.bank['wick-oil'] = 0;
  state.bank['lamp-oil'] = 0;
  const toasts = [];
  const ctx = makeCtx(state);
  ctx.toast = (m) => toasts.push(m);
  const scr = renderSkillDetail(ctx, 'combat');
  const hunts = scr.node.querySelectorAll('button').filter((b) => (b.textContent ?? '') === 'Hunt');
  assert.ok(hunts.length >= 1, 'stretch Hunt stays labelled Hunt');
  assert.equal(hunts[0].classList.contains('btn-primary'), false);
  assert.equal(hunts[0].getAttribute('aria-disabled'), 'true');
  assert.equal(hunts[0].disabled, false, 'stretch Hunt is not HTML-disabled');
  assert.equal(hunts[0].getAttribute('disabled'), null);
  const needBtns = scr.node.querySelectorAll('button').filter((b) => /Need oil/.test(b.textContent ?? ''));
  assert.equal(needBtns.length, 0, 'Need oil is not a Hunt label');
  assert.equal((scr.node.textContent.match(/Need oil/g) ?? []).length, 1, 'one Need oil CTA');
  hunts[0].click();
  assert.equal(state.combat.fighting, false);
  assert.ok(toasts.some((t) => /dry|oil/i.test(t)));
});

test('Keep hunting this foe defaults off', () => {
  const state = createState({ rngSeed: 4 });
  assert.equal(state.combat.autoContinue, false);
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  assert.match(scr.node.textContent ?? '', /Keep hunting this foe/);
  const box = scr.node.querySelector('.combat-keep')?.querySelector('input');
  assert.ok(box);
  assert.equal(box.checked, false);
});

test('foe chance-to-hit sits on the same kit line as yours', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  const kit = combat.fightCockpit(state);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const line = scr.node.querySelector('.acc-station')?.textContent ?? '';
  assert.match(line, new RegExp(`Acc ${kit.hitPct}%`));
  assert.match(line, new RegExp(`they ${kit.foeHitPct}%`));
  assert.match(line, new RegExp(`${kit.playerMinHit}–${kit.playerMaxHit}`));
  assert.match(line, new RegExp(`${kit.foeMinHit}–${kit.foeMaxHit}`));
  assert.match(line, /Acc \d+%.*\/.*they \d+%/);
  assert.ok(kit.foeHitPct > 0 && kit.foeHitPct < 100);
});


function killFoe(state, enemyId = 'pale-moth') {
  state.combat.autoContinue = false;
  combat.startFight(state, enemyId, { encounterSeed: 1 });
  let kill = null;
  for (let i = 0; i < 80 && !kill; i++) {
    if (state.combat.foe) state.combat.foe.hp = 1;
    state.combat.player.nextActMs = 0;
    const events = combat.tickCombat(state, 100);
    kill = events.find((e) => e.type === 'combat-kill') ?? kill;
  }
  return kill;
}

function killMoth(state) {
  return killFoe(state, 'pale-moth');
}

function traySum(tray, kind, id) {
  return (tray ?? [])
    .filter((e) => e.kind === kind && (id == null || e.id === id))
    .reduce((n, e) => n + e.qty, 0);
}

test('hunt-from-scrolled-hub first paint contains You / Acc / they / oil / eat', () => {
  const state = createState({ rngSeed: 4 });
  while (screenStub.firstChild) screenStub.removeChild(screenStub.firstChild);
  screenStub.scrollTop = 455;
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  screenStub.append(scr.node);
  screenStub.scrollTop = 455;
  assert.equal(state.combat.fighting, false);
  const hunt = scr.node.querySelectorAll('button').find((b) => (b.textContent ?? '') === 'Hunt');
  assert.ok(hunt, 'a Hunt tap exists on the hub');
  hunt.click();
  assert.equal(state.combat.fighting, true);
  assert.equal(screenStub.scrollTop, 0, 'startFight / fight paint zeros #screen');
  const fight = scr.node.querySelector('.combat-fight');
  assert.ok(fight);
  const first = fight.textContent ?? '';
  assert.match(first, /You/);
  assert.match(first, /Acc \d+%/);
  assert.match(first, /they \d+%/);
  assert.match(first, /Lantern fed|Lantern dry|sip/);
  assert.match(first, /Eat/);
  assert.match(first, /Lantern-loaf/);
  assert.match(fight.querySelector('.eat-row')?.textContent ?? '', /Fall back/);
  const classes = fight.children.map((c) => c.className);
  const iYou = classes.findIndex((c) => /\bfight-pair\b/.test(c) || /\bfighter\b/.test(c));
  const iAcc = classes.findIndex((c) => /\bacc-station\b/.test(c));
  const iOil = classes.findIndex((c) => /\boil-line\b/.test(c));
  const iEat = classes.findIndex((c) => /\beat-row\b/.test(c));
  assert.ok(iYou === 0 || iYou === 1, 'You/Foe HP open the fight');
  assert.ok(iAcc > iYou && iOil > iAcc && iEat > iOil);
  assert.match(fight.querySelector('.acc-station')?.textContent ?? '', /Acc \d+% · \d+–\d+ · [\d.]+s/);
});

test('hand-chip text does not contain Unarmed twice', () => {
  const armed = createState({ rngSeed: 4 });
  combat.startFight(armed, 'pale-moth', { encounterSeed: 1 });
  const armedChip = renderSkillDetail(makeCtx(armed), 'combat').node.querySelector('.hand-chip')?.textContent ?? '';
  assert.equal((armedChip.match(/Unarmed/g) ?? []).length, 1);
  assert.equal(/Unarmed\s*Unarmed/.test(armedChip), false);

  const bare = createState({ rngSeed: 4 });
  combat.equipWeapon(bare, 'unarmed');
  combat.startFight(bare, 'pale-moth', { encounterSeed: 1 });
  const bareChip = renderSkillDetail(makeCtx(bare), 'combat').node.querySelector('.hand-chip')?.textContent ?? '';
  assert.equal((bareChip.match(/Unarmed/g) ?? []).length, 1);
  assert.equal(/Unarmed\s*Unarmed/.test(bareChip), false);
  assert.match(bareChip, /Knife|Wick-knife/);
});

test('eat row has no +0 · 0 primary', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const eat = scr.node.querySelector('.eat-row')?.textContent ?? '';
  assert.equal(/\+0 · 0/.test(eat), false);
  assert.equal(/Pale-cap/.test(eat), false, 'empty foods stay out of the primary slot');
  assert.equal(scr.node.querySelectorAll('.eat-alt').length, 0, 'no ghost Fogwort alt under the slot');
  assert.equal(/Fogwort/.test(eat), false, 'Fogwort is cycled, not listed as a second row');
  assert.match(eat, /Lantern-loaf \+14 · 8/);
  assert.match(eat, /Eat/);
  assert.ok(scr.node.querySelector('.eat-btn'));
  assert.ok(scr.node.querySelector('.eat-pick'));
});

test('hub after kill still shows compact fight chrome', () => {
  const state = createState({ rngSeed: 4 });
  const kill = killMoth(state);
  assert.ok(kill);
  assert.equal(state.combat.fighting, false);
  assert.ok(state.combat.lastStation);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover, 'cockpit leftover stays after the moth');
  const text = leftover.textContent ?? '';
  assert.match(text, /You/);
  assert.ok(leftover.classList.contains('leftover-station'));
  assertNoSatchel(leftover);
  assert.ok(leftover.querySelector('.acc-station'), 'Acc stays after a wallet-only moth');
  assert.ok(leftover.querySelector('.hand-chip'), 'Knife/Unarmed stay after a wallet-only moth');
  assert.ok(leftover.querySelector('.style-row'), 'styles stay after a wallet-only moth');
  assert.match(leftover.querySelector('.hand-chip')?.textContent ?? '', /Knife|Unarmed/);
  assert.match(leftover.querySelector('.style-row')?.textContent ?? '', /Strike/);
  assert.match(leftover.querySelector('.style-row')?.textContent ?? '', /Shot/);
  assert.match(leftover.querySelector('.style-row')?.textContent ?? '', /Rite/);
  assert.equal(satchelSheet(), null, 'wallet-only moth must not open a satchel sheet');
  assert.match(text, /sip|Need oil/);
  assert.match(text, /Lantern-loaf \+14 · 8|Eat|No food/);
  assert.equal(/\+0/.test(leftover.querySelector('.eat-row')?.textContent ?? ''), false);
  assert.match(leftover.querySelector('.leftover-kicker')?.textContent ?? '', /Pale Moth fell/);
  assert.match(text, /✦|soul/);
  assert.match(leftover.querySelector('.leftover-hunt')?.textContent ?? '', /Hunt Pale Moth/);
  assert.equal(/Need oil/.test(leftover.querySelector('.leftover-hunt')?.textContent ?? ''), false);
  assert.equal(scr.node.querySelectorAll('.combat-meta').length, 0, 'no duplicate souls/dry/sips row under leftover');
  assert.equal(scr.node.querySelectorAll('.weapon-card').length, 0);
  assert.equal(leftover.querySelectorAll('.fighter').length, 2, 'You vs last foe');
  assert.match(leftover.querySelectorAll('.fighter')[1]?.textContent ?? '', /Pale Moth/);
  assert.equal(leftover.querySelectorAll('.vigil-card').length, 0, 'Vigil is not inside the cockpit');
  assert.equal(leftover.querySelectorAll('.zone-chips').length, 0, 'Stretches are not inside the cockpit');
  const logLines = leftover.querySelectorAll('.log-line');
  assert.ok(logLines.length >= 1, 'leftover fight log is not empty');
  assert.ok(logLines.length <= 4);
  assert.equal(/The fog holds its breath/.test(leftover.querySelector('.combat-log')?.textContent ?? ''), false);
});

test('leftover kicker after flee is not the previous kill headline', () => {
  const state = createState({ rngSeed: 4 });
  killMoth(state);
  combat.startFight(state, 'pale-moth', { encounterSeed: 9 });
  combat.fleeFight(state);
  const leftover = renderSkillDetail(makeCtx(state), 'combat').node.querySelector('.leftover-station');
  const kicker = leftover?.querySelector('.leftover-kicker')?.textContent ?? '';
  assert.match(kicker, /Fell back from Pale Moth|After the hunt/);
  assert.equal(/Pale Moth fell/.test(kicker), false);
  const log = leftover?.querySelector('.combat-log')?.textContent ?? '';
  assert.match(log, /fall back|You meet/i);
  assert.equal(/The fog holds its breath/.test(log), false);
});

test('new Hunt log does not carry eat/kill/flee from the last encounter', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  state.combat.player.hp = 10;
  combat.eatFood(state, 'lantern-loaf');
  combat.fleeFight(state);
  assert.ok(state.combat.log.some((l) => l.kind === 'eat' || l.kind === 'flee'));
  combat.startFight(state, 'pale-moth', { encounterSeed: 2 });
  const log = renderSkillDetail(makeCtx(state), 'combat').node.querySelector('.combat-log')?.textContent ?? '';
  assert.equal(/You eat/.test(log), false);
  assert.equal(/fall back/.test(log), false);
  assert.equal(/falls\./.test(log), false);
  assert.match(log, /You meet Pale Moth/);
});

test('leftover Acc moves when Knife is unequipped or style shifts to Rite', () => {
  const state = createState({ rngSeed: 4 });
  killMoth(state);
  const ctx = makeCtx(state);
  const scr = renderSkillDetail(ctx, 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover?.classList.contains('leftover-station'));
  assert.ok(leftover.querySelector('.acc-station'), 'Acc does not wait on Take all');
  const accOf = () => {
    const line = scr.node.querySelector('.leftover-station')?.querySelector('.acc-station')?.textContent ?? '';
    const m = line.match(/Acc (\d+)% · (\d+)–(\d+)/);
    assert.ok(m, line);
    return { pct: Number(m[1]), min: Number(m[2]), max: Number(m[3]), line };
  };
  const armed = accOf();
  const unarmedBtn = scr.node.querySelector('.hand-chip')?.querySelectorAll('button')
    .find((b) => /Unarmed/.test(b.textContent ?? '') && b.getAttribute('aria-pressed') !== 'true');
  assert.ok(unarmedBtn);
  unarmedBtn.click();
  const bare = accOf();
  assert.ok(bare.pct < armed.pct || bare.max < armed.max, `${armed.line} → ${bare.line}`);

  const rite = scr.node.querySelectorAll('button')
    .find((b) => (b.textContent ?? '') === 'Rite');
  assert.ok(rite);
  rite.click();
  const riteAcc = accOf();
  assert.ok(riteAcc.line !== bare.line, `style must move Acc: ${bare.line} → ${riteAcc.line}`);
  assert.match(riteAcc.line, /Acc \d+% · \d+–\d+(?: · [\d.]+s)? \/ they \d+% · \d+–\d+/);
});

test('leftover station states Need oil in-frame at 0 sips', () => {
  const state = createState({ rngSeed: 4 });
  killMoth(state);
  state.bank['wick-oil'] = 0;
  state.bank['lamp-oil'] = 0;
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover);
  const oil = leftover.querySelector('.leftover-dry')?.textContent ?? leftover.querySelector('.oil-line')?.textContent ?? '';
  assert.match(oil, /Need oil/);
  const hunt = leftover.querySelector('.leftover-hunt');
  assert.ok(hunt);
  assert.match(hunt.textContent ?? '', /Hunt Pale Moth/);
  assert.equal(/Need oil/.test(hunt.textContent ?? ''), false);
  assert.equal(hunt.getAttribute('aria-disabled'), 'true');
  assert.equal(hunt.disabled, true);
  assert.ok(hunt.getAttribute('disabled') != null, 'leftover Hunt uses HTML disabled');
  assert.equal((leftover.textContent.match(/Need oil/g) ?? []).length, 1, 'Need oil once in leftover');
  const stretchNeed = scr.node.querySelectorAll('button').filter((b) => /Need oil/.test(b.textContent ?? ''));
  assert.equal(stretchNeed.length, 0);
  assert.equal((scr.node.textContent.match(/Need oil/g) ?? []).length, 1, 'Need oil once on the whole combat screen');
});

test('one-slot eat picker cycles lantern-loaf to fogwort', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const pick = scr.node.querySelector('.eat-pick');
  assert.ok(pick);
  assert.match(pick.textContent ?? '', /Lantern-loaf \+14 · 8/);
  pick.click();
  const next = scr.node.querySelector('.eat-pick')?.textContent ?? '';
  assert.match(next, /Fogwort \+5 · 4/);
});

test('fight-live first frame hides title, XP bar, and XP chip', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  assert.ok(scr.node.classList.contains('fight-live'));
  assert.equal(scr.node.querySelector('.fight-xp-chip'), null);
  const fight = scr.node.querySelector('.combat-fight');
  assert.match(fight.querySelector('.eat-row')?.textContent ?? '', /Fall back/);
  assert.match(fight.querySelector('.acc-station')?.textContent ?? '', /Acc \d+% · \d+–\d+ · [\d.]+s \/ they \d+% · \d+–\d+ · [\d.]+s/);
  assert.equal(fight.querySelector('.flee-btn')?.classList.contains('btn-wide'), false);
  assert.ok(fight.querySelector('.hand-chip'));
  assert.match(fight.querySelector('.hand-chip')?.textContent ?? '', /Knife|Unarmed/);
});

test('eat-pick is not armed when only one food is owned', () => {
  const state = createState({ rngSeed: 4 });
  state.bank.fogwort = 0;
  state.bank.palecap = 0;
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  state.combat.player.hp = 32;
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const pick = scr.node.querySelector('.eat-pick');
  assert.ok(pick);
  assert.equal(pick.tagName, 'SPAN');
  assert.equal(pick.classList.contains('btn'), false);
  assert.equal(pick.classList.contains('btn-primary'), false);
  assert.equal(pick.classList.contains('on'), false);
  assert.match(pick.textContent ?? '', /Lantern-loaf \+14 · 8/);
  const eatBtn = scr.node.querySelector('.eat-btn');
  assert.ok(eatBtn.classList.contains('btn-primary'));
  assert.equal(eatBtn.classList.contains('btn-disabled'), false);
});

function assertLoafChip(host, { count = 8, tag = null } = {}) {
  assert.equal(host.querySelector('select'), null, 'food slot is not a native <select>');
  const pick = host.querySelector('.eat-pick');
  assert.ok(pick, 'eat-pick chip');
  assert.notEqual(pick.tagName, 'SELECT');
  if (tag) assert.equal(pick.tagName, tag);
  const text = pick.textContent ?? '';
  const title = pick.getAttribute('title') ?? '';
  assert.match(text, /Lantern-loaf/, 'name is in eat-pick text, not a title attr');
  assert.equal(/Lantern-loaf/.test(title) && !/Lantern-loaf/.test(text), false);
  assert.match(text, new RegExp(String(count)), 'remaining count is in eat-pick text');
  assert.match(pick.querySelector('.eat-food-name')?.textContent ?? '', /Lantern-loaf/);
  assert.match(pick.querySelector('.eat-food-meta')?.textContent ?? '', new RegExp(`\\+14 · ${count}`));
  const glyph = pick.querySelector('.eat-glyph');
  assert.ok(glyph, 'loaf glyph on the chip');
  assert.ok(glyph.classList.contains('glyph-loaf'));
  assert.match(glyph.innerHTML ?? '', /<svg/i);
  assert.ok(host.querySelector('.eat-btn'), 'Eat stays the tap');
  return pick;
}

test('leftover unpaid eat-pick is a lantern-loaf chip with count, not a truncated select', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killMoth(state));
  const n = state.bank['lantern-loaf'] ?? 0;
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover?.classList.contains('leftover-station'));
  assertLoafChip(leftover, { count: n, tag: 'BUTTON' });
  assert.ok(leftover.querySelector('.eat-btn'));
  assert.ok(leftover.querySelector('.leftover-hunt'));
  assert.ok(leftover.querySelector('.acc-station'), 'Acc still present');
  assert.ok(leftover.querySelector('.leftover-kit') || leftover.querySelector('.hand-chip'));
  const css = readFileSync(join(here, '../src/ui/combat.css'), 'utf8');
  assert.match(css, /\.screen\.fight-live \.craft-nav,\s*\n\.screen\.leftover-live \.craft-nav\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /\.eat-pick\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.doesNotMatch(css, /\.leftover-station \.eat-pick\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.doesNotMatch(css, /\.leftover-station \.eat-pick\s*\{[^}]*white-space:\s*nowrap/);
});

test('live Hunt eat-pick is a lantern-loaf chip with count, not a truncated select', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  const n = state.bank['lantern-loaf'] ?? 0;
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  assert.ok(scr.node.classList.contains('fight-live'));
  const fight = scr.node.querySelector('.combat-fight');
  assertLoafChip(fight, { count: n, tag: 'BUTTON' });
  assert.match(fight.querySelector('.eat-row')?.textContent ?? '', /Fall back/);
  assert.equal(fight.querySelector('select'), null);
});

test('leftover hub is leftover-live and has no duplicate souls chips', () => {
  const state = createState({ rngSeed: 4 });
  killMoth(state);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  assert.ok(scr.node.classList.contains('leftover-live'));
  assert.equal(scr.node.classList.contains('fight-live'), false);
  assert.equal(scr.node.querySelector('.fight-xp-chip'), null);
  assert.equal(scr.node.querySelectorAll('.combat-meta').length, 0);
  const leftover = scr.node.querySelector('.leftover-station');
  assert.match(leftover?.querySelector('.leftover-loot')?.textContent ?? leftover?.textContent ?? '', /✦|soul/);
  assert.match(leftover?.querySelector('.leftover-hunt')?.textContent ?? '', /Hunt Pale Moth/);
  assert.equal(scr.node.querySelector('.hunt-list'), null, 'hunt list is unmounted from leftover-live');
  assert.equal(scr.node.querySelector('.vigil-card'), null);
  assert.equal(scr.node.querySelector('.zone-chips'), null);
  assert.ok(Array.isArray(state.combat.lastStation.log));
  assert.ok(state.combat.lastStation.log.length >= 1);
});


function assertLeftoverCockpit(leftover, { foe = /Pale Moth/, kicker }) {
  assert.ok(leftover, 'leftover cockpit');
  const text = leftover.textContent ?? '';
  assert.match(text, /You/);
  assert.match(text, foe);
  assert.match(leftover.querySelector('.eat-row')?.textContent ?? '', /Eat|Lantern-loaf|No food/);
  const unpaid = leftover.classList.contains('leftover-station')
    && leftover.querySelector('.satchel-chip')
    && leftover.querySelector('.satchel-chip').getAttribute('hidden') == null;
  if (unpaid) {
    assert.match(leftover.querySelector('.satchel-chip')?.textContent ?? '', /Satchel · \d+/);
  }
  assert.match(leftover.querySelector('.hand-chip')?.textContent ?? '', /Knife|Unarmed/);
  assert.ok(leftover.querySelector('.acc-station'));
  assert.ok(leftover.querySelector('.style-row'));
  assert.ok(leftover.querySelector('.combat-log'));
  assert.ok(leftover.querySelectorAll('.log-line').length >= 1);
  assert.ok(leftover.querySelectorAll('.log-line').length <= 4);
  assert.equal(leftover.querySelectorAll('.fighter').length, 2);
  assert.equal(leftover.querySelectorAll('.vigil-card').length, 0);
  assert.equal(leftover.querySelectorAll('.zone-chips').length, 0);
  if (kicker) assert.match(leftover.querySelector('.leftover-kicker')?.textContent ?? '', kicker);
}

test('leftover after Fall back is the same 360 cockpit, not a lobby kicker', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'pale-moth', { encounterSeed: 9 });
  combat.fleeFight(state);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assertLeftoverCockpit(leftover, { kicker: /Fell back from Pale Moth/ });
  assert.match(leftover.querySelector('.leftover-hunt')?.textContent ?? '', /Hunt Pale Moth/);
  assert.equal(scr.node.querySelector('.combat-lobby'), null, 'lobby is unmounted from leftover-live');
  assert.equal(scr.node.querySelector('.combat-lobby-after'), null);
  assert.equal(scr.node.querySelector('.hunt-list'), null);
  assert.equal(scr.node.querySelector('.vigil-card'), null);
});

test('first Hunt Pale Moth is above the 360 fold on the combat lobby', () => {
  const state = createState({ rngSeed: 2 });
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  assert.equal(scr.node.classList.contains('leftover-live'), false);
  const lobby = scr.node.querySelector('.combat-lobby');
  assert.ok(lobby);
  const cards = lobby.querySelectorAll('.hunt-card');
  assert.ok(cards.length >= 1);
  assert.match(cards[0].textContent ?? '', /Pale Moth/);
  assert.match(cards[0].querySelector('.hunt-go')?.textContent ?? '', /Hunt/);
  const vigil = lobby.querySelector('.vigil-card');
  const vigilIdx = lobby.children.indexOf(vigil);
  const huntIdx = lobby.children.indexOf(lobby.querySelector('.hunt-list'));
  assert.ok(huntIdx >= 0 && vigilIdx > huntIdx, 'hunts before Vigil');
  const fold = lobbyFirstHuntBottom();
  assert.ok(fold.fits, `Hunt bottom ${fold.huntBottom} vs tab ${fold.tabTop}`);
});

test('fight log budget sits above the 360 tab bar', () => {
  const box = cockpitLogVsTab('fight');
});

test('live panel.update keeps Eat and Fall back nodes; eatFood and fleeFight still run', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'wick-thief', { encounterSeed: 1 });
  combat.resumeCombat(state);
  const max = combat.playerMaxHp(state);
  state.combat.player.hp = Math.max(8, max - 20);
  const loafBefore = state.bank['lantern-loaf'] ?? 0;
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const eatBtn = scr.node.querySelector('.eat-btn');
  const fleeBtn = scr.node.querySelector('.flee-btn');
  const strike = scr.node.querySelectorAll('button').find((b) => (b.textContent ?? '') === 'Strike');
  const keep = scr.node.querySelector('.combat-keep');
  const craftNav = scr.node.querySelector('.craft-nav');
  const hand = scr.node.querySelector('.hand-chip');
  assert.ok(eatBtn && fleeBtn && strike && keep && craftNav && hand);
  for (let i = 0; i < 10; i++) {
    if (state.combat.foe) state.combat.foe.hp = Math.max(4, state.combat.foe.hp);
    combat.tickCombat(state, 100);
    assert.equal(state.combat.fighting, true);
    scr.update();
    assert.equal(scr.node.querySelector('.eat-btn'), eatBtn, 'Eat node must survive ticks');
    assert.equal(scr.node.querySelector('.flee-btn'), fleeBtn, 'Fall back node must survive ticks');
    assert.equal(scr.node.querySelectorAll('button').find((b) => (b.textContent ?? '') === 'Strike'), strike);
    assert.equal(scr.node.querySelector('.combat-keep'), keep);
    assert.equal(scr.node.querySelector('.craft-nav'), craftNav);
    assert.equal(scr.node.querySelector('.hand-chip'), hand);
  }
  const hpBefore = state.combat.player.hp;
  eatBtn.click();
  assert.ok(state.combat.player.hp > hpBefore, 'eatFood must run after live updates');
  assert.ok((state.bank['lantern-loaf'] ?? 0) < loafBefore);

  const fleeAfterEat = scr.node.querySelector('.flee-btn');
  assert.ok(fleeAfterEat);
  for (let i = 0; i < 6; i++) {
    if (state.combat.foe) state.combat.foe.hp = Math.max(4, state.combat.foe.hp);
    combat.tickCombat(state, 100);
    scr.update();
    assert.equal(scr.node.querySelector('.flee-btn'), fleeAfterEat);
  }
  fleeAfterEat.click();
  assert.equal(state.combat.fighting, false);
  assert.equal(state.combat.lastStation?.ended, 'flee');
});


function leftoverDoorToHuntList(state) {
  const lumen0 = state.lumen;
  const souls0 = state.souls;
  const pile = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  assert.ok(scr.node.classList.contains('leftover-live'));
  assert.equal(scr.node.querySelector('.hunt-list'), null);
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover);
  assert.ok(leftover.querySelector('.leftover-hunt'), 'Hunt-this-foe stays');
  const door = leftover.querySelector('.leftover-another');
  assert.ok(door, 'leftover exposes a door off this foe');
  assert.match(door.textContent ?? '', /Hunt another/);
  door.click();
  assert.equal(state.combat.lastStation, null);
  assert.deepEqual(state.combat.lootTray, []);
  assert.equal(state.lumen, lumen0 + traySum(pile, 'lumen'));
  assert.equal(state.souls, souls0 + traySum(pile, 'soul'));
  assert.equal(scr.node.classList.contains('leftover-live'), false);
  assert.equal(scr.node.querySelector('.leftover-station'), null);
  const list = scr.node.querySelector('.hunt-list');
  assert.ok(list, 'hunt list is back');
  assert.ok(scr.node.querySelector('.craft-nav'), 'hunt list still shows Emberkeeping / Foraging / Combat');
  const cards = scr.node.querySelectorAll('.hunt-card');
  assert.ok(cards.length >= 2, 'more than one foe on the stretch');
  assert.ok(cards.some((c) => /Pale Moth/.test(c.textContent ?? '')));
  assert.ok(cards.some((c) => /Wick-thief/.test(c.textContent ?? '')));
  return scr;
}

test('leftover after Fall back exposes Hunt another and returns the zone hunt list', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'wick-thief', { encounterSeed: 1 });
  combat.fleeFight(state);
  leftoverDoorToHuntList(state);
});

test('leftover after kill exposes Hunt another and can start a different foe', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killMoth(state));
  leftoverDoorToHuntList(state);
});

test('Eat, Fall back, and Hunt another stay 44px taps and do not shrink under the food label', () => {
  const css = readFileSync(join(here, '../src/ui/combat.css'), 'utf8');
  assert.match(css, /\.eat-btn\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.flee-btn\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.leftover-another\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.leftover-take\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.leftover-oil-buy\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.eat-slot\s*\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(css, /\.eat-row\s*\{[^}]*flex-shrink:\s*0/);
  assert.match(css, /\.leftover-actions\s*\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(css, /\.leftover-actions\s*\{[^}]*max-width:\s*100%/);
});

test('leftover loot tray keeps prior chips after Hunt this foe and Take all pays once', () => {
  const state = createState({ rngSeed: 4 });
  const lumen0 = state.lumen;
  const souls0 = state.souls;
  const bank0 = { ...state.bank };
  assert.ok(killFoe(state, 'fog-rat'));
  const firstTray = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  assert.ok(firstTray.length >= 1);
  assert.ok(firstTray.every((e) => e.granted === false));
  assert.equal(state.lumen, lumen0);
  assert.equal(state.souls, souls0);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assertSatchelChip(leftover, unpaidN(state));
  const { body } = assertLootFurniture(leftover, {
    minItemTiles: trayItems(firstTray).length,
    expectWallet: trayWallet(firstTray).length > 0,
  });
  assert.match(body.textContent ?? '', /soul|✦/);
  leftover.querySelector('.leftover-hunt').click();
  assert.equal(state.combat.fighting, true);
  assert.equal(state.lumen, lumen0, 'Hunt this foe does not collect');

  let kill = null;
  for (let i = 0; i < 80 && !kill; i++) {
    if (state.combat.foe) state.combat.foe.hp = 1;
    state.combat.player.nextActMs = 0;
    kill = combat.tickCombat(state, 100).find((e) => e.type === 'combat-kill') ?? kill;
    scr.update();
  }
  assert.ok(kill);
  const after = scr.node.querySelector('.leftover-station');
  assert.ok(after);
  assertSatchelChip(after, unpaidN(state));
  const sheet2 = openSatchel(after);
  const { body: body2 } = assertSatchelFurniture(sheet2, {
    minItemTiles: trayItems(state.combat.lootTray).length,
    expectWallet: true,
  });
  const pile2 = body2.textContent ?? '';
  assert.match(pile2, /soul/);
  assert.match(pile2, /✦/);
  for (const row of firstTray) {
    if (row.kind === 'item') assert.match(pile2, new RegExp(row.name ?? row.id));
    if (row.kind === 'soul') assert.match(pile2, /soul/);
  }
  assert.match(pile2, /[2-9] souls|[2-9] soul/);
  const held = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  assert.equal(state.lumen, lumen0);
  assert.equal(state.souls, souls0);

  takeAllFromSatchel(after);
  assert.deepEqual(state.combat.lootTray, []);
  assert.equal(state.lumen, lumen0 + traySum(held, 'lumen'));
  assert.equal(state.souls, souls0 + traySum(held, 'soul'));
  for (const row of held) {
    if (row.kind === 'item' && row.id) {
      assert.equal(state.bank[row.id] ?? 0, (bank0[row.id] ?? 0) + row.qty);
    }
  }
  assert.equal(scr.node.querySelector('.leftover-loot'), null);
  assert.equal(leftoverTake(scr.node), null);
  assert.ok(scr.node.querySelector('.leftover-hunt'), 'Hunt-this-foe stays after Take all');
  assert.ok(scr.node.classList.contains('leftover-live'));

  const paidLumen = state.lumen;
  const paidSouls = state.souls;
  combat.takeAllLootTray(state);
  assert.equal(state.lumen, paidLumen);
  assert.equal(state.souls, paidSouls);
});

test('leftover after Fall back still shows the held loot pile', () => {
  const state = createState({ rngSeed: 4 });
  const lumen0 = state.lumen;
  const souls0 = state.souls;
  assert.ok(killFoe(state, 'fog-rat'));
  const first = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  combat.startFight(state, 'pale-moth', { encounterSeed: 9 });
  combat.fleeFight(state);
  const leftover = renderSkillDetail(makeCtx(state), 'combat').node.querySelector('.leftover-station');
  assert.match(leftover.querySelector('.leftover-kicker')?.textContent ?? '', /Fell back from Pale Moth/);
  assertSatchelChip(leftover, unpaidN(state));
  const sheet = openSatchel(leftover);
  const { body } = assertSatchelFurniture(sheet, {
    minItemTiles: trayItems(first).length,
    expectWallet: trayWallet(first).length > 0,
  });
  const pile = body.textContent ?? '';
  assert.match(pile, /soul|✦/);
  for (const row of first) {
    if (row.kind === 'item') assert.match(pile, new RegExp(row.name ?? row.id));
  }
  leftover.querySelector('.leftover-another').click();
  assert.equal(state.combat.lastStation, null);
  assert.deepEqual(state.combat.lootTray, []);
  assert.equal(state.lumen, lumen0 + traySum(first, 'lumen'));
  assert.equal(state.souls, souls0 + traySum(first, 'soul'));
});

test('pack-full Hunt another keeps leftover chips; Take all does not hide them', () => {
  const state = createState({ rngSeed: 4 });
  delete state.bank['pall-fang'];
  for (const it of ITEMS) {
    if (it.id === 'pall-fang') continue;
    if (uniqueStackCount(state.bank) >= lanternRoom(state)) break;
    if ((state.bank[it.id] ?? 0) <= 0) state.bank[it.id] = 1;
  }
  assert.equal(canAcceptStack(state, 'pall-fang'), false);
  state.combat.fighting = false;
  state.combat.lastStation = {
    enemyId: 'pale-moth',
    enemyName: 'Pale Moth',
    ended: 'kill',
    foeHp: 0,
    foeMaxHp: 16,
    souls: 1,
    lootGranted: false,
    loot: [{ kind: 'item', id: 'pall-fang', qty: 1, name: 'Pall-fang', granted: false }],
    log: [{ t: 0, text: 'Pale Moth falls. Loot: Pall-fang ×1.', kind: 'kill' }],
  };
  state.combat.lootTray = [
    { kind: 'lumen', qty: 4, name: 'Lumen', granted: false },
    { kind: 'soul', qty: 1, granted: false },
    { kind: 'item', id: 'pall-fang', qty: 1, name: 'Pall-fang', granted: false },
  ];
  const lumen0 = state.lumen;
  const souls0 = state.souls;
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  assert.ok(scr.node.classList.contains('leftover-live'));
  const leftover = scr.node.querySelector('.leftover-station');
  assertSatchelChip(leftover, 1);
  const packed = assertLootFurniture(leftover, { minItemTiles: 1, expectWallet: true });
  assert.match(packed.body.textContent ?? '', /Pall-fang/);
  takeAllFromSatchel(leftover);
  assert.equal(state.lumen, lumen0 + 4);
  assert.equal(state.souls, souls0 + 1);
  assert.equal(state.bank['pall-fang'], undefined);
  assert.ok(scr.node.classList.contains('leftover-live'));
  assert.equal(scr.node.querySelector('.hunt-list'), null);
  assertSatchelChip(scr.node.querySelector('.leftover-station'), 1);
  const still = openSatchel(scr.node.querySelector('.leftover-station'));
  assert.match(still.querySelector('.satchel-body')?.textContent ?? '', /Pall-fang/);
  assert.ok(leftoverTake(scr.node), 'Take all stays in the sheet while Pall-fang is unpaid');

  scr.node.querySelector('.leftover-another').click();
  assert.equal(state.combat.lastStation?.enemyId, 'pale-moth');
  assert.equal(state.combat.lootTray.length, 1);
  assert.equal(state.combat.lootTray[0].id, 'pall-fang');
  assert.equal(state.combat.lootTray[0].granted, false);
  assert.equal(state.bank['pall-fang'], undefined);
  assert.ok(scr.node.classList.contains('leftover-live'));
  assert.ok(scr.node.querySelector('.leftover-station'));
  assert.equal(scr.node.querySelector('.hunt-list'), null);
  assertSatchelChip(scr.node.querySelector('.leftover-station'), 1);
  const stillAfter = openSatchel(scr.node.querySelector('.leftover-station'));
  assert.match(stillAfter.querySelector('.satchel-body')?.textContent ?? '', /Pall-fang/);
});

test('leftover Eat heals in place without leaving leftover-live', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killFoe(state, 'fog-rat'));
  const lumen0 = state.lumen;
  const tray = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  const max = combat.playerMaxHp(state);
  state.combat.player.hp = Math.max(8, max - 20);
  const loafBefore = state.bank['lantern-loaf'] ?? 0;
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  assert.ok(scr.node.classList.contains('leftover-live'));
  const leftover = scr.node.querySelector('.leftover-station');
  const eatBtn = leftover.querySelector('.eat-btn');
  assert.ok(eatBtn);
  const hpBefore = state.combat.player.hp;
  eatBtn.click();
  assert.ok(state.combat.player.hp > hpBefore);
  assert.ok((state.bank['lantern-loaf'] ?? 0) < loafBefore);
  assert.equal(state.lumen, lumen0, 'Eat does not collect the pile');
  assert.ok(state.combat.lootTray.length >= 1);
  assert.equal(traySum(state.combat.lootTray, 'lumen'), traySum(tray, 'lumen'));
  assert.ok(scr.node.classList.contains('leftover-live'));
  assert.ok(scr.node.querySelector('.leftover-station'));
  assert.equal(scr.node.querySelector('.hunt-list'), null);
});

test('dry leftover offers wick-oil buy; Hunt this foe enables after the stall sip', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killMoth(state));
  const tray = (state.combat.lootTray ?? []).length;
  state.bank['wick-oil'] = 0;
  state.bank['lamp-oil'] = 0;
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  const buy = leftover.querySelector('.leftover-oil-buy');
  assert.ok(buy, 'dry leftover paints a stall buy');
  assert.match(buy.textContent ?? '', /Wick-oil/);
  assert.match(buy.textContent ?? '', /✦/);
  const hunt = leftover.querySelector('.leftover-hunt');
  assert.equal(hunt.disabled, true);
  const lumen = state.lumen;
  buy.click();
  assert.ok((state.bank['wick-oil'] ?? 0) >= 1);
  assert.ok(state.lumen < lumen);
  assert.equal(state.combat.lootTray.length, tray, 'oil buy does not collect');
  const hunt2 = scr.node.querySelector('.leftover-hunt');
  assert.ok(hunt2);
  assert.equal(hunt2.disabled, false);
  assert.equal(hunt2.getAttribute('aria-disabled'), 'false');
  assert.equal(combat.oilSipsRemaining(state) > 0, true);
  assert.equal(scr.node.querySelector('.leftover-oil-buy'), null);
  assert.equal(scr.node.querySelector('.hunt-list'), null, 'leftover stays a combat page');
  assert.ok(scr.node.classList.contains('leftover-live'));
});

test('first live fight hides the satchel until unpaid loot exists', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const fight = scr.node.querySelector('.combat-fight');
  assert.ok(fight);
  assert.equal(fight.classList.contains('leftover-station'), false);
  assertFightSatchel(fight);
  assertNoSatchel(fight);
  assert.equal(leftoverTake(fight), null, 'empty live fight has no Take all box');
  assert.doesNotMatch(fight.textContent ?? '', /Take all/);
  const css = readFileSync(join(here, '../src/ui/combat.css'), 'utf8');
  assert.match(css, /\.satchel-chip\[hidden\],\s*\n\.satchel-chip\.is-empty/);
});

test('ungranted leftover chips paint on the next live fight; kill still does not pay', () => {
  const state = createState({ rngSeed: 4 });
  const lumen0 = state.lumen;
  const souls0 = state.souls;
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  const first = renderSkillDetail(makeCtx(state), 'combat');
  assertNoSatchel(first.node.querySelector('.combat-fight'));
  assert.equal(leftoverTake(first.node), null, 'empty live fight has no Take all');

  assert.ok(killFoe(state, 'fog-rat'));
  const pile = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  assert.ok(pile.length >= 1);
  assert.ok(pile.every((e) => e.granted === false));
  assert.equal(state.lumen, lumen0);
  assert.equal(state.souls, souls0);

  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assertSatchelChip(leftover, unpaidN(state));
  leftover.querySelector('.leftover-hunt').click();
  assert.equal(state.combat.fighting, true);
  assert.equal(state.lumen, lumen0);
  assert.equal(state.souls, souls0);

  const fight = scr.node.querySelector('.combat-fight');
  assert.ok(fight);
  assert.equal(fight.classList.contains('leftover-station'), false);
  assertSatchelChip(fight, unpaidN(state));
  assert.ok(leftoverTake(openSatchel(fight)));
  assert.match(fight.querySelector('.eat-row')?.textContent ?? '', /Eat/);
  assert.match(fight.querySelector('.eat-row')?.textContent ?? '', /Fall back/);
  assert.equal(fight.querySelector('.eat-row')?.querySelector('.leftover-another'), null);
});

test('Take all from the live-fight tray pays once and the HUD lumen jumps', () => {
  const state = createState({ rngSeed: 4 });
  const lumen0 = state.lumen;
  const souls0 = state.souls;
  const bank0 = { ...state.bank };
  assert.ok(killFoe(state, 'fog-rat'));
  const held = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  scr.node.querySelector('.leftover-hunt').click();
  assert.equal(state.combat.fighting, true);
  assert.equal(state.lumen, lumen0, 'wallet still unpaid on the live pull');

  const hud = { textContent: '' };
  paintHud(hud, null, state);
  assert.match(hud.textContent ?? '', new RegExp(`✦\\s*${lumen0}`));

  const take = leftoverTake(openSatchel(scr.node.querySelector('.combat-fight')));
  assert.ok(take);
  take.click();
  assert.deepEqual(state.combat.lootTray, []);
  assert.equal(state.lumen, lumen0 + traySum(held, 'lumen'));
  assert.equal(state.souls, souls0 + traySum(held, 'soul'));
  for (const row of held) {
    if (row.kind === 'item' && row.id) {
      assert.equal(state.bank[row.id] ?? 0, (bank0[row.id] ?? 0) + row.qty);
    }
  }
  paintHud(hud, null, state);
  assert.match(hud.textContent ?? '', new RegExp(`✦\\s*${state.lumen}`));
  assert.ok(state.lumen > lumen0, 'HUD lumen jumps on Take all');
  assertNoSatchel(scr.node.querySelector('.combat-fight'));
  assert.equal(leftoverTake(scr.node), null, 'empty live hides Take all');
  assert.ok(scr.node.querySelector('.eat-btn'), 'Eat stays after collect');
  assert.ok(scr.node.querySelector('.flee-btn'), 'Fall back stays after collect');

  const paid = { lumen: state.lumen, souls: state.souls };
  combat.takeAllLootTray(state);
  assert.equal(state.lumen, paid.lumen);
  assert.equal(state.souls, paid.souls);
});

test('Eat and Fall back survive ticks while the unpaid live-fight tray is mounted', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killFoe(state, 'fog-rat'));
  assert.ok((state.combat.lootTray ?? []).some((e) => e.granted === false));
  const max = combat.playerMaxHp(state);
  state.combat.player.hp = Math.max(8, max - 20);
  const loafBefore = state.bank['lantern-loaf'] ?? 0;
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  scr.node.querySelector('.leftover-hunt').click();
  assert.equal(state.combat.fighting, true);
  combat.resumeCombat(state);
  const eatBtn = scr.node.querySelector('.eat-btn');
  const fleeBtn = scr.node.querySelector('.flee-btn');
  const strike = scr.node.querySelectorAll('button').find((b) => (b.textContent ?? '') === 'Strike');
  const chip = scr.node.querySelector('.satchel-chip');
  assert.ok(eatBtn && fleeBtn && strike && chip);
  assertSatchelChip(scr.node.querySelector('.combat-fight'), unpaidN(state));
  for (let i = 0; i < 10; i++) {
    if (state.combat.foe) state.combat.foe.hp = Math.max(4, state.combat.foe.hp);
    combat.tickCombat(state, 100);
    assert.equal(state.combat.fighting, true);
    scr.update();
    assert.equal(scr.node.querySelector('.eat-btn'), eatBtn, 'Eat node must survive ticks with satchel mounted');
    assert.equal(scr.node.querySelector('.flee-btn'), fleeBtn, 'Fall back node must survive ticks with satchel mounted');
    assert.equal(scr.node.querySelectorAll('button').find((b) => (b.textContent ?? '') === 'Strike'), strike);
    assert.equal(scr.node.querySelector('.satchel-chip'), chip);
    assertFightSatchel(scr.node.querySelector('.combat-fight'));
  }
  const hpBefore = state.combat.player.hp;
  eatBtn.click();
  assert.ok(state.combat.player.hp > hpBefore, 'eatFood must run after live updates with tray');
  assert.ok((state.bank['lantern-loaf'] ?? 0) < loafBefore);
  assert.ok((state.combat.lootTray ?? []).some((e) => e.granted === false), 'Eat does not collect');
});


function assertLootFurniture(host, opts = {}) {
  const chip = host.querySelector('.satchel-chip');
  assert.ok(chip, 'satchel chip is mounted');
  assert.equal(chip.getAttribute('hidden'), null, 'unpaid chip is visible');
  if (!satchelSheet()) chip.click();
  const sheet = satchelSheet();
  assert.ok(sheet, 'chip opens the satchel sheet');
  const out = assertSatchelFurniture(sheet, opts);
  return { ...out, tray: out.body };
}

test('leftover unpaid tray is loot furniture: glyph + name + qty, Take all still grants', () => {
  const state = createState({ rngSeed: 4 });
  const lumen0 = state.lumen;
  const souls0 = state.souls;
  const bank0 = { ...state.bank };
  assert.ok(killFoe(state, 'fog-rat'));
  const held = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  assert.ok(held.length >= 1);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover.classList.contains('leftover-station'));
  assertSatchelChip(leftover, unpaidN(state));
  const { tiles, body } = assertLootFurniture(leftover, {
    minItemTiles: trayItems(held).length,
    expectWallet: trayWallet(held).length > 0,
  });
  assert.equal(tiles.length, trayItems(held).length);
  assert.match(body.textContent ?? '', /soul/);
  assert.match(body.textContent ?? '', /✦/);
  takeAllFromSatchel(leftover);
  assert.deepEqual(state.combat.lootTray, []);
  assert.equal(state.lumen, lumen0 + traySum(held, 'lumen'));
  assert.equal(state.souls, souls0 + traySum(held, 'soul'));
  for (const row of held) {
    if (row.kind === 'item' && row.id) {
      assert.equal(state.bank[row.id] ?? 0, (bank0[row.id] ?? 0) + row.qty);
    }
  }
  assert.equal(scr.node.querySelector('.leftover-loot'), null);
  combat.takeAllLootTray(state);
  assert.equal(state.lumen, lumen0 + traySum(held, 'lumen'));
});

test('live unpaid tray is the same furniture; Take all pays; compact height holds', () => {
  const state = createState({ rngSeed: 4 });
  const lumen0 = state.lumen;
  const souls0 = state.souls;
  assert.ok(killFoe(state, 'fog-rat'));
  const held = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  scr.node.querySelector('.leftover-hunt').click();
  assert.equal(state.combat.fighting, true);
  const fight = scr.node.querySelector('.combat-fight');
  assert.equal(fight.classList.contains('leftover-station'), false);
  assertSatchelChip(fight, unpaidN(state));
  const { tray, tiles } = assertLootFurniture(fight, {
    minItemTiles: trayItems(held).length,
    expectWallet: trayWallet(held).length > 0,
  });
  assert.ok(tray.classList.contains('satchel-body') || tray.classList.contains('leftover-loot'));
  assert.match(tray.getAttribute('aria-label') ?? '', /Satchel · \d+/);
  assert.match(tray.querySelector('.loot-well-meter')?.textContent ?? '', /Hollow \d+\/\d+/);
  assert.equal(tiles.length, trayItems(held).length);
  assert.match(tray.textContent ?? '', /soul/);
  assert.match(tray.textContent ?? '', /✦/);

  leftoverTake(fight).click();
  assert.deepEqual(state.combat.lootTray, []);
  assert.equal(state.lumen, lumen0 + traySum(held, 'lumen'));
  assert.equal(state.souls, souls0 + traySum(held, 'soul'));
  assertNoSatchel(scr.node.querySelector('.combat-fight'));
  assert.equal(leftoverTake(scr.node), null, 'empty live hides Take all');
  assert.ok(scr.node.querySelector('.eat-btn'));
  assert.ok(scr.node.querySelector('.flee-btn'));

});

test('live unpaid furniture tiles survive combat ticks without remounting Eat/Fall back', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killMoth(state));
  ensureUnpaidItem(state, 'pall-fang', 1);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  scr.node.querySelector('.leftover-hunt').click();
  combat.resumeCombat(state);
  const eatBtn = scr.node.querySelector('.eat-btn');
  const fleeBtn = scr.node.querySelector('.flee-btn');
  const chip = scr.node.querySelector('.satchel-chip');
  assert.ok(eatBtn && fleeBtn && chip);
  assertSatchelChip(scr.node.querySelector('.combat-fight'));
  const sheet0 = openSatchel(scr.node.querySelector('.combat-fight'));
  const tile0 = sheet0.querySelector('.loot-tile.loot-item');
  const take = leftoverTake(scr.node);
  assert.ok(tile0 && take);
  for (let i = 0; i < 8; i++) {
    if (state.combat.foe) state.combat.foe.hp = Math.max(4, state.combat.foe.hp);
    combat.tickCombat(state, 100);
    scr.update();
    assert.equal(scr.node.querySelector('.eat-btn'), eatBtn);
    assert.equal(scr.node.querySelector('.flee-btn'), fleeBtn);
    assert.equal(scr.node.querySelector('.satchel-chip'), chip);
    assert.equal(leftoverTake(scr.node), take, 'Take all node survives ticks in the sheet');
    assert.equal(satchelSheet().querySelector('.loot-tile.loot-item'), tile0, 'loot portrait survives ticks in the sheet');
    assertFightSatchel(scr.node.querySelector('.combat-fight'));
  }
});

test('leftover well Take all is a no-op the second time; Acc was never gated on pay', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killFoe(state, 'fog-rat'));
  const lumen0 = state.lumen;
  const souls0 = state.souls;
  const held = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover.classList.contains('leftover-station'));
  assert.ok(leftover.querySelector('.acc-station'), 'Acc is on unpaid leftover before Take all');
  assert.ok(leftover.querySelector('.hand-chip'));
  assert.ok(leftover.querySelector('.style-row'));
  takeAllFromSatchel(leftover);
  assert.deepEqual(state.combat.lootTray, []);
  assert.equal(state.lumen, lumen0 + traySum(held, 'lumen'));
  assert.equal(state.souls, souls0 + traySum(held, 'soul'));
  const after = scr.node.querySelector('.leftover-station');
  assert.ok(after);
  assertNoSatchel(after);
  assert.ok(after.querySelector('.acc-station'), 'Acc stays after Take all');
  assert.ok(after.querySelector('.hand-chip'));
  assert.ok(after.querySelector('.style-row'));
  assert.equal(leftoverTake(after), null);
  const paidLumen = state.lumen;
  const paidSouls = state.souls;
  combat.takeAllLootTray(state);
  assert.equal(state.lumen, paidLumen);
  assert.equal(state.souls, paidSouls);
  assert.ok(after.querySelector('.leftover-hunt'), 'Hunt-this-foe stays after Take all');
});

test('leftover-live and fight-live hide craft-nav; Emberkeeping, Foraging, and hunt list still show it', () => {
  const css = readFileSync(join(here, '../src/ui/combat.css'), 'utf8');
  assert.match(css, /\.screen\.fight-live \.detail-head,\s*\n\.screen\.leftover-live \.detail-head\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.screen\.fight-live \.craft-nav,\s*\n\.screen\.leftover-live \.craft-nav\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.leftover-station \.log-wrap\s*\{[^}]*min-height:\s*100px/);
  assert.match(css, /\.combat-fight:not\(\.leftover-station\)\s+\.combat-keep\s*\{[^}]*max-height:\s*32px/);
  assert.match(css, /\.satchel-sheet \.loot-tile\s*\{[^}]*min-height:\s*103px/);
  assert.match(css, /\.sheet-panel\.satchel-sheet-panel\s*\{[^}]*min-height:\s*300px/);

  const ember = renderSkillDetail(makeCtx(createState({ rngSeed: 2 })), 'emberkeeping');
  assert.equal(ember.node.classList.contains('leftover-live'), false);
  assert.equal(ember.node.classList.contains('fight-live'), false);
  const emberNav = ember.node.querySelector('.craft-nav');
  assert.ok(emberNav, 'Emberkeeping keeps craft pills');
  assert.match(emberNav.textContent ?? '', /Emberkeeping/);
  assert.match(emberNav.textContent ?? '', /Foraging/);
  assert.match(emberNav.textContent ?? '', /Combat/);

  const forage = renderSkillDetail(makeCtx(createState({ rngSeed: 2 })), 'foraging');
  assert.ok(forage.node.querySelector('.craft-nav'), 'Foraging keeps craft pills');

  const lobby = renderSkillDetail(makeCtx(createState({ rngSeed: 2 })), 'combat');
  assert.equal(lobby.node.classList.contains('leftover-live'), false);
  assert.equal(lobby.node.classList.contains('fight-live'), false);
  assert.ok(lobby.node.querySelector('.hunt-list'), 'combat hunt list');
  assert.ok(lobby.node.querySelector('.craft-nav'), 'combat hunt list keeps craft pills');

  const leftoverState = createState({ rngSeed: 4 });
  assert.ok(killMoth(leftoverState));
  const leftover = renderSkillDetail(makeCtx(leftoverState), 'combat');
  assert.ok(leftover.node.classList.contains('leftover-live'));
  assert.equal(leftover.node.classList.contains('fight-live'), false);
  leftover.node.querySelector('.leftover-another').click();
  leftover.update();
  assert.equal(leftover.node.classList.contains('leftover-live'), false);
  assert.ok(leftover.node.querySelector('.hunt-list'), 'Hunt another returns to the zone list');
  assert.ok(leftover.node.querySelector('.craft-nav'), 'Hunt another restores craft pills on the lobby');

  const fightState = createState({ rngSeed: 4 });
  combat.startFight(fightState, 'pale-moth', { encounterSeed: 1 });
  const fight = renderSkillDetail(makeCtx(fightState), 'combat');
  assert.ok(fight.node.classList.contains('fight-live'));
  assert.equal(fight.node.classList.contains('leftover-live'), false);

});


function assertLeftoverUnpaidChrome(host) {
  const leftover = host.querySelector?.('.leftover-station') ?? host;
  assert.ok(leftover?.classList.contains('leftover-station'));
  const acc = leftover.querySelector('.acc-station');
  assert.ok(acc, 'leftover unpaid keeps Acc');
  assert.match(acc.textContent ?? '', /Acc \d+% · \d+–\d+/);
  const hand = leftover.querySelector('.hand-chip');
  assert.ok(hand, 'leftover unpaid keeps Knife/Unarmed');
  assert.match(hand.textContent ?? '', /Knife|Unarmed/);
  const styles = leftover.querySelector('.style-row');
  assert.ok(styles, 'leftover unpaid keeps Strike/Shot/Rite');
  assert.match(styles.textContent ?? '', /Strike/);
  assert.match(styles.textContent ?? '', /Shot/);
  assert.match(styles.textContent ?? '', /Rite/);
  return leftover;
}

test('leftover unpaid keeps Acc, kit, and styles without Take all', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killFoe(state, 'fog-rat'));
  assert.ok((state.combat.lootTray ?? []).some((e) => e.granted === false));
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftover = assertLeftoverUnpaidChrome(scr.node);
  assertSatchelChip(leftover, unpaidN(state));
});

test('leftover unpaid Acc and kit remain after a second unpaid kill', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killFoe(state, 'fog-rat'));
  const firstPile = (state.combat.lootTray ?? []).length;
  assert.ok(firstPile >= 1);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  assertLeftoverUnpaidChrome(scr.node);
  const hunt = scr.node.querySelector('.leftover-hunt');
  assert.ok(hunt);
  hunt.click();
  assert.equal(state.combat.fighting, true);
  assert.ok(killFoe(state, 'fog-rat'));
  assert.ok((state.combat.lootTray ?? []).length >= firstPile);
  scr.update();
  const leftover = assertLeftoverUnpaidChrome(scr.node);
  assertSatchelChip(leftover, unpaidN(state));
  assert.equal(state.combat.lootTray.every((e) => e.granted === false), true);
});

test('Take all is not the Acc-restore trigger on leftover unpaid', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killFoe(state, 'fog-rat'));
  const lumen0 = state.lumen;
  const held = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const before = assertLeftoverUnpaidChrome(scr.node);
  const accBefore = before.querySelector('.acc-station')?.textContent ?? '';
  leftoverTake(openSatchel(before)).click();
  assert.deepEqual(state.combat.lootTray, []);
  assert.ok(state.lumen >= lumen0 + traySum(held, 'lumen'));
  const after = scr.node.querySelector('.leftover-station');
  assert.ok(after);
  assertNoSatchel(after);
  assert.ok(after.querySelector('.acc-station'), 'Acc remains after pay');
  assert.match(after.querySelector('.acc-station')?.textContent ?? '', /Acc \d+%/);
  assert.ok(accBefore.length > 0);
  combat.takeAllLootTray(state);
  assert.deepEqual(state.combat.lootTray, []);
});

test('killing Fog-rat does not unmount Acc/kit/loaf or swap to a different loot layout', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killFoe(state, 'fog-rat'));
  ensureUnpaidItem(state, 'fogwort', 1);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftoverHunt = scr.node.querySelector('.leftover-hunt');
  assert.ok(leftoverHunt);
  leftoverHunt.click();
  assert.equal(state.combat.fighting, true);
  combat.resumeCombat(state);
  const fight = scr.node.querySelector('.combat-fight');
  assert.ok(fight);
  assert.equal(fight.classList.contains('leftover-station'), false);
  const acc = fight.querySelector('.acc-station');
  const kit = fight.querySelector('.leftover-kit');
  const hand = fight.querySelector('.hand-chip');
  const loaf = fight.querySelector('.eat-pick');
  const eat = fight.querySelector('.eat-btn');
  const flee = fight.querySelector('.flee-btn');
  const well = fight.querySelector('.satchel-chip');
  assert.ok(acc && kit && hand && loaf && eat && flee && well);
  assertSatchelChip(fight, unpaidN(state));
  const sheet = openSatchel(fight);
  assert.ok(leftoverTake(fight));
  assert.ok(sheet.querySelector('.loot-tile.loot-item'), 'Fogwort (or fixture item) stays a loot tile');
  assert.equal(sheet.querySelector('.loot-tile.loot-soul'), null);
  assert.equal(sheet.querySelector('.loot-tile.loot-lumen'), null);
  assert.match(loaf.textContent ?? '', /Lantern-loaf \+14/);
  assert.match(hand.textContent ?? '', /Knife|Wick-knife/);
  assert.match(fight.querySelector('.style-row')?.textContent ?? '', /Strike/);
  assert.match(sheet.querySelector('.loot-well-meter')?.textContent ?? '', /Hollow \d+\/\d+/);
  assert.ok(fight.querySelector('.combat-keep'), 'Keep hunting stays on the living fight');

  let kill = null;
  for (let i = 0; i < 80 && !kill; i++) {
    if (state.combat.foe) state.combat.foe.hp = 1;
    state.combat.player.nextActMs = 0;
    kill = combat.tickCombat(state, 100).find((e) => e.type === 'combat-kill') ?? kill;
    scr.update();
  }
  assert.ok(kill);
  assert.equal(state.combat.fighting, false);
  const after = scr.node.querySelector('.combat-fight');
  assert.equal(after, fight, 'kill must not remount the fight cockpit');
  assert.equal(after.querySelector('.acc-station'), acc, 'Acc node survives the kill');
  assert.equal(after.querySelector('.leftover-kit'), kit, 'kit row survives the kill');
  assert.equal(after.querySelector('.hand-chip'), hand);
  assert.equal(after.querySelector('.eat-pick'), loaf, 'loaf chip survives the kill');
  assert.equal(after.querySelector('.eat-btn'), eat);
  assert.equal(after.querySelector('.satchel-chip'), well, 'satchel chip is the same furniture');
  assertSatchelChip(after, unpaidN(state));
  const afterSheet = satchelSheet() ?? openSatchel(after);
  assert.ok(leftoverTake(after));
  assert.ok(afterSheet.querySelector('.loot-tile.loot-item'));
  assert.ok(afterSheet.querySelector('.loot-well-meter'));
  assertFightSatchel(after);
  assert.ok(after.classList.contains('leftover-station'));
  assert.match(after.querySelector('.leftover-hunt')?.textContent ?? '', /Hunt Fog-rat/);
  assert.match(afterSheet.querySelector('.loot-well-meter')?.textContent ?? '', /Hollow \d+\/\d+/);
  assert.ok(after.querySelector('.leftover-another'), 'Hunt another is a door, not the only path');
  assert.equal(after.querySelector('.hunt-list'), null, 'kill does not dump to the zone list');
});

test('Hunt Fog-rat after a kill stays on this fight; Hunt another is not the only path', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killFoe(state, 'fog-rat'));
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  assert.ok(scr.node.classList.contains('leftover-live'));
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover.classList.contains('leftover-station'));
  assert.match(leftover.querySelector('.leftover-hunt')?.textContent ?? '', /Hunt Fog-rat/);
  assert.ok(leftover.querySelector('.leftover-another'));
  leftover.querySelector('.leftover-hunt').click();
  assert.equal(state.combat.fighting, true);
  assert.equal(scr.node.querySelector('.hunt-list'), null, 'next Fog-rat does not open the zone list');
  assert.ok(scr.node.classList.contains('fight-live'));
  const fight = scr.node.querySelector('.combat-fight');
  assertSatchelChip(fight, unpaidN(state));
  const liveSheet = openSatchel(fight);
  assert.match(liveSheet.querySelector('.loot-well-meter')?.textContent ?? '', /Hollow \d+\/\d+/);
  assert.match(fight.querySelector('.eat-row')?.textContent ?? '', /Fall back/);
  assert.match(fight.querySelector('.eat-pick')?.textContent ?? '', /Lantern-loaf/);
});

test('Fogwort loot tiles are named inspectable items; soul and lumen are wallet, not portraits', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killFoe(state, 'fog-rat'));
  state.combat.lootTray = [
    { kind: 'soul', qty: 2, granted: false },
    { kind: 'lumen', qty: 3, name: 'Lumen', granted: false },
    { kind: 'item', id: 'fogwort', qty: 1, name: 'Fogwort', granted: false },
  ];
  const ctx = makeCtx(state);
  const scr = renderSkillDetail(ctx, 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover?.classList.contains('leftover-station'));
  assertSatchelChip(leftover, 1);
  const { itemTiles, body } = assertLootFurniture(leftover, { minItemTiles: 1, expectWallet: true });
  const itemTile = itemTiles[0];
  assert.ok(itemTile, 'Fogwort is a named loot tile, not a wallet chip');
  assert.equal(itemTile.tagName, 'BUTTON');
  assert.ok(itemTile.classList.contains('loot-inspectable'));
  assert.match(itemTile.querySelector('.loot-name')?.textContent ?? '', /Fogwort/);
  assert.match(itemTile.querySelector('.loot-qty')?.textContent ?? '', /×1|x1/i);
  assert.equal(body.querySelector('.loot-tile.loot-soul'), null, 'souls are not 103px loot-tiles');
  assert.equal(body.querySelector('.loot-tile.loot-lumen'), null, 'lumen is not a 103px loot-tile');
  assert.equal(body.querySelectorAll('.loot-tile').length, 1);
  const wallet = body.querySelector('.loot-wallet');
  assert.ok(wallet, 'wallet sits in the satchel head');
  assert.match(wallet.textContent ?? '', /2 souls|2 soul/);
  assert.match(wallet.textContent ?? '', /✦3/);
  itemTile.click();
  assert.ok(scr.node.classList.contains('leftover-live'));
  assertUnpaidWellNote(leftover, itemTile, ctx);
  assert.ok(itemTile.classList.contains('is-noted'));
  assert.equal(leftover.querySelector('.item-inspector-body'), null);

  leftover.querySelector('.leftover-hunt').click();
  assert.equal(state.combat.fighting, true);
  const fight = scr.node.querySelector('.combat-fight');
  assertSatchelChip(fight, 1);
  const liveSheet = openSatchel(fight);
  const liveItem = liveSheet.querySelector('.loot-tile.loot-item');
  assert.ok(liveItem);
  assert.equal(liveItem.tagName, 'BUTTON');
  assert.match(liveItem.querySelector('.loot-name')?.textContent ?? '', /Fogwort/);
  assert.equal(liveSheet.querySelector('.loot-tile.loot-soul'), null);
  assert.equal(liveSheet.querySelector('.loot-tile.loot-lumen'), null);
  liveItem.click();
  assert.ok(scr.node.classList.contains('fight-live'));
  assertUnpaidWellNote(fight, liveItem, ctx, { live: true });
  assert.ok(liveItem.classList.contains('is-noted'));
});

test('unpaid Fogwort tap is a tray note, not a stall; Take all then bank inspect is real', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killFoe(state, 'fog-rat'));
  const wort = (state.combat.lootTray ?? []).find((e) => e.kind === 'item' && e.id === 'fogwort');
  assert.ok(wort, 'Fog-rat kill must land Fogwort');
  assert.equal(wort.granted, false);
  const lumen0 = state.lumen;
  const souls0 = state.souls;
  const bank0 = state.bank.fogwort ?? 0;

  const ctx = makeCtx(state);
  const scr = renderSkillDetail(ctx, 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover?.classList.contains('leftover-station'), 'leftover-as-mode holds');
  assertSatchelChip(leftover, unpaidN(state));
  const { itemTiles, body } = assertLootFurniture(leftover, { minItemTiles: 1, expectWallet: true });
  const tile = itemTiles[0];
  assert.ok(tile);
  assert.match(tile.querySelector('.loot-name')?.textContent ?? '', /Fogwort/);
  tile.click();
  assert.ok(scr.node.classList.contains('leftover-live'), 'leftover-as-mode leftover-live');
  assertUnpaidWellNote(leftover, tile, ctx);
  const sentence = unpaidLootTapNote('Fogwort');
  const sheetText = satchelSheet()?.textContent ?? '';
  assert.equal(sheetText.split(sentence).length - 1, 1,
    'satchel sheet must print the tray sentence once');
  assert.ok(tile.classList.contains('is-noted'), 'tapped tile keeps a visible ring');
  const leftoverText = leftover.textContent ?? '';
  assert.doesNotMatch(leftoverText, /\bSell 1\b/);
  assert.doesNotMatch(leftoverText, /\bPin\b/);
  assert.doesNotMatch(leftoverText, /\bLock\b/);
  assert.equal(leftover.querySelector('.item-inspector-unpaid'), null);
  assert.equal(leftover.querySelector('.item-inspector-body'), null);
  assert.equal(state.bank.fogwort ?? 0, bank0, 'ungranted tap must not bank or sell the drop');

  const foe = leftover.querySelector('.fighter-foe');
  const art = foe?.querySelector('.foe-tile')?.querySelector('img');
  assert.ok(art, 'Fog-rat cockpit PNG stays');
  assert.match(art.getAttribute('src') ?? '', /fog-rat\.png/);
  assert.ok(leftover.querySelector('.bar.bar-lg'));
  assert.ok(leftover.querySelector('.acc-station'));
  assert.ok(leftover.querySelector('.leftover-kit'));
  assert.match(leftover.querySelector('.eat-pick')?.textContent ?? '', /Lantern-loaf/);
  assert.ok(leftover.querySelector('.leftover-another'), 'Hunt another stays outside the satchel chip');
  assert.equal(leftover.querySelector('.satchel-chip')?.querySelector('.leftover-another'), null);
  assert.equal(leftover.querySelectorAll('.loot-ghost').length, 0);
  const wallet = body.querySelector('.loot-wallet');
  assert.ok(wallet, 'soul/lumen stay satchel-head wallet');
  assert.match(wallet.textContent ?? '', /soul|✦/);

  takeAllFromSatchel(leftover);
  assert.deepEqual(state.combat.lootTray, []);
  assert.equal(state.bank.fogwort ?? 0, bank0 + wort.qty);
  assert.ok(state.lumen > lumen0);
  assert.ok(state.souls > souls0);

  const banked = createItemInspector(makeCtx(state), 'fogwort');
  assert.ok(banked);
  assert.match(banked.node.textContent ?? '', /in the bank/);
  assert.doesNotMatch(banked.node.textContent ?? '', /in the tray/);
  assert.doesNotMatch(banked.node.textContent ?? '', /ungranted/i);
  assert.equal(banked.node.classList.contains('item-inspector-unpaid'), false);
  assert.equal(banked.node.getAttribute('data-inspect-origin'), 'bank');
  const sell1 = banked.node.querySelector('.sell-1-btn');
  const pin = banked.node.querySelector('.sell-pin-btn');
  const lock = banked.node.querySelector('.sell-lock-btn');
  assert.ok(sell1, 'granted inspect is the real bank sheet');
  assert.ok(pin);
  assert.ok(lock);
  assert.equal(sell1.disabled, false);
  assert.equal(pin.disabled, false);
  assert.equal(lock.disabled, false);

  const css = readFileSync(join(here, '../src/ui/combat.css'), 'utf8');
  assert.match(css, /\.leftover-station \.bar\.bar-lg\s*\{[^}]*height:\s*8px/);
  assert.equal(SAVE_VERSION, 5);
});

test('unpaid Fogwort tap paints one leftover-loot note; toast-only or a grown well fails', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killFoe(state, 'fog-rat'));
  const ctx = makeCtx(state);
  const scr = renderSkillDetail(ctx, 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover?.classList.contains('leftover-station'), 'leftover-as-mode holds');
  assertSatchelChip(leftover, unpaidN(state));
  const { itemTiles } = assertLootFurniture(leftover, { minItemTiles: 1, expectWallet: true });
  const tile = itemTiles[0];
  assert.ok(tile);
  assert.equal(satchelSheet().querySelector('.loot-unpaid-note'), null);
  assert.equal(ctx.toasts.length, 0);

  tile.click();
  assertUnpaidWellNote(leftover, tile, ctx);
  assert.ok(scr.node.classList.contains('leftover-live'));
  assert.equal(document.getElementById('toasts'), null);
  const sentence = unpaidLootTapNote('Fogwort');
  assert.equal((satchelSheet().textContent ?? '').split(sentence).length - 1, 1);
  assert.doesNotMatch(tile.textContent ?? '', /still in the tray/);
  assert.ok(tile.querySelector('.loot-name'));
  assert.ok(tile.querySelector('.loot-qty'));

  leftover.querySelector('.leftover-hunt').click();
  assert.equal(state.combat.fighting, true);
  const fight = scr.node.querySelector('.combat-fight');
  assertSatchelChip(fight, unpaidN(state));
  const liveSheet = openSatchel(fight);
  const liveTile = liveSheet.querySelector('.loot-tile.loot-item');
  assert.ok(liveTile);
  liveTile.click();
  assertUnpaidWellNote(fight, liveTile, ctx, { live: true });

  const js = readFileSync(join(here, '../src/ui/screens/hunt-satchel.js'), 'utf8');
  const unpaid = js.match(/if \(entry\?\.granted === false\) \{([^}]+)\}/);
  assert.ok(unpaid, 'inspectTile unpaid branch');
  assert.match(unpaid[1], /paintNote/);
  assert.doesNotMatch(unpaid[1], /toast/, 'unpaid tap must not ctx.toast');
  assert.equal(SAVE_VERSION, 5);
});

test('first live Fog-rat hides the satchel while the foe still has HP', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'fog-rat', { encounterSeed: 1 });
  assert.equal(state.combat.fighting, true);
  assert.ok((state.combat.foe?.hp ?? 0) > 0);
  assert.equal((state.combat.lootTray ?? []).length, 0);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const fight = scr.node.querySelector('.combat-fight');
  assert.equal(fight.classList.contains('leftover-station'), false);
  assertNoSatchel(fight);
  assert.equal(leftoverTake(fight), null, 'empty live fight has no Take all box');
  assert.ok(fight.querySelector('.acc-station'));
  assert.ok(fight.querySelector('.eat-pick'));
  assert.match(fight.querySelector('.eat-row')?.textContent ?? '', /Fall back/);
  assert.ok(fight.querySelector('.combat-keep'));
});

test('leftover unpaid Fogwort tap mounts leftover-live copy when the bank already holds Fogwort', () => {
  const state = createState({ rngSeed: 4 });
  state.bank.fogwort = 6;
  assert.ok(killFoe(state, 'fog-rat'));
  const wort = (state.combat.lootTray ?? []).find((e) => e.kind === 'item' && e.id === 'fogwort');
  assert.ok(wort, 'satchel keeps extra unpaid Fogwort');
  assert.equal(wort.granted, false, 'bank-held Fogwort must not mark the tray granted');
  assert.equal(wort.qty, 1);
  assert.equal(state.bank.fogwort, 6);

  const ctx = makeCtx(state);
  const scr = renderSkillDetail(ctx, 'combat');
  assert.ok(scr.node.classList.contains('leftover-live'));
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover?.classList.contains('leftover-station'), 'leftover-as-mode holds');
  assertSatchelChip(leftover, unpaidN(state));
  const { itemTiles, body } = assertLootFurniture(leftover, { minItemTiles: 1, expectWallet: true });
  const tile = itemTiles[0];
  assert.ok(tile);
  assert.ok(tile.classList.contains('loot-inspectable'));
  assert.equal(tile.disabled, false);
  assert.match(tile.querySelector('.loot-name')?.textContent ?? '', /Fogwort/);
  assert.equal(body.querySelector('.loot-unpaid-note'), null);

  tile.click();
  assertUnpaidWellNote(leftover, tile, ctx);
  const note = body.querySelector('.loot-unpaid-note');
  assert.match(note.textContent, /still in the tray/);
  assert.match(note.textContent, /Take all/);
  assert.ok(tile.classList.contains('is-noted'));
  assert.equal(state.bank.fogwort, 6, 'tap must not grant or sell the banked stack');
  assert.equal(wort.granted, false);

  takeAllFromSatchel(leftover);
  assert.deepEqual(state.combat.lootTray, []);
  assert.equal(state.bank.fogwort, 7, 'Take all still grants the unpaid drop');
  assert.equal(scr.node.querySelector('.loot-unpaid-note'), null);

  const banked = createItemInspector(makeCtx(state), 'fogwort');
  assert.ok(banked);
  assert.equal(banked.node.getAttribute('data-inspect-origin'), 'bank');
  assert.equal(banked.node.querySelector('.sell-1-btn')?.disabled, false);
  assert.equal(SAVE_VERSION, 5);
});

test('Fog-rat kill with a fixed seed always paints an ungranted Fogwort tile', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killFoe(state, 'fog-rat'));
  const wort = (state.combat.lootTray ?? []).find((e) => e.kind === 'item' && e.id === 'fogwort');
  assert.ok(wort, 'Fog-rat kill must land Fogwort');
  assert.equal(wort.qty, 1);
  assert.equal(wort.granted, false);
  const souls = (state.combat.lootTray ?? []).filter((e) => e.kind === 'soul');
  const lumen = (state.combat.lootTray ?? []).filter((e) => e.kind === 'lumen');
  assert.ok(souls.length >= 1, 'Fog-rat still pays a soul');
  assert.ok(lumen.length >= 1, 'Fog-rat still pays lumen');

  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover?.classList.contains('leftover-station'));
  assertSatchelChip(leftover, unpaidN(state));
  assert.equal(leftover.querySelectorAll('.loot-ghost').length, 0);
  const { itemTiles, wallet } = assertLootFurniture(leftover, { minItemTiles: 1, expectWallet: true });
  const tile = itemTiles[0];
  assert.ok(tile, 'ungranted Fogwort is a named loot tile');
  assert.match(tile.querySelector('.loot-name')?.textContent ?? '', /Fogwort/);
  assert.ok(wallet);
  assert.match(wallet.textContent ?? '', /soul|✦/);
  assert.equal(wallet.classList.contains('loot-tile'), false);
  assert.ok(leftover.querySelector('.leftover-another'), 'Hunt another stays outside the satchel chip');
  assert.equal(leftover.querySelector('.satchel-chip')?.querySelector('.leftover-another'), null);
  assert.ok(leftover.querySelector('.acc-station'));
  assert.ok(leftover.querySelector('.leftover-kit'));
  assert.match(leftover.querySelector('.eat-pick')?.textContent ?? '', /Lantern-loaf/);

});
