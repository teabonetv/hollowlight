import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepAccumulator, createTickLoop, TICK_MS } from '../src/core/tick-loop.js';

test('stepAccumulator: jittered frames equal one uniform frame of same total time', () => {
  // Same total elapsed time must produce identical tick counts regardless of
  // how frames are chopped up — the accumulator exists precisely for this.
  const uniform = stepAccumulator(0, 5000, TICK_MS, 1000);
  let ticks = 0;
  let acc = 0;
  for (const dt of [137, 91, 240, 66, 512, 3954]) {
    const r = stepAccumulator(acc, dt, TICK_MS, 1000);
    acc = r.acc;
    ticks += r.ticks;
  }
  assert.equal(ticks, uniform.ticks);
  // Remainders differ only by sub-tick leftovers, never whole steps.
  assert.ok(Math.abs(uniform.acc - acc) < TICK_MS);
});

test('stepAccumulator: never emits partial or negative ticks', () => {
  const r = stepAccumulator(0, 350, TICK_MS, 1000);
  assert.equal(r.ticks, 3);
  assert.equal(r.acc, 50);
});

test('stepAccumulator: negative elapsed (clock skew) contributes nothing', () => {
  const r = stepAccumulator(0, -4000, TICK_MS, 1000);
  assert.equal(r.ticks, 0);
});

test('stepAccumulator: drops backlog instead of spiraling past maxTicks', () => {
  const r = stepAccumulator(0, 60_000, TICK_MS, 120);
  assert.equal(r.ticks, 120);
  assert.equal(r.acc, 0, 'backlog discarded once the cap trips');
});

test('tick loop: identical frame series → identical tick sequence', () => {
  const frameSeries = [];
  for (let i = 0; i < 200; i++) frameSeries.push(i * 37 + (i % 7) * 11);

  function run() {
    const got = [];
    const loop = createTickLoop({ stepMs: TICK_MS, onTick: () => {} });
    loop.start();
    for (const t of frameSeries) got.push(loop.processFrame(t));
    loop.stop();
    return got;
  }

  assert.deepEqual(run(), run(), 'determinism: same inputs, same outputs');
});

test('tick loop: 10s of wall time yields exactly 100 ticks at default step', () => {
  let ticks = 0;
  const loop = createTickLoop({ onTick: () => ticks++ });
  loop.start();
  for (let t = 0; t <= 10_000; t += 16) loop.processFrame(t);
  loop.stop();
  assert.equal(ticks, 100);
});

test('tick loop: stop() does not keep a rAF chain alive', () => {
  const queued = [];
  let nextId = 0;
  const origRAF = globalThis.requestAnimationFrame;
  const origCAF = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (cb) => {
    const id = ++nextId;
    queued[id] = cb;
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => { queued[id] = null; };
  try {
    let ticks = 0;
    const loop = createTickLoop({ onTick: () => ticks++ });
    loop.start();
    const stale = queued[1];
    loop.stop();
    stale?.(0);
    const live = Object.values(queued).filter((cb) => typeof cb === 'function');
    assert.equal(live.length, 0, 'in-flight frame after stop must not reschedule');
    assert.equal(ticks, 0);
  } finally {
    globalThis.requestAnimationFrame = origRAF;
    globalThis.cancelAnimationFrame = origCAF;
  }
});

test('tick loop: stop() halts processing; processFrame is inert afterwards', () => {
  let ticks = 0;
  const loop = createTickLoop({ onTick: () => ticks++ });
  loop.start();
  loop.processFrame(0);
  loop.processFrame(500);
  const before = ticks;
  loop.stop();
  assert.equal(loop.processFrame(1000), 0);
  assert.equal(ticks, before);
});
