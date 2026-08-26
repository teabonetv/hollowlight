// Inline SVG icon set — stroke-based for chrome, filled silhouettes for the
// owned bank grid. Kept geometric and hand-writable rather than an icon font.

const svg = (inner, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${inner}</svg>`;

const svgFill = (inner, extra = '') =>
  `<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" stroke="none"
        aria-hidden="true" ${extra}>${inner}</svg>`;

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
  sage: svg('<path d="M12 4.5v16"/><path d="M12 7.2l-3.2-1.2M12 7.2l3.2-1.2M12 11l-3.6-1M12 11l3.6-1M12 14.8l-3.2-.8M12 14.8l3.2-.8"/>'),
  thyme: svg('<path d="M12 20v-6"/><path d="M6.5 15.5c1.4-3 3.2-5 5.5-5s4.1 2 5.5 5"/><circle cx="8.2" cy="13.2" r="0.8"/><circle cx="12" cy="11.4" r="0.8"/><circle cx="15.8" cy="13.4" r="0.8"/>'),
  nettle: svg('<path d="M12 3.6c2 3.2 6.2 6.6 6.2 10.6 0 3.2-2.6 5.6-6.2 6-3.6-.4-6.2-2.8-6.2-6 0-4 4.2-7.4 6.2-10.6z"/><path d="M7.6 9.2l-2-1.6M16.4 9.2l2-1.6M6.8 13.6l-2.2.4M17.2 13.6l2.2.4"/>'),
  mint: svg('<path d="M12 5.5v14"/><path d="M12 12c-3.2-3.4-7.2-2.4-7.2.8 0 2.4 2.2 3.6 7.2 6.4 5-2.8 7.2-4 7.2-6.4 0-3.2-4-4.2-7.2-.8z"/>'),
  clover: svg('<path d="M12 12c-2.8-2.6-6.2-.8-6.2 2.2 0 1.6 1.2 2.6 6.2 5.2 5-2.6 6.2-3.6 6.2-5.2 0-3-3.4-4.8-6.2-2.2z"/><path d="M12 12c-2.6 2.8-.8 6.2 2.2 6.2 1.6 0 2.6-1.2 5.2-6.2-2.6-5-3.6-6.2-5.2-6.2-3 0-4.8 3.4-2.2 6.2z"/>'),
  parsley: svg('<path d="M12 21V10"/><path d="M12 10c-2.8-1.2-5.4.2-5.6 3M12 10c2.8-1.2 5.4.2 5.6 3M12 10c0-3.2-1.6-5.6-3.2-6.4"/>'),
  lanternleaf: svg('<path d="M12 3.4c3.8 0 6.6 3.6 6.6 8.2S15.8 20 12 20 5.4 16.2 5.4 11.6 8.2 3.4 12 3.4z"/><path d="M10 9h4v1.4h1v6.2H9V10.4h1z"/>'),
  myrrh: svg('<path d="M12 20.5V11L7 5.2M12 11l5-5.8"/><circle cx="6.4" cy="4.8" r="1.2"/><circle cx="17.6" cy="4.8" r="1.2"/><circle cx="12" cy="10.6" r="1"/>'),
};

/** High-contrast packed silhouettes for the owned bank grid (≥32px). */
export const FILLED_ICONS = {
  flame: svgFill('<path d="M12 2.4c2.4 3.1 5.4 5 5.4 9.2a5.4 5.4 0 1 1-10.8 0c0-2.2 1-3.7 2.2-5.3.4 1.5 1.3 2.4 2.6 2.6-.4-2.2-.2-4.3.6-6.5z"/><rect x="11" y="19.2" width="2" height="2.6" rx="0.4"/>'),
  moss: svgFill('<path d="M3.2 18.4c.8-4.8 3.2-9.4 8.8-10.6 5.6 1.2 8 5.8 8.8 10.6-1.6 2.4-16 2.4-17.6 0z"/><circle cx="7.6" cy="16.2" r="2.3"/><circle cx="12" cy="14.4" r="2.8"/><circle cx="16.5" cy="16.4" r="2.2"/>'),
  leaf: svgFill('<path d="M20 3.8C10.6 3.8 4.2 9.4 4.2 17.2c0 1.3.2 2.4.6 3.4 9.4-.6 15.4-6.6 15.2-16.8z"/>'),
  pick: svgFill('<path d="M13.4 3.6c3.8.4 6.2 2.6 6.8 6.6-2.8.2-5.2-1-7.2-2.8z"/><path d="M4.2 9.6l10.4 10.6 2.4-2.7c1.9-2 3.2-4.4 3.6-7.2-3.6.2-6.6-1.2-8.8-3.4L4.2 9.6z"/>'),
  hook: svgFill('<path d="M14.6 2.8c.8 0 1.5.7 1.5 1.5V13a5.4 5.4 0 0 1-10.8 0v-2.6h3.2V13a2.2 2.2 0 0 0 4.4 0V4.3c0-.8.7-1.5 1.7-1.5z"/><path d="M14.6 2.8l-2.4 2.8h4.8z"/><circle cx="8" cy="19.2" r="1.8"/>'),
  candle: svgFill('<path d="M9 11h6v9.2a1.2 1.2 0 0 1-1.2 1.2h-3.6A1.2 1.2 0 0 1 9 20.2z"/><path d="M12 4.2c1.8 1.4 2.2 3.2.8 5.2-.6-.6-1.2-1.2-1.2-2.1 0-1.2 1-1.6 1.6-2.4.2-.3-.4-.9-1.2-.7z"/><rect x="6.5" y="20.6" width="11" height="1.6" rx="0.4"/>'),
  anvil: svgFill('<path d="M3.8 7.4h9.2c4.2 0 6.4-2.1 7.6-3.8.4 2.6-.5 5.4-3.2 6.6l-1.2.6v3.2H8.2v-3.2l-1.6-.9C5 9.3 4.2 8.5 3.8 7.4z"/><rect x="6" y="17.4" width="12" height="3.4" rx="0.4"/><rect x="8.6" y="14.6" width="6.8" height="3"/>'),
  star: svgFill('<path d="M12 2.6l2.5 5.4 5.8.7-4.3 4 1.2 5.7L12 15.2 6.8 18.4l1.2-5.7-4.3-4 5.8-.7z"/>'),
  sword: svgFill('<path d="M4.4 18.8L16.2 7.2l3.6-4.6-4.6 3.6L3.6 17.8z"/><path d="M3.4 19.4l-1.2 1.4 1.6 1.4 1.4-1.2z"/><path d="M6.8 14.2l3.4 3.4 1.2-1.2-3.4-3.4z"/>'),
  chest: svgFill('<rect x="3.6" y="7" width="16.8" height="13.2" rx="2"/><rect x="3.6" y="10.6" width="16.8" height="2.2"/><circle cx="12" cy="15.4" r="1.5"/>'),
  map: svgFill('<path d="M9 3.6L3.6 5.8v14.6l5.4-2.2 6 2.2 5.4-2.2V3.6l-5.4 2.2-6-2.2z"/>'),
  book: svgFill('<path d="M12 5.4C10.4 4 8.2 3.4 5.2 3.4v14.6c3 0 5.2.6 6.8 2.2 1.6-1.6 3.8-2.2 6.8-2.2V3.4c-3 0-5.2.6-6.8 2z"/>'),
  gear: svgFill('<rect x="3.6" y="6" width="9.2" height="2.2" rx="0.6"/><rect x="16.2" y="6" width="4.2" height="2.2" rx="0.6"/><rect x="3.6" y="11" width="3.2" height="2.2" rx="0.6"/><rect x="10.4" y="11" width="10" height="2.2" rx="0.6"/><rect x="3.6" y="16" width="13.4" height="2.2" rx="0.6"/><circle cx="15.2" cy="7.1" r="2.1"/><circle cx="8.8" cy="12.1" r="2.1"/><circle cx="19" cy="17.1" r="2.1"/>'),
  back: svgFill('<path d="M15.2 4.4L7.4 12l7.8 7.6v-3.2H20V7.6h-4.8z"/>'),
  close: svgFill('<path d="M6.2 4.8L4.8 6.2 10.6 12l-5.8 5.8 1.4 1.4L12 13.4l5.8 5.8 1.4-1.4L13.4 12l5.8-5.8-1.4-1.4L12 10.6z"/>'),
  camp: svgFill('<path d="M3.6 20.4L12 6.6l8.4 13.8H3.6z"/><path d="M8.2 20.4l3.8-6.4 3.8 6.4z"/>'),
  spark: svgFill('<polygon points="12,2 13.6,10.4 22,12 13.6,13.6 12,22 10.4,13.6 2,12 10.4,10.4"/>'),
  brick: svgFill('<rect x="3.2" y="6.6" width="8.2" height="5.2" rx="0.7"/><rect x="12.6" y="6.6" width="8.2" height="5.2" rx="0.7"/><rect x="7.6" y="13.2" width="8.8" height="5.2" rx="0.7"/>'),
  wood: svgFill('<path d="M5.4 19.4L11.2 3.8l2.8 1.1-5.8 15.6z"/><path d="M10.6 19.4l5.6-13 2.6 1-5.6 13.2z"/>'),
  reed: svgFill('<rect x="7.1" y="6.4" width="1.8" height="14.2" rx="0.8"/><rect x="11.1" y="4" width="1.8" height="16.6" rx="0.8"/><rect x="15.1" y="8.4" width="1.8" height="12.2" rx="0.8"/><path d="M8 6.4l-2.2-3.2 1.6-.8 1.8 3.4z"/><path d="M12 4l1.4-2.4 1.4.8-1.4 2.2z"/><path d="M16 8.4l2.2-2.8 1.4.9-2 2.6z"/>'),
  loaf: svgFill('<path d="M4.2 13.4C4.2 8.8 7.5 5.8 12 5.8s7.8 3 7.8 7.6v4.4A2 2 0 0 1 17.8 20H6.2A2 2 0 0 1 4.2 17.8z"/>'),
  vial: svgFill('<rect x="9" y="3.4" width="6" height="3.4" rx="0.5"/><path d="M9 6.8h6l1.3 3.6V18a2.2 2.2 0 0 1-2.2 2.2h-4.2A2.2 2.2 0 0 1 7.7 18V10.4z"/>'),
  mushroom: svgFill('<path d="M4.6 11.2C4.6 6.6 7.8 3.4 12 3.4s7.4 3.2 7.4 7.8H4.6z"/><rect x="9.6" y="11" width="4.8" height="8.6" rx="1"/>'),
  drop: svgFill('<path d="M12 3.4c3 3.8 5.6 6.6 5.6 9.8a5.6 5.6 0 1 1-11.2 0C6.4 10 9 7.2 12 3.4z"/>'),
  sage: svgFill('<rect x="11.1" y="3.6" width="1.8" height="16.8" rx="0.8"/><ellipse cx="8" cy="7.2" rx="3" ry="1.6"/><ellipse cx="16" cy="7.2" rx="3" ry="1.6"/><ellipse cx="7.4" cy="11.2" rx="3.2" ry="1.7"/><ellipse cx="16.6" cy="11.2" rx="3.2" ry="1.7"/><ellipse cx="8.2" cy="15.2" rx="2.8" ry="1.5"/><ellipse cx="15.8" cy="15.2" rx="2.8" ry="1.5"/>'),
  thyme: svgFill('<ellipse cx="12" cy="16.8" rx="8.6" ry="4.4"/><circle cx="7" cy="14" r="1.7"/><circle cx="9.6" cy="11.8" r="1.6"/><circle cx="12" cy="10.8" r="1.8"/><circle cx="14.6" cy="12" r="1.6"/><circle cx="17.2" cy="14.2" r="1.7"/><circle cx="10.4" cy="14.6" r="1.4"/><circle cx="13.8" cy="14.4" r="1.4"/><rect x="11.2" y="16.4" width="1.6" height="4.8" rx="0.7"/>'),
  nettle: svgFill('<path d="M12 2.4l1.6 4.6 4.6-.4-1.8 4.4 3.8 2.8-4.8 1.4.6 4.6L12 17.4 7.2 19.8l.6-4.6-4.8-1.4 3.8-2.8-1.8-4.4 4.6.4z"/>'),
  mint: svgFill('<ellipse cx="7.2" cy="12.2" rx="5.4" ry="6.6"/><ellipse cx="16.8" cy="12.2" rx="5.4" ry="6.6"/><rect x="11.1" y="4.8" width="1.8" height="15.2" rx="0.8"/>'),
  clover: svgFill('<circle cx="12" cy="7.4" r="3.6"/><circle cx="12" cy="16.6" r="3.6"/><circle cx="7.4" cy="12" r="3.6"/><circle cx="16.6" cy="12" r="3.6"/><circle cx="12" cy="12" r="1.8"/>'),
  parsley: svgFill('<rect x="11.1" y="10.4" width="1.8" height="10.4" rx="0.8"/><ellipse cx="12" cy="5.8" rx="2.2" ry="4.4"/><ellipse cx="6.8" cy="10.2" rx="2.4" ry="4.2" transform="rotate(-48 6.8 10.2)"/><ellipse cx="17.2" cy="10.2" rx="2.4" ry="4.2" transform="rotate(48 17.2 10.2)"/>'),
  lanternleaf: svgFill('<path fill-rule="evenodd" d="M12 2.4c5 0 8.4 4.6 8.4 10s-3.4 10-8.4 10S3.6 17.8 3.6 12.4 7 2.4 12 2.4zM10 8.2h4v1.4h1.2v7.2H8.8V9.6H10zm1.4 3.2v3.4h1.2v-3.4z"/>'),
  myrrh: svgFill('<path d="M11.1 20.6V11.4L6 5.2l1.8-1.6 4.2 5.2 4.2-5.2 1.8 1.6-5.1 6.2v9.2z"/><circle cx="6.2" cy="4.6" r="2"/><circle cx="17.8" cy="4.6" r="2"/><circle cx="12" cy="10.4" r="1.8"/>'),
};

export function icon(name, cls = '') {
  const s = ICONS[name] ?? ICONS.star;
  return cls ? s.replace('<svg ', `<svg class="${cls}" `) : s;
}

export function filledIcon(name, cls = '') {
  const s = FILLED_ICONS[name] ?? FILLED_ICONS.star;
  return cls ? s.replace('<svg ', `<svg class="${cls}" `) : s;
}
