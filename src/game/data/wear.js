// Wear slots combat (and Camp) read. The 2×3 grid is locked until the first
// chimney is smithed or equipped — never on minute one. Tool is skilling only.

export const CHIMNEY_ITEM_ID = 'glass-chimney';
export const SMITH_CHIMNEY_ACTION_ID = 'smith-chimney';

export const WEAR_SLOTS = [
  { id: 'weapon', label: 'Weapon' },
  { id: 'lantern', label: 'Lantern' },
  { id: 'head', label: 'Head' },
  { id: 'hands', label: 'Hands' },
  { id: 'cloak', label: 'Cloak' },
  { id: 'tool', label: 'Tool' },
];

export const WEAR_SLOT_IDS = WEAR_SLOTS.map((s) => s.id);

/** Oil-class lanterns. One bonus each — not an 8-term power formula. */
export const LANTERN_WEAR = {
  [CHIMNEY_ITEM_ID]: {
    oilIntervalMult: 1.25,
    fogBiteDmg: 1,
    accuracy: 4,
  },
};
