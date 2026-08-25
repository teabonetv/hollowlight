// Mid-fight save honesty: combat ticks must flush hollowlight.save so
// painted HP matches deserialize without waiting for pagehide.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { FakeNode } = await import('./helpers/fake-node.mjs');
const { deserializeSave } = await import('../src/core/save.js');

const elements = {
  'hud-lumen': new FakeNode('span'),
  'hud-flame': new FakeNode('span'),
  'hud-radiance': new FakeNode('span'),
  screen: new FakeNode('main'),
  'modal-root': new FakeNode('div'),
  toasts: new FakeNode('div'),
  'btn-settings': new FakeNode('button'),
};
const docEl = new FakeNode('html');

globalThis.document = {
  readyState: 'complete',
  hidden: false,
  documentElement: docEl,
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => ({ nodeType: 3, textContent: String(s) }),
  getElementById: (id) => elements[id] ?? null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
};

const storeMap = new Map();
const storage = {
  getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
  setItem: (k, v) => { storeMap.set(k, String(v)); },
  removeItem: (k) => { storeMap.delete(k); },
};

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.localStorage = storage;
globalThis.matchMedia = () => ({ matches: false });

let rafCb = null;
let frameNow = 0;
globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
globalThis.cancelAnimationFrame = () => { rafCb = null; };
if (!globalThis.performance) globalThis.performance = {};
globalThis.performance.now = () => frameNow;
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
if (!globalThis.navigator) globalThis.navigator = {};

await import('../src/ui/app.js');

function pump(ms) {
  const end = frameNow + ms;
  while (frameNow < end) {
    frameNow += 100;
    const cb = rafCb;
    rafCb = null;
    cb?.(frameNow);
  }
}

function rawSave() {
  return JSON.parse(storage.getItem('hollowlight.save'));
}

test('combat ticks flush HP into hollowlight.save in the same eval', () => {
  const pale = elements.screen.querySelectorAll('button')
    .find((b) => /Face the pale-things/.test(b.textContent ?? ''));
  assert.ok(pale, 'camp combat door');
  pale.click();

  const hunt = elements.screen.querySelectorAll('button')
    .find((b) => (b.textContent ?? '') === 'Hunt');
  assert.ok(hunt, 'Hunt on Pale Moth');
  hunt.click();

  const writesBefore = storage.getItem('hollowlight.save');
  assert.ok(writesBefore);
  pump(3_200);

  const envelope = rawSave();
  const { state } = deserializeSave(JSON.stringify(envelope));
  assert.equal(state.combat.fighting, true);
  assert.ok(state.combat.foe);
  const painted = elements.screen.textContent ?? '';
  assert.match(painted, new RegExp(`${state.combat.player.hp} / `));
  assert.match(painted, new RegExp(`${state.combat.foe.hp} / ${state.combat.foe.maxHp}`));
  assert.equal(/1 souls/.test(painted), false);
});
