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
  'hud-known': new FakeNode('button'),
  'hud-hollow': new FakeNode('button'),
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
const { paintHud, formatHollowChip, formatKnownChip } = await import('../src/ui/hud.js');
const { formatNumber } = await import('../src/core/format.js');
const { cascadeAchievements } = await import('../src/game/systems/achievements.js');
const { pushLog } = await import('../src/game/state.js');
const { unlockPerk } = await import('../src/game/systems/radiance.js');
const { bankSellValue, bankCount, uniqueStackCount, lanternRoom } = await import('../src/game/systems/bank.js');
const { ITEMS_BY_ID } = await import('../src/game/data/items.js');

function hudNum(node) {
  const m = String(node.textContent ?? '').replace(/,/g, '').match(/(\d+)/);
  return m ? Number(m[1]) : NaN;
}

function hollowChip(node) {
  const m = String(node.textContent ?? '').match(/(\d+)\s*\/\s*(\d+)/);
  return m ? { used: Number(m[1]), cap: Number(m[2]) } : null;
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
  const chip = hollowChip(elements['hud-hollow']);
  assert.ok(chip, `${label}: hollow chip painted`);
  assert.equal(chip.used, uniqueStackCount(state.bank), `${label}: HUD hollow used == save`);
  assert.equal(chip.cap, lanternRoom(state), `${label}: HUD hollow cap == save`);
  assert.equal(elements['hud-hollow'].textContent, formatHollowChip(state));
  assert.match(elements['hud-hollow'].textContent, /^Hollow \d+\/\d+$/);
  const known = hollowChip(elements['hud-known']);
  assert.ok(known, `${label}: known chip painted`);
  assert.equal(elements['hud-known'].textContent, formatKnownChip(state));
  assert.match(elements['hud-known'].textContent, /^Known \d+\/\d+$/);
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
  const hudKnown = new FakeNode('span');
  const hudHollow = new FakeNode('span');
  const unspent = new FakeNode('span');
  const raw = serializeSave(s, s.savedAt ?? 1);
  paintHud(hudLumen, hudFlame, s, hudRadiance, { unspentRadiance: unspent, hudKnown, hudHollow });
  const env = JSON.parse(raw);
  assert.equal(hudNum(hudLumen), env.state.lumen);
  assert.equal(hudNum(hudRadiance), env.state.radiance ?? 0);
  assert.equal(hudNum(unspent), env.state.radiance ?? 0);
  assert.match(unspent.textContent, /Radiance unspent/);
  assert.equal(hudKnown.textContent, formatKnownChip(s));
  assert.equal(hudHollow.textContent, formatHollowChip(s));
});

test('Sell 1 from the Owned grid: HUD lumen == save.lumen same-eval', () => {
  const bankTab = tabButtons.find((b) => b.dataset.tab === 'bank');
  bankTab.click();

  const worthBefore = (() => {
    const header = elements.screen.querySelector('.screen-sub')?.textContent ?? '';
    const m = header.match(/catalog worth ✦([\d,]+)/);
    return m ? Number(m[1].replace(/,/g, '')) : NaN;
  })();
  const tinderBefore = bankCount(
    deserializeSave(storage.getItem(SAVE_KEY)).state.bank, 'tinderscrap');
  const lumenBefore = hudNum(elements['hud-lumen']);
  assert.equal(tinderBefore, 30);

  const sellToggle = findButton(elements.screen, /Sell Mode/);
  assert.ok(sellToggle, 'Sell Mode toggle on the working pack');
  sellToggle.click();

  let tinder;
  elements.screen._walk?.((n) => {
    if (tinder || n === elements.screen) return;
    if (n.classList?.contains('bank-tile') && /Tinderscrap/.test(n.textContent ?? '')) tinder = n;
  });
  assert.ok(tinder, 'Tinderscrap glyph on the grid');
  const chromeBefore = tinder.querySelector('.bank-chrome')?.textContent ?? '';
  assert.equal(chromeBefore, `✦${ITEMS_BY_ID.tinderscrap.sell} · ×${formatNumber(30)}`);
  tinder.click();

  assertHudEqualsSave('after grid Sell 1');
  const env = JSON.parse(storage.getItem(SAVE_KEY));
  const { state } = deserializeSave(storage.getItem(SAVE_KEY));
  assert.equal(bankCount(state.bank, 'tinderscrap'), 29);
  assert.equal(state.lumen, env.state.lumen);
  assert.equal(hudNum(elements['hud-lumen']), state.lumen);

  const catalogDrop = ITEMS_BY_ID.tinderscrap.sell;
  const header = elements.screen.querySelector('.screen-sub')?.textContent ?? '';
  assert.match(header, new RegExp(`catalog worth ✦${formatNumber(worthBefore - catalogDrop)}`));
  assert.equal(bankSellValue(state.bank), worthBefore - catalogDrop);

  let tinderAfter;
  elements.screen._walk?.((n) => {
    if (tinderAfter || n === elements.screen) return;
    if (n.classList?.contains('bank-tile') && /Tinderscrap/.test(n.textContent ?? '')) tinderAfter = n;
  });
  assert.equal(
    tinderAfter.querySelector('.bank-chrome')?.textContent,
    `✦${catalogDrop} · ×${formatNumber(29)}`);

  const featUnlocked = !!env.state.achievements.unlocked['e-sell-1'];
  if (featUnlocked) {
    assert.equal(state.lumen, lumenBefore + catalogDrop + 5, 'Fair Trade lumen is extra, not a catalog lie');
    const toastText = elements.toasts.textContent ?? '';
    assert.match(toastText, /A Fair Trade/);
    assert.match(toastText, /Sold Tinderscrap/);
    const toastNodes = elements.toasts.querySelectorAll('.toast');
    const combined = toastNodes.filter((n) => {
      const t = n.textContent ?? '';
      return /Sold Tinderscrap/.test(t) && /A Fair Trade/.test(t);
    });
    const splitSell = toastNodes.filter((n) => {
      const t = n.textContent ?? '';
      return /Sold Tinderscrap/.test(t) && !/A Fair Trade/.test(t);
    });
    const splitFeat = toastNodes.filter((n) => {
      const t = n.textContent ?? '';
      return /A Fair Trade/.test(t) && !/Sold Tinderscrap/.test(t);
    });
    assert.equal(combined.length, 1, 'sell + Fair Trade share one toast');
    assert.equal(splitSell.length, 0, 'do not double the same sell');
    assert.equal(splitFeat.length, 0, 'feat is not a competing pop');
    assert.doesNotMatch(
      tinderAfter.querySelector('.bank-chrome')?.textContent ?? '',
      /✦6/,
      'tile chrome stays on catalog ✦1');
    const selling = findButton(elements.screen, /^Selling$/);
    assert.ok(selling, 'Sell Mode survived the Fair Trade remount');
    assert.equal(selling.getAttribute('aria-pressed'), 'true');
    const uiSaved = JSON.parse(storage.getItem('hollowlight.ui') ?? '{}');
    assert.equal(uiSaved.sellMode, true);
  } else {
    assert.equal(state.lumen, lumenBefore + catalogDrop);
  }
});

function activeBankTab() {
  return elements.screen.querySelectorAll('.bank-tab').find((t) => t.classList.contains('active'));
}

test('tapping Known chip leaves Camp for Bank Catalogue (item log)', () => {
  const campTab = tabButtons.find((b) => b.dataset.tab === 'camp');
  campTab.click();
  assert.ok(elements.screen.querySelector('.camp'), 'start on Camp');
  assert.match(elements['hud-known'].textContent ?? '', /^Known \d+\/\d+$/);
  assert.equal(elements['hud-known'].tagName, 'BUTTON');

  elements['hud-known'].click();

  assert.equal(elements.screen.querySelector('.camp'), null, 'Known is a door — leave Camp');
  assert.ok(elements.screen.querySelector('.bank-screen'), 'land on Bank');
  const cat = activeBankTab();
  assert.ok(cat, 'a bank tab is selected');
  assert.match(cat.textContent ?? '', /Catalogue/);
  assert.equal(cat.getAttribute('aria-selected'), 'true');
  const tiles = elements.screen.querySelectorAll('.bank-tile');
  assert.ok(tiles.length >= 100, 'catalogue is a list of items, not a postcard');
  assert.ok(tiles.some((t) => t.classList.contains('unowned')), 'unfound rows are in the log');
  assert.ok(tiles.some((t) => /Lantern-loaf/.test(t.textContent ?? '')), 'found names are on the list');
  assertHudEqualsSave('after Known chip → Catalogue');
});

test('tapping Hollow chip opens the owned Bank grid', () => {
  const campTab = tabButtons.find((b) => b.dataset.tab === 'camp');
  campTab.click();
  assert.ok(elements.screen.querySelector('.camp'), 'start on Camp');
  assert.match(elements['hud-hollow'].textContent ?? '', /^Hollow \d+\/\d+$/);
  assert.equal(elements['hud-hollow'].tagName, 'BUTTON');

  elements['hud-hollow'].click();

  assert.equal(elements.screen.querySelector('.camp'), null, 'Hollow is a door — leave Camp');
  assert.ok(elements.screen.querySelector('.bank-screen'), 'land on Bank');
  const owned = activeBankTab();
  assert.match(owned?.textContent ?? '', /^Owned$/);
  const tiles = elements.screen.querySelectorAll('.bank-tile');
  assert.ok(tiles.length > 0);
  assert.ok(tiles.every((t) => t.classList.contains('owned')));
  assert.equal(elements.screen.querySelectorAll('.bank-tile.unowned').length, 0);
  assertHudEqualsSave('after Hollow chip → Owned');
});

test('dump lantern-loaf: Known stays 6/137, Hollow 5/12, chips still doors', () => {
  const campTab = tabButtons.find((b) => b.dataset.tab === 'camp');
  campTab.click();
  elements['hud-hollow'].click();

  const sellToggle = findButton(elements.screen, /Sell Mode|^Selling$/);
  if (!/Selling/.test(sellToggle?.textContent ?? '')) sellToggle.click();
  const dump = elements.screen.querySelectorAll('.bank-sell-qty-btn')
    .find((b) => /Dump/.test(b.textContent ?? ''));
  assert.ok(dump, 'Dump qty on the owned grid');
  dump.click();

  let loaf;
  elements.screen._walk?.((n) => {
    if (loaf || n === elements.screen) return;
    if (n.classList?.contains('bank-tile') && /Lantern-loaf/.test(n.textContent ?? '')) loaf = n;
  });
  assert.ok(loaf, 'Lantern-loaf still on the owned grid');
  loaf.click();

  assert.equal(elements['hud-known'].textContent, 'Known 6/137');
  assert.equal(elements['hud-hollow'].textContent, 'Hollow 5/12');
  assertHudEqualsSave('after dump loaf');

  campTab.click();
  assert.ok(elements.screen.querySelector('.camp'), 'back on Camp');
  assert.equal(elements['hud-known'].textContent, 'Known 6/137');
  assert.equal(elements['hud-hollow'].textContent, 'Hollow 5/12');

  elements['hud-known'].click();
  assert.ok(elements.screen.querySelector('.bank-screen'));
  assert.match(activeBankTab()?.textContent ?? '', /Catalogue/);
  let catLoaf;
  elements.screen._walk?.((n) => {
    if (catLoaf || n === elements.screen) return;
    if (n.classList?.contains('bank-tile') && /Lantern-loaf/.test(n.textContent ?? '')) catLoaf = n;
  });
  assert.ok(catLoaf, 'dumped loaf still named in Catalogue');
  assert.ok(catLoaf.classList.contains('known-empty'));
  assert.equal(catLoaf.querySelector('.bank-qty')?.textContent, '0');
});
