// Number and time formatting shared by every screen. Locale-independent
// (fixed separators) so tests, screenshots, and players all see the same
// strings. Compact tiers start at 100k; below that full grouped integers keep
// early-game amounts feeling tangible.

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

function groupThousands(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function trimZeros(s) {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** 999 → "999", 1234 → "1,234", 100000 → "100K", 1234567 → "1.23M". */
export function formatNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (!Number.isFinite(n)) return n < 0 ? '-∞' : '∞';
  if (n < 0) return '-' + formatNumber(-n);

  const value = Math.floor(n);
  if (value < 100000) return groupThousands(String(value));

  let tier = Math.min(Math.floor(Math.log10(value) / 3), SUFFIXES.length - 1);
  // Pre-rounding boundary check: 999,500+ displays as the NEXT tier ("1M"),
  // so "1000K"-style artifacts can never appear.
  if (value / 1000 ** tier >= 999.5) tier++;
  const scaled = value / 1000 ** tier;
  const digits = scaled >= 99.5 ? 0 : scaled >= 9.95 ? 1 : 2;
  return trimZeros(scaled.toFixed(digits)) + SUFFIXES[tier];
}

/** 45_500ms → "45s"; 5_400_000 → "1h 30m"; 97_200_000 → "1d 3h". */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Short clock for action progress bars: one-decimal seconds, e.g. "3.4s". */
export function formatSeconds(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0.0s';
  return `${(Math.round(ms / 100) / 10).toFixed(1)}s`;
}

/** "1 soul" / "4 souls" — never "1 souls". `n` is floored like formatNumber. */
export function formatNoun(n, singular, plural = `${singular}s`) {
  const count = Math.floor(Number(n));
  const word = count === 1 ? singular : plural;
  return `${formatNumber(count)} ${word}`;
}
