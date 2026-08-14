// Compute a readable, reasonably-unique CSS selector for an element.
// Used for the panel breadcrumb and the copied/generated CSS output.

function isValidClass(c) {
  // Skip framework hash-y / utility noise where possible, but keep it simple.
  return c && !/[^a-zA-Z0-9_-]/.test(c) && !/^(is-|has-|js-)/.test(c) === true
    ? true
    : c && !/[^a-zA-Z0-9_-]/.test(c);
}

function nth(el) {
  let i = 1;
  let sib = el;
  while ((sib = sib.previousElementSibling)) {
    if (sib.tagName === el.tagName) i++;
  }
  return i;
}

/** A single element's local selector segment. */
function segment(el) {
  const tag = el.tagName.toLowerCase();
  if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
    return '#' + el.id;
  }
  const classes = Array.from(el.classList).filter(isValidClass).slice(0, 2);
  if (classes.length) {
    const sel = tag + '.' + classes.map((c) => c).join('.');
    return sel;
  }
  return `${tag}:nth-of-type(${nth(el)})`;
}

/** Build a path from a stable ancestor down to `el`, kept as short as possible. */
export function cssPath(el, maxDepth = 4) {
  if (!el || el.nodeType !== 1) return '';
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    const seg = segment(node);
    parts.unshift(seg);
    // If this segment is an id, it is unique enough — stop climbing.
    if (seg.startsWith('#')) break;
    // If the current path already resolves uniquely to our element, stop.
    try {
      if (document.querySelectorAll(parts.join(' > ')).length === 1) break;
    } catch {
      /* invalid selector, keep climbing */
    }
    node = node.parentElement;
    if (parts.length >= maxDepth) break;
  }
  return parts.join(' > ');
}

/** Short breadcrumb form for the panel header, e.g. "section #features .panel". */
export function breadcrumb(el) {
  const chain = [];
  let node = el;
  let depth = 0;
  while (node && node.nodeType === 1 && node !== document.documentElement && depth < 3) {
    let s = node.tagName.toLowerCase();
    if (node.id) s = '#' + node.id;
    else if (node.classList.length) s = '.' + node.classList[0];
    chain.unshift(s);
    node = node.parentElement;
    depth++;
  }
  return chain.join(' ');
}
