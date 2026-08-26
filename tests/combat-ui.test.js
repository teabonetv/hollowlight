import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeNode, FakeText } from './helpers/fake-node.mjs';

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
  assert.match(fight.textContent ?? '', /You/);
  assert.match(fight.textContent ?? '', /Pale Moth/);
  assert.match(fight.textContent ?? '', /Lantern-loaf/);
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
  assert.match(text, /before Hunt/);
  assert.match(text, /Wick-knife/);
});

test('eat button heal matches the integer that will land on HP', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  state.combat.player.hp = 32;
  const pending = combat.eatHealAmount(state, 'lantern-loaf');
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  assert.match(scr.node.textContent ?? '', new RegExp(`Lantern-loaf \\+${pending}`));
  assert.equal(pending, 8);
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
  assert.equal(hunts.length, 0, 'no primary Hunt at 0 sips');
  const need = scr.node.querySelectorAll('button').filter((b) => /Need oil/.test(b.textContent ?? ''));
  assert.ok(need.length >= 1);
  assert.equal(need[0].classList.contains('btn-primary'), false);
  assert.equal(need[0].getAttribute('aria-disabled'), 'true');
  need[0].click();
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
  const classes = fight.children.map((c) => c.className);
  const iYou = classes.findIndex((c) => /\bfighter\b/.test(c));
  const iAcc = classes.findIndex((c) => /\bacc-station\b/.test(c));
  const iOil = classes.findIndex((c) => /\boil-line\b/.test(c));
  const iEat = classes.findIndex((c) => /\beat-row\b/.test(c));
  assert.ok(iYou === 0 || iYou === 1, 'You/Foe HP open the fight');
  assert.ok(iAcc > iYou && iOil > iAcc && iEat > iOil);
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
  assert.match(eat, /Lantern-loaf \+\d+ · \d+/);
  assert.match(eat, /Eat/);
  assert.ok(scr.node.querySelector('.eat-btn'));
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
  assert.match(text, /sip/);
  assert.match(text, /Lantern-loaf|Eat|No food/);
  assert.equal(/\+0 · 0/.test(text), false);
  assert.equal(scr.node.querySelectorAll('.weapon-card').length, 0);
  assert.ok(scr.node.querySelector('.hand-chip'));
});
