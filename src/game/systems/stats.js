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

export function hydrateStats(stats, nowMs = 0) {
  const base = emptyStats(nowMs);
  const out = { ...base, ...(stats ?? {}) };
  for (const k of STAT_KEYS) {
    if (!Number.isFinite(out[k])) out[k] = base[k];
  }
  return out;
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

export function recordSell(state, sold, gained) {
  state.stats ??= {};
  state.stats.sells = (state.stats.sells ?? 0) + 1;
  state.stats.itemsSold = (state.stats.itemsSold ?? 0) + sold;
  state.stats.lumenEarned = (state.stats.lumenEarned ?? 0) + gained;
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
