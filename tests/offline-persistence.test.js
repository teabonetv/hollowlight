// F1d Fix 1 regression — offline-progress persistence.
//
// Boots the REAL app.js against a stubbed browser, starts an action through
// the real UI, and drives the real persist()/storage path. Locks in the
// contract the offline calculator depends on: while an action runs, the save
// envelope must carry actions.active (+ progressMs + autoRestart), and
// computeOfflineProgress over a rewound savedAt must yield gains.
//
// Also pins the visibilitychange ordering: hidden ⇒ persisted with live
// runner state; return ⇒ offline computed BEFORE savedAt is restamped.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { FakeNode } = await import('./helpers/fake-node.mjs');

// ── browser env stubs (installed BEFORE importing app.js) ──────────
const elements = {
  'hud-lumen': new FakeNode('span'),
  'hud-flame': new FakeNode('span'),
  screen: new FakeNode('main'),
  'modal-root': new FakeNode('div'),
  toasts: new FakeNode('div'),
  'btn-settings': new FakeNode('button'),
};
const docEl = new FakeNode('html');

const docListeners = {};
globalThis.document = {
  readyState: 'complete',
  hidden: false,
  documentElement: docEl,
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => ({ nodeType: 3, textContent: String(s) }),
  getElementById: (id) => elements[id] ?? null,
  querySelectorAll: () => [],
  addEventListener(type, fn) { (docListeners[type] ??= []).push(fn); },
  removeEventListener() {},
};

const storeMap = new Map();
let storageWrites = 0;
const storage = {
  getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
  setItem: (k, v) => { storeMap.set(k, String(v)); storageWrites++; },
  removeItem: (k) => { storeMap.delete(k); },
};

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.localStorage = storage;
globalThis.matchMedia = () => ({ matches: false });

// Controllable rAF so we can drive real ticks deterministically.
let rafCb = null;
let frameNow = 0;
globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
globalThis.cancelAnimationFrame = () => { rafCb = null; };
if (!globalThis.performance) globalThis.performance = {};
globalThis.performance.now = () => frameNow;

const intervalFns = [];
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (fn) => { intervalFns.push(fn); return intervalFns.length; };
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

function fireAutosaves() { for (const fn of intervalFns) fn(); }

function rawSave() {
  return JSON.parse(storage.getItem('hollowlight.save'));
}

function openEmberkeepingAndStart() {
  elements.screen.querySelectorAll('button')
    .find((b) => b.textContent === 'Tend the Flame').click();
  const runBtn = elements.screen.querySelectorAll('.btn-run')[0];
  assert.equal(runBtn.textContent, 'Start');
  runBtn.click();
}

test('starting an action through the UI puts it in the save immediately', () => {
  assert.ok(rawSave(), 'boot wrote a save');
  openEmberkeepingAndStart();

  const s = rawSave().state;
  assert.ok(s.actions.active['tend-flame'], 'running action is in the save');
  assert.equal(typeof s.actions.active['tend-flame'].progressMs, 'number');

  // autoRestart is default-true; toggling writes an explicit record that must
  // survive serialization both ways. (The toggle paints itself with an
  // `onclick` property, so invoke it directly rather than .click().)
  const toggle = elements.screen.querySelector('.auto-toggle');
  const flip = () => toggle.onclick?.({ preventDefault() {} });
  flip(); // off
  assert.equal(rawSave().state.actions.autoRestart['tend-flame'], false);
  flip(); // back on
  assert.equal(rawSave().state.actions.autoRestart['tend-flame'], true);
});

test('ticks + autosave keep advancing the running action inside the save', () => {
  pump(5_000); // > one tend-flame cycle (4s)
  fireAutosaves();

  const s = rawSave().state;
  assert.ok(s.actions.active['tend-flame'], 'still running after autosave');
  assert.ok(s.actions.active['tend-flame'].progressMs >= 0);
  assert.ok(s.actions.completed['tend-flame'] > 0, 'cycles completed');
});

test('save round-trip then rewind yields offline gains (hasGains, xp, lumen)', async () => {
  fireAutosaves();
  const envelope = rawSave();
  assert.ok(envelope.state.actions.active['tend-flame'], 'precondition: action running in save');

  const { deserializeSave } = await import('../src/core/save.js');
  const { state } = deserializeSave(JSON.stringify(envelope));
  assert.ok(state.actions.active['tend-flame'], 'active survives deserialize');

  // Rewind the clock: pretend this save was written 5 minutes ago.
  const rewound = structuredClone(state);
  rewound.savedAt -= 5 * 60_000;

  const { computeOfflineProgress } = await import('../src/core/offline.js');
  const { ACTIONS_BY_ID } = await import('../src/game/data/actions.js');
  const res = computeOfflineProgress({
    state: rewound,
    nowMs: Date.now(),
    lastSavedAt: rewound.savedAt,
    actionsById: ACTIONS_BY_ID,
  });

  assert.equal(res.hasGains, true, 'offline calculator sees the running action');
  assert.ok(res.awayMs >= 60_000);
  assert.ok(res.gains.actions.length > 0);
  assert.ok(res.gains.actions[0].completions > 0);
  assert.ok(res.gains.xp.emberkeeping > 0);
  assert.ok(res.gains.lumen > 0);
  // Claiming keeps the action running (progress carries into nextState).
  assert.ok(res.nextState.actions.active['tend-flame'], 'claim keeps the loop alive');
});

test('visibilitychange: hidden persists live runner state; return computes before restamping', () => {
  const handlers = docListeners.visibilitychange ?? [];
  assert.ok(handlers.length > 0, 'app registered a visibilitychange handler');

  pump(2_300);
  const writesBeforeHide = storageWrites;
  document.hidden = true;
  for (const h of handlers) h();

  const envelope = rawSave();
  assert.ok(envelope.state.actions.active['tend-flame'],
    'hide-time save carries the running action');
  assert.ok(storageWrites > writesBeforeHide, 'hidden path persisted');

  // Return after a long absence. The app reads Date.now() directly, so shift
  // the clock forward five minutes to make the absence real.
  const realNow = Date.now;
  const shiftedBase = realNow() + 5 * 60_000;
  try {
    Date.now = () => realNow() + 5 * 60_000;

    document.hidden = false;
    for (const h of handlers) h();

    // The modal ("While You Were Away…") opened because away ≥ 60s — the
    // return path read the hide-time savedAt BEFORE restamping it.
    assert.equal(elements['modal-root'].querySelector('.modal-title')?.textContent,
      'While You Were Away…');

    const afterReturn = rawSave();
    assert.ok(Math.abs(afterReturn.savedAt - shiftedBase) < 5_000,
      'return path restamped savedAt only AFTER computing offline credit');
    assert.ok(afterReturn.state.actions.active['tend-flame'],
      'restamped save still carries the running action');
  } finally {
    Date.now = realNow;
  }
});
