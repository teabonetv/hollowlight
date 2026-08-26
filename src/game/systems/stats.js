// Honest counters. Every increment lives here so the Statistics page and
// achievement triggers read the same numbers.

export const STAT_KEYS = [
  'playtimeMs',
  'offlineClaims',
  'startedAt',
  'actionsDone',
  'itemsGathered',
  'itemsSold',
  'lumenEarned',
  'lumenSpent',
  'deaths',
  'kills',
  'guardians',
  'distanceWalked',
  'radianceEarned',
  'radianceSpent',
  'autoRestartToggles',
  'tinderHalts',
  'manualStops',
  'sells',
  'beaconsKindled',
  'mapOpens',
  'almanacOpens',
  'starsOpens',
  'settingsOpens',
  'dailiesDone',
  'dailyRerolls',
];

export function emptyStats(nowMs = 0) {
  const s = {
    playtimeMs: 0,
    offlineClaims: 0,
    startedAt: nowMs,
    actionsDone: 0,
    itemsGathered: 0,
    itemsSold: 0,
    lumenEarned: 0,
    lumenSpent: 0,
    deaths: 0,
    kills: 0,
    guardians: 0,
    distanceWalked: 0,
    radianceEarned: 0,
    radianceSpent: 0,
    autoRestartToggles: 0,
    tinderHalts: 0,
    manualStops: 0,
    sells: 0,
    beaconsKindled: 1, // Hearthway starts kindled
    mapOpens: 0,
    almanacOpens: 0,
    starsOpens: 0,
    settingsOpens: 0,
    dailiesDone: 0,
    dailyRerolls: 0,
  };
  return s;
}

function hydrateCountMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Number.isFinite(v) && v > 0) out[k] = Math.floor(v);
  }
  return out;
}

export function hydrateStats(stats, nowMs = 0) {
  const base = emptyStats(nowMs);
  const out = { ...base, ...(stats ?? {}) };
  for (const k of STAT_KEYS) {
    if (!Number.isFinite(out[k])) out[k] = base[k];
  }
  // Per-stack inspector counters (Melvor Times Found). Maps stay empty here
  // (no bank to read). hydrateState floors found up to held qty so a stack
  // you hold is never 0 — that is not invented sold+held history.
  out.itemFound = hydrateCountMap(out.itemFound);
  out.itemSold = hydrateCountMap(out.itemSold);
  out.itemLumen = hydrateCountMap(out.itemLumen);
  return out;
}

/**
 * Times Found is never 0 for a stack in the bank. Raise found to held qty
 * when the counter lagged (starter pack, old v5 saves). Do not invent
 * history: found 10 with 1 held stays 10.
 */
export function floorItemFoundToHeld(state) {
  if (!state || typeof state !== 'object') return state;
  state.stats ??= {};
  state.stats.itemFound ??= {};
  const bank = state.bank && typeof state.bank === 'object' && !Array.isArray(state.bank)
    ? state.bank
    : {};
  for (const [id, qty] of Object.entries(bank)) {
    const n = Math.floor(Number(qty));
    if (!Number.isFinite(n) || n <= 0) continue;
    const found = state.stats.itemFound[id] ?? 0;
    if (n > found) state.stats.itemFound[id] = n;
  }
  return state;
}

export function itemTimesFound(state, itemId) {
  return state?.stats?.itemFound?.[itemId] ?? 0;
}

export function itemTimesSold(state, itemId) {
  return state?.stats?.itemSold?.[itemId] ?? 0;
}

export function itemLumenTaken(state, itemId) {
  return state?.stats?.itemLumen?.[itemId] ?? 0;
}

export function recordItemFound(state, itemId, qty) {
  const n = Math.floor(qty);
  if (!state || !itemId || !(n > 0)) return;
  state.stats ??= {};
  state.stats.itemFound ??= {};
  state.stats.itemFound[itemId] = (state.stats.itemFound[itemId] ?? 0) + n;
}

/** Lifetime cycle count across every action. */
export function totalCycles(state) {
  let n = 0;
  for (const v of Object.values(state.actions?.completed ?? {})) n += v;
  return n;
}

export function recordCycle(state, appliedGains = []) {
  state.stats ??= {};
  state.stats.actionsDone = (state.stats.actionsDone ?? 0) + 1;
  for (const g of appliedGains) {
    if (g.kind === 'item') {
      state.stats.itemsGathered = (state.stats.itemsGathered ?? 0) + g.qty;
    } else if (g.kind === 'lumen') {
      state.stats.lumenEarned = (state.stats.lumenEarned ?? 0) + g.qty;
    }
  }
}

export function recordSell(state, sold, gained, itemId) {
  state.stats ??= {};
  state.stats.sells = (state.stats.sells ?? 0) + 1;
  state.stats.itemsSold = (state.stats.itemsSold ?? 0) + sold;
  state.stats.lumenEarned = (state.stats.lumenEarned ?? 0) + gained;
  if (itemId && sold > 0) {
    state.stats.itemSold ??= {};
    state.stats.itemSold[itemId] = (state.stats.itemSold[itemId] ?? 0) + sold;
  }
  if (itemId && gained > 0) {
    state.stats.itemLumen ??= {};
    state.stats.itemLumen[itemId] = (state.stats.itemLumen[itemId] ?? 0) + gained;
  }
}

export function recordLumenSpend(state, qty) {
  if (!(qty > 0)) return;
  state.stats ??= {};
  state.stats.lumenSpent = (state.stats.lumenSpent ?? 0) + qty;
}

export function recordKill(state, { boss = false } = {}) {
  state.stats ??= {};
  state.stats.kills = (state.stats.kills ?? 0) + 1;
  if (boss) state.stats.guardians = (state.stats.guardians ?? 0) + 1;
}

export function recordDeath(state) {
  state.stats ??= {};
  state.stats.deaths = (state.stats.deaths ?? 0) + 1;
}

/** Rows for the Statistics page — labels stay player-facing and honest. */
export function statsRows(state) {
  const st = state.stats ?? {};
  return [
    ['Time by the flame', st.playtimeMs, 'duration'],
    ['Cycles worked', totalCycles(state), 'number'],
    ['Items gathered', st.itemsGathered ?? 0, 'number'],
    ['Items sold', st.itemsSold ?? 0, 'number'],
    ['Lumen earned', st.lumenEarned ?? 0, 'lumen'],
    ['Lumen spent', st.lumenSpent ?? 0, 'lumen'],
    ['Radiance earned', state.radianceEarned ?? st.radianceEarned ?? 0, 'number'],
    ['Radiance spent', st.radianceSpent ?? 0, 'number'],
    ['Offline claims', st.offlineClaims ?? 0, 'number'],
    ['Deaths', st.deaths ?? 0, 'number'],
    ['Pale-things slain', st.kills ?? 0, 'number'],
    ['Distance walked', st.distanceWalked ?? 0, 'number'],
    ['Beacons kindled', st.beaconsKindled ?? 1, 'number'],
  ];
}
