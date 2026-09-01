// Warden rite — camp ceremony that kindles Ashfen.
// Pure over the state object. Key path if the Warden’s iron is held;
// otherwise cheap existing goods + Lumen. Never a “later” toast.

import { ITEMS_BY_ID } from '../data/items.js';
import { WARDEN_RITE } from '../data/world/rites.js';
import { ASHFEN_ID, SETTLEMENT_BY_ID } from '../data/world/settlements.js';
import { bankCount, bankPay, canAfford } from './bank.js';
import { recordLumenSpend } from './stats.js';
import { pushLog } from '../state.js';

export { WARDEN_RITE, ASHFEN_ID };

export function kindledBeaconsList(state) {
  const list = state?.beacons?.kindled;
  return Array.isArray(list) ? list : ['hearthway'];
}

export function isBeaconKindled(state, beaconId) {
  return kindledBeaconsList(state).includes(beaconId);
}

export function isAshfenReachable(state) {
  return isBeaconKindled(state, ASHFEN_ID);
}

export function isSettlementReachable(state, settlementId) {
  const row = SETTLEMENT_BY_ID[settlementId];
  if (!row) return false;
  return isBeaconKindled(state, row.beaconId);
}

function itemCosts(items) {
  return Object.entries(items ?? {}).map(([id, qty]) => ({
    id,
    qty,
    name: ITEMS_BY_ID[id]?.name ?? id,
  }));
}

/** Prefer the Warden key when held; otherwise the goods + Lumen offering. */
export function riteOffering(state) {
  const keyId = WARDEN_RITE.keyId;
  if (bankCount(state.bank, keyId) >= 1) {
    return {
      path: 'key',
      lumen: 0,
      items: { [keyId]: 1 },
      chips: itemCosts({ [keyId]: 1 }),
    };
  }
  const { lumen, items } = WARDEN_RITE.goods;
  const chips = [];
  if (lumen > 0) chips.push({ id: 'lumen', qty: lumen, name: 'Lumen' });
  chips.push(...itemCosts(items));
  return { path: 'goods', lumen, items, chips };
}

export function riteNeedLabel(state, offering = riteOffering(state)) {
  if ((offering.lumen ?? 0) > (state.lumen ?? 0)) {
    return `Need ✦${offering.lumen}`;
  }
  for (const c of itemCosts(offering.items)) {
    if (bankCount(state.bank, c.id) < c.qty) return `Need ${c.name} ×${c.qty}`;
  }
  return 'Need offering';
}

export function canPerformWardenRite(state) {
  if (isAshfenReachable(state)) {
    return { ok: false, done: true, error: WARDEN_RITE.doneToast };
  }
  const offering = riteOffering(state);
  const lumenOk = (state.lumen ?? 0) >= (offering.lumen ?? 0);
  const goodsOk = canAfford(state.bank, itemCosts(offering.items));
  if (!lumenOk || !goodsOk) {
    return { ok: false, done: false, error: riteNeedLabel(state, offering), offering };
  }
  return { ok: true, done: false, offering };
}

export function kindleBeacon(state, beaconId) {
  state.beacons ??= { kindled: ['hearthway'] };
  state.beacons.kindled ??= ['hearthway'];
  if (state.beacons.kindled.includes(beaconId)) return false;
  state.beacons.kindled.push(beaconId);
  state.stats ??= {};
  state.stats.beaconsKindled = (state.stats.beaconsKindled ?? 1) + 1;
  return true;
}

/**
 * Spend the Warden key (or goods + Lumen) and unlock Ashfen.
 * Atomic: unaffordable calls leave state untouched.
 */
export function performWardenRite(state, { nowMs } = {}) {
  const check = canPerformWardenRite(state);
  if (!check.ok) return check;

  const { offering } = check;
  if ((offering.lumen ?? 0) > 0) {
    state.lumen -= offering.lumen;
    recordLumenSpend(state, offering.lumen);
  }
  bankPay(state.bank, itemCosts(offering.items));
  kindleBeacon(state, WARDEN_RITE.beaconId);

  const at = Number.isFinite(nowMs) ? nowMs : (state.stats?.playtimeMs ?? 0);
  pushLog(state, WARDEN_RITE.journal, at);

  return {
    ok: true,
    settlementId: WARDEN_RITE.settlementId,
    settlement: SETTLEMENT_BY_ID[WARDEN_RITE.settlementId]?.name ?? 'Ashfen',
    path: offering.path,
    toast: WARDEN_RITE.toast,
  };
}
