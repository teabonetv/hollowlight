import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { createState } from '../src/game/state.js';
import { hitChance, styleMultiplier, HIT_FLOOR, HIT_CEIL, WEAKNESS_MULT, RESIST_MULT } from '../src/game/data/combat/styles.js';
import { ENEMIES, ENEMIES_BY_ID, BOSSES } from '../src/game/data/enemies/index.js';
import { REGULARS } from '../src/game/data/enemies/regulars.js';
import { ZONES } from '../src/game/data/combat/zones.js';
import * as combat from '../src/game/systems/combat.js';
import * as runner from '../src/game/systems/action-runner.js';
import { ALWAYS_STOCK } from '../src/game/data/store.js';
import { isOnShelf, buyFromStore } from '../src/game/systems/store.js';
import { serializeSave, deserializeSave } from '../src/core/save.js';

test('roster meets charter scope: ≥40 regulars, 12 bosses, 12 zones', () => {
  assert.ok(REGULARS.length >= 40, `regulars ${REGULARS.length}`);
  assert.equal(BOSSES.length, 12);
  assert.equal(ZONES.length, 12);
  assert.equal(ENEMIES.length, REGULARS.length + BOSSES.length);
  for (const z of ZONES) {
    assert.ok(ENEMIES.some((e) => e.zoneId === z.id && e.boss), `boss for ${z.id}`);
    assert.ok(ENEMIES.filter((e) => e.zoneId === z.id && !e.boss).length >= 3, `mobs in ${z.id}`);
  }
});

test('hit chance is monotonic, clamped, and independent of call order', () => {
  const low = hitChance(5, 40);
  const mid = hitChance(20, 20);
  const high = hitChance(80, 10);
  assert.ok(low >= HIT_FLOOR && high <= HIT_CEIL);
  assert.ok(low < mid && mid < high);
  assert.equal(hitChance(0, 0), hitChance(1, 1));
});

test('style weakness and resist multipliers are the published constants', () => {
  assert.equal(styleMultiplier('strike', 'strike', 'rite'), WEAKNESS_MULT);
  assert.equal(styleMultiplier('strike', 'shot', 'strike'), RESIST_MULT);
  assert.equal(styleMultiplier('strike', 'shot', 'rite'), 1);
});

test('loot table rolls are deterministic for a given seed', () => {
  const table = ENEMIES_BY_ID['pale-moth'].loot;
  const a = combat.rollLootTable(table, createRng(4242));
  const b = combat.rollLootTable(table, createRng(4242));
  assert.deepEqual(a, b);
  const c = combat.rollLootTable(table, createRng(7));
  // Different seed is allowed to match by chance; just prove the helper returns arrays.
  assert.ok(Array.isArray(c));
});

test('rollDamage stays inside the scaled range (min 1)', () => {
  const rng = createRng(99);
  for (let i = 0; i < 40; i++) {
    const d = combat.rollDamage(rng, 3, 6, 1.18);
    assert.ok(d >= 1);
    assert.ok(d <= Math.round(6 * 1.18));
  }
});

test('Hearthway is huntable at a fresh save; later stretches stay locked', () => {
  const s = createState({ nowMs: 0, rngSeed: 11 });
  assert.equal(combat.zoneUnlock(s, 'hearthway').ok, true);
  const ves = combat.zoneUnlock(s, 'vespers');
  assert.equal(ves.ok, false);
  assert.match(ves.reason, /beacon|Vesper|level/i);
  const locked = combat.startFight(s, 'dusk-bell');
  assert.equal(locked.ok, false);
  const open = combat.startFight(s, 'pale-moth', { encounterSeed: 1001 });
  assert.equal(open.ok, true);
  assert.equal(s.combat.fighting, true);
  assert.equal(s.combat.foe.id, 'pale-moth');
});

test('the Hearth-Warden stays behind stir-kills, then stands', () => {
  const s = createState({ rngSeed: 12 });
  const early = combat.startFight(s, 'hearth-warden');
  assert.equal(early.ok, false);
  s.combat.stretchKills.hearthway = 5;
  const later = combat.startFight(s, 'hearth-warden', { encounterSeed: 9 });
  assert.equal(later.ok, true);
  assert.equal(s.combat.foe.maxHp, ENEMIES_BY_ID['hearth-warden'].hp);
});

test('a seeded fight replays the same log and HP when ticked the same way', () => {
  function play() {
    const s = createState({ nowMs: 0, rngSeed: 1 });
    s.combat.autoContinue = false;
    combat.startFight(s, 'fog-rat', { encounterSeed: 0xC0FFEE });
    for (let i = 0; i < 80; i++) combat.tickCombat(s, 100);
    return {
      log: s.combat.log.map((l) => l.text),
      php: s.combat.player.hp,
      fhp: s.combat.foe?.hp ?? 0,
      seed: s.combat.rngState,
    };
  }
  assert.deepEqual(play(), play());
});

test('kills grant combat XP via the shared mastery × altar formula and drop loot', () => {
  const s = createState({ rngSeed: 3 });
  s.combat.autoContinue = false;
  s.combat.player.style = 'strike';
  combat.startFight(s, 'pale-moth', { encounterSeed: 1 });
  let kill = null;
  for (let i = 0; i < 80 && !kill; i++) {
    s.combat.foe.hp = 1;
    s.combat.player.nextActMs = 0;
    const events = combat.tickCombat(s, 100);
    kill = events.find((e) => e.type === 'combat-kill') ?? kill;
  }
  assert.ok(kill, 'kill event');
  assert.equal(kill.enemyId, 'pale-moth');
  assert.ok(s.skills.combat.xp > 0);
  assert.ok(s.souls >= 1);
  assert.equal(s.stats.kills, 1);
});

test('death drops carried Lumen at the site; walking back recovers it; bank stays', () => {
  const s = createState({ rngSeed: 4 });
  s.lumen = 77;
  s.bank.fogwort = 9;
  s.combat.autoContinue = false;
  combat.startFight(s, 'hollow-cur', { encounterSeed: 2 });
  let death = null;
  for (let i = 0; i < 80 && !death; i++) {
    s.combat.player.hp = 1;
    s.combat.foe.nextActMs = 0;
    const events = combat.tickCombat(s, 100);
    death = events.find((e) => e.type === 'combat-death') ?? death;
  }
  assert.ok(death, 'death event');
  assert.equal(s.stats.deaths, 1);
  assert.equal(s.lumen, 0);
  assert.equal(s.combat.deathSite.lumen, 77);
  assert.equal(s.combat.deathSite.zoneId, 'hearthway');
  assert.equal(s.bank.fogwort, 9, 'nothing permanent taken from the bank');
  assert.equal(s.combat.fighting, false);
  assert.equal(s.combat.player.hp, combat.playerMaxHp(s));

  const rec = combat.recoverLumen(s, 'hearthway');
  assert.equal(rec.ok, true);
  assert.equal(rec.gained, 77);
  assert.equal(s.lumen, 77);
  assert.equal(s.combat.deathSite, null);
});

test('eating heals and consumes food; oil sips drain wick-oil during the fight', () => {
  const s = createState({ rngSeed: 5 });
  s.combat.player.hp = 10;
  const loaf = s.bank['lantern-loaf'];
  const ate = combat.eatFood(s, 'lantern-loaf');
  assert.equal(ate.ok, true);
  assert.equal(s.combat.player.hp, 10 + 14);
  assert.equal(s.bank['lantern-loaf'], loaf - 1);

  const oilBefore = s.bank['wick-oil'];
  combat.startFight(s, 'pale-moth', { encounterSeed: 3 });
  s.combat.autoContinue = false;
  combat.tickCombat(s, 8000);
  assert.ok((s.bank['wick-oil'] ?? 0) < oilBefore, 'a sip was taken');
});

test('eat heal, log line, and HP delta are the same integer', () => {
  const s = createState({ rngSeed: 5 });
  s.combat.player.hp = 32;
  const pending = combat.eatHealAmount(s, 'lantern-loaf');
  assert.equal(pending, 8);
  const hp0 = s.combat.player.hp;
  const ate = combat.eatFood(s, 'lantern-loaf');
  assert.equal(ate.ok, true);
  assert.equal(ate.healed, pending);
  assert.equal(s.combat.player.hp - hp0, pending);
  const line = s.combat.log.find((l) => l.kind === 'eat');
  assert.match(line.text, new RegExp(`\\+${pending} vitality`));
});

test('equipped wick-knife changes strike damage and speed vs unarmed', () => {
  const armed = createState({ rngSeed: 1 });
  const knife = combat.playerOffense(armed, 'strike');
  assert.equal(combat.heldWeapon(armed)?.id, 'wick-knife');
  assert.equal(knife.minDmg, 3);
  assert.equal(knife.maxDmg, 6);
  assert.equal(knife.speedMs, 2200);
  assert.equal(knife.accuracy, 8 + 2 + 4);

  const bare = createState({ rngSeed: 1 });
  combat.equipWeapon(bare, 'unarmed');
  const un = combat.playerOffense(bare, 'strike');
  assert.equal(un.minDmg, 2);
  assert.equal(un.maxDmg, 4);
  assert.equal(un.speedMs, 2400);
  assert.ok(knife.maxDmg > un.maxDmg);
  assert.ok(knife.speedMs < un.speedMs);
  assert.ok(knife.accuracy > un.accuracy);
});

test('the stall always sells wick-oil', () => {
  assert.ok(ALWAYS_STOCK.includes('wick-oil'));
  const s = createState({ rngSeed: 2 });
  s.lumen = 80;
  assert.equal(isOnShelf(s, 'wick-oil'), true);
  const before = s.bank['wick-oil'] ?? 0;
  const buy = buyFromStore(s, 'wick-oil', 2);
  assert.equal(buy.ok, true);
  assert.equal(s.bank['wick-oil'], before + 2);
});

test('swapping style mid-fight is allowed and recorded', () => {
  const s = createState({ rngSeed: 6 });
  combat.startFight(s, 'pale-moth', { encounterSeed: 4 });
  const res = combat.setStyle(s, 'rite');
  assert.equal(res.ok, true);
  assert.equal(s.combat.player.style, 'rite');
  assert.ok(s.combat.log.some((l) => /Rite/.test(l.text)));
});

test('flee ends the fight without loot or death', () => {
  const s = createState({ rngSeed: 7 });
  const lumen = s.lumen;
  combat.startFight(s, 'wick-thief', { encounterSeed: 5 });
  combat.fleeFight(s);
  assert.equal(s.combat.fighting, false);
  assert.equal(s.lumen, lumen);
  assert.equal(s.combat.foe, null);
});

test('boss phase telegraphs enter the log at HP thresholds', () => {
  const s = createState({ rngSeed: 8 });
  s.combat.stretchKills.hearthway = 5;
  s.combat.autoContinue = false;
  combat.startFight(s, 'hearth-warden', { encounterSeed: 6 });
  s.combat.foe.hp = Math.floor(s.combat.foe.maxHp * 0.64);
  s.combat.player.nextActMs = 0;
  combat.tickCombat(s, 100);
  assert.ok(s.combat.log.some((l) => l.kind === 'telegraph' || /Lantern-Storm|faster/.test(l.text)));
});

test('a Vigil against pale-things completes with the tier-1 payout', () => {
  const s = createState({ rngSeed: 9 });
  const assigned = combat.assignVigil(s, { categoryId: 'pale', seed: 1 });
  assert.equal(assigned.ok, true);
  assert.equal(s.combat.vigils.current.category, 'pale');
  s.combat.autoContinue = false;
  const need = s.combat.vigils.current.required;
  const lumen0 = s.lumen;
  let attempts = 0;
  while (s.combat.vigils.current && attempts++ < 80) {
    if (!s.combat.fighting) combat.startFight(s, 'pale-moth', { encounterSeed: 100 + attempts });
    if (!s.combat.foe) break;
    s.combat.foe.hp = 1;
    s.combat.player.nextActMs = 0;
    combat.tickCombat(s, 100);
  }
  assert.equal(s.combat.vigils.current, null);
  assert.equal(s.combat.vigils.completed, 1);
  assert.ok(s.lumen > lumen0);
  assert.ok(need >= 1);
});

test('first Vigil sworn on Hearthway is pale-things, never marsh horrors', () => {
  for (let seed = 0; seed < 16; seed++) {
    const s = createState({ rngSeed: seed });
    const res = combat.assignVigil(s, { seed });
    assert.equal(res.ok, true);
    assert.equal(res.vigil.category, 'pale');
    assert.equal(res.vigil.zoneId, 'hearthway');
  }
});

test('vigil increments on matching-category kills on the sworn stretch', () => {
  const s = createState({ rngSeed: 9 });
  combat.assignVigil(s, { categoryId: 'pale', seed: 1 });
  s.combat.autoContinue = false;
  combat.startFight(s, 'lantern-shade', { encounterSeed: 2 });
  let n = 0;
  while (s.combat.fighting && n++ < 40) {
    s.combat.foe.hp = 1;
    s.combat.player.nextActMs = 0;
    combat.tickCombat(s, 100);
  }
  assert.equal(s.combat.vigils.current.kills, 0, 'wight kill does not count as pale');

  combat.startFight(s, 'pale-moth', { encounterSeed: 3 });
  n = 0;
  while (s.combat.fighting && n++ < 40) {
    s.combat.foe.hp = 1;
    s.combat.player.nextActMs = 0;
    combat.tickCombat(s, 100);
  }
  assert.equal(s.combat.vigils.current.kills, 1);
});

test('mid-fight serialize then deserialize keeps fighting and pauses until the HUD mounts', () => {
  const s = createState({ rngSeed: 4 });
  combat.startFight(s, 'pale-moth', { encounterSeed: 1 });
  s.combat.player.hp = 22;
  const json = serializeSave(s, 1);
  const { state } = deserializeSave(json);
  assert.equal(state.combat.fighting, true);
  assert.equal(combat.fightWouldResume(state), true);
  assert.equal(state.combat.paused, true);
  const hp = state.combat.player.hp;
  const foeHp = state.combat.foe.hp;
  combat.tickCombat(state, 8000);
  assert.equal(state.combat.player.hp, hp);
  assert.equal(state.combat.foe.hp, foeHp);
  combat.resumeCombat(state);
  assert.equal(state.combat.paused, false);
  assert.equal(state.combat.fighting, true);
});

test('emberkeeping still ticks while a fight is running', () => {
  const s = createState({ rngSeed: 10 });
  runner.startAction(s, 'tend-flame');
  combat.startFight(s, 'fog-rat', { encounterSeed: 11 });
  const rng = createRng(10);
  const events = runner.tickActions(s, 4000, rng);
  assert.ok(events.some((e) => e.type === 'cycle'));
  assert.equal(s.combat.fighting, true);
});

test('player log lines use first-person verbs', () => {
  const s = createState({ rngSeed: 21 });
  s.combat.autoContinue = false;
  combat.startFight(s, 'pale-moth', { encounterSeed: 1 });
  assert.match(s.combat.log[0].text, /on The fog-line/);
  s.combat.player.nextActMs = 0;
  s.combat.foe.hp = 1;
  for (let i = 0; i < 30 && s.combat.fighting; i++) {
    s.combat.player.nextActMs = 0;
    combat.tickCombat(s, 100);
  }
  const you = s.combat.log.filter((l) => l.text.startsWith('You '));
  assert.ok(you.some((l) => /You strike |You miss|You loose|You intone/.test(l.text) || /You meet/.test(l.text)));
  assert.equal(you.some((l) => /You strikes/.test(l.text)), false);
});

test('grantCombatXp uses the same rounding as live kills', () => {
  const s = createState({ rngSeed: 13 });
  const { xp } = combat.grantCombatXp(s, 11);
  // mastery starts at 1 → ×1.01, altar at 0 → ×1
  assert.equal(xp, Math.round(11 * 1.01));
});
