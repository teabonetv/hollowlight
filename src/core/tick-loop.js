// Deterministic fixed-timestep tick loop with an accumulator.
//
// Design: the browser drives `processFrame(now)` from requestAnimationFrame;
// tests drive it directly with synthetic timestamps. All timing is injected —
// nothing here reads Date.now() or performance.now(), so identical frame
// sequences produce identical tick counts (charter determinism rule).
//
// Long stalls (background tab, debugger pause) are capped by maxTicksPerFrame;
// leftover backlog is discarded rather than allowed to spiral. Real absence is
// covered by the offline-progress calculator, not by catch-up simulation.

export const TICK_MS = 100; // fixed step: 10 ticks/sec game time

/**
 * Pure accumulator step. Exposed separately so determinism is unit-testable
 * without rAF. Returns how many whole steps elapsed and the carried remainder.
 */
export function stepAccumulator(accMs, elapsedMs, stepMs, maxTicks) {
  let acc = accMs + Math.max(0, elapsedMs); // negative elapsed (clock skew) ignored
  let ticks = 0;
  while (acc >= stepMs && ticks < maxTicks) {
    acc -= stepMs;
    ticks++;
  }
  if (ticks >= maxTicks && acc >= stepMs) acc = 0; // drop backlog at the cap
  return { ticks, acc };
}

export function createTickLoop({ stepMs = TICK_MS, onTick, maxTicksPerFrame = 120 } = {}) {
  let running = false;
  let acc = 0;
  let last = null; // last frame timestamp; null until first frame after start/reset
  let frameId = null;

  function processFrame(now) {
    if (!running) return 0;
    const elapsed = last === null ? 0 : now - last;
    last = now;
    const r = stepAccumulator(acc, elapsed, stepMs, maxTicksPerFrame);
    acc = r.acc;
    for (let i = 0; i < r.ticks; i++) onTick(stepMs);
    return r.ticks;
  }

  function frame(now) {
    processFrame(now);
    frameId = requestAnimationFrame(frame);
  }

  function start(now = null) {
    if (running) return;
    running = true;
    last = typeof now === 'number' ? now : null;
    if (typeof requestAnimationFrame === 'function') {
      frameId = requestAnimationFrame(frame);
    }
  }

  function stop() {
    running = false;
    last = null;
    if (frameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  }

  function reset() { acc = 0; last = null; }

  return {
    start,
    stop,
    reset,
    processFrame,
    get running() { return running; },
    get accumulatedMs() { return acc; },
  };
}
