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
import { ITEMS } from '../src/game/data/items.js';
import {
  uniqueStackCount, lanternRoom, canAcceptStack, PACK_FULL_MSG,
} from '../src/game/systems/bank.js';

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
  assert.equal(s.souls, 0, 'souls wait on the leftover tray');
  assert.ok(s.combat.lootTray.some((e) => e.kind === 'soul' && e.qty >= 1 && e.granted === false));
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

function hitLogCount(state) {
  return (state.combat.log ?? []).filter((l) => l.kind === 'hit').length;
}

test('mid-swing Eat zeros player attack progress, heals, and does not land a blow that step', () => {
  const s = createState({ rngSeed: 5 });
  combat.startFight(s, 'pale-moth', { encounterSeed: 3 });
  s.combat.player.hp = 10;
  const speed = combat.playerOffense(s, s.combat.player.style).speedMs;
  assert.ok(speed > 400, `weapon speed ${speed}`);
  const rem = Math.floor(speed / 4);
  s.combat.player.nextActMs = rem;
  s.combat.foe.nextActMs = 50_000;
  assert.ok(combat.playerSwingProgress(s) > 0.5);
  const foeHp = s.combat.foe.hp;
  const hits0 = hitLogCount(s);
  const hp0 = s.combat.player.hp;
  const ate = combat.eatFood(s, 'lantern-loaf');
  assert.equal(ate.ok, true);
  assert.equal(s.combat.player.hp, hp0 + 14);
  assert.equal(combat.playerSwingRemainingMs(s), speed);
  assert.equal(combat.playerSwingProgress(s), 0);
  assert.equal(s.combat.foe.nextActMs, 50_000, 'foe timer is not the eat letter');

  combat.tickCombat(s, rem);
  assert.equal(s.combat.fighting, true);
  assert.equal(s.combat.foe.hp, foeHp, 'old remainder must not complete the new swing');
  assert.equal(hitLogCount(s), hits0);
  assert.ok(s.combat.player.nextActMs > 0);
});

test('a second Eat also zeros swing progress; ready-to-hit Eat skips the blow that step', () => {
  const s = createState({ rngSeed: 5 });
  combat.startFight(s, 'pale-moth', { encounterSeed: 3 });
  s.combat.player.hp = 10;
  const speed = combat.playerOffense(s, s.combat.player.style).speedMs;
  s.combat.foe.nextActMs = 50_000;
  s.combat.player.nextActMs = Math.floor(speed / 3);
  assert.equal(combat.eatFood(s, 'lantern-loaf').ok, true);
  assert.equal(combat.playerSwingProgress(s), 0);
  assert.equal(s.combat.player.nextActMs, speed);

  s.combat.player.nextActMs = 80;
  assert.ok(combat.playerSwingProgress(s) > 0);
  const hp1 = s.combat.player.hp;
  assert.equal(combat.eatFood(s, 'lantern-loaf').ok, true);
  assert.ok(s.combat.player.hp > hp1);
  assert.equal(combat.playerSwingProgress(s), 0);
  assert.equal(s.combat.player.nextActMs, speed);

  const foeHp = s.combat.foe.hp;
  const hits0 = hitLogCount(s);
  s.combat.player.nextActMs = 0;
  assert.equal(combat.eatFood(s, 'fogwort').ok, true);
  assert.equal(s.combat.player.nextActMs, speed);
  combat.tickCombat(s, 0);
  combat.tickCombat(s, 50);
  assert.equal(s.combat.foe.hp, foeHp);
  assert.equal(hitLogCount(s), hits0);
});

test('failed Eat does not restart the swing; leftover Eat does not need a live windup', () => {
  const s = createState({ rngSeed: 5 });
  combat.startFight(s, 'pale-moth', { encounterSeed: 3 });
  const speed = combat.playerOffense(s, s.combat.player.style).speedMs;
  s.combat.player.hp = combat.playerMaxHp(s);
  s.combat.player.nextActMs = 180;
  const fail = combat.eatFood(s, 'lantern-loaf');
  assert.equal(fail.ok, false);
  assert.equal(s.combat.player.nextActMs, 180);

  combat.fleeFight(s);
  s.combat.player.hp = 10;
  const leftoverSwing = s.combat.player.nextActMs;
  const ate = combat.eatFood(s, 'lantern-loaf');
  assert.equal(ate.ok, true);
  assert.equal(s.combat.fighting, false);
  assert.equal(s.combat.player.nextActMs, leftoverSwing);
  assert.equal(speed, combat.playerOffense(s, s.combat.player.style).speedMs);
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

test('a hunt with empty flasks starts dry and never counts as fed', () => {
  const s = createState({ rngSeed: 14 });
  s.bank['wick-oil'] = 0;
  s.bank['lamp-oil'] = 0;
  combat.startFight(s, 'pale-moth', { encounterSeed: 1 });
  assert.equal(combat.oilSipsRemaining(s), 0);
  assert.equal(combat.lanternIsFed(s), false);
  assert.equal(s.combat.lanternDry, true);
  const st = combat.combatStatus(s);
  assert.equal(st.lanternFed, false);
  assert.ok(s.combat.log.some((l) => /lantern is dry|goes dry/i.test(l.text)));
});

test('hub lantern chip is not ready at 0 sips even if lanternDry is false', () => {
  const s = createState({ rngSeed: 15 });
  s.bank['wick-oil'] = 0;
  s.bank['lamp-oil'] = 0;
  s.combat.lanternDry = false;
  assert.equal(combat.lanternIsFed(s), false);
});

test('wick-knife accuracy raises shown hit % and max-hit vs unarmed', () => {
  const armed = createState({ rngSeed: 1 });
  combat.startFight(armed, 'pale-moth', { encounterSeed: 1 });
  const knife = combat.fightCockpit(armed);
  const bare = createState({ rngSeed: 1 });
  combat.equipWeapon(bare, 'unarmed');
  combat.startFight(bare, 'pale-moth', { encounterSeed: 1 });
  const un = combat.fightCockpit(bare);
  assert.ok(knife.hitPct > un.hitPct, `${knife.hitPct} vs ${un.hitPct}`);
  assert.ok(knife.playerMaxHit > un.playerMaxHit);
  assert.equal(knife.foeMaxHit, un.foeMaxHit);
  assert.equal(knife.vsName, 'Pale Moth');
  const moth = ENEMIES_BY_ID['pale-moth'];
  const off = combat.playerOffense(armed, 'strike');
  assert.equal(knife.foeHitPct, Math.round(hitChance(moth.accuracy, off.avoidance) * 100));
  assert.equal(knife.hitPct, Math.round(hitChance(off.accuracy, moth.avoidance) * 100));
  assert.equal(knife.playerMinHit, Math.max(1, Math.round(off.minDmg * WEAKNESS_MULT)));
  assert.equal(knife.playerMaxHit, Math.max(1, Math.round(off.maxDmg * WEAKNESS_MULT)));
  assert.equal(knife.foeMinHit, moth.minDmg);
  assert.equal(knife.foeMaxHit, moth.maxDmg);
});

test('after combat ticks, deserialize HP matches live HP without pagehide', () => {
  const s = createState({ rngSeed: 16 });
  s.combat.autoContinue = false;
  combat.startFight(s, 'pale-moth', { encounterSeed: 7 });
  for (let i = 0; i < 24; i++) combat.tickCombat(s, 100);
  assert.equal(combat.combatShouldFlush(s), true);
  const json = serializeSave(s, 1);
  const { state } = deserializeSave(json);
  assert.equal(state.combat.player.hp, s.combat.player.hp);
  assert.equal(state.combat.foe.hp, s.combat.foe.hp);
});

test('kills of 1 soul use singular in the log', () => {
  const s = createState({ rngSeed: 3 });
  s.combat.autoContinue = false;
  combat.startFight(s, 'pale-moth', { encounterSeed: 1 });
  let kill = null;
  for (let i = 0; i < 80 && !kill; i++) {
    s.combat.foe.hp = 1;
    s.combat.player.nextActMs = 0;
    const events = combat.tickCombat(s, 100);
    kill = events.find((e) => e.type === 'combat-kill') ?? kill;
  }
  assert.equal(kill.souls, 1);
  assert.ok(s.combat.log.some((l) => /1 soul/.test(l.text)));
  assert.equal(s.combat.log.some((l) => /1 souls/.test(l.text)), false);
});

test('keep hunting defaults off on a fresh save', () => {
  const s = createState({ rngSeed: 1 });
  assert.equal(s.combat.autoContinue, false);
});

test('auto-continue refuses the next moth while the lantern is dry', () => {
  const s = createState({ rngSeed: 3 });
  s.bank['wick-oil'] = 0;
  s.bank['lamp-oil'] = 0;
  s.combat.autoContinue = true;
  combat.startFight(s, 'pale-moth', { encounterSeed: 1 });
  let kill = null;
  for (let i = 0; i < 80 && !kill; i++) {
    s.combat.foe.hp = 1;
    s.combat.player.nextActMs = 0;
    const events = combat.tickCombat(s, 100);
    kill = events.find((e) => e.type === 'combat-kill') ?? kill;
  }
  assert.ok(kill);
  assert.equal(s.combat.fighting, false);
  assert.equal(s.combat.foe, null);
  assert.equal(combat.lanternIsFed(s), false);
});

test('auto-continue chains the next moth while the lantern is fed', () => {
  const s = createState({ rngSeed: 3 });
  s.combat.autoContinue = true;
  combat.startFight(s, 'pale-moth', { encounterSeed: 1 });
  let kill = null;
  for (let i = 0; i < 80 && !kill; i++) {
    s.combat.foe.hp = 1;
    s.combat.player.nextActMs = 0;
    const events = combat.tickCombat(s, 100);
    kill = events.find((e) => e.type === 'combat-kill') ?? kill;
  }
  assert.ok(kill);
  assert.equal(s.combat.fighting, true);
  assert.equal(s.combat.foe?.id, 'pale-moth');
  assert.ok(combat.lanternIsFed(s));
});

test('selected food skips empty stacks and lastStation snapshots a kill', () => {
  const s = createState({ rngSeed: 5 });
  s.bank.palecap = 0;
  assert.equal(combat.selectedFoodId(s), 'lantern-loaf');
  combat.selectFood(s, 'fogwort');
  assert.equal(combat.selectedFoodId(s), 'fogwort');
  s.bank.fogwort = 0;
  assert.equal(combat.selectedFoodId(s), 'lantern-loaf');

  s.combat.autoContinue = false;
  combat.startFight(s, 'pale-moth', { encounterSeed: 1 });
  const kit = combat.fightCockpit(s);
  let kill = null;
  for (let i = 0; i < 80 && !kill; i++) {
    if (s.combat.foe) s.combat.foe.hp = 1;
    s.combat.player.nextActMs = 0;
    const events = combat.tickCombat(s, 100);
    kill = events.find((e) => e.type === 'combat-kill') ?? kill;
  }
  assert.ok(kill);
  assert.equal(s.combat.fighting, false);
  assert.equal(s.combat.lastStation?.enemyId, 'pale-moth');
  assert.equal(s.combat.lastStation?.ended, 'kill');
  assert.equal(s.combat.lastStation?.hitPct, kit.hitPct);
  assert.equal(s.combat.lastStation?.foeHitPct, kit.foeHitPct);
  assert.equal(s.combat.lastStation?.playerMinHit, kit.playerMinHit);
  assert.equal(s.combat.lastStation?.souls, 1);
  assert.ok(Array.isArray(s.combat.lastStation?.loot));
  assert.ok(s.combat.lastStation.loot.some((d) => d.kind === 'lumen' && d.qty >= 1));
});

test('flee snapshots lastStation as flee, not a kill', () => {
  const s = createState({ rngSeed: 7 });
  combat.startFight(s, 'pale-moth', { encounterSeed: 5 });
  combat.fleeFight(s);
  assert.equal(s.combat.lastStation?.ended, 'flee');
  assert.equal(s.combat.lastStation?.enemyId, 'pale-moth');
  assert.match(combat.leftoverKicker(s.combat.lastStation), /Fell back from Pale Moth/);
});

test('startFight clears the previous encounter log', () => {
  const s = createState({ rngSeed: 4 });
  combat.startFight(s, 'pale-moth', { encounterSeed: 1 });
  s.combat.player.hp = 10;
  combat.eatFood(s, 'lantern-loaf');
  combat.fleeFight(s);
  assert.ok(s.combat.log.some((l) => l.kind === 'eat'));
  assert.ok(s.combat.log.some((l) => l.kind === 'flee'));
  combat.startFight(s, 'pale-moth', { encounterSeed: 2 });
  assert.equal(s.combat.log.some((l) => l.kind === 'eat'), false);
  assert.equal(s.combat.log.some((l) => l.kind === 'flee'), false);
  assert.equal(s.combat.log.some((l) => l.kind === 'kill'), false);
  assert.match(s.combat.log[0].text, /You meet Pale Moth/);
});

test('first Hunt waits the opening windup; Pale Moth is still up at 400ms', () => {
  const s = createState({ rngSeed: 4 });
  combat.startFight(s, 'pale-moth', { encounterSeed: 1 });
  assert.ok(s.combat.player.nextActMs >= combat.OPENING_WINDUP_MS);
  assert.equal(s.combat.foe.hp, 16);
  assert.equal(s.combat.foe.hp, s.combat.foe.maxHp);
  combat.tickCombat(s, 400);
  assert.equal(s.combat.fighting, true);
  assert.ok(s.combat.foe);
  assert.equal(s.combat.foe.hp, 16);
  assert.equal(s.combat.log.some((l) => l.kind === 'hit' || l.kind === 'hurt'), false);
  assert.equal(s.combat.log.some((l) => l.kind === 'kill'), false);
});

test('kill and flee pin leftover foe vitals for the cockpit', () => {
  const s = createState({ rngSeed: 4 });
  s.combat.autoContinue = false;
  combat.startFight(s, 'pale-moth', { encounterSeed: 1 });
  let kill = null;
  for (let i = 0; i < 80 && !kill; i++) {
    if (s.combat.foe) s.combat.foe.hp = 1;
    s.combat.player.nextActMs = 0;
    const events = combat.tickCombat(s, 100);
    kill = events.find((e) => e.type === 'combat-kill') ?? kill;
  }
  assert.ok(kill);
  const dead = combat.leftoverFoeVitals(s.combat.lastStation);
  assert.equal(dead.name, 'Pale Moth');
  assert.equal(dead.hp, 0);
  assert.equal(dead.max, 16);

  combat.startFight(s, 'pale-moth', { encounterSeed: 9 });
  s.combat.foe.hp = 11;
  combat.fleeFight(s);
  const fled = combat.leftoverFoeVitals(s.combat.lastStation);
  assert.equal(fled.name, 'Pale Moth');
  assert.equal(fled.hp, 11);
  assert.equal(fled.max, 16);
});

test('kill and flee pin a leftover fight log (not log: [])', () => {
  const s = createState({ rngSeed: 4 });
  s.combat.autoContinue = false;
  combat.startFight(s, 'pale-moth', { encounterSeed: 1 });
  let kill = null;
  for (let i = 0; i < 80 && !kill; i++) {
    if (s.combat.foe) s.combat.foe.hp = 1;
    s.combat.player.nextActMs = 0;
    const events = combat.tickCombat(s, 100);
    kill = events.find((e) => e.type === 'combat-kill') ?? kill;
  }
  assert.ok(kill);
  assert.ok(Array.isArray(s.combat.lastStation.log));
  assert.ok(s.combat.lastStation.log.length >= 1);
  assert.ok(s.combat.lastStation.log.length <= combat.LEFTOVER_LOG_LINES);
  assert.ok(s.combat.lastStation.log.some((l) => l.kind === 'kill' || /falls/.test(l.text)));

  combat.startFight(s, 'pale-moth', { encounterSeed: 9 });
  combat.fleeFight(s);
  assert.ok(Array.isArray(s.combat.lastStation.log));
  assert.ok(s.combat.lastStation.log.length >= 1);
  assert.ok(s.combat.lastStation.log.some((l) => l.kind === 'flee'));
  assert.equal(s.combat.lastStation.log.some((l) => l.kind === 'kill'), false);
});

test('cycleFood walks owned foods in FOOD_ORDER', () => {
  const s = createState({ rngSeed: 5 });
  assert.equal(combat.selectedFoodId(s), 'lantern-loaf');
  assert.deepEqual(combat.ownedFoodIds(s), ['lantern-loaf', 'fogwort']);
  assert.equal(combat.cycleFood(s).foodId, 'fogwort');
  assert.equal(combat.selectedFoodId(s), 'fogwort');
  assert.equal(combat.cycleFood(s).foodId, 'lantern-loaf');
  assert.equal(combat.foodHeal('lantern-loaf'), 14);
  assert.equal(combat.foodHeal('fogwort'), 5);
});

test('dismissLastStation clears leftover without starting a fight', () => {
  const s = createState({ rngSeed: 4 });
  combat.startFight(s, 'wick-thief', { encounterSeed: 1 });
  combat.fleeFight(s);
  assert.equal(s.combat.lastStation?.enemyId, 'wick-thief');
  combat.dismissLastStation(s);
  assert.equal(s.combat.lastStation, null);
  assert.deepEqual(s.combat.lootTray, []);
  assert.equal(s.combat.fighting, false);
});

function killPaleMoth(s, encounterSeed = 1) {
  s.combat.autoContinue = false;
  combat.startFight(s, 'pale-moth', { encounterSeed });
  let kill = null;
  for (let i = 0; i < 80 && !kill; i++) {
    if (s.combat.foe) s.combat.foe.hp = 1;
    s.combat.player.nextActMs = 0;
    const events = combat.tickCombat(s, 100);
    kill = events.find((e) => e.type === 'combat-kill') ?? kill;
  }
  return kill;
}

function traySum(tray, kind, id) {
  return (tray ?? [])
    .filter((e) => e.kind === kind && (id == null || e.id === id))
    .reduce((n, e) => n + e.qty, 0);
}

function walletSnap(s) {
  return { lumen: s.lumen, souls: s.souls, bank: { ...s.bank } };
}

function fillHollowExcept(state, skipId, cap = lanternRoom(state)) {
  delete state.bank[skipId];
  for (const it of ITEMS) {
    if (it.id === skipId) continue;
    if (uniqueStackCount(state.bank) >= cap) break;
    if ((state.bank[it.id] ?? 0) <= 0) state.bank[it.id] = 1;
  }
  return uniqueStackCount(state.bank);
}

function pinUnpaidLeftover(s, { lumen = 3, souls = 1, itemId = 'pall-fang' } = {}) {
  fillHollowExcept(s, itemId);
  assert.equal(canAcceptStack(s, itemId), false);
  s.combat.fighting = false;
  s.combat.foe = null;
  s.combat.lastStation = {
    enemyId: 'pale-moth',
    enemyName: 'Pale Moth',
    ended: 'kill',
    foeHp: 0,
    foeMaxHp: 16,
    souls,
    lootGranted: false,
    loot: [{ kind: 'item', id: itemId, qty: 1, name: 'Pall-fang', granted: false }],
  };
  s.combat.lootTray = [
    { kind: 'lumen', qty: lumen, name: 'Lumen', granted: false },
    { kind: 'soul', qty: souls, granted: false },
    { kind: 'item', id: itemId, qty: 1, name: 'Pall-fang', granted: false },
  ];
}

function assertWalletUnchanged(s, snap) {
  assert.equal(s.lumen, snap.lumen);
  assert.equal(s.souls, snap.souls);
  assert.deepEqual({ ...s.bank }, snap.bank);
}

function assertWalletMatchesPile(s, snap, pile) {
  assert.equal(s.lumen, snap.lumen + traySum(pile, 'lumen'));
  assert.equal(s.souls, snap.souls + traySum(pile, 'soul'));
  const expected = { ...snap.bank };
  for (const row of pile) {
    if (row.kind === 'item' && row.id) expected[row.id] = (expected[row.id] ?? 0) + row.qty;
  }
  assert.deepEqual({ ...s.bank }, expected);
}

test('kill leaves bank and lumen unpaid until Take all; second Take all is a no-op', () => {
  const s = createState({ rngSeed: 4 });
  const snap = walletSnap(s);
  assert.ok(killPaleMoth(s, 1));
  const pile = (s.combat.lootTray ?? []).map((e) => ({ ...e }));
  assert.ok(pile.length >= 1, 'kill fills the leftover pile');
  assert.ok(pile.some((e) => e.kind === 'soul'));
  assert.ok(pile.some((e) => e.kind === 'lumen'));
  assert.ok(pile.every((e) => e.granted === false), 'tray is pending, not a receipt');
  assert.ok(s.combat.log.some((l) => l.kind === 'kill' && /Loot:/.test(l.text)),
    'kill log may name loot as flavour');
  assertWalletUnchanged(s, snap);

  const res = combat.takeAllLootTray(s);
  assert.equal(res.ok, true);
  assert.ok(res.granted.length >= 1);
  assert.deepEqual(s.combat.lootTray, []);
  assertWalletMatchesPile(s, snap, pile);

  const paid = walletSnap(s);
  const again = combat.takeAllLootTray(s);
  assert.equal(again.ok, true);
  assert.equal(again.granted.length, 0);
  assert.deepEqual(s.combat.lootTray, []);
  assertWalletUnchanged(s, paid);
});

test('two kills without Take all stack the tray; wallet stays unpaid until one collect', () => {
  const s = createState({ rngSeed: 4 });
  const snap = walletSnap(s);
  assert.ok(killPaleMoth(s, 1));
  const first = (s.combat.lootTray ?? []).map((e) => ({ ...e }));
  assert.ok(first.length >= 1);
  assertWalletUnchanged(s, snap);

  assert.ok(killPaleMoth(s, 2));
  const tray = s.combat.lootTray;
  assert.ok(tray.some((e) => e.kind === 'soul' && e.qty >= 2), 'souls stack across hunts');
  assert.ok(tray.every((e) => e.granted === false));
  for (const row of first) {
    const hit = tray.find((t) => t.kind === row.kind && (row.kind !== 'item' || t.id === row.id));
    assert.ok(hit, `prior ${row.kind} ${row.name ?? row.id ?? ''} still in the pile`);
    assert.ok(hit.qty >= row.qty);
  }
  assertWalletUnchanged(s, snap);

  const piled = tray.map((e) => ({ ...e }));
  const res = combat.takeAllLootTray(s);
  assert.equal(res.ok, true);
  assert.ok(res.granted.length >= 1);
  assert.deepEqual(s.combat.lootTray, []);
  assertWalletMatchesPile(s, snap, piled);

  const paid = walletSnap(s);
  assert.equal(combat.takeAllLootTray(s).granted.length, 0);
  assertWalletUnchanged(s, paid);
});

test('Take all skips granted receipts and never double-pays', () => {
  const s = createState({ rngSeed: 4 });
  s.combat.lootTray = [{ kind: 'lumen', qty: 9, name: 'Lumen', granted: true }];
  const snap = walletSnap(s);
  const res = combat.takeAllLootTray(s);
  assert.equal(res.ok, true);
  assert.equal(res.granted.length, 0);
  assert.deepEqual(s.combat.lootTray, []);
  assertWalletUnchanged(s, snap);
});

test('Fall back keeps the unpaid tray; Hunt another auto-collects it', () => {
  const s = createState({ rngSeed: 4 });
  const snap = walletSnap(s);
  assert.ok(killPaleMoth(s, 1));
  const before = s.combat.lootTray.map((e) => ({ ...e }));
  assert.ok(before.length >= 1);
  combat.startFight(s, 'pale-moth', { encounterSeed: 9 });
  combat.fleeFight(s);
  assert.equal(s.combat.lastStation?.ended, 'flee');
  assert.equal(s.combat.lootTray.length, before.length);
  for (const row of before) {
    const hit = s.combat.lootTray.find((t) => t.kind === row.kind && t.id === row.id);
    assert.ok(hit);
    assert.equal(hit.qty, row.qty);
    assert.equal(hit.granted, false);
  }
  assertWalletUnchanged(s, snap);
  combat.dismissLastStation(s);
  assert.equal(s.combat.lastStation, null);
  assert.deepEqual(s.combat.lootTray, []);
  assertWalletMatchesPile(s, snap, before);
});

test('pack-full Take all keeps unbanked chips; Hunt another does not wipe them', () => {
  const s = createState({ rngSeed: 4 });
  pinUnpaidLeftover(s, { lumen: 3, souls: 1, itemId: 'pall-fang' });
  const snap = walletSnap(s);
  const last = s.combat.lastStation;

  const taken = combat.takeAllLootTray(s);
  assert.equal(s.lumen, snap.lumen + 3);
  assert.equal(s.souls, snap.souls + 1);
  assert.equal(s.bank['pall-fang'], undefined);
  assert.equal(taken.blocked, true);
  assert.match(taken.error ?? '', /hollow is full/i);
  assert.equal(s.combat.lootTray.length, 1);
  assert.equal(s.combat.lootTray[0].id, 'pall-fang');
  assert.equal(s.combat.lootTray[0].granted, false);
  assert.equal(s.combat.lastStation, last);

  const again = combat.takeAllLootTray(s);
  assert.equal(again.blocked, true);
  assert.equal(s.bank['pall-fang'], undefined);
  assert.equal(s.combat.lootTray[0].id, 'pall-fang');
  assert.equal(s.lumen, snap.lumen + 3);

  const door = combat.dismissLastStation(s);
  assert.equal(door.ok, false);
  assert.match(door.error ?? PACK_FULL_MSG, /hollow is full/i);
  assert.equal(s.combat.lastStation?.enemyId, 'pale-moth');
  assert.equal(s.combat.lootTray.length, 1);
  assert.equal(s.combat.lootTray[0].id, 'pall-fang');
  assert.equal(s.combat.lootTray[0].granted, false);
  assert.equal(s.bank['pall-fang'], undefined);
});

test('v5 hydrate unions lootTray without a SAVE_VERSION bump', () => {
  const json = JSON.stringify({
    version: 5,
    savedAt: 1,
    state: {
      lumen: 22,
      combat: {
        fighting: false,
        lastStation: {
          enemyId: 'pale-moth',
          enemyName: 'Pale Moth',
          ended: 'kill',
          souls: 1,
          loot: [{ kind: 'lumen', qty: 2, name: 'Lumen' }],
        },
      },
    },
  });
  const { state } = deserializeSave(json);
  assert.equal(JSON.parse(serializeSave(state, 1)).version, 5);
  assert.ok(Array.isArray(state.combat.lootTray));
  assert.ok(state.combat.lootTray.some((e) => e.kind === 'soul' && e.qty === 1));
  assert.ok(state.combat.lootTray.some((e) => e.kind === 'lumen' && e.qty === 2));
  assert.equal(state.combat.lastStation?.enemyId, 'pale-moth');
});

test('v5 hydrate keeps pending tray loot ungranted across reload', () => {
  const s = createState({ rngSeed: 4 });
  const snap = walletSnap(s);
  assert.ok(killPaleMoth(s, 1));
  const pile = (s.combat.lootTray ?? []).map((e) => ({ ...e }));
  assert.ok(pile.every((e) => e.granted === false));
  assertWalletUnchanged(s, snap);

  const json = serializeSave(s, 99);
  assert.equal(JSON.parse(json).version, 5);
  const { state } = deserializeSave(json);
  assert.equal(JSON.parse(serializeSave(state, 1)).version, 5);
  assert.ok(state.combat.lootTray.every((e) => e.granted === false));
  assert.equal(traySum(state.combat.lootTray, 'lumen'), traySum(pile, 'lumen'));
  assert.equal(traySum(state.combat.lootTray, 'soul'), traySum(pile, 'soul'));
  assertWalletUnchanged(state, snap);

  const res = combat.takeAllLootTray(state);
  assert.ok(res.granted.length >= 1);
  assert.deepEqual(state.combat.lootTray, []);
  assertWalletMatchesPile(state, snap, pile);
});

test('v5 hydrate of an explicit pending tray does not bank until Take all', () => {
  const json = JSON.stringify({
    version: 5,
    savedAt: 1,
    state: {
      lumen: 20,
      souls: 0,
      bank: { tinderscrap: 30 },
      combat: {
        fighting: false,
        lootTray: [
          { kind: 'soul', qty: 1, granted: false },
          { kind: 'lumen', qty: 2, name: 'Lumen', granted: false },
        ],
        lastStation: {
          enemyId: 'pale-moth',
          enemyName: 'Pale Moth',
          ended: 'kill',
          souls: 1,
          lootGranted: false,
          loot: [{ kind: 'lumen', qty: 2, name: 'Lumen', granted: false }],
        },
      },
    },
  });
  const { state } = deserializeSave(json);
  assert.equal(JSON.parse(serializeSave(state, 1)).version, 5);
  assert.equal(state.lumen, 20);
  assert.equal(state.souls, 0);
  assert.ok(state.combat.lootTray.every((e) => e.granted === false));
  combat.takeAllLootTray(state);
  assert.equal(state.lumen, 22);
  assert.equal(state.souls, 1);
  assert.deepEqual(state.combat.lootTray, []);
});
