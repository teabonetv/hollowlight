import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { xpForLevel } from '../src/core/xp.js';
import { createState } from '../src/game/state.js';
import {
  rollOutputs, completeCycle, tickActions, startAction, stopAction,
  setAutoRestart, autoRestartEnabled, actionStatus,
} from '../src/game/systems/action-runner.js';

const TEND = 'tend-flame';
const HERBS = 'gather-herbs';
const FUNGI = 'gather-fungi';
const FAN = 'fan-the-coals';

function freshState() {
  return createState({ nowMs: 0, rngSeed: 1234 });
}

test('rollOutputs: fixed outputs are exact; chance gates resolve', () => {
  const action = { outputs: [{ kind: 'lumen', qty: 3 }, { kind: 'resource', id: 'flame', qty: 2 }] };
  const rng = createRng(1);
  const g = rollOutputs(action, rng);
  assert.deepEqual(g.map((x) => [x.kind, x.qty]), [['lumen', 3], ['resource', 2]]);
});

test('rollOutputs: ranged quantities stay within inclusive bounds over many rolls', () => {
  const action = { outputs: [{ kind: 'item', id: 'fogwort', min: 1, max: 2 }] };
  const seen = new Set();
  for (const seed of [1, 2, 3, 4, 5]) {
    const rng = createRng(seed);
    for (let i = 0; i < 200; i++) {
      const [g] = rollOutputs(action, rng);
      assert.ok(g.qty >= 1 && g.qty <= 2);
      seen.add(g.qty);
    }
  }
  assert.deepEqual([...seen].sort(), [1, 2], 'both bounds must be reachable');
});

test('completeCycle on Tend the Flame: exact reward math at mastery 0', () => {
  const s = freshState();
  const before = structuredClone(s);
  const action = { id: TEND, skill: 'emberkeeping', costs: [{ id: 'tinderscrap', qty: 1 }], outputs: [
    { kind: 'resource', id: 'flame', qty: 2 }, { kind: 'lumen', qty: 1 },
  ], xp: 14, masteryXp: 10 };

  const { events } = completeCycle(s, action, createRng(9));

  assert.equal(s.bank.tinderscrap, before.bank.tinderscrap - 1);
  assert.equal(s.flame, 2);
  assert.equal(s.lumen, before.lumen + 1);
  assert.equal(s.skills.emberkeeping.xp, 14);
  assert.equal(s.skills.emberkeeping.mastery[TEND].xp, 10);
  assert.equal(events.some((e) => e.type === 'cycle'), true);
});

test('mastery multiplier applies exactly: +1% XP per mastery level', () => {
  const s = freshState();
  s.skills.foraging.mastery[HERBS] = { xp: 5000, level: 20 };
  const action = { id: HERBS, skill: 'foraging', costs: [], outputs: [], xp: 100, masteryXp: 5 };
  completeCycle(s, action, createRng(2));
  // round(100 * (1 + 0.01*20)) = 120
  assert.equal(s.skills.foraging.xp, 120);
});

test('tickActions: cycles fire on schedule and accumulate completions', () => {
  const s = freshState();
  startAction(s, HERBS);
  let cycles = 0;
  // exactly 3 cycles in 15s (duration 5000ms)
  for (let i = 0; i < 150; i++) {
    cycles += tickActions(s, 100, createRng(50)).filter((e) => e.type === 'cycle').length;
  }
  assert.equal(cycles, 3);
  assert.equal(s.actions.completed[HERBS], 3);
});

test('auto-restart keeps cycling until the bank runs dry, then halts cleanly', () => {
  const s = freshState(); // 30 tinderscrap
  startAction(s, TEND);   // costs 1/cycle @4s → dry after 120s
  const events = [];
  for (let i = 0; i < 2000; i++) events.push(...tickActions(s, 100, createRng(7))); // 200s

  assert.equal(s.actions.active[TEND], undefined, 'action must stop when broke');
  assert.equal(s.actions.completed[TEND], 30, 'exactly as many cycles as affordable');
  assert.equal(s.bank.tinderscrap, undefined, 'bank drained to zero (key tidied)');
  assert.ok(s.flame === 60 && s.lumen === 50, 'rewards: flame 30×2, lumen 20+30');
  const halted = events.find((e) => e.type === 'halted');
  assert.ok(halted, 'a halted event surfaces for UI toasting');
  assert.match(halted.reason, /tinderscrap/i);
});

test('auto-restart OFF: one cycle then the action stops itself', () => {
  const s = freshState();
  setAutoRestart(s, HERBS, false);
  assert.equal(autoRestartEnabled(s, { id: HERBS }), false);
  startAction(s, HERBS);
  let cycles = 0;
  for (let i = 0; i < 200; i++) cycles += tickActions(s, 100, createRng(3)).filter((e) => e.type === 'cycle').length;
  assert.equal(cycles, 1);
  assert.equal(s.actions.active[HERBS], undefined);
});

test('startAction validates level locks', () => {
  const s = freshState();
  const res = startAction(s, FUNGI); // requires Foraging 5; we are level 1
  assert.equal(res.ok, false);
  assert.match(res.error, /level/i);
  assert.equal(s.actions.active[FUNGI], undefined, 'locked action must not start');
});

test('startAction validates affordability of the first cycle', () => {
  const s = freshState();
  delete s.bank.tinderscrap;
  const res = startAction(s, TEND);
  assert.equal(res.ok, false);
  assert.match(res.error, /materials/i);
});

test('starting an unknown action id fails gracefully', () => {
  const s = freshState();
  assert.equal(startAction(s, 'not-real').ok, false);
});

test('starting another action in the same skill replaces the current one', () => {
  const s = freshState();
  s.skills.foraging.level = 6;
  startAction(s, HERBS);
  tickActions(s, 2000, createRng(1)); // partial progress on herbs
  const res = startAction(s, FUNGI);
  assert.equal(res.ok, true);
  assert.equal(s.actions.active[HERBS], undefined);
  assert.equal(s.actions.active[FUNGI].progressMs, 0);
  // different skills coexist:
  startAction(s, TEND);
  assert.ok(s.actions.active[FUNGI] && s.actions.active[TEND]);
});

test('stopAction clears progress for one skill-action or everything', () => {
  const s = freshState();
  startAction(s, TEND);
  startAction(s, HERBS);
  tickActions(s, 1200, createRng(1));
  stopAction(s, HERBS);
  assert.equal(s.actions.active[HERBS], undefined);
  assert.ok(s.actions.active[TEND]);
  stopAction(s);
  assert.deepEqual(s.actions.active, {});
});

test('actionStatus reports lock/affordability/progress for UI rows', () => {
  const s = freshState();
  let st = actionStatus(s, FUNGI);
  assert.equal(st.locked, true);
  assert.equal(st.lockLevel, 5);

  st = actionStatus(s, TEND);
  assert.equal(st.locked, false);
  assert.equal(st.affordable, true);
  assert.equal(st.running, false);

  startAction(s, TEND);
  tickActions(s, 1500, createRng(1));
  st = actionStatus(s, TEND);
  assert.equal(st.running, true);
  assert.ok(Math.abs(st.frac - 0.375) < 0.01, `frac ~0.375, got ${st.frac}`);
  assert.ok(Math.abs(st.etaMs - 2500) < 100);
  assert.equal(st.mastery.level, 1);
});

test('level-up event fires when XP crosses a level boundary', () => {
  const s = freshState();
  // Level-2 threshold = 50; one herb cycle grants round(16 × 1.01) = 16 XP,
  // so starting at 34 lands EXACTLY on the boundary.
  s.skills.foraging.xp = xpForLevel(2) - 16;
  startAction(s, HERBS);
  const events = tickActions(s, 5000, createRng(11));
  const lvl = events.find((e) => e.type === 'levelup');
  assert.ok(lvl, 'expected a levelup event');
  assert.equal(lvl.skillId, 'foraging');
  assert.equal(lvl.level, 2);
  assert.equal(s.skills.foraging.level, 2);
});

test('unlock notices fire for actions whose unlockLevel is newly reached', () => {
  const s = freshState();
  s.skills.foraging.xp = xpForLevel(5) - 16; // next cycle reaches level 5
  startAction(s, HERBS);
  const events = tickActions(s, 5000, createRng(11));
  const unlock = events.find((e) => e.type === 'unlock' && e.actionId === FUNGI);
  assert.ok(unlock, 'gather-fungi should be announced at Foraging 5');
});

// ── F1d Fix 1: one-shot completion must be visible, not silent ──────

test('tickActions emits a stopped event (and clears active) when a non-auto action completes', () => {
  const state = freshState();
  assert.equal(startAction(state, TEND).ok, true);
  setAutoRestart(state, TEND, false);

  const events = [];
  let guard = 0;
  while (state.actions.active[TEND] && guard++ < 100) {
    events.push(...tickActions(state, 1_000, createRng(7)));
  }

  assert.ok(events.some((e) => e.type === 'stopped' && e.actionId === TEND),
    'UI gets a renderable stop event');
  assert.equal(state.actions.active[TEND], undefined,
    'active entry cleared exactly once');
});

test('auto-restart ON still runs silently: cycles continue with no stopped event', () => {
  const state = freshState();
  startAction(state, TEND);
  // Feed plenty of materials so nothing halts.
  for (let i = 0; i < 40; i++) state.bank.tinderscrap = 99;

  const events = tickActions(state, 12_000, createRng(7));
  assert.ok(!events.some((e) => e.type === 'stopped'), 'no stop while auto-running');
  assert.ok(state.actions.active[TEND], 'action keeps running');
});
