import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  xpBetween, xpForLevel, levelFromXp, levelProgress,
  MAX_LEVEL, MILESTONE_LEVEL,
} from '../src/core/xp.js';

test('per-level cost is positive and strictly increasing (monotonic curve)', () => {
  let prev = -Infinity;
  for (let l = 1; l < MAX_LEVEL; l++) {
    const cost = xpBetween(l);
    assert.ok(Number.isFinite(cost) && cost > 0, `cost at ${l} must be finite/positive`);
    assert.ok(cost > prev, `cost must strictly increase at ${l}: ${cost} !> ${prev}`);
    prev = cost;
  }
  assert.equal(xpBetween(MAX_LEVEL), Infinity, 'no growth past MAX_LEVEL');
});

test('exact level boundaries: threshold XP lands you ON the level', () => {
  for (let l = 1; l <= MAX_LEVEL; l++) {
    assert.equal(levelFromXp(xpForLevel(l)), l, `xpForLevel(${l}) must evaluate to level ${l}`);
  }
});

test('one XP below any boundary leaves you at the previous level', () => {
  for (let l = 2; l <= MAX_LEVEL; l++) {
    assert.equal(levelFromXp(xpForLevel(l) - 1), l - 1, `just under ${l}`);
  }
});

test('cumulative thresholds are strictly increasing and start at zero', () => {
  assert.equal(xpForLevel(1), 0);
  let prev = -1;
  for (let l = 1; l <= MAX_LEVEL; l++) {
    assert.ok(xpForLevel(l) > prev, `threshold must increase at ${l}`);
    prev = xpForLevel(l);
  }
});

test('negative/garbage XP clamps to level 1', () => {
  assert.equal(levelFromXp(-5), 1);
  assert.equal(levelFromXp(NaN), 1);
});

test('total XP to the 99 milestone is in the genre-normal band (~10M)', () => {
  const total99 = xpForLevel(MILESTONE_LEVEL);
  assert.ok(total99 > 1_000_000, 'too fast — 99 would be trivial');
  assert.ok(total99 < 50_000_000, 'too slow — 99 would never land');
});

test('soft caps bite at each band boundary, yet no level is ever a wall', () => {
  const ratio = (l) => xpBetween(l) / xpBetween(l - 1);
  // Measured curve: boundary jumps land ~1.56 / 1.96 / 1.91 — clearly steeper
  // than anything deep inside a band (~1.02–1.15).
  for (const b of [30, 60, 90]) {
    assert.ok(ratio(b) > 1.3, `boundary ${b} must steepen (got ${ratio(b).toFixed(3)})`);
  }
  for (const l of [11, 41, 71, 101]) {
    assert.ok(ratio(l) < 1.25, `interior ${l} must stay smooth (got ${ratio(l).toFixed(3)})`);
    assert.ok(ratio(l) > 1.0);
  }
  // …but no level ever costs ≥3× the previous one (early curve tapers from
  // ~2.7× at level 2 down toward ~1.02× late).
  for (let l = 2; l < MAX_LEVEL; l++) {
    assert.ok(ratio(l) < 3, `level ${l} is a wall (${ratio(l).toFixed(2)}×)`);
    if (l >= 10) assert.ok(ratio(l) < 2.5, `late wall at ${l} (${ratio(l).toFixed(2)}×)`);
  }
});

test('elite tax compounds: growth windows accelerate past the milestone', () => {
  // 100→110 grows faster than 90→100 by a wide margin — that gap IS the
  // compounding 1.04^L tax (measured: 1.78 vs 1.32).
  const nearWindow = xpBetween(100) / xpBetween(90);
  const farWindow = xpBetween(110) / xpBetween(100);
  assert.ok(farWindow > nearWindow * 1.2,
    `far window ${farWindow.toFixed(3)} must exceed near ${nearWindow.toFixed(3)} × 1.2`);
});

test('levelProgress returns sane fractions for bars', () => {
  const mid = Math.floor((xpForLevel(10) + xpForLevel(11)) / 2);
  const p = levelProgress(mid);
  assert.equal(p.level, 10);
  assert.ok(p.frac > 0 && p.frac < 1);
  const atBoundary = levelProgress(xpForLevel(11));
  assert.equal(atBoundary.level, 11);
  assert.equal(atBoundary.frac, 0);
  const maxed = levelProgress(Infinity);
  assert.equal(maxed.level, MAX_LEVEL);
  assert.equal(maxed.frac, 1);
});
