// S4g: recap owns the save until Claim.
// 3h rewind → recap open → autosave / hide / pagehide must not restamp
// savedAt to now. Reload with the modal still "open" on disk must offer
// the same recap, not a zero-away boot. Wallet stays pre-Claim.

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
  'hud-hollow': new FakeNode('span'),
  screen: new FakeNode('main'),
  'modal-root': new FakeNode('div'),
  toasts: new FakeNode('div'),
  'btn-settings': new FakeNode('button'),
  'boot-fallback': bootFallback,
};
elements['hud-lumen'].textContent = '✦ 20';
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
  await import('../src/ui/app.js?s4g-recap-persist');
} finally {
  // Keep Date.now frozen for persist + reload: a restamp to `now` is exactly
  // the bug (zero-away boot). Restore at the end of the file's tests.
}

function rawSave() {
  return JSON.parse(storage.getItem(SAVE_KEY));
}

function fireAutosaves() { for (const fn of intervalFns) fn(); }

function firePagehide() { for (const fn of winListeners.pagehide ?? []) fn(); }

function fireVisibility() {
  for (const h of docListeners.visibilitychange ?? []) h();
}

test('3h rewind → recap open → persist/reload still has recap', async (t) => {
  t.after(() => { Date.now = realNow; });

  assert.equal(elements['modal-root'].querySelector('.modal-title')?.textContent,
    'While You Were Away…');
  const recapClose = elements['modal-root'].querySelectorAll('button')
    .filter((b) => b.getAttribute('aria-label') === 'Close');
  assert.equal(recapClose.length, 0, 'recap has no dismiss ×');

  const opened = rawSave();
  assert.equal(opened.savedAt, rewound);
  assert.equal(opened.state.savedAt, rewound);
  assert.equal(opened.state.flame, 40, 'wallet still pre-Claim');
  assert.equal(opened.state.bank.tinderscrap, 4);

  fireAutosaves();
  firePagehide();
  document.hidden = true;
  fireVisibility();
  document.hidden = false;
  fireVisibility();

  const dumped = rawSave();
  assert.equal(dumped.savedAt, rewound,
    'autosave / pagehide / visibility must not restamp while recap is open');
  assert.equal(dumped.state.savedAt, rewound);
  assert.equal(dumped.state.flame, 40);
  assert.equal(dumped.state.bank.tinderscrap, 4);
  assert.ok(now - dumped.savedAt >= 3 * 3_600_000);

  const { state, savedAt } = deserializeSave(JSON.stringify(dumped));
  const stamp = adoptedSavedAt(savedAt, state.savedAt);
  assert.equal(stamp, rewound, 'reload honouring envelope+state still sees the 3h window');
  assert.equal(state.flame, 40, 'nextState was not written in place of the live wallet');

  await import('../src/ui/app.js?s4g-recap-reload');
  assert.equal(elements['modal-root'].querySelector('.modal-title')?.textContent,
    'While You Were Away…', 'reload with the modal-era save still offers recap');
  assert.match(elements['modal-root'].textContent ?? '', /Tend the Flame/);
  assert.match(elements['modal-root'].textContent ?? '', /out of Tinderscrap ×/);
  assert.equal(elements['boot-fallback'].hidden, true);

  const claim = elements['modal-root'].querySelectorAll('button')
    .find((b) => b.textContent === 'Claim');
  assert.ok(claim, 'Claim button present');
  claim.click();
  const claimed = rawSave();
  assert.ok(Math.abs(claimed.savedAt - now) < 5_000,
    'Claim is allowed to stamp savedAt to now');
  assert.notEqual(claimed.state.flame, 40,
    'Claim writes nextState so the 3h of work is not only in the modal');
});
