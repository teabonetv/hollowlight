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
  assert.match(riteAcc.line, /Acc \d+% · \d+–\d+ \/ they \d+% · \d+–\d+/);
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
  assert.equal(scr.node.querySelectorAll('.weapon-card').length, 0);
  assert.ok(scr.node.querySelector('.hand-chip'));
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
  assert.match(riteAcc.line, /Acc \d+% · \d+–\d+ \/ they \d+% · \d+–\d+/);
});

test('leftover station states Need oil in-frame at 0 sips', () => {
  const state = createState({ rngSeed: 4 });
  killMoth(state);
  state.bank['wick-oil'] = 0;
  state.bank['lamp-oil'] = 0;
  const leftover = renderSkillDetail(makeCtx(state), 'combat').node.querySelector('.leftover-station');
  assert.ok(leftover);
  const oil = leftover.querySelector('.leftover-dry')?.textContent ?? leftover.querySelector('.oil-line')?.textContent ?? '';
  assert.match(oil, /Need oil/);
  assert.equal(/Need oil/.test(leftover.textContent ?? ''), true);
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
