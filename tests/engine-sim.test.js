// Integration: the whole engine wired together — tick loop cadence feeding
// the action runner feeding state, across a save/load boundary, with RNG
// continuity. This is the charter determinism rule ("same seed + same
// actions = same results") proven end-to-end.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { TICK_MS } from '../src/core/tick-loop.js';
import { createState } from '../src/game/state.js';
import { startAction, tickActions } from '../src/game/systems/action-runner.js';
import { serializeSave, deserializeSave } from '../src/core/save.js';

function drive(state, rng, ms) {
  const steps = Math.floor(ms / TICK_MS);
  let cycles = 0;
  for (let i = 0; i < steps; i++) {
    cycles += tickActions(state, TICK_MS, rng).filter((e) => e.type === 'cycle').length;
  }
  return cycles;
}

test('save boundary does not disturb determinism: split run == continuous run', () => {
  function makeRun() {
    return createState({ nowMs: 1000, rngSeed: 777 });
  }

  // Run A: 60s continuous herb gathering.
  const a = makeRun();
  startAction(a, 'gather-herbs');
  const rngA = createRng(a.rngState);
  const cyclesA = drive(a, rngA, 60_000);
  a.rngState = rngA.getState(); // the app syncs RNG state before every save

  // Run B: same seed, but serialize → deserialize after 25s and continue.
  const b = makeRun();
  startAction(b, 'gather-herbs');
  const rngB = createRng(b.rngState);
  const cyclesB1 = drive(b, rngB, 25_000);
  b.rngState = rngB.getState(); // persist RNG continuity (app does this on save)

  const json = serializeSave(b, 26_000);
  const { state: restored } = deserializeSave(json);
  const rngB2 = createRng(restored.rngState);
  const cyclesB2 = drive(restored, rngB2, 35_000);
  restored.rngState = rngB2.getState(); // sync like the app does before saving

  assert.equal(cyclesA, 12);          // 60s / 5s
  assert.equal(cyclesB1 + cyclesB2, cyclesA, 'cycle counts agree across the save boundary');
  assert.deepEqual(restored, a, 'split-across-save run must equal the continuous run');
});

test('invariant audit over a long mixed session (two skills, full loop)', () => {
  const s = createState({ nowMs: 0, rngSeed: 31337 });
  startAction(s, 'tend-flame');
  startAction(s, 'gather-herbs');
  const rng = createRng(s.rngState);

  let cycles = 0;
  for (let i = 0; i < 3000; i++) { // 5 minutes of game time
    cycles += tickActions(s, TICK_MS, rng).filter((e) => e.type === 'cycle').length;
    s.stats.playtimeMs += TICK_MS;
  }

  assert.equal(s.stats.playtimeMs, 300_000);
  // Tend-the-flame gets 75 cycle windows in 300s but only 30 tinder → halts at 30.
  assert.equal(s.actions.completed['tend-flame'], 30);
  assert.equal(s.actions.completed['gather-herbs'], 60); // 300s / 5s
  assert.equal(cycles, 90, 'total completions = both skills combined');
  // Flame/lumen reflect ONLY affordable cycles.
  assert.equal(s.flame, 2 * 30);
  assert.equal(s.lumen, 20 + 30);
  // Mastery starts at level 1 (+1%); through 30 cycles the bonus never rounds
  // tend-flame's 14 base XP up (×1.02–×1.03 still round to 14).
  assert.equal(s.skills.emberkeeping.xp, Math.round(14 * 1.01) * 30);
  // Foraging never blocked: xp compounds above base rate as mastery climbs.
  assert.ok(s.skills.foraging.xp > 60 * 16, 'mastery bonus compounds above base rate');
  assert.ok(s.bank.fogwort >= 60 && s.bank.fogwort <= 120, 'ranged yields stay in bounds');
});

test('fresh state has no active actions and survives JSON round-trip untouched', () => {
  const s = createState({ nowMs: 42, rngSeed: 8 });
  const json = serializeSave(s, 43);
  const { state: back } = deserializeSave(json);
  assert.deepEqual(back, s);
});
