// S5a: Warden rite opens Ashfen. Before the rite the first pilgrim-road
// wick is locked; after it, Map and Hunt can reach Ashfen. SAVE_VERSION
// stays 5. No twelve-settlement dump.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeNode, FakeText } from './helpers/fake-node.mjs';

globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => new FakeText(s),
};
globalThis.requestAnimationFrame = (fn) => 0;
try { globalThis.navigator = {}; } catch { /* node ≥21 read-only navigator */ }

const { createState } = await import('../src/game/state.js');
const { SAVE_VERSION } = await import('../src/core/save.js');
const { ZONES, ZONE_BY_ID, ASHFEN_ZONE } = await import('../src/game/data/combat/zones.js');
const { WARDEN_RITE } = await import('../src/game/data/world/rites.js');
const { SETTLEMENTS, huntRoadZones } = await import('../src/game/data/world/settlements.js');
const rite = await import('../src/game/systems/rite.js');
const combat = await import('../src/game/systems/combat.js');
const { bankCount } = await import('../src/game/systems/bank.js');
const tabs = await import('../src/ui/screens/tabs.js');
const { renderCombatPanel } = await import('../src/ui/screens/combat.js');

function makeCtx(state, extras = {}) {
  return {
    state,
    toast() {},
    openSkill() {},
    performWardenRite() { return rite.performWardenRite(state); },
    travelToSettlement() {},
    ...extras,
  };
}

test('SAVE_VERSION stays 5', () => {
  assert.equal(SAVE_VERSION, 5);
});

test('before the rite Ashfen is locked; Hearthway stays kindled', () => {
  const s = createState({ nowMs: 0, rngSeed: 11 });
  assert.equal(combat.zoneUnlock(s, 'hearthway').ok, true);
  assert.equal(rite.isAshfenReachable(s), false);
  assert.equal(combat.zoneUnlock(s, 'ashfen').ok, false);
  assert.match(combat.zoneUnlock(s, 'ashfen').reason, /Warden rite|Ashfen waits/i);
  assert.equal(combat.startFight(s, 'fen-moth').ok, false);
  assert.deepEqual(s.beacons.kindled, ['hearthway']);
});

test('goods + Lumen rite unlocks Ashfen and spends starter offerings', () => {
  const s = createState({ nowMs: 0, rngSeed: 12 });
  const fog = bankCount(s.bank, 'fogwort');
  const tinder = bankCount(s.bank, 'tinderscrap');
  const lumen = s.lumen;
  const res = rite.performWardenRite(s);
  assert.equal(res.ok, true);
  assert.equal(res.settlementId, 'ashfen');
  assert.equal(res.path, 'goods');
  assert.equal(rite.isAshfenReachable(s), true);
  assert.equal(combat.zoneUnlock(s, 'ashfen').ok, true);
  assert.ok(s.beacons.kindled.includes('ashfen'));
  assert.equal(s.lumen, lumen - WARDEN_RITE.goods.lumen);
  assert.equal(bankCount(s.bank, 'fogwort'), fog - WARDEN_RITE.goods.items.fogwort);
  assert.equal(bankCount(s.bank, 'tinderscrap'), tinder - WARDEN_RITE.goods.items.tinderscrap);
  assert.equal(s.stats.beaconsKindled, 2);
  assert.ok(s.log.some((e) => /Ashfen/.test(e.text)));
});

test('after the rite Hunt can start an Ashfen fight; Vespers stays locked', () => {
  const s = createState({ nowMs: 0, rngSeed: 13 });
  assert.equal(rite.performWardenRite(s).ok, true);
  const fight = combat.startFight(s, 'fen-moth', { encounterSeed: 7 });
  assert.equal(fight.ok, true);
  assert.equal(s.combat.foe.id, 'fen-moth');
  assert.equal(combat.zoneUnlock(s, 'vespers').ok, false);
});

test('Warden key is preferred and does not spend the goods path', () => {
  const s = createState({ nowMs: 0, rngSeed: 14 });
  s.bank['key-hearthway'] = 1;
  const fog = bankCount(s.bank, 'fogwort');
  const lumen = s.lumen;
  const res = rite.performWardenRite(s);
  assert.equal(res.ok, true);
  assert.equal(res.path, 'key');
  assert.equal(bankCount(s.bank, 'key-hearthway'), 0);
  assert.equal(bankCount(s.bank, 'fogwort'), fog);
  assert.equal(s.lumen, lumen);
  assert.equal(rite.isAshfenReachable(s), true);
});

test('a second rite does not restamp Ashfen or take another offering', () => {
  const s = createState({ nowMs: 0, rngSeed: 15 });
  assert.equal(rite.performWardenRite(s).ok, true);
  const lumen = s.lumen;
  const fog = bankCount(s.bank, 'fogwort');
  const again = rite.performWardenRite(s);
  assert.equal(again.ok, false);
  assert.equal(again.done, true);
  assert.equal(s.lumen, lumen);
  assert.equal(bankCount(s.bank, 'fogwort'), fog);
  assert.equal(s.beacons.kindled.filter((id) => id === 'ashfen').length, 1);
});

test('unaffordable rite leaves Ashfen locked', () => {
  const s = createState({ nowMs: 0, rngSeed: 16 });
  s.lumen = 0;
  s.bank = { tinderscrap: 1 };
  const denied = rite.performWardenRite(s);
  assert.equal(denied.ok, false);
  assert.equal(rite.isAshfenReachable(s), false);
  assert.match(denied.error, /Need/i);
});

test('camp hosts the Warden rite; it does not restamp Hand or hearth craft', () => {
  const s = createState({ nowMs: 0, rngSeed: 17 });
  const performed = [];
  const scr = tabs.renderCampScreen(makeCtx(s, {
    performWardenRite() { performed.push('rite'); return rite.performWardenRite(s); },
  }));
  const card = scr.node.querySelector('[data-camp="rite"]');
  assert.ok(card, 'rite card on Camp');
  assert.ok(scr.node.querySelector('[data-camp="hand"]'), 'Hand card still present');
  assert.ok(scr.node.querySelector('[data-camp="craft"]'), 'hearth craft still present');
  const btn = scr.node.querySelector('[data-rite="warden"]');
  assert.match(btn.textContent ?? '', /rite|Offer/i);
  btn.click();
  assert.deepEqual(performed, ['rite']);
  assert.equal(rite.isAshfenReachable(s), true);
  scr.update();
  assert.match(btn.textContent ?? '', /Walk to Ashfen/);
});

test('map Ashfen tap is not a later toast; after the rite the node is lit', () => {
  const s = createState({ nowMs: 0, rngSeed: 18 });
  const toasts = [];
  const travelled = [];
  const ctx = makeCtx(s, {
    toast(m) { toasts.push(m); },
    travelToSettlement(id) {
      travelled.push(id);
      if (!rite.isSettlementReachable(s, id)) {
        toasts.push('Ashfen waits. Perform the Warden rite at camp.');
        return { ok: false };
      }
      toasts.push('Ashfen — the pilgrim verge is walkable from here.');
      return { ok: true };
    },
  });
  const scr = tabs.renderMapScreen(ctx);
  const ash = scr.node.querySelector('[data-settlement="ashfen"]');
  assert.ok(!/\blit\b/.test(ash.className));
  ash.click();
  assert.deepEqual(travelled, ['ashfen']);
  assert.equal(toasts.some((m) => /later/i.test(m)), false);

  assert.equal(rite.performWardenRite(s).ok, true);
  scr.update();
  const lit = scr.node.querySelector('[data-settlement="ashfen"]');
  assert.ok(/\blit\b/.test(lit.className));
  assert.match(scr.node.textContent ?? '', /Ashfen is open/);
});

test('Hunt road lists Hearthway and Ashfen only; Ashfen hunts appear after the rite', () => {
  assert.equal(ZONES.length, 12, 'twelve roster stubs stay stubs');
  assert.equal(ZONE_BY_ID.ashfen, ASHFEN_ZONE);
  assert.deepEqual(huntRoadZones().map((z) => z.id), ['hearthway', 'ashfen']);
  assert.equal(SETTLEMENTS.length, 2);

  const s = createState({ nowMs: 0, rngSeed: 19 });
  const before = renderCombatPanel(makeCtx(s));
  const chips = before.node.querySelectorAll('[data-zone]');
  assert.equal(chips.length, 2);
  const ashChip = chips.find((c) => c.getAttribute('data-zone') === 'ashfen');
  assert.ok(ashChip);
  assert.ok(/\blocked\b/.test(ashChip.className));
  assert.doesNotMatch(before.node.textContent ?? '', /later wave/i);

  assert.equal(rite.performWardenRite(s).ok, true);
  s.combat.zoneId = 'ashfen';
  const after = renderCombatPanel(makeCtx(s));
  assert.match(after.node.textContent ?? '', /Fen-moth|Ash-wight|Verge-crawler/);
  assert.match(after.node.textContent ?? '', /Ashfen is kindled|pilgrim verge/i);
});
