// Scans the live page and extracts reusable design assets:
// colors, typography, SVGs and images. Everything the page actually uses,
// deduped and ranked by how often it appears.

import { rgbToHex } from './util.js';

const MAX_ELEMENTS = 6000; // safety cap for very large pages
const isOurs = (el) => el.closest && el.closest('[data-inspect-ui]');

function elements() {
  const all = document.body ? document.body.querySelectorAll('*') : [];
  const out = [];
  for (let i = 0; i < all.length && out.length < MAX_ELEMENTS; i++) {
    if (!isOurs(all[i])) out.push(all[i]);
  }
  return out;
}

function bump(map, key, value) {
  const e = map.get(key);
  if (e) e.count++;
  else map.set(key, { ...value, count: 1 });
}

/** Unique colors used across the page, ranked by frequency. */
export function collectColors() {
  const map = new Map();
  const props = ['color', 'background-color', 'border-top-color', 'border-right-color',
    'border-bottom-color', 'border-left-color', 'outline-color', 'fill', 'stroke'];
  for (const el of elements()) {
    const cs = getComputedStyle(el);
    for (const p of props) {
      const raw = cs.getPropertyValue(p).trim();
      if (!raw || raw === 'none') continue;
      const { hex, alpha } = rgbToHex(raw);
      if (alpha === 0) continue;            // fully transparent
      if (hex === '#000000' && p === 'fill') continue; // default svg fill noise
      const key = hex + '|' + alpha;
      bump(map, key, { hex, alpha, css: raw });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 80);
}

/** Unique typographic styles (family + size + weight) with a sample. */
export function collectTypography() {
  const map = new Map();
  for (const el of elements()) {
    // only elements that directly render text
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    const cs = getComputedStyle(el);
    const family = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
    const size = cs.fontSize;
    const weight = cs.fontWeight;
    const key = `${family}|${size}|${weight}`;
    const sample = el.textContent.trim().slice(0, 40);
    const e = map.get(key);
    if (e) e.count++;
    else map.set(key, { family, size, weight, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, sample, count: 1 });
  }
  return [...map.values()]
    .sort((a, b) => parseFloat(b.size) - parseFloat(a.size) || b.count - a.count)
    .slice(0, 60);
}

/** Inline SVGs and .svg image sources on the page. */
export function collectSvgs() {
  const out = [];
  const seen = new Set();
  for (const svg of document.querySelectorAll('svg')) {
    if (isOurs(svg)) continue;
    let markup = svg.outerHTML;
    if (!/xmlns=/.test(markup)) markup = markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    const key = markup.slice(0, 400);
    if (seen.has(key) || markup.length > 40000) continue;
    seen.add(key);
    const r = svg.getBoundingClientRect();
    out.push({ type: 'inline', markup, w: Math.round(r.width), h: Math.round(r.height) });
    if (out.length > 120) break;
  }
  for (const img of document.querySelectorAll('img[src$=".svg"], img[src*=".svg?"]')) {
    if (isOurs(img) || seen.has(img.src)) continue;
    seen.add(img.src);
    out.push({ type: 'url', src: img.src, markup: '' });
  }
  return out;
}

/** Raster images: <img>, <picture>, and CSS background-image urls. */
export function collectImages() {
  const out = [];
  const seen = new Set();
  const add = (src) => {
    if (!src || seen.has(src) || src.endsWith('.svg') || src.startsWith('data:image/svg')) return;
    seen.add(src);
    out.push({ src });
  };
  for (const img of document.querySelectorAll('img')) {
    if (isOurs(img)) continue;
    if (img.currentSrc || img.src) add(img.currentSrc || img.src);
  }
  for (const el of elements()) {
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === 'none') continue;
    let m;
    const re = /url\((['"]?)([^'")]+)\1\)/g;
    while ((m = re.exec(bg))) add(new URL(m[2], location.href).href);
    if (out.length > 120) break;
  }
  return out;
}

/** Everything, in one call. */
export function collectAll() {
  return {
    colors: collectColors(),
    typography: collectTypography(),
    svgs: collectSvgs(),
    images: collectImages(),
  };
}
