// Small DOM + formatting helpers shared across modules.

let idCounter = 0;
const ID_ATTR = 'data-inspect-id';

/** Ensure an element carries a stable id we can target with CSS. */
export function ensureInspectId(el) {
  let id = el.getAttribute(ID_ATTR);
  if (!id) {
    id = 'ic-' + ++idCounter;
    el.setAttribute(ID_ATTR, id);
  }
  return id;
}

export function inspectIdSelector(id) {
  return `[${ID_ATTR}="${id}"]`;
}

/** Round to at most `p` decimals, dropping trailing zeros. */
export function round(n, p = 2) {
  if (n == null || Number.isNaN(n)) return 0;
  const f = Math.pow(10, p);
  return Math.round(n * f) / f;
}

/** Create an element with props/attrs/children in one call. */
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== false && v != null) {
      el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** Human label for an element: tag + #id + .first-class */
export function elementLabel(el) {
  if (!el || el.nodeType !== 1) return '';
  let s = el.tagName.toLowerCase();
  if (el.id) s += '#' + el.id;
  else if (el.classList.length) s += '.' + el.classList[0];
  return s;
}

/** Parse a CSS length like "12px" -> { value: 12, unit: 'px' }. */
export function parseLength(str) {
  if (str == null) return { value: 0, unit: 'px' };
  const m = String(str).trim().match(/^(-?[\d.]+)\s*([a-z%]*)$/i);
  if (!m) return { value: str, unit: '' };
  return { value: parseFloat(m[1]), unit: m[2] || 'px' };
}

/** Convert an rgb(a) color string to #hex (+ alpha as separate). */
export function rgbToHex(rgb) {
  if (!rgb) return { hex: '#000000', alpha: 1 };
  if (rgb.startsWith('#')) return { hex: rgb, alpha: 1 };
  const m = rgb.match(/rgba?\(([^)]+)\)/i);
  if (!m) return { hex: '#000000', alpha: 1 };
  const parts = m[1].split(',').map((x) => x.trim());
  const [r, g, b] = parts.map((x) => parseInt(x, 10));
  const a = parts[3] != null ? parseFloat(parts[3]) : 1;
  const hex =
    '#' +
    [r, g, b]
      .map((x) => Math.max(0, Math.min(255, x || 0)).toString(16).padStart(2, '0'))
      .join('');
  return { hex, alpha: a };
}

export function hexToRgba(hex, alpha = 1) {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean.padEnd(6, '0');
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${round(alpha, 3)})`;
}

export function debounce(fn, ms = 60) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Is this element part of our own UI? (never inspect ourselves) */
export function isOwnUI(el) {
  return !!(el && el.closest && el.closest('[data-inspect-ui]'));
}
