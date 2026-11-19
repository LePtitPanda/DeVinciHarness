// Whole-app interface translation without touching the host's components: exact-match
// replacement of visible UI strings (text nodes and placeholder/aria-label/title),
// kept up to date with a MutationObserver. Learning content is never translated.
const SKIP = '.lh-prose, pre, code, textarea, input, [contenteditable="true"], .katex, svg text';
const ATTRS = ['placeholder', 'data-placeholder', 'aria-placeholder', 'aria-label', 'title'];

export function startTranslator(dict, root = document.body) {
  const lookup = (value) => {
    const key = value.trim();
    const hit = key && dict[key];
    return hit ? value.replace(key, hit) : null;
  };
  const text = (node) => {
    if (node.parentElement?.closest(SKIP)) return;
    const next = lookup(node.nodeValue);
    if (next && next !== node.nodeValue) node.nodeValue = next;
  };
  const element = (el) => {
    if (el.closest('.lh-prose, pre, code')) return; // a typing box's placeholder is fine; its text is skipped above
    for (const name of ATTRS) {
      const value = el.getAttribute(name);
      const next = value && lookup(value);
      if (next && next !== value) el.setAttribute(name, next);
    }
  };
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return text(node);
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    element(node);
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) n.nodeType === Node.TEXT_NODE ? text(n) : element(n);
  };
  // A translated value is never a key, so our own writes do not loop.
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'characterData') text(m.target);
      else if (m.type === 'attributes') element(m.target);
      else m.addedNodes.forEach(walk);
    }
  });
  walk(root);
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  return () => observer.disconnect();
}
