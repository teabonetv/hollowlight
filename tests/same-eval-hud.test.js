// Same-eval contract: HUD pills equal hollowlight.save in one shot — after
// boot feats, after opening Almanac, after claiming a daily. No later flush.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeNode } from './helpers/fake-node.mjs';

function tabButton(tab) {
  const b = new FakeNode('button');
  b.dataset.tab = tab;
  b.setAttribute('data-tab', tab);
  return b;
}

const tabButtons = ['camp', 'skills', 'bank', 'map', 'journal'].map(tabButton);

const elements = {
  'hud-lumen': new FakeNode('span'),
  'hud-radiance': new FakeNode('span'),
  'hud-flame': new FakeNode('span'),
  screen: new FakeNode('main'),
  'modal-root': new FakeNode('div'),
  toasts: new FakeNode('div'),
  'btn-settings': new FakeNode('button'),
  'boot-fallback': new FakeNode('div'),
};

function findById(node, id) {
  if (!node) return null;
  if (node.attrs?.id === id) return node;
  for (const c of node.children ?? []) {
    const hit = findById(c, id);
    if (hit) return hit;
  }
  return null;
}

function findButton(root, re) {
  let hit = null;
  root._walk?.((n) => {
    if (hit || n === root) return;
    if (n.tagName === 'BUTTON' && re.test(n.textContent ?? '')) hit = n;
  });
  return hit;
}

const docEl = new FakeNode('html');
globalThis.document = {
  readyState: 'complete',
  documentElement: docEl,
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => ({ nodeType: 3, textContent: String(s) }),
  getElementById: (id) => elements[id] ?? findById(elements.screen, id),
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
globalThis.requestAnimationFrame = () => 0;
globalThis.setInterval = () => 0;
globalThis.setTimeout = () => 0;
if (!globalThis.navigator) globalThis.navigator = {};

const { SAVE_KEY, serializeSave, deserializeSave } = await import('../src/core/save.js');
const { createState } = await import('../src/game/state.js');
const { ensureDailies, claimDaily, taskProgress } = await import('../src/game/systems/dailies.js');
const { paintHud } = await import('../src/ui/hud.js');
const { formatNumber } = await import('../src/core/format.js');
const { cascadeAchievements } = await import('../src/game/systems/achievements.js');
const { pushLog } = await import('../src/game/state.js');
const { unlockPerk } = await import('../src/game/systems/radiance.js');

function hudNum(node) {
  const m = String(node.textContent ?? '').replace(/,/g, '').match(/(\d+)/);
  return m ? Number(m[1]) : NaN;
}

function assertHudEqualsSave(label) {
  const raw = storage.getItem(SAVE_KEY);
  assert.ok(raw, `${label}: save present`);
  const env = JSON.parse(raw);
  const { state } = deserializeSave(raw);
  assert.equal(hudNum(elements['hud-lumen']), env.state.lumen, `${label}: HUD lumen == envelope`);
  assert.equal(hudNum(elements['hud-radiance']), env.state.radiance ?? 0, `${label}: HUD radiance == envelope`);
  assert.equal(hudNum(elements['hud-flame']), env.state.flame ?? 0, `${label}: HUD flame == envelope`);
  assert.equal(state.lumen, env.state.lumen);
  assert.equal(elements['hud-lumen'].textContent, `✦ ${formatNumber(state.lumen)}`);
  assert.equal(elements['hud-radiance'].textContent, `✧ ${formatNumber(state.radiance ?? 0)}`);
}

await import('../src/ui/app.js?same-eval');

test('boot feats land in hollowlight.save before/with first HUD paint', () => {
  assertHudEqualsSave('fresh boot');
  const env = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(env.state.lumen, 35, 'Cataloguer cascade is persisted, not just painted');
  assert.ok(env.state.achievements.unlocked['g-known-6']);
  assert.ok(env.state.achievements.unlocked['s-title']);
});

test('opening Almanac keeps HUD and save on the same wallet', () => {
  const journal = tabButtons.find((b) => b.dataset.tab === 'journal');
  journal.click();
  const stars = findButton(elements.screen, /^Stars$/);
  stars?.click();
  assertHudEqualsSave('after Almanac / Stars');
  const env = JSON.parse(storage.getItem(SAVE_KEY));
  assert.ok(env.state.stats.almanacOpens >= 1);
  const unspent = findById(elements.screen, 'almanac-radiance-unspent');
  assert.ok(unspent, 'constellation binds Radiance unspent');
  assert.equal(hudNum(unspent), hudNum(elements['hud-radiance']));
  assert.equal(hudNum(unspent), env.state.radiance ?? 0);
});

test('claim + kindling path: persist-then-paint matches deserialize in one shot', () => {
  const s = createState({ nowMs: Date.UTC(2026, 7, 25), rngSeed: 9 });
  ensureDailies(s, Date.UTC(2026, 7, 25));
  s.actions.completed['tend-flame'] = 999;
  s.actions.completed['gather-herbs'] = 999;
  s.stats.lumenEarned = 999;
  s.stats.itemsGathered = 999;
  s.stats.playtimeMs = 999 * 60_000;
  s.skills.emberkeeping.level = 99;
  s.skills.foraging.level = 99;
  cascadeAchievements(s, { onUnlock(a) { pushLog(s, `Feat lit: ${a.name}.`, 0); } });
  const task = s.dailies.tasks.find((t) => taskProgress(s, t).done && !t.claimed);
  const claim = claimDaily(s, task.id);
  assert.equal(claim.ok, true);
  cascadeAchievements(s, { onUnlock(a) { pushLog(s, `Feat lit: ${a.name}.`, 0); } });
  if ((s.radiance ?? 0) >= 1 && !(s.perks.owned ?? []).includes('kindling')) {
    assert.equal(unlockPerk(s, 'kindling').ok, true);
    cascadeAchievements(s, { onUnlock(a) { pushLog(s, `Feat lit: ${a.name}.`, 0); } });
  }
  const hudLumen = new FakeNode('span');
  const hudFlame = new FakeNode('span');
  const hudRadiance = new FakeNode('span');
  const unspent = new FakeNode('span');
  const raw = serializeSave(s, s.savedAt ?? 1);
  paintHud(hudLumen, hudFlame, s, hudRadiance, { unspentRadiance: unspent });
  const env = JSON.parse(raw);
  assert.equal(hudNum(hudLumen), env.state.lumen);
  assert.equal(hudNum(hudRadiance), env.state.radiance ?? 0);
  assert.equal(hudNum(unspent), env.state.radiance ?? 0);
  assert.match(unspent.textContent, /Radiance unspent/);
});
