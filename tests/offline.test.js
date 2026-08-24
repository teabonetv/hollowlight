import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/game/state.js';
import { ACTIONS_BY_ID } from '../src/game/data/actions.js';
import { xpForLevel, levelFromXp } from '../src/core/xp.js';
import {
  computeOfflineProgress, OFFLINE_CAP_HOURS, OFFLINE_MIN_AWAY_MS,
} from '../src/core/offline.js';

const H = 3_600_000;

function stateTending(tinderCount = 10_000) {
  const s = createState({ nowMs: 0, rngSeed: 1 });
  s.bank.tinderscrap = tinderCount;
  s.actions.active['tend-flame'] = { progressMs: 0 };
  return s;
}

test('short absences below the minimum produce no gains and no modal bait', () => {
  const res = computeOfflineProgress({
    state: stateTending(), nowMs: OFFLINE_MIN_AWAY_MS - 1, lastSavedAt: 0,
    actionsById: ACTIONS_BY_ID,
  });
  assert.equal(res.hasGains, false);
});

test('analytic match: 1h away tending the flame with ample tinder', () => {
  const s = stateTending(10_000);
  const res = computeOfflineProgress({
    state: s, nowMs: 2 * H, lastSavedAt: H, actionsById: ACTIONS_BY_ID,
  });
  // credited exactly 1h; tend-flame is 4s/cycle → 900 completions
  assert.equal(res.creditedMs, H);
  assert.equal(res.capped, false);
  const line = res.gains.actions.find((a) => a.actionId === 'tend-flame');
  assert.equal(line.completions, 900);
  assert.equal(res.gains.flame, 1800, 'flame units: 2 × 900');
  assert.equal(res.gains.lumen, 900, 'lumen drip: 1 × 900');
  assert.equal(res.nextState.lumen, 900 + 20, 'starter lumen preserved plus drip');
  assert.equal(res.nextState.bank.tinderscrap, 10_000 - 900);
  // Per-cycle rounding identical to live play: mastery starts at level 1 → ×1.01
  assert.equal(res.gains.xp.emberkeeping, Math.round(14 * 1.01) * 900);
});

test('offline respects materials: stops when the bank cannot pay', () => {
  const s = stateTending(30);
  const res = computeOfflineProgress({
    state: s, nowMs: 12 * H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  const line = res.gains.actions.find((a) => a.actionId === 'tend-flame');
  assert.equal(line.completions, 30, 'only 30 cycles affordable');
  assert.ok(!(res.nextState.bank.tinderscrap < 0));
});

test('offline respects the explicit cap and flags it honestly', () => {
  const s = stateTending(1_000_000);
  const res = computeOfflineProgress({
    state: s, nowMs: 48 * H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  assert.equal(res.awayMs, 48 * H);
  assert.equal(res.creditedMs, OFFLINE_CAP_HOURS * H, 'credited time trimmed to cap');
  assert.equal(res.capped, true);
  // 12h at 4s/cycle = 10,800 completions — but only 1M tinder available, fine.
  assert.equal(res.gains.flame, 21_600);
});

test('actions with auto-restart disabled do not idle', () => {
  const s = stateTending();
  s.actions.autoRestart['tend-flame'] = false;
  const res = computeOfflineProgress({
    state: s, nowMs: 5 * H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  assert.equal(res.hasGains, false);
});

test('multiple concurrent actions each contribute', () => {
  const s = stateTending(10_000);
  s.actions.active['gather-herbs'] = { progressMs: 0 };
  const res = computeOfflineProgress({
    state: s, nowMs: H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  const herbs = res.gains.actions.find((a) => a.actionId === 'gather-herbs');
  assert.equal(herbs.completions, 720); // 3600s / 5s
  const fogwort = res.gains.items.find((i) => i.id === 'fogwort');
  assert.equal(fogwort.qty, Math.floor((1 + 2) / 2 * 720), 'expected-value yield');
  assert.equal(res.gains.flame, 1800);
});

test('level-ups during offline are detected for celebration on load', () => {
  const s = stateTending(100_000);
  s.skills.foraging.level = 4;
  s.skills.foraging.xp = xpForLevel(4); // exactly at the level-4 threshold
  s.actions.active['gather-herbs'] = { progressMs: 0 };
  const res = computeOfflineProgress({
    state: s, nowMs: H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  assert.ok(
    res.levelUps.some((l) => l.skillId === 'foraging' && l.level >= 5),
    `expected foraging ≥5 in ${JSON.stringify(res.levelUps)}`,
  );
});

test('nextState is an independent copy (claim-or-dismiss is safe)', () => {
  const s = stateTending(500);
  const before = structuredClone(s);
  const res = computeOfflineProgress({
    state: s, nowMs: 3 * H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  assert.deepEqual(s, before, 'input state untouched');
  assert.notEqual(res.nextState, s);
});

// ── D1 regression: offline progress must ASSIGN earned skill levels ──────
test('D1: nextState skill levels match their XP after offline play', () => {
  const s = stateTending(100_000);
  s.skills.foraging.level = 4;
  s.skills.foraging.xp = xpForLevel(4);
  s.actions.active['gather-herbs'] = { progressMs: 0 };
  s.actions.active['tend-flame'] = { progressMs: 0 };
  const res = computeOfflineProgress({
    state: s, nowMs: H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  for (const [id, sk] of Object.entries(res.nextState.skills)) {
    assert.equal(
      sk.level, levelFromXp(sk.xp),
      `${id}: save level ${sk.level} disagrees with XP-derived ${levelFromXp(sk.xp)}`,
    );
  }
  // The reported bug: startAction gated on a stale level. Simulate the gate.
  assert.ok(res.nextState.skills.foraging.level >= 5, 'foraging level assigned ≥5');
});

test('D1: levelUps entries equal the actual level delta', () => {
  const s = stateTending(100_000);
  s.skills.foraging.level = 4;
  s.skills.foraging.xp = xpForLevel(4);
  s.actions.active['gather-herbs'] = { progressMs: 0 };
  const res = computeOfflineProgress({
    state: s, nowMs: H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  const next = res.nextState;
  for (const lu of res.levelUps) {
    const before = s.skills[lu.skillId].level;
    const after = next.skills[lu.skillId].level;
    assert.equal(lu.level - before, after - before,
      `reported level for ${lu.skillId} equals the real delta`);
    assert.equal(after, levelFromXp(next.skills[lu.skillId].xp));
  }
  assert.ok(res.levelUps.length > 0, 'this scenario must produce level-ups');
});

// ── D2 regression: tinderscrap income exists — no economy dead end ───────
test('D2: gather-herbs yields tinderscrap (expected value) offline', () => {
  const s = createState({ nowMs: 0, rngSeed: 1 });
  s.actions.active['gather-herbs'] = { progressMs: 0 };
  const res = computeOfflineProgress({
    state: s, nowMs: H, lastSavedAt: 0, actionsById: ACTIONS_BY_ID,
  });
  // 720 completions × 30% × 1 tinder = 216 expected
  assert.equal(res.gains.items.find((i) => i.id === 'tinderscrap')?.qty, 216);
});

test('D2: emberkeeping is not a dead end — tinder income outpaces its costs', () => {
  // Data-level guard: some no-cost action must produce the fuel emberkeeping
  // burns, or the skill caps at the starter bank forever.
  const freeActions = Object.values(ACTIONS_BY_ID).filter(
    (a) => (a.costs ?? []).length === 0,
  );
  const producesTinder = freeActions.some((a) =>
    (a.outputs ?? []).some((o) => o.kind === 'item' && o.id === 'tinderscrap'));
  assert.ok(producesTinder, 'a free action must produce tinderscrap');

  // Arithmetic guard at the worst conversion (Tend: 14 XP per tinder):
  // herbs yield 0.3 tinder / 5s cycle; reaching level 10 needs xpForLevel(10)
  // XP minus what the starter bank funds — finite and reachable, not capped
  // by a lifetime supply.
  const tinderPerHour = 0.3 * (3_600_000 / 5000); // 216/h
  const xpPerTinder = ACTIONS_BY_ID['tend-flame'].xp;
  const starterFundedXp = 30 * xpPerTinder;
  const hoursToEk10 =
    (xpForLevel(10) - starterFundedXp) / (tinderPerHour * xpPerTinder);
  assert.ok(Number.isFinite(hoursToEk10) && hoursToEk10 < 24,
    `Ek 10 reachable in ~${hoursToEk10.toFixed(1)}h of herb gathering`);
});
