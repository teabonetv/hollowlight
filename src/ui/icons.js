// Inline SVG icon set — stroke-based, currentColor-tinted, consistent at any
// size. Kept geometric and hand-writable rather than pulling in an icon font.

const svg = (inner, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${inner}</svg>`;

export const ICONS = {
  flame: svg('<path d="M12 3.5c2.2 2.8 4.8 4.4 4.8 7.9a4.8 4.8 0 0 1-9.6 0c0-1.9.9-3.2 1.9-4.6.4 1.3 1.1 2 2.2 2.1-.3-1.9-.1-3.7.7-5.4z"/><path d="M12 21v-2"/>'),
  leaf: svg('<path d="M19.5 4.5C11 4.5 5 9.5 5 16.5c0 1.1.2 2.1.5 3 8.5-.5 14-6 14-15z"/><path d="M5.5 19.5C9 15 13 11.5 17 9"/>'),
  pick: svg('<path d="M14 4c3.5.4 5.6 2.4 6 6M14 4c-2.8.3-5.4 1.7-7.5 3.8L4 10l10 10 2.2-2.5C18.3 15.4 19.7 12.8 20 10"/>'),
  hook: svg('<path d="M15.5 3v9a4.5 4.5 0 0 1-9 0V10h2.5"/><path d="M15.5 3l-2 2.5M15.5 3l2 2.5"/><circle cx="8" cy="19" r="1.4"/>'),
  candle: svg('<path d="M9 11h6v9a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/><path d="M12 8.5c1.4-1.2 1.6-2.6.6-4.3C11.9 5.4 11 5.6 11 6.7c0 .7.4 1.3 1 1.8z"/><path d="M7 21h10"/>'),
  anvil: svg('<path d="M4 8h9c4 0 6-2 7-3.5.4 2.5-.5 5-3 6l-1 .5v3H8v-3l-1.5-.8C5 9.7 4.3 9 4 8z"/><path d="M6.5 21h11M9 17.5h6v3.5"/>'),
  star: svg('<path d="M12 3.5l2.3 5 5.4.6-4 3.7 1.1 5.3L12 15.4l-4.8 2.7 1.1-5.3-4-3.7 5.4-.6z"/>'),
  sword: svg('<path d="M5 19L16 8l3.5-4.5L15 7 4 18"/><path d="M5 19l-1.5 1.5M7.5 14.5l3 3M4 16l4 4"/>'),
  chest: svg('<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M4 12h16M4 10c0-2 2-3.5 5-4h6c3 .5 5 2 5 4"/><circle cx="12" cy="15" r="1.3"/>'),
  map: svg('<path d="M9 4L4 6v14l5-2 6 2 5-2V4l-5 2-6-2z"/><path d="M9 4v14M15 6v14"/>'),
  book: svg('<path d="M12 6c-1.5-1.4-3.6-2-6.5-2v14c2.9 0 5 .6 6.5 2 1.5-1.4 3.6-2 6.5-2V4c-2.9 0-5 .6-6.5 2z"/><path d="M12 6v14"/>'),
  gear: svg('<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h13"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="19" cy="17" r="2"/>'),
  back: svg('<path d="M14.5 5.5L8 12l6.5 6.5"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  camp: svg('<path d="M4 20l8-13 8 13"/><path d="M8 20l4-6.5 4 6.5M2.5 20h19"/>'),
  spark: svg('<path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.8 6.8l2.4 2.4M14.8 14.8l2.4 2.4M17.2 6.8l-2.4 2.4M9.2 14.8l-2.4 2.4"/>'),
  moss: svg('<path d="M4.5 18c2.2-5 4.6-8 7.5-8s5.3 3 7.5 8"/><path d="M7 16.5c1.4-3.4 2.8-5.5 5-5.5s3.6 2.1 5 5.5"/><path d="M6 19h2M16 19h2"/>'),
  brick: svg('<rect x="3.5" y="7" width="8" height="5" rx="0.6"/><rect x="12.5" y="7" width="8" height="5" rx="0.6"/><rect x="8" y="13.5" width="8" height="5" rx="0.6"/>'),
  wood: svg('<path d="M6 19L11.5 4.5l2.2.9L8.2 19.9z"/><path d="M11 19l5.2-12 2 .8L13 19.8z"/>'),
  reed: svg('<path d="M8 20V7"/><path d="M12 20V4.5"/><path d="M16 20V9"/><path d="M8 7l-1.6-2.4M12 4.5l1.2-2M16 9l1.7-2.2"/>'),
  loaf: svg('<path d="M4.5 13.5C4.5 9.2 7.6 6.5 12 6.5s7.5 2.7 7.5 7v4.2a1.8 1.8 0 0 1-1.8 1.8H6.3a1.8 1.8 0 0 1-1.8-1.8z"/><path d="M7.5 12.2c2.2-1 6.8-1 9 0"/>'),
  vial: svg('<path d="M9 7V4h6v3"/><path d="M9 7h6l1.2 3.5V18a2 2 0 0 1-2 2h-4.4a2 2 0 0 1-2-2V10.5z"/><path d="M10.2 14h3.6"/>'),
  mushroom: svg('<path d="M5 11c0-4 3-7.2 7-7.2S19 7 19 11H5z"/><path d="M10 11v8h4v-8"/><path d="M8.2 8.2c.4.6 1.1.9 1.8.6"/>'),
  drop: svg('<path d="M12 4.5c2.8 3.6 5.2 6.2 5.2 9.2a5.2 5.2 0 1 1-10.4 0C6.8 10.7 9.2 8.1 12 4.5z"/>'),
};

export function icon(name, cls = '') {
  const s = ICONS[name] ?? ICONS.star;
  return cls ? s.replace('<svg ', `<svg class="${cls}" `) : s;
}
