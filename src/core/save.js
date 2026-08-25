// Versioned save/load (charter §5 "save integrity").
//
// Envelope format:
//   { version: <int>, savedAt: <ms>, state: {...} }
//
// Migration hook: append to MIGRATIONS when the schema changes.
//   { from: 1, migrate(state) { ...; return newState } }
// deserialize walks them in order until the save reaches SAVE_VERSION.

import { hydrateState } from '../game/hydrate.js';

export const SAVE_KEY = 'hollowlight.save';
export const SAVE_VERSION = 1;

/** @type {Array<{from:number, migrate:(s:any)=>any}>} */
export const MIGRATIONS = [];

export class SaveError extends Error {
  constructor(reason, detail) {
    super(`save error: ${reason}${detail ? ` (${detail})` : ''}`);
    this.name = 'SaveError';
    this.reason = reason;
  }
}

export function serializeSave(state, savedAtMs) {
  return JSON.stringify({ version: SAVE_VERSION, savedAt: savedAtMs, state });
}

/**
 * Parse + validate + migrate a save envelope. Throws SaveError with a stable
 * `reason` ('corrupt' | 'malformed' | 'newer' | 'unmigratable') so callers can
 * show an honest message instead of silently wiping.
 */
export function deserializeSave(json, { currentVersion = SAVE_VERSION, migrations = MIGRATIONS } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SaveError('corrupt');
  }
  if (!parsed || typeof parsed !== 'object'
    || typeof parsed.version !== 'number'
    || !parsed.state || typeof parsed.state !== 'object') {
    throw new SaveError('malformed');
  }
  if (parsed.version > currentVersion) {
    throw new SaveError('newer', String(parsed.version));
  }

  let state = parsed.state;
  let v = parsed.version;
  const sorted = [...migrations].sort((a, b) => a.from - b.from);
  for (const m of sorted) {
    if (m.from !== v) continue;
    state = m.migrate(state) ?? state;
    v += 1;
  }
  if (v !== currentVersion) throw new SaveError('unmigratable', `${parsed.version}→${v}`);

  state = hydrateState(state);

  return { state, savedAt: Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0 };
}

// Storage is injected (localStorage-shaped: getItem/setItem/removeItem) so
// tests run against a plain object and the app passes window.localStorage.

export function storageGet(storage, key = SAVE_KEY) {
  try { return storage.getItem(key); } catch { return null; }
}

export function storageSet(storage, json, key = SAVE_KEY) {
  try {
    storage.setItem(key, json);
    return true;
  } catch {
    return false; // quota/private-mode failures must never crash gameplay
  }
}
