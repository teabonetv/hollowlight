// Hunt loot furniture: a compact satchel chip on the fight, a sheet for
// named tiles + Take all. Reuses combat.lootTray / takeAllLootTray.
// Not the Keeper's Satchel camp upgrade.

import { el, clear } from '../dom.js';
import { filledIcon } from '../icons.js';
import { formatNumber, formatNoun } from '../../core/format.js';
import { ITEMS_BY_ID } from '../../game/data/items.js';
import { itemGlyph } from '../../game/data/item-glyphs.js';
import { uniqueStackCount, lanternRoom } from '../../game/systems/bank.js';
import * as combat from '../../game/systems/combat.js';
import { openModal } from '../modals.js';

function setHidden(node, hide) {
  if (!node) return;
  if (hide) node.setAttribute('hidden', '');
  else node.removeAttribute('hidden');
}

function closestClass(node, cls) {
  let n = node;
  while (n) {
    if (n.classList?.contains?.(cls)) return n;
    n = n.parentNode;
  }
  return null;
}

function firstQuery(node, sel) {
  try { return node?.querySelector?.(sel) ?? null; } catch { return null; }
}

export class HuntSatchel {
  static chipLabel(n) {
    return `Satchel · ${n}`;
  }

  static unpaidEntries(st, ctx) {
    const tray = st?.lootTray ?? ctx?.state?.combat?.lootTray ?? [];
    return HuntSatchel.ungranted(tray);
  }

  static unpaidCount(st, ctx) {
    return HuntSatchel.unpaidEntries(st, ctx).length;
  }

  static showChip(st, ctx) {
    return HuntSatchel.unpaidCount(st, ctx) > 0;
  }

  static trayEntries(tray) {
    return (tray ?? []).filter((e) => e && e.qty > 0);
  }

  static ungranted(tray) {
    return HuntSatchel.trayEntries(tray).filter((e) => e.granted === false);
  }

  static fingerprint(entries) {
    return entries.map((e) => `${e.kind}:${e.id ?? ''}:${e.qty}`).join('|');
  }

  static walletEntries(entries) {
    return (entries ?? []).filter((e) => e.kind === 'soul' || e.kind === 'lumen');
  }

  static itemEntries(entries) {
    return (entries ?? []).filter((e) => e.kind === 'item');
  }

  static unpaidTapNote(name) {
    return `${name} is still in the tray. Take all to keep it.`;
  }

  static hollowCopy(state) {
    return `Hollow ${uniqueStackCount(state?.bank)}/${lanternRoom(state)}`;
  }

  static modalMount(ctx) {
    return ctx?.modalRoot
      ?? (typeof document !== 'undefined' ? document.getElementById('modal-root') : null);
  }

  static mountChip(ctx, st, paint) {
    const chip = el('button', {
      class: 'btn btn-ghost satchel-chip',
      type: 'button',
      onclick: () => { HuntSatchel.openSheet(ctx, paint); },
    });
    HuntSatchel.fillChip(chip, ctx, st);
    return chip;
  }

  static fillChip(chip, ctx, st) {
    if (!chip) return;
    const n = HuntSatchel.unpaidCount(st, ctx);
    const show = n > 0;
    chip.textContent = HuntSatchel.chipLabel(n);
    chip.setAttribute('aria-label', show
      ? `Satchel, ${n} unpaid`
      : 'Satchel empty');
    setHidden(chip, !show);
    chip.classList.toggle('is-empty', !show);
    if (chip.disabled !== undefined) chip.disabled = !show;
    if (!show) chip.setAttribute('disabled', '');
    else chip.removeAttribute('disabled');
  }

  static walletChip(entry) {
    if (entry.kind === 'soul') {
      const label = formatNoun(entry.qty, 'soul');
      return el('span', {
        class: 'loot-wallet-chip loot-wallet-soul',
        'data-loot-kind': 'soul',
        'aria-label': `${label} unpaid`,
      }, label);
    }
    const label = `✦${formatNumber(entry.qty)}`;
    return el('span', {
      class: 'loot-wallet-chip loot-wallet-lumen',
      'data-loot-kind': 'lumen',
      'aria-label': `${label} Lumen unpaid`,
    }, label);
  }

  static walletLine(entries) {
    if (!entries.length) return null;
    const line = el('span', { class: 'loot-wallet' });
    for (const e of entries) line.append(HuntSatchel.walletChip(e));
    return line;
  }

  static tileSpec(entry) {
    const item = entry.id ? ITEMS_BY_ID[entry.id] : null;
    const name = item?.name ?? entry.name ?? entry.id ?? 'Loot';
    return {
      kind: 'item',
      id: entry.id ?? name,
      glyph: itemGlyph(item),
      name,
      qtyLabel: `×${formatNumber(entry.qty)}`,
      aria: `${name} ×${formatNumber(entry.qty)} unpaid`,
    };
  }

  static lootTile(entry, ctx) {
    const spec = HuntSatchel.tileSpec(entry);
    const inspectable = spec.id && ITEMS_BY_ID[spec.id];
    const attrs = {
      class: `loot-tile loot-item${inspectable ? ' loot-inspectable' : ''} glyph-${spec.glyph}`,
      'data-loot-kind': 'item',
      'data-loot-id': spec.id ?? '',
      'aria-label': spec.aria,
    };
    if (inspectable) attrs.type = 'button';
    const tile = el(inspectable ? 'button' : 'div', attrs,
      el('span', {
        class: `loot-glyph bank-glyph bank-glyph-fill glyph-${spec.glyph}`,
        html: filledIcon(spec.glyph),
        'aria-hidden': 'true',
      }),
      el('span', { class: 'loot-copy' },
        el('span', { class: 'loot-name' }, spec.name),
        el('span', { class: 'loot-qty' }, spec.qtyLabel)));
    if (inspectable) {
      tile.addEventListener('click', (ev) => {
        HuntSatchel.inspectTile(ctx, spec, entry, ev.currentTarget ?? tile);
      });
    }
    return tile;
  }

  static itemGrid(items, ctx) {
    const grid = el('div', { class: 'leftover-loot-chips loot-tray-grid satchel-grid' });
    for (const e of items) grid.append(HuntSatchel.lootTile(e, ctx));
    return grid;
  }

  static takeAllBtn(ctx, paint, { onTaken } = {}) {
    return el('button', {
      class: 'btn btn-primary leftover-take satchel-take',
      type: 'button',
      onclick: () => {
        const res = ctx.takeAllLootTray
          ? ctx.takeAllLootTray()
          : combat.takeAllLootTray(ctx.state);
        if (res?.blocked) ctx.toast?.(res.error, 'warn');
        onTaken?.(res);
        paint();
      },
    }, 'Take all');
  }

  static noteHost(tile) {
    const well = closestClass(tile, 'satchel-body')
      ?? closestClass(tile, 'leftover-loot')
      ?? closestClass(tile, 'leftover-tray')
      ?? closestClass(tile, 'fight-loot');
    if (!well) return { well: null, host: null };
    const chips = firstQuery(well, '.leftover-loot-chips')
      ?? firstQuery(well, '.loot-tray-grid');
    return { well, host: chips ?? well };
  }

  static paintNote(tile, spec) {
    const note = HuntSatchel.unpaidTapNote(spec?.name ?? 'Loot');
    if (tile?.classList) tile.classList.add('is-noted');
    const { well, host } = HuntSatchel.noteHost(tile);
    if (!host) return note;
    let banner = firstQuery(well ?? host, '.loot-unpaid-note');
    if (!banner) {
      banner = el('p', { class: 'loot-unpaid-note' }, note);
      host.append(banner);
    } else {
      banner.textContent = note;
      if (banner.parentNode !== host) host.append(banner);
    }
    return note;
  }

  static inspectTile(ctx, spec, entry, tile) {
    if (!spec?.id) return;
    if (entry?.granted === false) {
      HuntSatchel.paintNote(tile, spec);
      return;
    }
    if (ctx.openSellSheet) ctx.openSellSheet(spec.id);
    else if (ctx.inspectLoot) ctx.inspectLoot(spec.id, { name: spec.name, qty: entry?.qty ?? 0 });
    else ctx.toast?.(`${spec.name} ${spec.qtyLabel}`, 'info');
  }

  static buildBody(ctx, st) {
    const pending = HuntSatchel.unpaidEntries(st, ctx);
    const items = HuntSatchel.itemEntries(pending);
    const wallet = HuntSatchel.walletEntries(pending);
    const meter = HuntSatchel.hollowCopy(ctx.state);
    const body = el('div', {
      class: 'satchel-body leftover-loot leftover-tray',
      'aria-label': `Satchel · ${pending.length} · ${meter}`,
    });
    const head = el('div', { class: 'loot-well-head satchel-head' });
    head.append(el('span', { class: 'loot-well-meter' }, meter));
    const walletLine = HuntSatchel.walletLine(wallet);
    if (walletLine) head.append(walletLine);
    body.append(head);
    body.append(HuntSatchel.itemGrid(items, ctx));
    return body;
  }

  static openSheet(ctx, paint) {
    const st = combat.combatStatus(ctx.state);
    if (!HuntSatchel.showChip(st, ctx)) return null;
    const mount = HuntSatchel.modalMount(ctx);
    if (!mount) return null;
    const body = HuntSatchel.buildBody(ctx, st);
    let ref = null;
    const take = HuntSatchel.takeAllBtn(ctx, paint, {
      onTaken: (res) => {
        if (res?.blocked) return;
        ref?.close();
        if (mount) clear(mount);
      },
    });
    ref = openModal(mount, {
      title: 'Satchel',
      variant: 'sheet',
      body,
      actions: [take],
    });
    ref.overlay.classList.add('satchel-sheet');
    ref.panel.classList.add('satchel-sheet-panel');
    return ref;
  }
}
