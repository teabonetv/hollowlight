// S2n: one True Completion % (items known / live catalogue).
// Critic v45: Camp 2% (LOG mean) ≠ Items 4% (catalogue) ≠ HUD Known 6/137 (count, no %).
// Wave 1 identity is the catalogue fraction, painted as the same string on
// HUD beside Known, Almanac Items head, and Camp completion face.
// Known 6/137 stays the count door. Hollow occupancy is a different number.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FakeNode, FakeText } from './helpers/fake-node.mjs';

globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => new FakeText(s),
  addEventListener() {},
  removeEventListener() {},
};
globalThis.requestAnimationFrame = (fn) => 0;
try { globalThis.navigator = {}; } catch { /* node ≥21 read-only */ }

import { createState, STARTER_BANK } from '../src/game/state.js';
import { ITEMS } from '../src/game/data/items.js';
import { SAVE_VERSION } from '../src/core/save.js';
import { sellItems, tryBankAdd } from '../src/game/systems/bank.js';
import { itemTimesFound } from '../src/game/systems/stats.js';
import {
  trueCompletion, totalCompletion, knownItemCount, formatCompletionPct,
} from '../src/game/systems/completion.js';
import { paintHud, formatKnownChip, formatHollowChip, formatTrueCompletionChip } from '../src/ui/hud.js';
import { renderCampScreen } from '../src/ui/screens/tabs.js';
import { renderAlmanacScreen } from '../src/ui/screens/meta.js';

function almanacCtx(state, view = 'log-items') {
  return {
    state,
    toast() {},
    almanacView: () => view,
    openAlmanac() {},
    ensureDailies() {},
    rerollDailies() {},
    claimDaily() {},
  };
}

function campCtx(state) {
  return { state, toast() {}, buyUpgrade() {}, openSellSheet() {} };
}

function paintIdentity(state) {
  const hudKnown = new FakeNode('button');
  const hudHollow = new FakeNode('button');
  const hudComplete = new FakeNode('span');
  paintHud(new FakeNode('span'), new FakeNode('span'), state, new FakeNode('span'), {
    hudKnown, hudHollow, hudComplete,
  });
  const camp = renderCampScreen(campCtx(state));
  const items = renderAlmanacScreen(almanacCtx(state, 'log-items'));
  return {
    label: trueCompletion(state).label,
    hud: hudComplete.textContent,
    known: hudKnown.textContent,
    hollow: hudHollow.textContent,
    camp: camp.node.querySelector('[data-true-complete="camp"]')?.textContent
      ?? camp.node.querySelector('.stat-complete')?.querySelector('.stat-value')?.textContent,
    items: items.node.querySelector('[data-true-complete="items"]')?.textContent,
    itemsHead: items.node.querySelector('.log-items-head')?.querySelector('.screen-sub')?.textContent,
  };
}

test('trueCompletion is items known / live catalogue, formatted like Items 4%', () => {
  const s = createState({ rngSeed: 1 });
  const tot = trueCompletion(s);
  assert.equal(tot.done, Object.keys(STARTER_BANK).length);
  assert.equal(tot.done, 6);
  assert.equal(tot.total, ITEMS.length);
  assert.equal(tot.total, 137);
  assert.equal(tot.pct, 6 / 137);
  assert.equal(tot.label, formatCompletionPct(6 / 137));
  assert.equal(tot.label, '4%');
  assert.equal(formatTrueCompletionChip(s), '4%');
  assert.equal(formatKnownChip(s), 'Known 6/137');
  assert.notEqual(totalCompletion(s).label, tot.label,
    'LOG four-bucket mean must not masquerade as the HUD identity');
  assert.equal(SAVE_VERSION, 5);
});

test('HUD %, Almanac Items %, Camp % are identical strings for the same save', () => {
  const s = createState({ rngSeed: 1 });
  const painted = paintIdentity(s);
  assert.equal(painted.label, '4%');
  assert.equal(painted.hud, painted.label);
  assert.equal(painted.camp, painted.label);
  assert.equal(painted.items, painted.label);
  assert.equal(painted.hud, painted.camp);
  assert.equal(painted.camp, painted.items);
  assert.equal(painted.known, 'Known 6/137');
  assert.match(painted.itemsHead ?? '', /^4% · 6\/137/);
});

test('dump loaf does not change Known or the True Completion %; Hollow occupancy is separate', () => {
  const s = createState({ rngSeed: 1 });
  const before = paintIdentity(s);
  assert.equal(before.known, 'Known 6/137');
  assert.equal(before.hud, '4%');
  assert.equal(before.hollow, 'Hollow 6/12');

  const prior = itemTimesFound(s, 'lantern-loaf');
  const dumped = sellItems(s, 'lantern-loaf', prior);
  assert.equal(dumped.ok, true);
  assert.equal(s.bank['lantern-loaf'], undefined);
  assert.equal(itemTimesFound(s, 'lantern-loaf'), prior);
  assert.equal(knownItemCount(s), 6);

  const after = paintIdentity(s);
  assert.equal(after.known, 'Known 6/137');
  assert.equal(after.hud, before.hud);
  assert.equal(after.camp, before.camp);
  assert.equal(after.items, before.items);
  assert.equal(after.hud, '4%');
  assert.equal(after.hollow, 'Hollow 5/12');
  assert.equal(formatHollowChip(s), 'Hollow 5/12');
  assert.equal(SAVE_VERSION, 5);
});

test('a new find moves HUD, Camp, and Items % together', () => {
  const s = createState({ rngSeed: 1 });
  const before = trueCompletion(s).label;
  const added = tryBankAdd(s, 'palecap', 3);
  assert.equal(added.ok, true);
  const tot = trueCompletion(s);
  assert.equal(tot.done, 7);
  assert.equal(tot.label, formatCompletionPct(7 / 137));
  assert.notEqual(tot.label, before);

  const painted = paintIdentity(s);
  assert.equal(painted.hud, tot.label);
  assert.equal(painted.camp, tot.label);
  assert.equal(painted.items, tot.label);
  assert.equal(painted.known, 'Known 7/137');
});

test('index.html pins True Completion beside Known; Known stays the count door', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="hud-known"/);
  assert.match(html, /id="hud-complete"/);
  assert.match(html, /Known 0\/137/);
  const knownAt = html.indexOf('id="hud-known"');
  const completeAt = html.indexOf('id="hud-complete"');
  const hollowAt = html.indexOf('id="hud-hollow"');
  assert.ok(knownAt > 0 && completeAt > knownAt && hollowAt > completeAt,
    '% sits beside Known, before Hollow');
});
