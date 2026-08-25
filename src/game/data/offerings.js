// Altar offerings — burn goods for Radiance sparks (prestige currency).
// Does NOT spend Radiance; the constellation grid is a later lane.
// Sparks are slow on purpose: offerings are a sink for surplus stacks.

/** Radiance granted per item offered. Missing ids use the fallback. */
export const OFFERING_SPARKS = {
  tinderscrap: 1,
  bogmoss: 1,
  peatbrick: 1,
  fogwort: 1,
  palecap: 1,
  graveresin: 2,
  rushwick: 1,
  'soul-ember': 6,
  'journal-page': 4,
  'first-match': 12,
  'wisp-core': 8,
};

export function sparksFor(item) {
  if (!item) return 0;
  if (OFFERING_SPARKS[item.id] != null) return OFFERING_SPARKS[item.id];
  // Fallback: 1 spark per tier, +1 if unique/relic/drop.
  let n = Math.max(1, item.tier ?? 1);
  if (item.unique || item.category === 'relic' || item.category === 'drop') n += 2;
  return n;
}
