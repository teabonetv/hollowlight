// S4i: idle 3h away with active {} still opens the recap.
// savedAt stays rewound until Claim; persist must not eat the window.
// Overlay / Escape stay no-op; no X. Title is While You Were Away…

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
const intervalFns = [];
globalThis.window = globalThis;
globalThis.addEventListener = (type, fn) => { (winListeners[type] ??= []).push(fn); };
globalThis.removeEventListener = () => {};
globalThis.localStorage = storage;
globalThis.matchMedia = () => ({ matches: false });
globalThis.requestAnimationFrame = () => 0;
globalThis.setInterval = (fn) => { intervalFns.push(fn); return intervalFns.length; };
globalThis.setTimeout = () => 0;
if (!globalThis.navigator) globalThis.navigator = {};

const { SAVE_KEY, serializeSave, deserializeSave, adoptedSavedAt } = await import('../src/core/save.js');
const { createState } = await import('../src/game/state.js');

const now = 1_700_000_000_000;
const rewound = now - 3 * 3_600_000;
const prior = createState({ nowMs: rewound, rngSeed: 19 });
prior.lumen = 161;
prior.flame = 0;
prior.radiance = 1;
prior.savedAt = rewound;
prior.actions.active = {};
prior.stats.playtimeMs = 90_000;
storage.setItem(SAVE_KEY, serializeSave(prior, rewound));

const realNow = Date.now;
Date.now = () => now;
try {
  await import('../src/ui/app.js?s4i-idle-recap');
} finally {
  // Keep Date.now frozen through persist + claim, same as S4g.
}

function rawSave() {
  return JSON.parse(storage.getItem(SAVE_KEY));
}

function fireAutosaves() { for (const fn of intervalFns) fn(); }

function firePagehide() { for (const fn of winListeners.pagehide ?? []) fn(); }

function fireVisibility() {
  for (const h of docListeners.visibilitychange ?? []) h();
}

test('idle 3h rewind with active {} still opens recap and keeps savedAt', async (t) => {
  t.after(() => { Date.now = realNow; });

  assert.equal(window.__HOLLOWLIGHT_BOOTED, true);
  assert.ok(elements.screen.querySelector('.camp'), 'live CAMP on first paint');
  const title = elements['modal-root'].querySelector('.modal-title');
  assert.equal(title?.textContent, 'While You Were Away…',
    'idle-recap first-paint title');
  const recap = elements['modal-root'].textContent ?? '';
  assert.match(recap, /Cap 12h/);
  assert.match(recap, /Nothing ran/);
  assert.match(recap, /With nothing queued/);
  assert.match(recap, /Time by the Flame/);
  assert.match(recap, /dailies sat still/);
  assert.match(recap, /Time by the Flame unchanged/);
  assert.doesNotMatch(recap, / · worked/);
  assert.doesNotMatch(recap, /stuffed/i);
  const recapClose = elements['modal-root'].querySelectorAll('button')
    .filter((b) => b.getAttribute('aria-label') === 'Close');
  assert.equal(recapClose.length, 0, 'recap has no dismiss ×');

  const opened = rawSave();
  assert.equal(opened.savedAt, rewound);
  assert.equal(opened.state.savedAt, rewound);
  const hudLumen = Number(String(elements['hud-lumen'].textContent).replace(/[^\d]/g, ''));
  assert.equal(opened.state.lumen, hudLumen, 'HUD==save; boot feats may add Lumen, Claim has not');
  assert.equal(opened.state.flame, 0, 'idle recap must not apply nextState production');
  assert.equal(opened.state.stats.playtimeMs, 90_000, 'idle did not stuff playtime');

  fireAutosaves();
  firePagehide();
  document.hidden = true;
  fireVisibility();
  document.hidden = false;
  fireVisibility();

  const dumped = rawSave();
  assert.equal(dumped.savedAt, rewound,
    'autosave / pagehide / visibility must not restamp while idle recap is open');
  assert.equal(dumped.state.savedAt, rewound);
  assert.ok(now - dumped.savedAt >= 3 * 3_600_000);

  const { state, savedAt } = deserializeSave(JSON.stringify(dumped));
  const stamp = adoptedSavedAt(savedAt, state.savedAt);
  assert.equal(stamp, rewound, 'reload honouring envelope+state still sees the 3h window');

  await import('../src/ui/app.js?s4i-idle-recap-reload');
  assert.equal(elements['modal-root'].querySelector('.modal-title')?.textContent,
    'While You Were Away…', 'reload with the modal-era save still offers recap');
  assert.match(elements['modal-root'].textContent ?? '', /Nothing ran/);
  assert.match(elements['modal-root'].textContent ?? '', /With nothing queued/);
  assert.doesNotMatch(elements['modal-root'].textContent ?? '', /stuffed/i);

  const claim = elements['modal-root'].querySelectorAll('button')
    .find((b) => b.textContent === 'Claim');
  assert.ok(claim, 'Claim button present');
  claim.click();
  const claimed = rawSave();
  assert.ok(Math.abs(claimed.savedAt - now) < 5_000,
    'Claim is allowed to stamp savedAt to now');
  assert.equal(claimed.state.stats.playtimeMs, 90_000,
    'idle Claim still does not stuff Time by the Flame');
});
