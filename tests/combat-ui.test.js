import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeNode, FakeText } from './helpers/fake-node.mjs';

globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => new FakeText(s),
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

test('a live fight paints HP, styles, eat, flee, weapon, and a log', () => {
  const state = createState({ rngSeed: 4 });
  combat.startFight(state, 'pale-moth', { encounterSeed: 1 });
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  assert.match(scr.node.textContent ?? '', /Pale Moth/);
  assert.match(scr.node.textContent ?? '', /Strike/);
  assert.match(scr.node.textContent ?? '', /Wick-knife/);
  assert.match(scr.node.textContent ?? '', /3–6/);
  assert.match(scr.node.textContent ?? '', /Fall back/);
  assert.match(scr.node.textContent ?? '', /Lantern-loaf/);
  assert.ok(scr.node.querySelector('.combat-log'));
  scr.update();
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

test('mid-fight deserialize re-enters the fight screen', () => {
  const live = createState({ rngSeed: 4 });
  combat.startFight(live, 'pale-moth', { encounterSeed: 1 });
  const { state } = deserializeSave(serializeSave(live, 9));
  assert.equal(combat.fightWouldResume(state), true);
  const scr = renderSkillDetail(makeCtx(state), 'combat');
  assert.match(scr.node.textContent ?? '', /Pale Moth/);
  assert.match(scr.node.textContent ?? '', /Fall back/);
  assert.equal(state.combat.paused, false);
  assert.equal(state.combat.fighting, true);
});
