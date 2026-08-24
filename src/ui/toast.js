// Toast queue — the app's notification surface. Max 3 visible, auto-dismiss,
// types tinted (info/success/warn). Every toast also lands in nothing else:
// journal entries are written by callers that want permanence.

import { el, clear } from './dom.js';

export function createToaster(container) {
  const active = [];
  const MAX = 3;

  function push(message, type = 'info', ms = 3400) {
    while (active.length >= MAX) dismiss(active[0]);
    const t = el('div', { class: `toast toast-${type}`, role: 'status' },
      el('span', { class: 'toast-msg' }, message));
    container.append(t);
    active.push(t);
    requestAnimationFrame(() => t.classList.add('toast-in'));
    setTimeout(() => dismiss(t), ms);
    return t;
  }

  function dismiss(t) {
    const i = active.indexOf(t);
    if (i === -1) return;
    active.splice(i, 1);
    t.classList.remove('toast-in');
    t.classList.add('toast-out');
    setTimeout(() => t.remove(), 260);
  }

  function clearAll() {
    for (const t of [...active]) {
      active.splice(0);
      t.remove();
    }
    clear(container);
  }

  return { push, clearAll };
}
