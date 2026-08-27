// Mid-fight save honesty: combat ticks must flush hollowlight.save so
// painted HP matches deserialize without waiting for pagehide.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { FakeNode } = await import('./helpers/fake-node.mjs');
const { deserializeSave } = await import('../src/core/save.js');

function tabButton(tab) {
  const b = new FakeNode('button');
  b.dataset.tab = tab;
  b.setAttribute('data-tab', tab);
  if (tab === 'camp') {
    b.classList.add('active');
    b.setAttribute('aria-selected', 'true');
  } else {
    b.setAttribute('aria-selected', 'false');
  }
  return b;
}

const tabButtons = ['camp', 'skills', 'bank', 'map', 'journal'].map(tabButton);

const elements = {
  'hud-lumen': new FakeNode('span'),
  'hud-flame': new FakeNode('span'),
  'hud-radiance': new FakeNode('span'),
  screen: new FakeNode('main'),
  'modal-root': new FakeNode('div'),
  toasts: new FakeNode('div'),
  'btn-settings': new FakeNode('button'),
  'boot-fallback': new FakeNode('div'),
};
const docEl = new FakeNode('html');

globalThis.document = {
  readyState: 'complete',
  hidden: false,
  documentElement: docEl,
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => ({ nodeType: 3, textContent: String(s) }),
  getElementById: (id) => elements[id] ?? null,
  querySelectorAll: (sel) => {
    if (sel === '.tabbar button') return tabButtons;
    return [];
  },
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
  const skills = tabButtons.find((b) => b.dataset.tab === 'skills');
  assert.ok(skills, 'Skills tab');
  skills.click();
  const combatTab = elements.screen.querySelectorAll('.craft-tab')
    .find((b) => b.getAttribute('data-skill') === 'combat');
  assert.ok(combatTab, 'Skills craft subnav has Combat');
  combatTab.click();

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

function tabIs(tab) {
  const btn = tabButtons.find((b) => b.dataset.tab === tab);
  return {
    active: btn.classList.contains('active'),
    selected: btn.getAttribute('aria-selected') === 'true',
  };
}

test('after reload the selected tab matches the combat screen', async () => {
  if (!/Pale Moth/.test(elements.screen.textContent ?? '')) {
    const skills = tabButtons.find((b) => b.dataset.tab === 'skills');
    skills?.click();
    const combatTab = elements.screen.querySelectorAll('.craft-tab')
      .find((b) => b.getAttribute('data-skill') === 'combat');
    combatTab?.click();
    const hunt = elements.screen.querySelectorAll('button')
      .find((b) => (b.textContent ?? '') === 'Hunt');
    hunt?.click();
  }
  assert.equal(tabIs('skills').active, true, 'Skills selected while Combat is painted');
  assert.equal(tabIs('skills').selected, true);
  assert.equal(tabIs('camp').active, false);
  assert.equal(tabIs('camp').selected, false);
  assert.match(elements.screen.textContent ?? '', /Pale Moth/);

  await import('../src/ui/app.js?tab-reload');

  assert.equal(tabIs('skills').active, true, 'Skills still selected after reload');
  assert.equal(tabIs('skills').selected, true);
  assert.equal(tabIs('camp').active, false);
  assert.equal(tabIs('camp').selected, false);
  const painted = elements.screen.textContent ?? '';
  assert.match(painted, /Pale Moth/);
  assert.match(painted, /Resume|Fall back/);
  assert.match(painted, /You/);
});
