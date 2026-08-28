import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FakeNode, FakeText } from './helpers/fake-node.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const screenStub = new FakeNode('main');
screenStub.setAttribute('id', 'screen');

globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => new FakeText(s),
  getElementById: (id) => (id === 'screen' ? screenStub : null),
  querySelectorAll: (sel) => screenStub.querySelectorAll(sel),
};
globalThis.requestAnimationFrame = () => 0;
try { globalThis.navigator = {}; } catch { /* node ≥21 */ }

const { createState } = await import('../src/game/state.js');
const { serializeSave, deserializeSave } = await import('../src/core/save.js');
const { renderSkillDetail, renderSkillsScreen } = await import('../src/ui/screens/skills.js');
const { cockpitLogVsTab, leftoverLogVsTab, fightLogVsTab, leftoverHuntRowVs360, lobbyFirstHuntBottom, COMBAT_360 } = await import('../src/ui/screens/combat.js');
const combat = await import('../src/game/systems/combat.js');
const runner = await import('../src/game/systems/action-runner.js');
const { buyFromStore } = await import('../src/game/systems/store.js');
const { ITEMS } = await import('../src/game/data/items.js');
const { uniqueStackCount, lanternRoom, canAcceptStack } = await import('../src/game/systems/bank.js');
const { paintHud } = await import('../src/ui/hud.js');

function makeCtx(state) {
  return {
    state,
    toast() {},
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
  };
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
  const iFighter = classes.findIndex((c) => /\bfighter\b/.test(c));
  const iKit = classes.findIndex((c) => /\bacc-station\b/.test(c) || /\bfight-cockpit\b/.test(c));
  const iOil = classes.findIndex((c) => /\boil-line\b/.test(c));
  const iEat = classes.findIndex((c) => /\beat-row\b/.test(c));
  const iHand = classes.findIndex((c) => /\bhand-chip\b/.test(c));
  assert.ok(iFighter >= 0 && iKit > iFighter && iOil > iKit && iEat > iOil, 'HP then kit then oil then eat');
  assert.ok(iHand > iEat, 'weapon chip sits after the cockpit');
  assert.equal(classes.filter((c) => /\bfighter\b/.test(c)).length, 2);
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

function killMoth(state) {
  state.combat.autoContinue = false;
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  let kill = null;
  for (let i = 0; i < 80 && !kill; i++) {
    if (state.combat.foe) state.combat.foe.hp = 1;
    state.combat.player.nextActMs = 0;
    const events = combat.tickCombat(state, 100);
    kill = events.find((e) => e.type === 'combat-kill') ?? kill;
  }
  return kill;
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
  const iYou = classes.findIndex((c) => /\bfighter\b/.test(c));
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
  assert.ok(leftover.classList.contains('leftover-well'), 'unpaid leftover is a loot well');
  assert.equal(leftover.querySelector('.acc-station'), null, 'Acc collapses while unpaid loot waits');
  assert.equal(leftover.querySelector('.hand-chip'), null, 'Knife/Unarmed collapse while unpaid loot waits');
  assert.equal(leftover.querySelector('.style-row'), null, 'styles collapse while unpaid loot waits');
  assert.match(leftover.querySelector('.loot-well-meter')?.textContent ?? '', /Hollow \d+\/\d+/);
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
  const take = scr.node.querySelector('.leftover-take');
  assert.ok(take, 'unpaid leftover starts as a well');
  take.click();
  assert.equal(scr.node.querySelector('.leftover-well'), null);
  assert.ok(scr.node.querySelector('.leftover-station')?.querySelector('.acc-station'));
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
  const unpaid = leftover.classList.contains('leftover-well') || leftover.querySelector('.leftover-loot');
  if (unpaid) {
    assert.match(leftover.querySelector('.loot-well-meter')?.textContent ?? text, /Hollow \d+\/\d+/);
    assert.equal(leftover.querySelector('.hand-chip'), null);
  } else {
    assert.match(leftover.querySelector('.hand-chip')?.textContent ?? '', /Knife|Unarmed/);
  }
  assert.ok(leftover.querySelector('.combat-log'));
  assert.ok(leftover.querySelectorAll('.log-line').length >= 1);
  assert.ok(leftover.querySelectorAll('.log-line').length <= 4);
  assert.equal(leftover.querySelectorAll('.fighter').length, 2);
  assert.equal(leftover.querySelectorAll('.vigil-card').length, 0);
  assert.equal(leftover.querySelectorAll('.zone-chips').length, 0);
  if (kicker) assert.match(leftover.querySelector('.leftover-kicker')?.textContent ?? '', kicker);
}

test('leftover after kill is a 360 cockpit with You/foe/Eat/Knife/log above the tab bar', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killMoth(state));
  const leftover = renderSkillDetail(makeCtx(state), 'combat').node.querySelector('.leftover-station');
  assertLeftoverCockpit(leftover, { kicker: /Pale Moth fell/ });
  const box = leftoverLogVsTab({ loot: true });
  assert.ok(box.fits, `log ${box.logTop}+${box.wrapH} vs tab ${box.tabTop} fill ${box.fillH}`);
  assert.ok(box.logBottom < box.tabTop, `log bottom ${box.logBottom} >= tab ${box.tabTop}`);
  assert.equal(box.tabTop, 577);
  assert.ok(box.wrapH >= 96, `leftover wrap ${box.wrapH}px must fit two wraps + two singles`);
  assert.ok(box.line4Bottom < box.tabTop, `line 4 bottom ${box.line4Bottom} vs tab ${box.tabTop}`);
  for (const line of box.lines.slice(0, 4)) {
    assert.ok(line.bottom < box.tabTop, `line ${line.index} bottom ${line.bottom} vs tab ${box.tabTop}`);
  }
});

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
  const box = leftoverLogVsTab({ loot: false });
  assert.ok(box.fits);
  assert.ok(box.logBottom < box.tabTop);
  const withLoot = leftoverLogVsTab({ loot: true });
  assert.equal(withLoot.logBottom, box.logBottom, 'loot chips must not move logWrap.bottom');
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
  assert.ok(box.fits, `fight log ${box.logTop}+${box.wrapH} vs tab ${box.tabTop}`);
  assert.ok(box.logBottom < box.tabTop);
  assert.equal(box.wrapH, 64);
  assert.ok(box.logBottom <= 569);
});

test('leftover-after-kill four log line bottoms sit above tab 577', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killMoth(state));
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  assert.ok(scr.node.classList.contains('leftover-live'));
  const leftover = scr.node.querySelector('.leftover-station');
  const logLines = leftover.querySelectorAll('.log-line');
  assert.ok(logLines.length >= 1);
  assert.ok(logLines.length <= 4);
  assert.ok(logLines.some((n) => /falls/.test(n.textContent ?? '')), 'kill line is in leftover log');
  assert.equal(scr.node.querySelector('.hunt-list'), null, 'hunt list not in leftover-live DOM');
  assert.equal(scr.node.querySelector('.combat-lobby'), null);
  assert.equal(scr.node.querySelector('.vigil-card'), null);
  assert.equal(scr.node.querySelector('.zone-chips'), null);
  assert.equal(scr.node.querySelector('.combat-h'), null);

  const box = leftoverLogVsTab({ loot: true });
  assert.equal(box.tabTop, 577);
  assert.ok(box.logBottom < box.tabTop, `logWrap.bottom ${box.logBottom} vs tab ${box.tabTop}`);
  assert.ok(box.wrapH >= 96, `wrap ${box.wrapH}px`);
  assert.equal(box.lines.length, COMBAT_360.logLinesLeftover);
  for (const line of box.lines) {
    assert.ok(line.bottom < 577, `line ${line.index} bottom ${line.bottom} vs tab 577`);
  }
  assert.ok(box.line4Bottom < 577, `line 4 bottom ${box.line4Bottom} vs tab 577`);
  assert.ok(box.fits);
});

test('leftover-after-kill wrapping kill + loot keeps four line bottoms < 577', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killMoth(state));
  const last = state.combat.lastStation;
  assert.ok(last);
  last.log = [
    { t: 1, text: 'Pale Moth misses.', kind: 'miss' },
    { t: 2, text: 'You strike for 6.', kind: 'hit' },
    { t: 3, text: 'The lantern drinks Wick-oil. The fog gathers a breath.', kind: 'oil' },
    { t: 4, text: 'Pale Moth falls. +11 Combat XP, 1 soul. Loot: ✦4, Moth-dust ×1.', kind: 'kill' },
  ];
  last.ended = 'kill';
  last.souls = 1;
  last.loot = [{ kind: 'lumen', qty: 4, name: 'Lumen' }, { kind: 'item', id: 'moth-dust', qty: 1, name: 'Moth-dust' }];
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover);
  assert.ok(scr.node.classList.contains('leftover-live'));
  assert.equal(scr.node.querySelector('.hunt-list'), null, 'hunt list stays unmounted');
  assert.equal(scr.node.querySelector('.combat-lobby'), null);
  assert.ok(leftover.querySelector('.leftover-loot'), 'loot chips on kill leftover');
  assert.ok(leftover.querySelector('.cockpit-fill'), 'fill spacer consumes leftover flex');
  const logLines = leftover.querySelectorAll('.log-line');
  assert.equal(logLines.length, 4);
  assert.match(logLines[0].textContent ?? '', /falls/);
  assert.match(logLines[1].textContent ?? '', /lantern drinks|oil|fog/i);
  assert.match(logLines[3].textContent ?? '', /misses/);

  const box = leftoverLogVsTab({ loot: true });
  const noLoot = leftoverLogVsTab({ loot: false });
  assert.equal(box.tabTop, 577);
  assert.equal(box.wrapH, 100);
  assert.equal(box.logBottom, noLoot.logBottom, 'loot must not tax logWrap.bottom');
  assert.ok(box.logBottom < box.tabTop, `logWrap.bottom ${box.logBottom} vs tab ${box.tabTop}`);
  assert.ok(box.fillH >= 0, `cockpit-fill ${box.fillH}px must absorb loot, not go negative`);
  assert.equal(box.lines[0].rows, 2, 'kill line wraps');
  assert.equal(box.lines[1].rows, 2, 'oil line wraps');
  assert.equal(box.lines.length, 4);
  for (const line of box.lines) {
    assert.ok(line.bottom < 577, `line ${line.index} bottom ${line.bottom} vs tab 577`);
    assert.ok(line.bottom <= box.logBottom, `line ${line.index} ${line.bottom} vs wrap ${box.logBottom}`);
  }
  assert.ok(box.line4Bottom < 577, `line 4 bottom ${box.line4Bottom} vs tab 577`);
  assert.ok(box.fits);
});

test('leftover log-wrap CSS is 96px+ and leftover-live does not scroll the lobby', () => {
  const css = readFileSync(join(here, '../src/ui/combat.css'), 'utf8');
  const blocks = [...css.matchAll(/\.leftover-station\s+\.log-wrap\s*\{([^}]+)\}/g)];
  assert.ok(blocks.length >= 1, 'leftover log-wrap rule');
  const minHeights = blocks.flatMap((m) => [...m[1].matchAll(/min-height:\s*(\d+)px/g)].map((x) => Number(x[1])));
  const maxHeights = blocks.flatMap((m) => [...m[1].matchAll(/max-height:\s*(\d+)px/g)].map((x) => Number(x[1])));
  assert.ok(minHeights.some((h) => h >= 96), `min-height ${minHeights.join(',')} must include 96px+`);
  assert.ok(maxHeights.some((h) => h >= 96), `max-height ${maxHeights.join(',')} must include 96px+`);
  assert.match(css, /\.leftover-station \.log-wrap[\s\S]*overflow:\s*hidden/);
  assert.match(css, /#screen:has\(\.leftover-live\)\s*\{\s*overflow:\s*hidden/);
  assert.match(css, /\.screen\.leftover-live\s*\{\s*overflow:\s*hidden/);
  assert.match(css, /\.leftover-station\s*\{[^}]*min-height:\s*0/);
  assert.match(css, /\.leftover-station\s*\{[^}]*height:\s*100%/);
  assert.match(css, /\.screen\.leftover-live\s*\{[^}]*flex:\s*1 1 0/);
  assert.match(css, /\.cockpit-fill\s*\{[^}]*flex:\s*1/);
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
  assert.ok(killMoth(state));
  const firstTray = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  assert.ok(firstTray.length >= 1);
  assert.ok(firstTray.every((e) => e.granted === false));
  assert.equal(state.lumen, lumen0);
  assert.equal(state.souls, souls0);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  const pile = leftover.querySelector('.leftover-loot')?.textContent ?? '';
  assert.match(pile, /soul/);
  assert.match(pile, /✦/);
  assert.ok(leftover.querySelector('.leftover-take'));
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
  const pile2 = after.querySelector('.leftover-loot')?.textContent ?? '';
  assert.match(pile2, /soul/);
  assert.match(pile2, /✦/);
  for (const row of firstTray) {
    if (row.kind === 'item') assert.match(pile2, new RegExp(row.name ?? row.id));
    if (row.kind === 'soul') assert.match(pile2, /soul/);
  }
  const souls = after.querySelector('.leftover-loot-chips')?.textContent ?? pile2;
  assert.match(souls, /[2-9] souls|[2-9] soul/);
  const held = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  assert.equal(state.lumen, lumen0);
  assert.equal(state.souls, souls0);

  after.querySelector('.leftover-take').click();
  assert.deepEqual(state.combat.lootTray, []);
  assert.equal(state.lumen, lumen0 + traySum(held, 'lumen'));
  assert.equal(state.souls, souls0 + traySum(held, 'soul'));
  for (const row of held) {
    if (row.kind === 'item' && row.id) {
      assert.equal(state.bank[row.id] ?? 0, (bank0[row.id] ?? 0) + row.qty);
    }
  }
  assert.equal(scr.node.querySelector('.leftover-loot'), null);
  assert.equal(scr.node.querySelector('.leftover-take'), null);
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
  assert.ok(killMoth(state));
  const first = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  combat.startFight(state, 'pale-moth', { encounterSeed: 9 });
  combat.fleeFight(state);
  const leftover = renderSkillDetail(makeCtx(state), 'combat').node.querySelector('.leftover-station');
  assert.match(leftover.querySelector('.leftover-kicker')?.textContent ?? '', /Fell back from Pale Moth/);
  const pile = leftover.querySelector('.leftover-loot')?.textContent ?? '';
  assert.match(pile, /soul|✦/);
  for (const row of first) {
    if (row.kind === 'item') assert.match(pile, new RegExp(row.name ?? row.id));
  }
  assert.ok(leftover.querySelector('.leftover-take'));
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
  assert.match(leftover.querySelector('.leftover-loot')?.textContent ?? '', /Pall-fang/);
  leftover.querySelector('.leftover-take').click();
  assert.equal(state.lumen, lumen0 + 4);
  assert.equal(state.souls, souls0 + 1);
  assert.equal(state.bank['pall-fang'], undefined);
  assert.ok(scr.node.classList.contains('leftover-live'));
  assert.equal(scr.node.querySelector('.hunt-list'), null);
  assert.match(scr.node.querySelector('.leftover-loot')?.textContent ?? '', /Pall-fang/);
  assert.ok(scr.node.querySelector('.leftover-take'));

  scr.node.querySelector('.leftover-another').click();
  assert.equal(state.combat.lastStation?.enemyId, 'pale-moth');
  assert.equal(state.combat.lootTray.length, 1);
  assert.equal(state.combat.lootTray[0].id, 'pall-fang');
  assert.equal(state.combat.lootTray[0].granted, false);
  assert.equal(state.bank['pall-fang'], undefined);
  assert.ok(scr.node.classList.contains('leftover-live'));
  assert.ok(scr.node.querySelector('.leftover-station'));
  assert.equal(scr.node.querySelector('.hunt-list'), null);
  assert.match(scr.node.querySelector('.leftover-loot')?.textContent ?? '', /Pall-fang/);
});

test('leftover Eat heals in place without leaving leftover-live', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killMoth(state));
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

test('dry leftover tray + oil buy still pins the log above tab 577', () => {
  const box = leftoverLogVsTab({ loot: true, oilBuy: true });
  assert.equal(box.tabTop, 577);
  assert.ok(box.fits, `fill ${box.fillH} logBottom ${box.logBottom} vs tab ${box.tabTop}`);
  assert.ok(box.fillH >= 0);
  assert.ok(box.logBottom < box.tabTop);
  assert.equal(box.wrapH, 100);
  const fed = leftoverLogVsTab({ loot: true, oilBuy: false });
  assert.equal(fed.logBottom, box.logBottom, 'oil buy must not move logWrap.bottom');
  assert.ok(box.eatBottom < 577, `leftover Eat ${box.eatBottom} vs tab 577`);
  assert.ok(box.anotherBottom < 577, `Hunt another ${box.anotherBottom} vs tab 577`);
});

test('first live fight has no Take all until ungranted chips exist', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const fight = scr.node.querySelector('.combat-fight');
  assert.ok(fight);
  assert.equal(fight.classList.contains('leftover-station'), false);
  assert.equal(scr.node.querySelector('.leftover-take'), null);
  assert.equal(/Take all/.test(fight.textContent ?? ''), false);
  const empty = leftoverLogVsTab({ loot: false });
  assert.ok(empty.fits);
});

test('ungranted leftover chips paint on the next live fight; kill still does not pay', () => {
  const state = createState({ rngSeed: 4 });
  const lumen0 = state.lumen;
  const souls0 = state.souls;
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  const first = renderSkillDetail(makeCtx(state), 'combat');
  assert.equal(first.node.querySelector('.leftover-take'), null);

  assert.ok(killMoth(state));
  const pile = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  assert.ok(pile.length >= 1);
  assert.ok(pile.every((e) => e.granted === false));
  assert.equal(state.lumen, lumen0);
  assert.equal(state.souls, souls0);

  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover.querySelector('.leftover-loot'));
  assert.ok(leftover.querySelector('.leftover-take'));
  leftover.querySelector('.leftover-hunt').click();
  assert.equal(state.combat.fighting, true);
  assert.equal(state.lumen, lumen0);
  assert.equal(state.souls, souls0);

  const fight = scr.node.querySelector('.combat-fight');
  assert.ok(fight);
  assert.equal(fight.classList.contains('leftover-station'), false);
  const tray = fight.querySelector('.leftover-loot') ?? fight.querySelector('.fight-loot');
  assert.ok(tray, 'unpaid tray stays on the live pull');
  assert.equal(tray.classList.contains('is-empty'), false);
  const pileText = tray.textContent ?? '';
  assert.match(pileText, /soul/);
  assert.match(pileText, /✦/);
  assert.ok(fight.querySelector('.leftover-take'));
  assert.match(fight.querySelector('.eat-row')?.textContent ?? '', /Eat/);
  assert.match(fight.querySelector('.eat-row')?.textContent ?? '', /Fall back/);
  assert.equal(fight.querySelector('.eat-row')?.querySelector('.leftover-another'), null);
});

test('Take all from the live-fight tray pays once and the HUD lumen jumps', () => {
  const state = createState({ rngSeed: 4 });
  const lumen0 = state.lumen;
  const souls0 = state.souls;
  const bank0 = { ...state.bank };
  assert.ok(killMoth(state));
  const held = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  scr.node.querySelector('.leftover-hunt').click();
  assert.equal(state.combat.fighting, true);
  assert.equal(state.lumen, lumen0, 'wallet still unpaid on the live pull');

  const hud = { textContent: '' };
  paintHud(hud, null, state);
  assert.match(hud.textContent ?? '', new RegExp(`✦\\s*${lumen0}`));

  const take = scr.node.querySelector('.leftover-take');
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
  assert.equal(scr.node.querySelector('.leftover-take'), null);
  assert.ok(scr.node.querySelector('.eat-btn'), 'Eat stays after collect');
  assert.ok(scr.node.querySelector('.flee-btn'), 'Fall back stays after collect');

  const paid = { lumen: state.lumen, souls: state.souls };
  combat.takeAllLootTray(state);
  assert.equal(state.lumen, paid.lumen);
  assert.equal(state.souls, paid.souls);
});

test('Eat and Fall back survive ticks while the unpaid live-fight tray is mounted', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killMoth(state));
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
  const tray = scr.node.querySelector('.leftover-loot') ?? scr.node.querySelector('.fight-loot');
  assert.ok(eatBtn && fleeBtn && strike && tray);
  assert.ok(tray.querySelector('.leftover-take'));
  for (let i = 0; i < 10; i++) {
    if (state.combat.foe) state.combat.foe.hp = Math.max(4, state.combat.foe.hp);
    combat.tickCombat(state, 100);
    assert.equal(state.combat.fighting, true);
    scr.update();
    assert.equal(scr.node.querySelector('.eat-btn'), eatBtn, 'Eat node must survive ticks with tray mounted');
    assert.equal(scr.node.querySelector('.flee-btn'), fleeBtn, 'Fall back node must survive ticks with tray mounted');
    assert.equal(scr.node.querySelectorAll('button').find((b) => (b.textContent ?? '') === 'Strike'), strike);
    const liveTray = scr.node.querySelector('.leftover-loot') ?? scr.node.querySelector('.fight-loot');
    assert.equal(liveTray, tray);
    assert.ok(liveTray.querySelector('.leftover-take'));
  }
  const hpBefore = state.combat.player.hp;
  eatBtn.click();
  assert.ok(state.combat.player.hp > hpBefore, 'eatFood must run after live updates with tray');
  assert.ok((state.bank['lantern-loaf'] ?? 0) < loafBefore);
  assert.ok((state.combat.lootTray ?? []).some((e) => e.granted === false), 'Eat does not collect');
});

test('leftover Hunt another sits on leftover-actions, not the eat-slot, and fits 360', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killMoth(state));
  const leftover = renderSkillDetail(makeCtx(state), 'combat').node.querySelector('.leftover-station');
  assert.ok(leftover);
  const eat = leftover.querySelector('.eat-row');
  assert.ok(eat);
  assert.equal(eat.querySelector('.leftover-another'), null, 'Hunt another is not packed onto Eat');
  assert.ok(eat.querySelector('.leftover-hunt'));
  const actions = leftover.querySelector('.leftover-actions');
  assert.ok(actions);
  assert.ok(actions.querySelector('.leftover-another'));
  assert.match(actions.querySelector('.leftover-another')?.textContent ?? '', /Hunt another/);
  assert.ok(actions.querySelector('.leftover-loot'));
  const row = leftoverHuntRowVs360();
  assert.equal(row.viewportW, 360);
  assert.ok(row.fits, `eat ${row.eatUsed} actions ${row.actionsUsed} wellHead ${row.wellHeadUsed} vs ${row.contentW}; anotherRight ${row.anotherRight}`);
  assert.ok(row.anotherRight <= 360);
  const box = leftoverLogVsTab({ loot: true });
  assert.ok(box.eatBottom < 577);
  assert.ok(box.anotherBottom <= 577 - COMBAT_360.tabClearance);
  assert.equal(box.tabTop, 577);
});

test('live-fight tray + Eat + Fall back sit above tab 577', () => {
  const empty = fightLogVsTab({ loot: false });
  const piled = fightLogVsTab({ loot: true });
  assert.equal(empty.tabTop, 577);
  assert.equal(piled.tabTop, 577);
  assert.ok(empty.fits, `empty fill ${empty.fillH}`);
  assert.ok(piled.fits, `tray fill ${piled.fillH} eat ${piled.eatBottom} tray ${piled.trayBottom} gap ${piled.trayGap}`);
  assert.ok(piled.eatBottom < 577);
  assert.ok(piled.fleeBottom < 577);
  assert.ok(piled.trayBottom <= 577 - COMBAT_360.tabClearance,
    `tray bottom ${piled.trayBottom} must clear tab 577 by ≥${COMBAT_360.tabClearance}px`);
  assert.equal(piled.logBottom, empty.logBottom, 'live tray must not move logWrap.bottom');
  assert.ok(piled.fillH >= 0);
});

test('360 live unpaid tray bottom sits above tab 577; Eat and Fall back stay above', () => {
  const criticV49Top = 543;
  const criticV49Bottom = 587;
  const criticV54Top = 550.6;
  const criticV54Bottom = 582.6;
  const tabTop = 577;
  const clearance = COMBAT_360.tabClearance;
  assert.equal(clearance, 8);
  assert.equal(criticV49Bottom - criticV49Top, 44, 'v49 measured leftover-loot 44px');
  assert.ok(criticV49Bottom > tabTop, 'v49 letter 5: live tray 10px under the tab');
  assert.equal(Number((criticV54Bottom - criticV54Top).toFixed(1)), 32, 'v54 compact tray is 32px');
  assert.ok(criticV54Bottom > tabTop, 'v54 live unpaid tray overlaps tab 577');
  assert.ok(criticV54Bottom - tabTop > 5, 'v54 overlap is the 5.6px SKILLS miss');
  assert.ok(criticV54Bottom > tabTop - clearance, 'v54 compact 32px from 550.6 misses the 8px gap');

  const fatLoot = COMBAT_360.loot;
  assert.equal(fatLoot, 44);
  assert.ok(criticV49Top + fatLoot > tabTop, 'uncapped 44px live tray cannot clear 577');

  assert.equal(COMBAT_360.fightLoot, 32);
  assert.ok(COMBAT_360.fightLoot < fatLoot, 'live tray is compact vs leftover 44');
  assert.equal(COMBAT_360.fightKeep, 32);
  assert.ok(COMBAT_360.fightKeep < COMBAT_360.keep, 'live Keep hunting is compact vs 44');
  const keepSaved = COMBAT_360.keep - COMBAT_360.fightKeep;
  const accSaved = 32 - COMBAT_360.fightAcc; // v54 live Acc was cockpit 32-class; now 28
  assert.ok(keepSaved + accSaved >= 16, 'keep+acc compact must cover the v54 13.6px miss');
  assert.ok(criticV54Bottom - keepSaved - accSaved <= tabTop - clearance,
    `v54 bottom ${criticV54Bottom} minus keep ${keepSaved}px acc ${accSaved}px must reach ≤${tabTop - clearance}`);

  const empty = fightLogVsTab({ loot: false });
  const piled = fightLogVsTab({ loot: true });
  assert.equal(piled.tabTop, tabTop);
  assert.equal(piled.lootH, 32);
  assert.equal(piled.keepH, 32);
  assert.equal(piled.clearance, clearance);
  assert.ok(piled.trayBottom <= tabTop - clearance,
    `360 live unpaid tray bottom ${piled.trayBottom} vs tab ${tabTop} gap ${piled.trayGap}`);
  assert.ok(piled.trayGap >= clearance, `tray gap ${piled.trayGap} < ${clearance}px`);
  assert.ok(piled.trayBottom < criticV54Bottom, 'compact keep must beat the v54 582.6px bottom');
  assert.ok(piled.trayBottom < criticV49Bottom, 'compact must beat the v49 587px bottom');
  assert.ok(piled.eatBottom < tabTop, `Eat ${piled.eatBottom} vs tab ${tabTop}`);
  assert.ok(piled.fleeBottom < tabTop, `Fall back ${piled.fleeBottom} vs tab ${tabTop}`);
  assert.ok(piled.fits, `fill ${piled.fillH} tray ${piled.trayTop}–${piled.trayBottom}`);
  assert.ok(piled.fillH >= 0);
  assert.equal(piled.logBottom, empty.logBottom);

  const leftover = leftoverLogVsTab({ loot: true });
  assert.equal(leftover.tabTop, tabTop);
  assert.ok(leftover.anotherBottom <= tabTop - clearance, `Hunt another ${leftover.anotherBottom} vs tab ${tabTop}`);
  assert.ok(leftover.wellBottom <= tabTop - clearance, `well bottom ${leftover.wellBottom} vs tab ${tabTop}`);
  assert.ok(leftover.lootH >= COMBAT_360.leftoverWellMin, `leftover well ${leftover.lootH}px must beat a 44px row`);
  assert.ok(leftover.lootH > fatLoot, 'leftover unpaid is a well, not a 44px checkout');

  const css = readFileSync(join(here, '../src/ui/combat.css'), 'utf8');
  const liveLoot = [...css.matchAll(/\.combat-fight:not\(\.leftover-station\)\s+\.fight-loot\.leftover-loot\s*\{([^}]+)\}/g)];
  assert.ok(liveLoot.length >= 1, 'live fight-loot compact rule');
  const maxH = liveLoot.flatMap((m) => [...m[1].matchAll(/max-height:\s*(\d+)px/g)].map((x) => Number(x[1])));
  assert.ok(maxH.some((h) => h <= 32), `live fight-loot max-height ${maxH.join(',')} must be ≤32px`);
  assert.match(css, /\.leftover-loot\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.leftover-actions\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.combat-fight:not\(\.leftover-station\)\s*\{[^}]*max-height:\s*100%/);
  assert.match(css, /\.screen\.fight-live,\s*\n\.screen\.leftover-live\s*\{[^}]*max-height:\s*100%/);
  assert.match(css, /\.combat-fight:not\(\.leftover-station\)\s+\.combat-keep\s*\{[^}]*max-height:\s*32px/);
  assert.match(css, /\.combat-fight:not\(\.leftover-station\)\s+\.log-wrap\s*\{[^}]*margin-top:\s*auto/);
  assert.match(css, /\.loot-tile\s*\{/);
  const liveTile = [...css.matchAll(/\.combat-fight:not\(\.leftover-station\)\s+\.fight-loot\s+\.loot-tile\s*\{([^}]+)\}/g)];
  assert.ok(liveTile.length >= 1, 'live loot-tile compact rule');
  const tileH = liveTile.flatMap((m) => [...m[1].matchAll(/height:\s*(\d+)px/g)].map((x) => Number(x[1])));
  assert.ok(tileH.some((h) => h <= 32), `live loot-tile height ${tileH.join(',')} must be ≤32px`);
});

function assertLootFurniture(host, { minTiles = 1 } = {}) {
  const tray = host.querySelector('.leftover-loot') ?? host.querySelector('.fight-loot:not(.is-empty)');
  assert.ok(tray, 'loot tray is mounted');
  assert.equal(tray.querySelector('.chip-sep'), null, 'loot is furniture, not a · receipt');
  assert.equal(tray.querySelectorAll('.chip').length, 0, 'no text chips in the tray');
  const tiles = tray.querySelectorAll('.loot-tile');
  assert.ok(tiles.length >= minTiles, `expected ≥${minTiles} loot portraits, got ${tiles.length}`);
  for (const tile of tiles) {
    const glyph = tile.querySelector('.loot-glyph');
    assert.ok(glyph, '32px portrait glyph');
    assert.match(glyph.innerHTML ?? '', /<svg/i);
    assert.match(glyph.className, /bank-glyph/);
    const name = (tile.querySelector('.loot-name')?.textContent ?? '').trim();
    const qty = (tile.querySelector('.loot-qty')?.textContent ?? '').trim();
    assert.ok(name.length > 0, 'tile shows a name');
    assert.ok(qty.length > 0, 'tile shows a qty');
  }
  assert.ok(tray.querySelector('.leftover-take'), 'Take all stays on the furniture');
  return { tray, tiles };
}

test('leftover unpaid tray is loot furniture: glyph + name + qty, Take all still grants', () => {
  const state = createState({ rngSeed: 4 });
  const lumen0 = state.lumen;
  const souls0 = state.souls;
  const bank0 = { ...state.bank };
  assert.ok(killMoth(state));
  const held = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  assert.ok(held.length >= 1);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover.classList.contains('leftover-well'));
  const { tiles } = assertLootFurniture(leftover, { minTiles: held.length });
  assert.equal(tiles.length, held.length);
  const pile = leftover.querySelector('.leftover-loot')?.textContent ?? '';
  assert.match(pile, /soul/);
  assert.match(pile, /✦/);
  leftover.querySelector('.leftover-take').click();
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
  assert.ok(killMoth(state));
  const held = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  scr.node.querySelector('.leftover-hunt').click();
  assert.equal(state.combat.fighting, true);
  const fight = scr.node.querySelector('.combat-fight');
  assert.equal(fight.classList.contains('leftover-station'), false);
  const { tray, tiles } = assertLootFurniture(fight, { minTiles: held.length });
  assert.ok(tray.classList.contains('fight-loot'));
  assert.match(tray.getAttribute('aria-label') ?? '', /Loot to collect/i);
  assert.equal(tiles.length, held.length);
  assert.match(tray.textContent ?? '', /soul/);
  assert.match(tray.textContent ?? '', /✦/);

  const take = fight.querySelector('.leftover-take');
  take.click();
  assert.deepEqual(state.combat.lootTray, []);
  assert.equal(state.lumen, lumen0 + traySum(held, 'lumen'));
  assert.equal(state.souls, souls0 + traySum(held, 'soul'));
  assert.equal(scr.node.querySelector('.leftover-take'), null);
  assert.ok(scr.node.querySelector('.eat-btn'));
  assert.ok(scr.node.querySelector('.flee-btn'));

  const piled = fightLogVsTab({ loot: true });
  assert.equal(piled.lootH, 32);
  assert.ok(piled.trayBottom <= 577 - COMBAT_360.tabClearance);
  assert.ok(piled.trayGap >= COMBAT_360.tabClearance);
  assert.ok(piled.eatBottom < 577);
});

test('live unpaid furniture tiles survive combat ticks without remounting Eat/Fall back', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killMoth(state));
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  scr.node.querySelector('.leftover-hunt').click();
  combat.resumeCombat(state);
  const eatBtn = scr.node.querySelector('.eat-btn');
  const fleeBtn = scr.node.querySelector('.flee-btn');
  const tray = scr.node.querySelector('.fight-loot');
  const take = tray.querySelector('.leftover-take');
  const tile0 = tray.querySelector('.loot-tile');
  assert.ok(eatBtn && fleeBtn && tray && take && tile0);
  for (let i = 0; i < 8; i++) {
    if (state.combat.foe) state.combat.foe.hp = Math.max(4, state.combat.foe.hp);
    combat.tickCombat(state, 100);
    scr.update();
    assert.equal(scr.node.querySelector('.eat-btn'), eatBtn);
    assert.equal(scr.node.querySelector('.flee-btn'), fleeBtn);
    assert.equal(scr.node.querySelector('.fight-loot'), tray);
    assert.equal(tray.querySelector('.leftover-take'), take, 'Take all node survives ticks');
    assert.equal(tray.querySelector('.loot-tile'), tile0, 'loot portrait survives ticks');
  }
});

test('leftover unpaid is a well: portraits, stack counts, Hollow pressure, tab clearance', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killMoth(state));
  state.combat.lootTray = [
    { kind: 'soul', qty: 3, granted: false },
    { kind: 'lumen', qty: 8, granted: false },
    { kind: 'item', id: 'pall-fang', qty: 2, name: 'Pall-fang', granted: false },
    { kind: 'item', id: 'tinderscrap', qty: 1, name: 'Tinderscrap', granted: false },
  ];
  const used = uniqueStackCount(state.bank);
  const cap = lanternRoom(state);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover);
  assert.ok(leftover.classList.contains('leftover-well'), 'leftover unpaid mounts a well');
  assert.equal(leftover.querySelector('.acc-station'), null);
  assert.equal(leftover.querySelector('.hand-chip'), null);
  assert.equal(leftover.querySelector('.style-row'), null);
  const meter = leftover.querySelector('.loot-well-meter')?.textContent ?? '';
  assert.equal(meter, `Hollow ${used}/${cap}`);
  assert.match(meter, /Hollow \d+\/12|Hollow \d+\/\d+/);
  assert.equal(/100/.test(meter), false, 'Hollow is 12, not a Melvor 100-slot clone');
  const { tiles } = assertLootFurniture(leftover, { minTiles: 4 });
  assert.equal(tiles.length, 4);
  const pile = leftover.querySelector('.leftover-loot')?.textContent ?? '';
  assert.match(pile, /3 souls|3 soul/);
  assert.match(pile, /✦8|Lumen/);
  assert.match(pile, /Pall-fang/);
  assert.match(pile, /Tinderscrap/);
  for (const tile of tiles) {
    const glyph = tile.querySelector('.loot-glyph');
    assert.ok(glyph, 'portrait glyph');
    assert.match(glyph.innerHTML ?? '', /<svg/i);
    assert.ok((tile.querySelector('.loot-qty')?.textContent ?? '').trim().length > 0);
    assert.ok((tile.querySelector('.loot-name')?.textContent ?? '').trim().length > 0);
  }
  assert.ok(leftover.querySelector('.leftover-take'));
  assert.ok(leftover.querySelector('.leftover-another'));
  assert.ok(leftover.querySelector('.eat-btn'), 'leftover Eat still heals in-frame');

  const box = leftoverLogVsTab({ loot: true });
  assert.equal(box.tabTop, 577);
  assert.ok(box.lootH > 44, `well ${box.lootH}px must beat the 44px checkout row`);
  assert.ok(box.lootH >= COMBAT_360.leftoverWellMin, `well ${box.lootH} vs min ${COMBAT_360.leftoverWellMin}`);
  assert.ok(box.wellBottom <= 577 - COMBAT_360.tabClearance,
    `well bottom ${box.wellBottom} must clear tab 577 by ≥${COMBAT_360.tabClearance}px (gap ${box.wellGap})`);
  assert.ok(box.anotherBottom <= 577 - COMBAT_360.tabClearance, `Hunt another ${box.anotherBottom}`);
  assert.ok(box.takeBottom <= 577 - COMBAT_360.tabClearance, `Take all ${box.takeBottom}`);
  assert.ok(box.fits);

  const dry = leftoverLogVsTab({ loot: true, oilBuy: true });
  assert.ok(dry.fits, `dry well ${dry.wellH} fill ${dry.fillH}`);
  assert.ok(dry.wellBottom <= 577 - COMBAT_360.tabClearance);

  const css = readFileSync(join(here, '../src/ui/combat.css'), 'utf8');
  assert.match(css, /\.leftover-station\.leftover-well\s+\.leftover-actions\s*\{[^}]*flex:\s*1 1 0/);
  assert.match(css, /\.leftover-station\.leftover-well\s+\.leftover-actions\s*\{[^}]*min-height:\s*140px/);
  assert.match(css, /\.leftover-station\.leftover-well\s+\.log-wrap\s*\{[^}]*margin-top:\s*0/);
  assert.match(css, /\.leftover-station\.leftover-well\s+\.loot-tile\s*\{[^}]*min-width:\s*56px/);
  assert.match(css, /\.leftover-station\.leftover-well\s+\.loot-tile\s*\{[^}]*min-height:\s*80px/);
  assert.match(css, /\.leftover-station\.leftover-well\s+\.loot-tile\s+\.loot-glyph,\s*\n\.leftover-station\.leftover-well\s+\.loot-tile\s+\.bank-glyph\s*\{[^}]*min-width:\s*56px/);
  assert.match(css, /\.combat-fight:not\(\.leftover-station\)\s+\.combat-keep\s*\{[^}]*max-height:\s*32px/);
  assert.match(css, /\.combat-fight:not\(\.leftover-station\)\s+\.fight-loot\.leftover-loot\s*\{[^}]*max-height:\s*32px/);
  const liveKeep = fightLogVsTab({ loot: true });
  assert.equal(liveKeep.keepH, 32);
  assert.equal(liveKeep.lootH, 32);
  assert.ok(liveKeep.trayBottom <= 577 - COMBAT_360.tabClearance);
});

test('leftover well Take all is a no-op the second time; kit chrome returns after pay', () => {
  const state = createState({ rngSeed: 4 });
  assert.ok(killMoth(state));
  const lumen0 = state.lumen;
  const souls0 = state.souls;
  const held = (state.combat.lootTray ?? []).map((e) => ({ ...e }));
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  const leftover = scr.node.querySelector('.leftover-station');
  assert.ok(leftover.classList.contains('leftover-well'));
  leftover.querySelector('.leftover-take').click();
  assert.deepEqual(state.combat.lootTray, []);
  assert.equal(state.lumen, lumen0 + traySum(held, 'lumen'));
  assert.equal(state.souls, souls0 + traySum(held, 'soul'));
  const after = scr.node.querySelector('.leftover-station');
  assert.ok(after);
  assert.equal(after.classList.contains('leftover-well'), false);
  assert.ok(after.querySelector('.acc-station'), 'kit Acc returns after Take all');
  assert.ok(after.querySelector('.hand-chip'));
  assert.ok(after.querySelector('.style-row'));
  assert.equal(after.querySelector('.leftover-loot'), null);
  assert.equal(after.querySelector('.leftover-take'), null);
  const paidLumen = state.lumen;
  const paidSouls = state.souls;
  combat.takeAllLootTray(state);
  assert.equal(state.lumen, paidLumen);
  assert.equal(state.souls, paidSouls);
  assert.ok(after.querySelector('.leftover-hunt'), 'Hunt-this-foe stays after Take all');
});

