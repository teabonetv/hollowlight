// S4f: first paint after a 3h rewind (the critic items.js method) must be
// live Camp + recap, never #boot-fallback. HUD must match the surviving save.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeNode } from './helpers/fake-node.mjs';

const { FakeText } = await import('./helpers/fake-node.mjs');

function tabButton(tab) {
  const b = new FakeNode('button');
  b.dataset.tab = tab;
  b.setAttribute('data-tab', tab);
  return b;
}

const tabButtons = ['camp', 'skills', 'bank', 'map', 'journal'].map(tabButton);
const bootFallback = new FakeNode('div');
bootFallback.hidden = true;
bootFallback.setAttribute('hidden', '');

const elements = {
  'hud-lumen': new FakeNode('span'),
  'hud-radiance': new FakeNode('span'),
  'hud-flame': new FakeNode('span'),
  'hud-hollow': new FakeNode('span'),
  screen: new FakeNode('main'),
  'modal-root': new FakeNode('div'),
  toasts: new FakeNode('div'),
  'btn-settings': new FakeNode('button'),
  'boot-fallback': bootFallback,
};
elements['hud-lumen'].textContent = '✦ 20';
elements['hud-hollow'].textContent = '0 / 12 hollow';

const docEl = new FakeNode('html');
globalThis.document = {
  readyState: 'complete',
  hidden: false,
  documentElement: docEl,
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => new FakeText(s),
  getElementById: (id) => elements[id] ?? null,
  querySelectorAll: (sel) => (sel === '.tabbar button' ? tabButtons : []),
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
globalThis.requestAnimationFrame = () => 0;
globalThis.setInterval = () => 0;
globalThis.setTimeout = () => 0;
if (!globalThis.navigator) globalThis.navigator = {};

const { SAVE_KEY, serializeSave } = await import('../src/core/save.js');
const { createState } = await import('../src/game/state.js');

const now = 1_700_000_000_000;
const rewound = now - 3 * 3_600_000;
const prior = createState({ nowMs: rewound, rngSeed: 11 });
prior.lumen = 178;
prior.flame = 40;
prior.savedAt = rewound;
prior.bank.tinderscrap = 4;
prior.actions.active['tend-flame'] = { progressMs: 800 };
storage.setItem(SAVE_KEY, serializeSave(prior, rewound));

const realNow = Date.now;
Date.now = () => now;
try {
  await import('../src/ui/app.js?s4f-offline-return');
} finally {
  Date.now = realNow;
}

test('3h rewind first paint is Camp + recap, never the candle overlay', () => {
  assert.equal(window.__HOLLOWLIGHT_BOOTED, true);
  assert.equal(elements['boot-fallback'].hidden, true);
  assert.equal(elements['boot-fallback'].getAttribute('hidden'), '');

  const camp = elements.screen.querySelector('.camp');
  assert.ok(camp, 'live CAMP rendered on first paint');
  assert.match(camp.textContent ?? '', /Hearthway Hollow/);
  assert.match(camp.textContent ?? '', /Completion/);

  assert.notEqual(elements['hud-lumen'].textContent, '✦ 20',
    'HUD must not stay on the HTML starter while a 178-lumen save survived');
  assert.match(elements['hud-lumen'].textContent ?? '', /^✦ /);
  const lumen = Number(String(elements['hud-lumen'].textContent).replace(/[^\d]/g, ''));
  assert.ok(lumen >= 178, `HUD lumen ${lumen} should keep the surviving wallet`);

  const title = elements['modal-root'].querySelector('.modal-title');
  assert.equal(title?.textContent, 'While You Were Away…');
  const recap = elements['modal-root'].textContent ?? '';
  assert.match(recap, /Tend the Flame/);
  assert.match(recap, /out of Tinderscrap ×/);
});

test('HUD hollow chip carries a noun after the rewind boot', () => {
  assert.match(elements['hud-hollow'].textContent ?? '', /Hollow\s+\d+\/\d+/);
});
