import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashSeed } from '../src/core/rng.js';

test('same seed reproduces the exact same float sequence', () => {
  const a = createRng('hollowlight');
  const b = createRng('hollowlight');
  const seqA = Array.from({ length: 200 }, () => a.next());
  const seqB = Array.from({ length: 200 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test('numeric seeds are equally reproducible; different seeds diverge', () => {
  const a = createRng(12345);
  const b = createRng(12345);
  for (let i = 0; i < 50; i++) {
    assert.equal(a.next(), b.next());
    assert.equal(a.getState(), b.getState());
  }
  const x = createRng(1);
  const y = createRng(2);
  const sx = JSON.stringify(Array.from({ length: 10 }, () => x.next()));
  const sy = JSON.stringify(Array.from({ length: 10 }, () => y.next()));
  assert.notEqual(sx, sy);
});

test('int(maxExclusive) stays in bounds across many draws', () => {
  const rng = createRng(99);
  for (let n = 1; n <= 40; n++) {
    for (let i = 0; i < 300; i++) {
      const v = rng.int(n);
      assert.ok(v >= 0 && v < n, `int(${n}) returned ${v}`);
    }
  }
});

test('int degenerate inputs return 0 instead of NaN', () => {
  const rng = createRng(5);
  assert.equal(rng.int(0), 0);
  assert.equal(rng.int(-7), 0);
});

test('range(min,max) is inclusive of both ends eventually', () => {
  const rng = createRng(777);
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const v = rng.range(2, 4);
    assert.ok(v >= 2 && v <= 4);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [2, 3, 4]);
});

test('chance(p): p=1 always true, p=0 always false', () => {
  const rng = createRng(31);
  for (let i = 0; i < 100; i++) {
    assert.equal(rng.chance(1), true);
    assert.equal(rng.chance(0), false);
  }
});

test('pick stays inside the array; empty array yields undefined', () => {
  const rng = createRng(8);
  const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 100; i++) assert.ok(arr.includes(rng.pick(arr)));
  assert.equal(rng.pick([]), undefined);
});

test('state snapshot + restore resumes the sequence exactly', () => {
  const rng = createRng(2024);
  rng.next(); rng.next(); rng.next();
  const saved = rng.getState();
  const expected = [rng.next(), rng.next(), rng.next()];

  const restored = createRng(1);
  restored.setState(saved); // this is how saves carry RNG state across sessions
  assert.deepEqual(
    [restored.next(), restored.next(), restored.next()],
    expected,
  );
});

test('hashSeed is deterministic and uint32-ranged', () => {
  assert.equal(hashSeed('ember'), hashSeed('ember'));
  for (const s of ['', 'a', 'the hollow awaits', '🔥']) {
    const h = hashSeed(s);
    assert.ok(h >= 0 && h <= 0xFFFFFFFF);
    assert.ok(Number.isInteger(h));
  }
});
