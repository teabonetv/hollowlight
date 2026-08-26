// S4j: live ticks must not mint Lumen/Radiance/items behind an open recap.
// Claim is the only apply. HUD stays matched for a beat after Claim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeNode, FakeText } from './helpers/fake-node.mjs';

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
  'hud-known': new FakeNode('button'),
  'hud-hollow': new FakeNode('button'),
  screen: new FakeNode('main'),
  'modal-root': new FakeNode('div'),
  toasts: new FakeNode('div'),
  'btn-settings': new FakeNode('button'),
  'boot-fallback': bootFallback,
};
elements['hud-lumen'].textContent = '✦ 20';
elements['hud-known'].textContent = 'Known 0/137';
elements['hud-hollow'].textContent = 'Hollow 0/12';

const docEl = new FakeNode('html');
const docListeners = {};
globalThis.document = {
  readyState: 'complete',
  hidden: false,
  documentElement: docEl,
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => new FakeText(s),
  getElementById: (id) => elements[id] ?? null,
  querySelectorAll: (sel) => (sel === '.tabbar button' ? tabButtons : []),
  addEventListener(type, fn) { (docListeners[type] ??= []).push(fn); },
  removeEventListener() {},
};

const storeMap = new Map();
const storage = {
  getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
  setItem: (k, v) => { storeMap.set(k, String(v)); },
  removeItem: (k) => { storeMap.delete(k); },
};

const winListeners = {};
const timeouts = [];
let timeoutId = 0;
let animNow = 0;
/** @type {Array<{id:number, cb:Function}|null>} */
const rafs = [];
let rafId = 0;

globalThis.window = globalThis;
globalThis.addEventListener = (type, fn) => { (winListeners[type] ??= []).push(fn); };
globalThis.removeEventListener = () => {};
globalThis.localStorage = storage;
globalThis.matchMedia = () => ({ matches: false });
globalThis.requestAnimationFrame = (cb) => {
  const id = ++rafId;
  rafs.push({ id, cb });
  return id;
};
globalThis.cancelAnimationFrame = (id) => {
  const i = rafs.findIndex((r) => r && r.id === id);
  if (i >= 0) rafs[i] = null;
};
globalThis.setInterval = () => 0;
globalThis.setTimeout = (fn, ms) => {
  const id = ++timeoutId;
  timeouts.push({ id, fn, ms: ms ?? 0 });
  return id;
};
globalThis.clearTimeout = (id) => {
  const i = timeouts.findIndex((t) => t && t.id === id);
  if (i >= 0) timeouts[i] = null;
};
if (!globalThis.navigator) globalThis.navigator = {};

const { SAVE_KEY, serializeSave } = await import('../src/core/save.js');
const { createState } = await import('../src/game/state.js');

const now = 1_700_000_000_000;
const rewound = now - 3 * 3_600_000;
const prior = createState({ nowMs: rewound, rngSeed: 23 });
prior.lumen = 35;
prior.flame = 0;
prior.radiance = 12;
prior.radianceEarned = 12;
prior.stats.radianceEarned = 12;
prior.savedAt = rewound;
prior.actions.active['gather-herbs'] = { progressMs: 0 };
prior.stats.playtimeMs = 90_000;
storage.setItem(SAVE_KEY, serializeSave(prior, rewound));

const realNow = Date.now;
Date.now = () => now;
try {
  await import('../src/ui/app.js?s4j-recap-freeze');
} finally {
  // Keep Date.now frozen so persist cannot invent a new away window.
}

function rawSave() {
  return JSON.parse(storage.getItem(SAVE_KEY));
}

function hudNum(id) {
  return Number(String(elements[id].textContent).replace(/[^\d]/g, ''));
}

function pump(ms) {
  const end = animNow + ms;
  while (animNow < end) {
    animNow += 100;
    const batch = rafs.filter(Boolean);
    rafs.length = 0;
    for (const r of batch) r.cb(animNow);
  }
}

function fireThaw() {
  const due = timeouts.filter((t) => t);
  timeouts.length = 0;
  for (const t of due) t.fn();
}

test('recapOpen freezes radiance/lumen until Claim; HUD holds a beat', async (t) => {
  t.after(() => { Date.now = realNow; });

  assert.equal(window.__HOLLOWLIGHT_BOOTED, true);
  assert.equal(elements['modal-root'].querySelector('.modal-title')?.textContent,
    'While You Were Away…', 'idle recap still opens with an active gather');
  assert.match(elements['modal-root'].textContent ?? '', /Gather Herbs/);

  const opened = rawSave();
  const preLumen = opened.state.lumen;
  const preRadiance = opened.state.radiance ?? 0;
  const prePlay = opened.state.stats.playtimeMs;
  const hudL0 = hudNum('hud-lumen');
  const hudR0 = hudNum('hud-radiance');
  assert.equal(hudL0, preLumen, 'HUD==save before Claim');
  assert.equal(hudR0, preRadiance);

  pump(12_000);

  const during = rawSave();
  assert.equal(during.state.lumen, preLumen, 'no tick-apply lumen while recapOpen');
  assert.equal(during.state.radiance ?? 0, preRadiance, 'no tick-apply radiance while recapOpen');
  assert.equal(during.state.stats.playtimeMs, prePlay, 'playtime frozen while recapOpen');
  assert.equal(hudNum('hud-lumen'), hudL0);
  assert.equal(hudNum('hud-radiance'), hudR0);
  assert.equal(during.savedAt, rewound, 'must not restamp savedAt before Claim');

  const claim = elements['modal-root'].querySelectorAll('button')
    .find((b) => b.textContent === 'Claim');
  assert.ok(claim, 'Claim button present');
  claim.click();

  const claimed = rawSave();
  const claimRadiance = claimed.state.radiance ?? 0;
  const claimLumen = claimed.state.lumen;
  assert.ok(claimRadiance > preRadiance, 'Claim applies recap Radiance');
  assert.equal(hudNum('hud-radiance'), claimRadiance, 'HUD matches recap on Claim');
  assert.equal(hudNum('hud-lumen'), claimLumen);

  pump(12_000);
  const held = rawSave();
  assert.equal(held.state.radiance, claimRadiance,
    'thaw beat: no +1 Radiance from a tick during/after the modal');
  assert.equal(held.state.lumen, claimLumen);
  assert.equal(hudNum('hud-radiance'), claimRadiance);
  assert.equal(hudNum('hud-lumen'), claimLumen);

  fireThaw();
  pump(12_000);
  const after = rawSave();
  assert.ok(
    (after.state.radiance ?? 0) >= claimRadiance,
    'after the beat, live gather may resume',
  );
});
