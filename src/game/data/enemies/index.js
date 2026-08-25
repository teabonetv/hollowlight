import { REGULARS } from './regulars.js';
import { BOSSES } from './bosses.js';

export { REGULARS, BOSSES };
export const ENEMIES = [...REGULARS, ...BOSSES];
export const ENEMIES_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));

export function enemiesInZone(zoneId, { bosses = true } = {}) {
  return ENEMIES.filter((e) => e.zoneId === zoneId && (bosses || !e.boss));
}

export function bossOfZone(zoneId) {
  return BOSSES.find((b) => b.zoneId === zoneId) ?? null;
}
