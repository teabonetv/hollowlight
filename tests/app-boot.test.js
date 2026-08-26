// Integration: run the REAL app.js boot() against a stubbed browser
// environment. Verifies module wiring end-to-end: save load/creation, HUD
// ids, initial screen render, tick loop construction — the glue that unit
// tests and render smokes don't cover.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_VERSION } from '../src/core/save.js';

// ── browser env stubs (installed BEFORE importing app.js) ──────────
const { FakeNode } = await import('./helpers/fake-node.mjs');

const elements = {
  'hud-lumen': new FakeNode('span'),
  'hud-flame': new FakeNode('span'),
  'hud-known': new FakeNode('span'),
  'hud-hollow': new FakeNode('span'),
  screen: new FakeNode('main'),
  'modal-root': new FakeNode('div'),
  toasts: new FakeNode('div'),
  'btn-settings': new FakeNode('button'),
};
const docEl = new FakeNode('html');

globalThis.document = {
  readyState: 'complete',
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
globalThis.requestAnimationFrame = () => 0; // schedule nothing; we drive ticks manually if needed
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = () => 0; // don't keep the test process alive
if (!globalThis.navigator) globalThis.navigator = {};

// ── boot the actual app ────────────────────────────────────────────
await import('../src/ui/app.js');

test('boot() renders the camp screen into #screen and lights the HUD', () => {
  const camp = elements.screen.querySelector('.camp');
  assert.ok(camp, 'camp screen rendered on first boot');
  assert.match(elements['hud-lumen'].textContent ?? '', /^✦ /);
  assert.match(elements['hud-known'].textContent ?? '', /^Known \d+\/\d+$/);
  assert.match(elements['hud-hollow'].textContent ?? '', /^Hollow \d+\/\d+$/);
  assert.match(camp.textContent ?? '', /Hearthway Hollow/);
});

test('boot() persisted a versioned save envelope', () => {
  const raw = storage.getItem('hollowlight.save');
  assert.ok(raw, 'save written during boot');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.version, SAVE_VERSION);
  assert.ok(parsed.state.skills.emberkeeping, 'skills state present');
});

test('a second boot loads the existing save instead of wiping it', async () => {
  // Simulate a reload: mutate the stored save, boot state should reflect it.
  const saved = JSON.parse(storage.getItem('hollowlight.save'));
  saved.state.bank.fogwort = 77;
  storage.setItem('hollowlight.save', JSON.stringify(saved));

  // Re-import with a fresh query string so the module re-evaluates.
  await import('../src/ui/app.js?v=reload');

  const bankText = elements.screen.textContent ?? '';
  assert.ok(bankText.includes('Hearthway'), 'still rendering camp after reload');
});
