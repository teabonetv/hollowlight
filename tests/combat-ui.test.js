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
const { cockpitLogVsTab, leftoverLogVsTab, lobbyFirstHuntBottom, COMBAT_360 } = await import('../src/ui/screens/combat.js');
const tabs = await import('../src/ui/screens/tabs.js');
const combat = await import('../src/game/systems/combat.js');

function makeCtx(state) {
  return {
    state,
    toast() {},
    openSkill() {},
    openSkillsList() {},
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

test('camp offers a tap through to combat', () => {
  const scr = tabs.renderCampScreen(makeCtx(createState({ rngSeed: 3 })));
  assert.match(scr.node.textContent ?? '', /Face the pale-things/);
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
  assert.match(text, /Acc \d+%/);
  assert.match(text, /they \d+%/);
  assert.match(text, /sip|Need oil/);
  assert.match(text, /Lantern-loaf \+14 · 8|Eat|No food/);
  assert.equal(/\+0/.test(leftover.querySelector('.eat-row')?.textContent ?? ''), false);
  assert.match(leftover.querySelector('.leftover-kicker')?.textContent ?? '', /Pale Moth fell/);
  assert.match(text, /✦|soul/);
  assert.match(leftover.querySelector('.leftover-hunt')?.textContent ?? '', /Hunt Pale Moth/);
  assert.equal(/Need oil/.test(leftover.querySelector('.leftover-hunt')?.textContent ?? ''), false);
  assert.equal(scr.node.querySelectorAll('.combat-meta').length, 0, 'no duplicate souls/dry/sips row under leftover');
  assert.equal(scr.node.querySelectorAll('.weapon-card').length, 0);
  assert.ok(leftover.querySelector('.hand-chip'), 'Knife/Unarmed sits in leftover, not under Vigil');
  assert.match(leftover.querySelector('.hand-chip')?.textContent ?? '', /Knife|Unarmed/);
  assert.ok(leftover.querySelector('.style-row'));
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
  assert.match(leftover.querySelector('.hand-chip')?.textContent ?? '', /Knife|Unarmed/);
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
