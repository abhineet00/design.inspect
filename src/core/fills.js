// Multi-layer fill model. An element's background is modelled as an ordered
// list of layers (top-most first), each a solid colour, a linear gradient, or
// an image. Layers compose into the CSS `background-*` shorthand list so any
// number can stack — exactly like a design tool's fill list.

import { rgbToHex, hexToRgba } from './util.js';

const bank = new WeakMap(); // el -> [layer]

// layer shapes:
//   { type:'solid',  color:'#RRGGBB', alpha:1 }
//   { type:'linear', angle:180, stops:[{color:'#fff',alpha:1,pos:0}, …] }
//   { type:'image',  url:'…', fit:'cover' }

export function getFills(el) {
  if (!bank.has(el)) bank.set(el, derive(el));
  return bank.get(el);
}
export function setFills(el, layers) { bank.set(el, layers); }
export function resetFills(el) { bank.delete(el); }

// Seed the list from the element's current computed background so the first
// edit doesn't wipe an existing fill. Parses the full `background-image` stack
// (linear gradients + images) plus the `background-color`, top layer first —
// so an element whose colour lives in a `background-image: linear-gradient(...)`
// is fully editable, not just plain `background-color`.
function derive(el) {
  const cs = getComputedStyle(el);
  const layers = [];
  const bgImg = cs.backgroundImage;
  if (bgImg && bgImg !== 'none') {
    for (const tok of splitTop(bgImg)) {
      const t = tok.trim();
      if (!t || t === 'none') continue;
      if (/^linear-gradient/i.test(t)) layers.push(parseLinear(t));
      else if (/^url\(/i.test(t)) layers.push({ type: 'image', url: extractUrl(t), fit: fitFrom(cs) });
      else layers.push({ type: 'raw', css: t }); // radial/conic/etc. — preserved, editable as gradient
    }
  }
  const bg = cs.backgroundColor;
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
    const { hex, alpha } = rgbToHex(bg);
    layers.push({ type: 'solid', color: hex, alpha: alpha == null ? 1 : alpha });
  }
  return layers;
}

// Split a comma list at the top level only (commas inside parens are kept).
function splitTop(str) {
  const out = []; let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

// Parse a computed `linear-gradient(...)` into { angle, stops }.
function parseLinear(str) {
  const inner = str.slice(str.indexOf('(') + 1, str.lastIndexOf(')'));
  const parts = splitTop(inner).map((s) => s.trim());
  let angle = 180, i = 0;
  if (/^[\d.]+deg$/i.test(parts[0])) { angle = parseFloat(parts[0]); i = 1; }
  else if (/^to\s+/i.test(parts[0])) { angle = dirToAngle(parts[0]); i = 1; }
  else if (/^[\d.]+(rad|grad|turn)$/i.test(parts[0])) { angle = 180; i = 1; }
  const stops = [];
  for (let k = i; k < parts.length; k++) {
    const st = parseStop(parts[k]);
    if (st) stops.push(st);
  }
  const n = stops.length;
  stops.forEach((s, idx) => { if (s.pos == null) s.pos = n <= 1 ? 0 : Math.round((idx / (n - 1)) * 100); });
  return stops.length ? { type: 'linear', angle, stops } : { type: 'raw', css: str };
}

// "rgb(…) 50%" / "rgba(…)" / "#fff 0%" -> { color, alpha, pos|null }
function parseStop(s) {
  s = s.trim();
  let pos = null, color = s;
  const m = s.match(/\s+(-?[\d.]+)%\s*$/);
  if (m) { pos = parseFloat(m[1]); color = s.slice(0, m.index).trim(); }
  if (!color) return null;
  const { hex, alpha } = rgbToHex(color);
  return { color: hex, alpha: alpha == null ? 1 : alpha, pos };
}

function dirToAngle(dir) {
  const d = dir.toLowerCase().replace(/^to\s+/, '').trim();
  const map = {
    top: 0, right: 90, bottom: 180, left: 270,
    'top right': 45, 'right top': 45, 'bottom right': 135, 'right bottom': 135,
    'bottom left': 225, 'left bottom': 225, 'top left': 315, 'left top': 315,
  };
  return map[d] != null ? map[d] : 180;
}

function extractUrl(str) {
  const m = str.match(/url\(\s*(['"]?)(.*?)\1\s*\)/i);
  return m ? m[2] : '';
}

// Read a sensible fit from computed background-size for a url layer.
function fitFrom(cs) {
  const s = (cs.backgroundSize || '').split(',')[0].trim();
  return s === 'contain' || s === 'cover' ? s : 'cover';
}

// One layer → a single CSS background-image token (solids become a flat
// gradient so they can live in the same list as real gradients/images).
export function layerCss(L) {
  if (L.type === 'solid') { const c = hexToRgba(L.color, L.alpha ?? 1); return `linear-gradient(${c}, ${c})`; }
  if (L.type === 'linear') {
    const stops = (L.stops || []).map((s) => `${hexToRgba(s.color, s.alpha ?? 1)} ${s.pos}%`).join(', ');
    return `linear-gradient(${L.angle ?? 180}deg, ${stops})`;
  }
  if (L.type === 'image') return `url("${L.url}")`;
  if (L.type === 'raw') return L.css;
  return 'none';
}

// The whole list → the properties needed to render it.
export function compose(layers) {
  if (!layers || !layers.length) {
    return { 'background-image': 'none', 'background-color': 'rgba(0, 0, 0, 0)' };
  }
  const img = [], size = [], repeat = [], pos = [];
  for (const L of layers) {
    img.push(layerCss(L));
    size.push(L.type === 'image' ? (L.fit || 'cover') : 'auto');
    repeat.push('no-repeat');
    pos.push('center');
  }
  return {
    'background-image': img.join(', '),
    'background-size': size.join(', '),
    'background-repeat': repeat.join(', '),
    'background-position': pos.join(', '),
    'background-color': 'rgba(0, 0, 0, 0)',
  };
}

// Short human label for a layer row.
export function layerLabel(L) {
  if (L.type === 'solid') return L.color.replace('#', '').toUpperCase();
  if (L.type === 'linear') return 'Gradient';
  if (L.type === 'image') return 'Image';
  if (L.type === 'raw') return 'Gradient';
  return '';
}

export function defaultLayer(type) {
  if (type === 'linear') return { type: 'linear', angle: 180, stops: [{ color: '#58AEFF', alpha: 1, pos: 0 }, { color: '#FF8858', alpha: 1, pos: 100 }] };
  if (type === 'image') return { type: 'image', url: '', fit: 'cover' };
  return { type: 'solid', color: '#FFFFFF', alpha: 1 };
}
