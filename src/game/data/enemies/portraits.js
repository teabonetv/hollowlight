// Cockpit portraits. Paths are document-relative from index.html.
// Only Fog-rat ships a PNG this slice; other foes keep the glyph tile.

export const FOE_PORTRAIT_BY_ID = {
  'fog-rat': './src/ui/assets/foes/fog-rat.png',
};

export function foePortraitSrc(enemyId) {
  return FOE_PORTRAIT_BY_ID[enemyId] ?? null;
}
