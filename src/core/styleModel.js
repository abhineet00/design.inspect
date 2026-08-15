// Reads the current visual properties of an element into a structured model
// that the Design tab renders. Edited values take precedence over computed.

import { store } from './store.js';
import { round } from './util.js';
import { getEditedProps } from './liveStyles.js';

/** Value for a property, preferring an active edit over the computed value. */
function val(el, cs, prop, computedProp = prop) {
  const edited = getEditedProps(el, store.get().pseudo).get(prop);
  if (edited != null) return edited;
  return cs.getPropertyValue(computedProp).trim();
}

export function readModel(el) {
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  return {
    rect,
    tag: el.tagName.toLowerCase(),
    layout: {
      display: val(el, cs, 'display'),
      position: val(el, cs, 'position'),
      width: cs.width,
      height: cs.height,
      x: round(rect.left + window.scrollX),
      y: round(rect.top + window.scrollY),
      rowGap: cs.rowGap === 'normal' ? '0' : cs.rowGap,
      columnGap: cs.columnGap === 'normal' ? '0' : cs.columnGap,
      justify: val(el, cs, 'justify-content'),
      align: val(el, cs, 'align-items'),
    },
    transform: parseTransform(el, cs),
    spacing: {
      margin: sides(cs, 'margin'),
      padding: sides(cs, 'padding'),
    },
    radius: {
      all: val(el, cs, 'border-radius'),
      tl: cs.borderTopLeftRadius,
      tr: cs.borderTopRightRadius,
      br: cs.borderBottomRightRadius,
      bl: cs.borderBottomLeftRadius,
    },
    typography: {
      fontFamily: cs.fontFamily,
      fontSize: val(el, cs, 'font-size'),
      fontWeight: val(el, cs, 'font-weight'),
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing,
      textAlign: val(el, cs, 'text-align'),
      color: val(el, cs, 'color'),
      marginBottom: val(el, cs, 'margin-bottom'),
    },
    background: {
      color: val(el, cs, 'background-color'),
      image: cs.backgroundImage,
    },
    border: {
      width: cs.borderTopWidth,
      style: cs.borderTopStyle,
      color: cs.borderTopColor,
    },
    effects: {
      opacity: val(el, cs, 'opacity'),
      boxShadow: cs.boxShadow === 'none' ? '' : cs.boxShadow,
    },
  };
}

function sides(cs, prop) {
  return {
    top: cs.getPropertyValue(`${prop}-top`),
    right: cs.getPropertyValue(`${prop}-right`),
    bottom: cs.getPropertyValue(`${prop}-bottom`),
    left: cs.getPropertyValue(`${prop}-left`),
  };
}

// Pull translate/rotate out of a matrix so X/Y/rotation controls have values.
function parseTransform(el, cs) {
  const edited = getEditedProps(el, store.get().pseudo).get('transform');
  const t = edited || cs.transform;
  const base = { tx: 0, ty: 0, rotate: 0 };
  if (!t || t === 'none') return base;
  // Prefer parsing our own friendly form: translate(Xpx, Ypx) rotate(Rdeg)
  const tr = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/.exec(t);
  const ro = /rotate\(\s*(-?[\d.]+)deg\s*\)/.exec(t);
  if (tr) { base.tx = parseFloat(tr[1]); base.ty = parseFloat(tr[2]); }
  if (ro) base.rotate = parseFloat(ro[1]);
  if (tr || ro) return base;
  // Fallback: decompose a matrix().
  const m = /matrix\(([^)]+)\)/.exec(t);
  if (m) {
    const [a, b, , , e, f] = m[1].split(',').map(parseFloat);
    base.tx = round(e);
    base.ty = round(f);
    base.rotate = round(Math.atan2(b, a) * (180 / Math.PI));
  }
  return base;
}

/** Compose a transform string from the X/Y/rotate control values. */
export function composeTransform({ tx = 0, ty = 0, rotate = 0 }) {
  const parts = [];
  if (tx || ty) parts.push(`translate(${round(tx)}px, ${round(ty)}px)`);
  if (rotate) parts.push(`rotate(${round(rotate)}deg)`);
  return parts.length ? parts.join(' ') : '';
}
