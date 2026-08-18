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

// Seed the list from the element's current computed background colour so the
// first edit doesn't wipe an existing fill.
function derive(el) {
  const cs = getComputedStyle(el);
  const bg = cs.backgroundColor;
  const layers = [];
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
    const { hex, alpha } = rgbToHex(bg);
    layers.push({ type: 'solid', color: hex, alpha: alpha == null ? 1 : alpha });
  }
  return layers;
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
  return '';
}

export function defaultLayer(type) {
  if (type === 'linear') return { type: 'linear', angle: 180, stops: [{ color: '#58AEFF', alpha: 1, pos: 0 }, { color: '#FF8858', alpha: 1, pos: 100 }] };
  if (type === 'image') return { type: 'image', url: '', fit: 'cover' };
  return { type: 'solid', color: '#FFFFFF', alpha: 1 };
}
