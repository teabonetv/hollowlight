// Combat engine — generic over src/game/data/enemies/** and combat/*.
// Real-time: player and foe act on independent timers. All rolls go through
// the encounter RNG (seeded per fight). Mutates only the passed state.

import { createRng, hashSeed } from '../../core/rng.js';
import { levelFromXp } from '../../core/xp.js';
import { ENEMIES_BY_ID, enemiesInZone, bossOfZone } from '../data/enemies/index.js';
import { ZONE_BY_ID, KINDLED_BEACON_IDS } from '../data/combat/zones.js';
import { hitChance, styleMultiplier, STYLE_BY_ID } from '../data/combat/styles.js';
import { UNARMED, WEAPON_BY_ID } from '../data/combat/weapons.js';
import {
  FOOD, FOOD_ORDER, OILS, OIL_ORDER, OIL_CHECK_MS, FOG_BITE_MS,
  FOG_BITE_DMG, FOG_HIT_MULT, AUTO_EAT_DEFAULT_THRESHOLD, AUTO_BREW_DEFAULT_THRESHOLD,
} from '../data/combat/consumables.js';
import { VIGIL_TIERS, VIGIL_TIER_BY_N, VIGIL_CATEGORIES, VIGIL_CATEGORY_BY_ID } from '../data/combat/vigils.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { masteryXpMultiplier } from './action-runner.js';
import * as bank from './bank.js';
import * as camp from './upgrades.js';
import { recordKill, recordDeath } from './stats.js';

export const COMBAT_LOG_CAP = 48;
export const BASE_MAX_HP = 36;
export const HP_PER_LEVEL = 4;

export function createCombatState() {
  return {
    fighting: false,
    zoneId: 'hearthway',
    enemyId: null,
    encounterSeed: 0,
    rngState: 0,
    player: { hp: BASE_MAX_HP, nextActMs: 0, style: 'strike' },
    foe: null,
    oilMs: OIL_CHECK_MS,
    fogMs: FOG_BITE_MS,
    lanternDry: false,
    autoContinue: true,
    autoEat: { unlocked: false, enabled: false, threshold: AUTO_EAT_DEFAULT_THRESHOLD },
    autoBrew: { unlocked: false, enabled: false, threshold: AUTO_BREW_DEFAULT_THRESHOLD },
    log: [],
    deathSite: null, // { zoneId, lumen }
    vigils: { current: null, completed: 0, nextTier: 1 },
    kills: {},
    stretchKills: {}, // zoneId -> non-boss kills (guardian stir)
  };
}

export function ensureCombat(state) {
  if (!state.combat) state.combat = createCombatState();
  if (state.souls == null) state.souls = 0;
  if (!state.beacons) state.beacons = { kindled: [...KINDLED_BEACON_IDS] };
  if (!state.beacons.kindled) state.beacons.kindled = [...KINDLED_BEACON_IDS];
  const c = state.combat;
  if (!c.player) c.player = { hp: playerMaxHp(state), nextActMs: 0, style: 'strike' };
  if (!c.kills) c.kills = {};
  if (!c.stretchKills) c.stretchKills = {};
  if (!c.vigils) c.vigils = { current: null, completed: 0, nextTier: 1 };
  if (!c.log) c.log = [];
  if (c.autoEat && c.autoEat.unlocked == null) c.autoEat.unlocked = false;
  if (c.autoBrew && c.autoBrew.unlocked == null) c.autoBrew.unlocked = false;
  return c;
}

export function kindledBeacons(state) {
  ensureCombat(state);
  return state.beacons.kindled;
}

export function isBeaconKindled(state, beaconId) {
  return kindledBeacons(state).includes(beaconId);
}

export function zoneUnlock(state, zoneId) {
  const zone = ZONE_BY_ID[zoneId];
  if (!zone) return { ok: false, reason: 'Unknown stretch.' };
  const level = state.skills.combat?.level ?? 1;
  const kindled = isBeaconKindled(state, zone.beaconId);
  const levelOk = level >= zone.levelReq;
  if (kindled && levelOk) return { ok: true, zone };
  const parts = [];
  if (!levelOk) parts.push(`Combat level ${zone.levelReq}`);
  if (!kindled) parts.push(zone.lockCopy ?? 'unkindled beacon');
  return { ok: false, reason: parts.join(' · '), zone, kindled, levelOk };
}

export function playerMaxHp(state) {
  const lv = state.skills.combat?.level ?? 1;
  return BASE_MAX_HP + HP_PER_LEVEL * lv;
}

export function equippedWeapon(state, style) {
  ensureCombat(state);
  const id = state.combat.equipment?.[style];
  const w = id ? WEAPON_BY_ID[id] : null;
  if (w && w.style === style && bank.bankCount(state.bank, id) > 0) return w;
  // Auto-equip first owned weapon that matches the style.
  for (const cand of Object.values(WEAPON_BY_ID)) {
    if (cand.style === style && bank.bankCount(state.bank, cand.id) > 0) return cand;
  }
  return { id: 'unarmed', style, ...UNARMED[style] };
}

export function playerOffense(state, style) {
  const lv = state.skills.combat?.level ?? 1;
  const w = equippedWeapon(state, style);
  return {
    weapon: w,
    minDmg: w.minDmg,
    maxDmg: w.maxDmg,
    speedMs: w.speedMs,
    accuracy: 8 + 2 * lv + (w.accuracy ?? 0),
    avoidance: Math.round(7 + 1.5 * lv),
  };
}

export function pushCombatLog(state, text, kind = 'info') {
  const c = ensureCombat(state);
  c.log.push({ t: state.stats.playtimeMs, text, kind });
  if (c.log.length > COMBAT_LOG_CAP) c.log.splice(0, c.log.length - COMBAT_LOG_CAP);
}

function encounterRng(state) {
  const c = state.combat;
  const rng = createRng(c.rngState || c.encounterSeed || 1);
  return rng;
}

function commitRng(state, rng) {
  state.combat.rngState = rng.getState();
}

export function rollLootTable(table, rng) {
  const drops = [];
  for (const row of table ?? []) {
    if (row.chance !== undefined && !rng.chance(row.chance)) continue;
    const qty = row.min !== undefined
      ? rng.range(row.min, row.max)
      : (row.qty ?? 1);
    if (qty <= 0) continue;
    drops.push({ kind: row.kind, id: row.id, qty });
  }
  return drops;
}

export function applyCombatDrops(state, drops) {
  const applied = [];
  for (const d of drops) {
    if (d.kind === 'lumen') {
      state.lumen += d.qty;
      applied.push({ kind: 'lumen', qty: d.qty, name: 'Lumen' });
    } else if (d.kind === 'item') {
      bank.bankAdd(state.bank, d.id, d.qty);
      applied.push({ kind: 'item', id: d.id, qty: d.qty, name: ITEMS_BY_ID[d.id]?.name ?? d.id });
    }
  }
  return applied;
}

export function grantCombatXp(state, baseXp) {
  const skill = state.skills.combat;
  const actionKey = state.combat.enemyId ?? 'combat';
  if (!skill.mastery[actionKey]) skill.mastery[actionKey] = { xp: 0, level: 1 };
  const mastery = skill.mastery[actionKey];
  const before = skill.level;
  const xp = Math.round(baseXp * masteryXpMultiplier(mastery.level) * camp.xpMultiplier(state));
  skill.xp += xp;
  mastery.xp += Math.max(1, Math.round(baseXp * 0.7));
  mastery.level = levelFromXp(mastery.xp);
  const newLevel = levelFromXp(skill.xp);
  const events = [];
  if (newLevel > before) {
    skill.level = newLevel;
    events.push({ type: 'levelup', skillId: 'combat', level: newLevel });
    // HP rises with level; fill the new heart.
    const c = state.combat;
    const max = playerMaxHp(state);
    c.player.hp = Math.min(max, c.player.hp + HP_PER_LEVEL * (newLevel - before));
  }
  return { xp, events };
}

export function activePhase(enemy, hp, maxHp) {
  if (!enemy.boss || !enemy.phases?.length) {
    return { index: 0, phase: { atHpFrac: 1, name: null, telegraph: null, dmgMult: 1, accMult: 1, speedMult: 1 } };
  }
  const frac = maxHp > 0 ? hp / maxHp : 0;
  let index = 0;
  for (let i = 0; i < enemy.phases.length; i++) {
    if (frac <= enemy.phases[i].atHpFrac + 1e-9) index = i;
  }
  return { index, phase: enemy.phases[index] };
}

export function foeSpeedMs(enemy, phase) {
  const m = phase?.speedMult ?? 1;
  return Math.max(400, Math.round(enemy.speedMs * m));
}

function resolveAttack(state, rng, { attacker, defenderHpKey, defenderMax, accuracy, avoidance, minDmg, maxDmg, style, weakness, resist, label, verb }) {
  const c = state.combat;
  let chance = hitChance(accuracy, avoidance);
  if (attacker === 'player' && c.lanternDry) chance *= FOG_HIT_MULT;
  const hit = rng.next() < chance;
  if (!hit) {
    pushCombatLog(state, `${label === 'You' ? 'You miss.' : `${label} misses.`}`, 'miss');
    return { hit: false, dmg: 0, killed: false };
  }
  const mult = styleMultiplier(style, weakness, resist);
  const dmg = Math.max(1, Math.round(rng.range(minDmg, maxDmg) * mult));
  if (defenderHpKey === 'foe') {
    c.foe.hp = Math.max(0, c.foe.hp - dmg);
    const weakNote = mult > 1 ? ' (true-line)' : mult < 1 ? ' (resisted)' : '';
    pushCombatLog(state, `${label} ${verb} for ${dmg}${weakNote}.`, 'hit');
    return { hit: true, dmg, killed: c.foe.hp <= 0 };
  }
  c.player.hp = Math.max(0, c.player.hp - dmg);
  pushCombatLog(state, `${label} ${verb} for ${dmg}.`, 'hurt');
  return { hit: true, dmg, killed: c.player.hp <= 0 };
}

function playerAct(state, rng) {
  const c = state.combat;
  const enemy = ENEMIES_BY_ID[c.foe.id];
  const off = playerOffense(state, c.player.style);
  const phase = activePhase(enemy, c.foe.hp, c.foe.maxHp).phase;
  const foeAvo = Math.round(enemy.avoidance * (phase.accMult ? 1 : 1)); // avoidance unscaled
  const style = STYLE_BY_ID[c.player.style];
  return resolveAttack(state, rng, {
    attacker: 'player',
    defenderHpKey: 'foe',
    accuracy: off.accuracy,
    avoidance: foeAvo,
    minDmg: off.minDmg,
    maxDmg: off.maxDmg,
    style: c.player.style,
    weakness: enemy.weakness,
    resist: enemy.resist,
    label: 'You',
    verb: style?.youVerb ?? 'strike',
  });
}

function foeAct(state, rng) {
  const c = state.combat;
  const enemy = ENEMIES_BY_ID[c.foe.id];
  const { phase } = activePhase(enemy, c.foe.hp, c.foe.maxHp);
  const off = playerOffense(state, c.player.style);
  const acc = Math.round(enemy.accuracy * (phase.accMult ?? 1));
  const min = Math.max(1, Math.round(enemy.minDmg * (phase.dmgMult ?? 1)));
  const max = Math.max(min, Math.round(enemy.maxDmg * (phase.dmgMult ?? 1)));
  const style = STYLE_BY_ID[enemy.style];
  return resolveAttack(state, rng, {
    attacker: 'foe',
    defenderHpKey: 'player',
    accuracy: acc,
    avoidance: off.avoidance,
    minDmg: min,
    maxDmg: max,
    style: enemy.style,
    weakness: null,
    resist: null,
    label: enemy.name,
    verb: style?.verb ?? 'strikes',
  });
}

function maybePhaseShift(state, prevIndex) {
  const c = state.combat;
  const enemy = ENEMIES_BY_ID[c.foe.id];
  const { index, phase } = activePhase(enemy, c.foe.hp, c.foe.maxHp);
  if (index !== prevIndex) {
    c.foe.phaseIndex = index;
    if (phase.telegraph) pushCombatLog(state, phase.telegraph, 'telegraph');
    else if (phase.name) pushCombatLog(state, `${enemy.name} enters ${phase.name}.`, 'telegraph');
    c.foe.nextActMs = Math.min(c.foe.nextActMs, foeSpeedMs(enemy, phase));
  }
}

export function guardianStirred(state, zoneId) {
  const boss = bossOfZone(zoneId);
  if (!boss) return false;
  const kills = ensureCombat(state).stretchKills[zoneId] ?? 0;
  return kills >= (boss.stirKills ?? 5);
}

export function startFight(state, enemyId, { encounterSeed } = {}) {
  ensureCombat(state);
  const enemy = ENEMIES_BY_ID[enemyId];
  if (!enemy) return { ok: false, error: 'Unknown foe.' };
  const unlock = zoneUnlock(state, enemy.zoneId);
  if (!unlock.ok) return { ok: false, error: unlock.reason };
  if (enemy.boss && !guardianStirred(state, enemy.zoneId)) {
    return { ok: false, error: `${enemy.name} will not face a stranger — fell ${enemy.stirKills} on this stretch first.` };
  }
  if (state.combat.fighting) return { ok: false, error: 'Already in a fight.' };

  const seed = encounterSeed ?? hashSeed(
    `${state.stats.playtimeMs}|${enemyId}|${state.combat.kills[enemyId] ?? 0}|${state.rngState}`,
  );
  const off = playerOffense(state, state.combat.player.style);
  const maxHp = playerMaxHp(state);
  if (state.combat.player.hp <= 0) state.combat.player.hp = maxHp;
  state.combat.player.hp = Math.min(state.combat.player.hp, maxHp);

  state.combat.fighting = true;
  state.combat.zoneId = enemy.zoneId;
  state.combat.enemyId = enemyId;
  state.combat.encounterSeed = seed >>> 0;
  state.combat.rngState = seed >>> 0;
  state.combat.lanternDry = false;
  state.combat.oilMs = OIL_CHECK_MS;
  state.combat.fogMs = FOG_BITE_MS;
  state.combat.player.nextActMs = off.speedMs;
  const phase0 = activePhase(enemy, enemy.hp, enemy.hp).phase;
  state.combat.foe = {
    id: enemy.id,
    name: enemy.name,
    hp: enemy.hp,
    maxHp: enemy.hp,
    nextActMs: foeSpeedMs(enemy, phase0),
    phaseIndex: 0,
  };
  pushCombatLog(state, `You meet ${enemy.name} on ${ZONE_BY_ID[enemy.zoneId]?.stretch ?? 'the road'}.`, 'start');
  return { ok: true, seed: state.combat.encounterSeed };
}

export function fleeFight(state) {
  ensureCombat(state);
  if (!state.combat.fighting) return { ok: false, error: 'No fight to leave.' };
  const name = state.combat.foe?.name ?? 'the dark';
  pushCombatLog(state, `You fall back from ${name} to the lantern-light.`, 'flee');
  state.combat.fighting = false;
  state.combat.foe = null;
  state.combat.enemyId = null;
  return { ok: true };
}

function consumeOilSip(state) {
  for (const id of OIL_ORDER) {
    if (bank.bankCount(state.bank, id) > 0) {
      bank.bankPay(state.bank, [{ id, qty: 1 }]);
      state.combat.lanternDry = false;
      const interval = OILS[id].intervalMs;
      pushCombatLog(state, `The lantern drinks ${OILS[id].name}.`, 'oil');
      return interval;
    }
  }
  state.combat.lanternDry = true;
  return OIL_CHECK_MS;
}

export function eatFood(state, itemId) {
  ensureCombat(state);
  const food = FOOD[itemId];
  if (!food) return { ok: false, error: 'That will not feed a fight.' };
  if (bank.bankCount(state.bank, itemId) <= 0) return { ok: false, error: `No ${food.name} left.` };
  const max = playerMaxHp(state);
  if (state.combat.player.hp >= max) return { ok: false, error: 'Already whole.' };
  bank.bankPay(state.bank, [{ id: itemId, qty: 1 }]);
  const before = state.combat.player.hp;
  state.combat.player.hp = Math.min(max, before + food.heal);
  const healed = state.combat.player.hp - before;
  pushCombatLog(state, `You eat ${food.name} (+${healed} vitality).`, 'eat');
  return { ok: true, healed };
}

function tryAutoEat(state) {
  const c = state.combat;
  if (!c.autoEat?.unlocked || !c.autoEat.enabled) return;
  const max = playerMaxHp(state);
  if (c.player.hp / max > (c.autoEat.threshold ?? AUTO_EAT_DEFAULT_THRESHOLD)) return;
  for (const id of FOOD_ORDER) {
    if (eatFood(state, id).ok) return;
  }
}

function tryAutoBrew(state) {
  const c = state.combat;
  if (!c.autoBrew?.unlocked || !c.autoBrew.enabled) return;
  if (!c.lanternDry) return;
  consumeOilSip(state);
}

export function setStyle(state, styleId) {
  ensureCombat(state);
  if (!STYLE_BY_ID[styleId]) return { ok: false, error: 'Unknown style.' };
  state.combat.player.style = styleId;
  const off = playerOffense(state, styleId);
  if (state.combat.fighting) {
    state.combat.player.nextActMs = Math.min(state.combat.player.nextActMs, off.speedMs);
    pushCombatLog(state, `You shift to ${STYLE_BY_ID[styleId].name}.`, 'style');
  }
  return { ok: true };
}

function onKill(state, rng) {
  const c = state.combat;
  const enemy = ENEMIES_BY_ID[c.foe.id];
  c.kills[enemy.id] = (c.kills[enemy.id] ?? 0) + 1;
  if (!enemy.boss) c.stretchKills[enemy.zoneId] = (c.stretchKills[enemy.zoneId] ?? 0) + 1;
  recordKill(state, { boss: !!enemy.boss });

  const drops = rollLootTable(enemy.loot, rng);
  const applied = applyCombatDrops(state, drops);
  state.souls += enemy.souls;
  const { xp, events } = grantCombatXp(state, enemy.xp);
  const dropText = applied.length
    ? applied.map((d) => (d.kind === 'lumen' ? `✦${d.qty}` : `${d.name} ×${d.qty}`)).join(', ')
    : 'nothing but quiet';
  pushCombatLog(state, `${enemy.name} falls. +${xp} Combat XP, ${enemy.souls} souls. Loot: ${dropText}.`, 'kill');

  const vigilEvents = progressVigil(state, enemy);

  const repeatId = enemy.id;
  const auto = c.autoContinue && !enemy.boss;
  c.fighting = false;
  c.foe = null;
  c.enemyId = null;

  const out = [
    { type: 'combat-kill', enemyId: enemy.id, xp, drops: applied, souls: enemy.souls },
    ...events,
    ...vigilEvents,
  ];

  if (auto) {
    const next = startFight(state, repeatId);
    if (next.ok) out.push({ type: 'combat-start', enemyId: repeatId });
    else pushCombatLog(state, 'The stretch goes still.', 'info');
  } else if (enemy.boss) {
    pushCombatLog(state, `${enemy.name} is quiet. The stretch remembers.`, 'info');
  }
  return out;
}

function onDeath(state) {
  const c = state.combat;
  const zoneId = c.zoneId;
  const carried = Math.max(0, state.lumen);
  if (c.deathSite && c.deathSite.zoneId !== zoneId) {
    c.unrecovered = c.unrecovered ?? [];
    c.unrecovered.push(c.deathSite);
    c.deathSite = { zoneId, lumen: carried };
  } else if (c.deathSite && c.deathSite.zoneId === zoneId) {
    c.deathSite.lumen += carried;
  } else {
    c.deathSite = { zoneId, lumen: carried };
  }
  state.lumen = 0;
  recordDeath(state);
  pushCombatLog(state, `You fall. ✦${carried} Lumen spills at ${ZONE_BY_ID[zoneId]?.settlement ?? zoneId}. Walk back to gather it.`, 'death');
  c.fighting = false;
  c.foe = null;
  c.enemyId = null;
  c.player.hp = playerMaxHp(state);
  c.player.nextActMs = 0;
  return [{ type: 'combat-death', zoneId, lumen: carried }];
}

export function recoverLumen(state, zoneId) {
  ensureCombat(state);
  const c = state.combat;
  const piles = [];
  if (c.deathSite?.zoneId === zoneId && c.deathSite.lumen > 0) piles.push('deathSite');
  const extra = (c.unrecovered ?? []).filter((p) => p.zoneId === zoneId);
  if (!piles.length && !extra.length) {
    return { ok: false, error: 'No spilled Lumen here.' };
  }
  let gained = 0;
  if (c.deathSite?.zoneId === zoneId) {
    gained += c.deathSite.lumen;
    c.deathSite = null;
  }
  if (c.unrecovered) {
    for (const p of extra) gained += p.lumen;
    c.unrecovered = c.unrecovered.filter((p) => p.zoneId !== zoneId);
  }
  state.lumen += gained;
  pushCombatLog(state, `You gather ✦${gained} spilled Lumen from the death-site.`, 'recover');
  return { ok: true, gained };
}

export function deathPileAt(state, zoneId) {
  ensureCombat(state);
  let n = 0;
  if (state.combat.deathSite?.zoneId === zoneId) n += state.combat.deathSite.lumen;
  for (const p of state.combat.unrecovered ?? []) if (p.zoneId === zoneId) n += p.lumen;
  return n;
}

export function assignVigil(state, { categoryId, seed } = {}) {
  ensureCombat(state);
  if (state.combat.vigils.current) return { ok: false, error: 'A Vigil is already sworn.' };
  const kindledZones = Object.values(ZONE_BY_ID)
    .filter((z) => isBeaconKindled(state, z.beaconId))
    .map((z) => z.id);
  const available = VIGIL_CATEGORIES.filter((cat) =>
    kindledZones.some((zid) =>
      enemiesInZone(zid, { bosses: false }).some((e) => e.category === cat.id)),
  );
  const pool = available.length ? available : VIGIL_CATEGORIES.filter((c) => c.id === 'pale');
  const rng = createRng(seed ?? hashSeed(`vigil|${state.stats.playtimeMs}|${state.combat.vigils.nextTier}`));
  const cat = categoryId
    ? (VIGIL_CATEGORY_BY_ID[categoryId] ?? pool[0])
    : rng.pick(pool);
  const tierN = state.combat.vigils.nextTier;
  const spec = VIGIL_TIER_BY_N[tierN] ?? VIGIL_TIERS[VIGIL_TIERS.length - 1];
  state.combat.vigils.current = {
    tier: spec.tier,
    category: cat.id,
    required: spec.kills,
    kills: 0,
  };
  return { ok: true, vigil: state.combat.vigils.current };
}

function progressVigil(state, enemy) {
  const v = state.combat.vigils.current;
  if (!v) return [];
  if (enemy.category !== v.category) return [];
  v.kills += 1;
  if (v.kills < v.required) return [];
  const spec = VIGIL_TIER_BY_N[v.tier] ?? VIGIL_TIERS[0];
  state.lumen += spec.lumen;
  state.souls += spec.souls;
  const { xp, events } = grantCombatXp(state, spec.xp);
  pushCombatLog(state, `Vigil complete — ${VIGIL_CATEGORY_BY_ID[v.category]?.name ?? v.category}. +✦${spec.lumen}, ${spec.souls} souls, ${xp} XP.`, 'vigil');
  state.combat.vigils.current = null;
  state.combat.vigils.completed += 1;
  state.combat.vigils.nextTier = Math.min(VIGIL_TIERS.length, v.tier + 1);
  return [{ type: 'vigil-complete', tier: v.tier, category: v.category, lumen: spec.lumen, souls: spec.souls, xp }, ...events];
}

function tickOilAndFog(state, step, rng) {
  const c = state.combat;
  c.oilMs -= step;
  if (c.oilMs <= 0) {
    const interval = consumeOilSip(state);
    c.oilMs += interval;
    tryAutoBrew(state);
  }
  if (c.lanternDry) {
    c.fogMs -= step;
    if (c.fogMs <= 0) {
      c.fogMs += FOG_BITE_MS;
      c.player.hp = Math.max(0, c.player.hp - FOG_BITE_DMG);
      pushCombatLog(state, `The dry lantern fails — fog bites for ${FOG_BITE_DMG}.`, 'fog');
      return c.player.hp <= 0;
    }
  } else {
    c.fogMs = FOG_BITE_MS;
  }
  return false;
}

/**
 * Advance an active fight by dtMs. Uses the encounter RNG stored on state.
 */
export function tickCombat(state, dtMs) {
  ensureCombat(state);
  const events = [];
  const c = state.combat;
  if (!c.fighting || !c.foe) return events;

  const rng = encounterRng(state);
  let remaining = dtMs;
  let guard = 0;
  while (remaining > 0 && c.fighting && c.foe && guard++ < 2000) {
    tryAutoEat(state);
    const enemy = ENEMIES_BY_ID[c.foe.id];
    const phase = activePhase(enemy, c.foe.hp, c.foe.maxHp).phase;
    const pSpeed = playerOffense(state, c.player.style).speedMs;
    const eSpeed = foeSpeedMs(enemy, phase);
    const step = Math.min(
      remaining,
      Math.max(0, c.player.nextActMs),
      Math.max(0, c.foe.nextActMs),
      Math.max(0, c.oilMs),
      c.lanternDry ? Math.max(0, c.fogMs) : remaining,
    );
    // If a timer is already 0, act immediately with a 0-ms step once.
    const actNow = c.player.nextActMs <= 0 || c.foe.nextActMs <= 0 || c.oilMs <= 0 || (c.lanternDry && c.fogMs <= 0);
    const slice = actNow && step === 0 ? 0 : (step > 0 ? step : remaining);

    if (!actNow && slice <= 0) {
      remaining = 0;
      break;
    }

    c.player.nextActMs -= slice;
    c.foe.nextActMs -= slice;
    remaining -= slice;

    if (tickOilAndFog(state, slice, rng)) {
      events.push(...onDeath(state));
      break;
    }
    if (!c.fighting) break;

    const prevPhase = c.foe.phaseIndex ?? 0;

    if (c.player.nextActMs <= 0) {
      const r = playerAct(state, rng);
      c.player.nextActMs += pSpeed;
      maybePhaseShift(state, prevPhase);
      if (r.killed) {
        events.push(...onKill(state, rng));
        break;
      }
    }
    if (!c.fighting || !c.foe) break;

    if (c.foe.nextActMs <= 0) {
      const r = foeAct(state, rng);
      const { phase: ph } = activePhase(ENEMIES_BY_ID[c.foe.id], c.foe.hp, c.foe.maxHp);
      c.foe.nextActMs += foeSpeedMs(ENEMIES_BY_ID[c.foe.id], ph);
      if (r.killed) {
        events.push(...onDeath(state));
        break;
      }
    }
  }

  commitRng(state, rng);
  return events;
}

export function combatStatus(state) {
  ensureCombat(state);
  const c = state.combat;
  const maxHp = playerMaxHp(state);
  const off = playerOffense(state, c.player.style);
  const enemy = c.foe ? ENEMIES_BY_ID[c.foe.id] : (c.enemyId ? ENEMIES_BY_ID[c.enemyId] : null);
  const phase = c.foe && enemy ? activePhase(enemy, c.foe.hp, c.foe.maxHp) : null;
  return {
    fighting: c.fighting,
    zoneId: c.zoneId,
    playerHp: c.player.hp,
    playerMaxHp: maxHp,
    style: c.player.style,
    playerNextMs: c.player.nextActMs,
    playerSpeedMs: off.speedMs,
    offense: off,
    foe: c.foe,
    enemy,
    phase,
    lanternDry: c.lanternDry,
    oilMs: c.oilMs,
    autoContinue: c.autoContinue,
    autoEat: c.autoEat,
    autoBrew: c.autoBrew,
    log: c.log,
    deathSite: c.deathSite,
    vigils: c.vigils,
    souls: state.souls ?? 0,
  };
}

/** Pure hit/damage helpers exported for tests (no state). */
export function rollHit(rng, chance) {
  return rng.next() < chance;
}

export function rollDamage(rng, minDmg, maxDmg, multiplier = 1) {
  return Math.max(1, Math.round(rng.range(minDmg, maxDmg) * multiplier));
}
