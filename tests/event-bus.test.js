import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEventBus } from '../src/core/event-bus.js';

test('on/emit delivers payloads to every listener', () => {
  const bus = createEventBus();
  const seen = [];
  bus.on('ping', (p) => seen.push(['a', p]));
  bus.on('ping', (p) => seen.push(['b', p]));
  bus.emit('ping', 42);
  assert.deepEqual(seen, [['a', 42], ['b', 42]]);
});

test('unsubscribe stops delivery; other listeners unaffected', () => {
  const bus = createEventBus();
  const seen = [];
  const off = bus.on('evt', (p) => seen.push(p));
  bus.on('evt', (p) => seen.push(`kept:${p}`));
  off();
  bus.emit('evt', 'x');
  assert.deepEqual(seen, ['kept:x']);
});

test('listener may unsubscribe during dispatch without breaking others', () => {
  const bus = createEventBus();
  const seen = [];
  let offSecond;
  bus.on('evt', () => seen.push('first'));
  offSecond = null;
  const handler2 = () => { seen.push('second'); };
  offSecond = bus.on('evt', handler2);
  bus.on('evt', () => { seen.push('third'); offSecond(); });
  bus.emit('evt');
  bus.emit('evt');
  assert.deepEqual(seen, ['first', 'second', 'third', 'first', 'third']);
});

test('events with no listeners are silently dropped', () => {
  const bus = createEventBus();
  assert.doesNotThrow(() => bus.emit('nobody-listens', { any: 'thing' }));
});

test('off() for unknown listener is a safe no-op', () => {
  const bus = createEventBus();
  assert.doesNotThrow(() => bus.off('nope', () => {}));
});
