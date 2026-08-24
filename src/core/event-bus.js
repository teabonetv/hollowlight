// Minimal pub/sub event bus. Systems emit; UI and logging subscribe.
// Kept dependency-free so both node tests and the browser import it directly.

export function createEventBus() {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();

  function on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => off(type, fn);
  }

  function off(type, fn) {
    const set = listeners.get(type);
    if (set) set.delete(fn);
  }

  function emit(type, payload) {
    const set = listeners.get(type);
    if (!set) return;
    // Copy so a listener may unsubscribe during dispatch.
    for (const fn of [...set]) fn(payload);
  }

  return { on, off, emit };
}
