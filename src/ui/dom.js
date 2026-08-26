// Tiny DOM helpers — no framework, just readable element construction.

/**
 * el('div', { class: 'card', onclick: fn }, childA, 'text', …)
 * Attributes: class → className; strings starting with 'on' + known events →
 * addEventListener; everything else setAttribute. Children: nodes or strings.
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'disabled') {
      node.disabled = !!v;
      if (v) node.setAttribute('disabled', '');
      else node.removeAttribute?.('disabled');
    } else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, String(v));
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

/** Remove all children. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
