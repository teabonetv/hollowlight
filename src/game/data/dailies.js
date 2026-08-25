// Daily ember task pool. One rotating set of 3; rerollable once.
// Seeded by UTC day so every player shares the same offering. No streak,
// no punishment for missing a day — gentle retention only.

export const DAILY_TASK_COUNT = 3;
export const DAILY_REROLLS_PER_DAY = 1;

/** @type {Array<{
 *   id: string, label: string, hint: string,
 *   kind: 'cycles'|'lumenEarned'|'itemsGathered'|'playMinutes'|'skillLevel',
 *   actionId?: string, skillId?: string, need: number, reward: number
 * }>} */
export const DAILY_POOL = [
  { id: 'tend-8', kind: 'cycles', actionId: 'tend-flame', need: 8, reward: 2, label: 'Tend the Flame ×8', hint: 'Eight cycles at the coals.' },
  { id: 'tend-20', kind: 'cycles', actionId: 'tend-flame', need: 20, reward: 3, label: 'Tend the Flame ×20', hint: 'A longer watch.' },
  { id: 'herbs-10', kind: 'cycles', actionId: 'gather-herbs', need: 10, reward: 2, label: 'Gather Herbs ×10', hint: 'Walk the fog-line a while.' },
  { id: 'herbs-25', kind: 'cycles', actionId: 'gather-herbs', need: 25, reward: 3, label: 'Gather Herbs ×25', hint: 'Fill the satchel.' },
  { id: 'fungi-8', kind: 'cycles', actionId: 'gather-fungi', need: 8, reward: 3, label: 'Gather Fungi ×8', hint: 'Needs Foraging 5.' },
  { id: 'any-15', kind: 'cycles', need: 15, reward: 2, label: 'Any work ×15', hint: 'Fifteen cycles of anything.' },
  { id: 'any-40', kind: 'cycles', need: 40, reward: 4, label: 'Any work ×40', hint: 'A proper session.' },
  { id: 'lumen-25', kind: 'lumenEarned', need: 25, reward: 2, label: 'Earn ✦25', hint: 'From work or sales — honestly counted.' },
  { id: 'lumen-80', kind: 'lumenEarned', need: 80, reward: 3, label: 'Earn ✦80', hint: 'A brighter purse.' },
  { id: 'gather-20', kind: 'itemsGathered', need: 20, reward: 2, label: 'Gather 20 items', hint: 'Stacks that were not there this morning.' },
  { id: 'gather-60', kind: 'itemsGathered', need: 60, reward: 3, label: 'Gather 60 items', hint: 'The satchel grows heavy.' },
  { id: 'sit-10', kind: 'playMinutes', need: 10, reward: 2, label: 'Keep the lantern 10 minutes', hint: 'Live or credited offline time counts.' },
  { id: 'sit-25', kind: 'playMinutes', need: 25, reward: 3, label: 'Keep the lantern 25 minutes', hint: 'A real watch.' },
  { id: 'ek-3', kind: 'skillLevel', skillId: 'emberkeeping', need: 3, reward: 3, label: 'Emberkeeping 3', hint: 'If you are already there, claim at once.' },
  { id: 'fo-3', kind: 'skillLevel', skillId: 'foraging', need: 3, reward: 3, label: 'Foraging 3', hint: 'If you are already there, claim at once.' },
];

export const DAILY_POOL_BY_ID = Object.fromEntries(DAILY_POOL.map((t) => [t.id, t]));
