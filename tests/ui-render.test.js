// Headless UI render smoke: a minimal DOM shim sufficient for our render()
// functions, so every screen's code path executes under node:test. This
// catches broken selectors, undefined property access, and bad data wiring —
// everything short of pixel-perfect layout.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── mini DOM ───────────────────────────────────────────────────────
class FakeText {
  constructor(text) { this.nodeType = 3; this.textContent = String(text); }
}
class FakeNode {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.attrs = {};
    this._listeners = {};
    this.parentNode = null;
    this._classSet = new Set();
    this._html = '';
    const self = this;
    this.classList = {
      add: (...cs) => cs.forEach((c) => self._classSet.add(c)),
      remove: (...cs) => cs.forEach((c) => self._classSet.delete(c)),
      toggle: (c, force) => {
        const has = self._classSet.has(c);
        const want = force === undefined ? !has : !!force;
        want ? self._classSet.add(c) : self._classSet.delete(c);
        return want;
      },
      contains: (c) => self._classSet.has(c),
    };
  }
  get className() { return [...this._classSet].join(' '); }
  set className(v) { this._classSet = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get classListProxy() { return this.classList; }
  get firstChild() { return this.children[0] ?? null; }
  get lastChild() { return this.children[this.children.length - 1] ?? null; }
  get textContent() {
    return this.children.map((c) => c.textContent ?? '').join('');
  }
  set textContent(v) { this.children = []; if (v !== '') this.append(new FakeText(v)); }
  get innerHTML() { return this._html + this.children.map((c) => c.outerHTML ?? c.textContent ?? '').join(''); }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get outerHTML() {
    const cls = this.className ? ` class="${this.className}"` : '';
    return `<${this.tagName.toLowerCase()}${cls}>${this.innerHTML}</${this.tagName.toLowerCase()}>`;
  }
  append(...nodes) {
    for (const n of nodes.flat(9)) {
      if (n === null || n === undefined || n === false) continue;
      const child = n.nodeType ? n : new FakeText(n);
      child.parentNode = this;
      this.children.push(child);
    }
  }
  appendChild(n) { this.append(n); return n; }
  removeChild(n) {
    const i = this.children.indexOf(n);
    if (i >= 0) this.children.splice(i, 1);
    return n;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'value') this.value = v; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(type, fn) { (this._listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] ?? []).filter((f) => f !== fn);
  }
  click() { for (const fn of this._listeners.click ?? []) fn({ target: this }); }
  _walk(fn) {
    fn(this);
    for (const c of this.children) if (c._walk) c._walk(fn);
  }
  matchesSelector(sel) {
    // supports '.a.b.c', '#id', 'tag'
    return sel.split(/[.#]/).filter(Boolean).every((tok) => {
      if (sel.trim().startsWith('#')) return this.attrs.id === tok;
      return this._classSet.has(tok) || this.tagName === tok.toUpperCase();
    });
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  querySelectorAll(sel) {
    const out = [];
    this._walk((n) => { if (n !== this && n.matchesSelector(sel)) out.push(n); });
    return out;
  }
}

globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => new FakeText(s),
};
globalThis.requestAnimationFrame = (fn) => 0;
try { globalThis.navigator = {}; } catch { /* node ≥21 exposes a read-only navigator */ }

// ── imports AFTER the shim exists ──────────────────────────────────
const { createState } = await import('../src/game/state.js');
const runner = await import('../src/game/systems/action-runner.js');
const { renderSkillsScreen, renderSkillDetail } = await import('../src/ui/screens/skills.js');
const tabs = await import('../src/ui/screens/tabs.js');

function makeCtx(state) {
  return {
    state,
    toast() {},
    openSkill() {},
    openSkillsList() {},
    actionStatus: (id) => runner.actionStatus(state, id),
  };
}

test('skills list renders all eight registry rows', () => {
  const state = createState({ nowMs: 0, rngSeed: 2 });
  const scr = renderSkillsScreen(makeCtx(state));
  const rows = scr.node.querySelectorAll('.skill-row');
  assert.equal(rows.length, 8, 'one row per charter skill');
  assert.equal(rows.filter((r) => r.matchesSelector('.skill-row-future')).length, 6,
    'six skills marked future in wave 0');
});

test('playable skill detail renders action cards with live controls', () => {
  const state = createState({ nowMs: 0, rngSeed: 3 });
  runner.startAction(state, 'tend-flame');
  const ctx = makeCtx(state);
  const scr = renderSkillDetail(ctx, 'emberkeeping');

  const cards = scr.node.querySelectorAll('.action-card');
  assert.equal(cards.length, 2, 'two emberkeeping actions');

  // start/stop button reflects the running action
  const stopBtn = cards[0].querySelectorAll('button').find((b) =>
    (b.textContent ?? '').startsWith('Stop'));
  assert.ok(stopBtn, 'running action shows Stop');

  // progress fill exists and update() runs without throwing
  scr.update();
  const fill = cards[0].querySelector('.bar-fill');
  assert.ok(fill, 'progress bar fill present');
});

test('locked action card communicates its level gate', () => {
  const state = createState({ nowMs: 0, rngSeed: 4 });
  const scr = renderSkillDetail(makeCtx(state), 'emberkeeping');
  const cards = scr.node.querySelectorAll('.action-card');
  const fanCard = cards[1];
  const lockBtn = fanCard.querySelectorAll('button').find((b) => /Locked/.test(b.textContent ?? ''));
  assert.ok(lockBtn, 'Fan the Coals shows Locked · Level 10 at skill level 1');
});

test('foraging detail includes both gathering actions and mastery badge', () => {
  const state = createState({ nowMs: 0, rngSeed: 5 });
  const scr = renderSkillDetail(makeCtx(state), 'foraging');
  assert.equal(scr.node.querySelectorAll('.action-card').length, 2);
  assert.equal(scr.node.querySelectorAll('.mastery-badge').length, 2);
});

test('future skill detail renders a designed coming-soon empty state', () => {
  const state = createState({ nowMs: 0, rngSeed: 6 });
  const scr = renderSkillDetail(makeCtx(state), 'mining');
  const empty = scr.node.querySelector('.empty-state');
  assert.ok(empty, 'coming-soon panel present');
  assert.match(empty.textContent ?? '', /Wave 1/i);
});

test('camp renders stats and quick actions', () => {
  const state = createState({ nowMs: 0, rngSeed: 7 });
  state.flame = 42;
  const scr = tabs.renderCampScreen(makeCtx(state));
  const cells = scr.node.querySelectorAll('.stat-cell');
  assert.equal(cells.length, 4);
  assert.match(cells[1].textContent ?? '', /42/);
});

test('bank groups items by category and marks owned stacks', () => {
  const state = createState({ nowMs: 0, rngSeed: 8 }); // starter: tinder, rushwick, fogwort
  const scr = tabs.renderBankScreen(makeCtx(state));
  const owned = scr.node.querySelectorAll('.bank-tile.owned');
  assert.equal(owned.length, 3, 'three starter stacks lit');
  assert.ok(scr.node.querySelectorAll('.bank-tile').length >= 20, '~22 items visible');
});

test('map lists twelve beacons with only the first kindled', () => {
  const state = createState({ nowMs: 0, rngSeed: 9 });
  const scr = tabs.renderMapScreen(makeCtx(state));
  const nodes = scr.node.querySelectorAll('.map-node');
  assert.equal(nodes.length, 12);
  assert.equal(nodes.filter((n) => n.matchesSelector('.lit')).length, 1);
});

test('journal renders entries newest-first and an empty state when blank', () => {
  const state = createState({ nowMs: 0, rngSeed: 10 });
  const emptyScr = tabs.renderJournalScreen(makeCtx(state));
  assert.ok(emptyScr.node.querySelector('.empty-state'), 'designed empty journal');

  state.log.push(
    { t: 100, text: 'first entry' },
    { t: 200, text: 'second entry' },
  );
  const scr = tabs.renderJournalScreen(makeCtx(state));
  const entries = scr.node.querySelectorAll('.journal-entry');
  assert.equal(entries.length, 2);
  assert.match(entries[0].textContent ?? '', /second entry/, 'newest first');
});

test('toaster queues, caps at three live toasts, fades the rest', async () => {
  const { createToaster } = await import('../src/ui/toast.js');
  const host = new FakeNode('div');
  const toaster = createToaster(host);
  toaster.push('a'); toaster.push('b'); toaster.push('c'); toaster.push('d');
  const all = host.querySelectorAll('.toast');
  const live = all.filter((t) => !t.matchesSelector('.toast-out'));
  const fading = all.filter((t) => t.matchesSelector('.toast-out'));
  assert.equal(live.length, 3, 'three live toasts');
  assert.equal(fading.length, 1, 'oldest is fading out');
});
