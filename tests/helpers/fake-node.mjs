// Minimal DOM shim shared by headless UI tests. Supports exactly what
// Hollowlight's render code needs: tree building, classes, style/dataset,
// listeners, compound-class selectors, textContent/innerHTML basics.

export class FakeText {
  constructor(text) { this.nodeType = 3; this.textContent = String(text); }
}

export class FakeNode {
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
    this.scrollTop = 0;
    this.scrollLeft = 0;
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
  get firstChild() { return this.children[0] ?? null; }
  get lastChild() { return this.children[this.children.length - 1] ?? null; }
  get textContent() { return this.children.map((c) => c.textContent ?? '').join(''); }
  set textContent(v) { this.children = []; if (v !== '') this.append(new FakeText(v)); }
  get innerHTML() { return this._html + this.children.map((c) => c.outerHTML ?? c.textContent ?? '').join(''); }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get outerHTML() {
    const cls = this.className ? ` class="${this.className}"` : '';
    return `<${this.tagName.toLowerCase()}${cls}>${this.innerHTML}</${this.tagName.toLowerCase()}>`;
  }
  append(...nodes) {
    for (const n of nodes.flat(9)) {
      if (n === null) { this.children.push(Object.assign(new FakeText('null'), { parentNode: this })); continue; }
      if (n === undefined) { this.children.push(Object.assign(new FakeText('undefined'), { parentNode: this })); continue; }
      if (n === false) continue;
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
  contains(n) { return n !== null && this._walk((m) => m === n); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'value') this.value = v; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
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
    const attr = sel.match(/^(\w+)?\[data-([a-z0-9-]+)(?:=["']?([^"'\]]+)["']?)?\]$/i);
    if (attr) {
      const [, tag, dataKey, val] = attr;
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      const camel = dataKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const have = this.dataset[camel] ?? this.dataset[dataKey] ?? this.attrs[`data-${dataKey}`];
      if (val === undefined) return have != null && have !== '';
      return String(have) === val;
    }
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
