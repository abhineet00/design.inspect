// Reusable panel widgets, styled to the Figma design. Each returns a DOM node
// and calls back with the new CSS value when edited.

import { h, parseLength, rgbToHex, hexToRgba } from '../core/util.js';
import { icon } from '../icons/index.js';

function ico(name) {
  return h('span', { class: 'fic', html: icon(name) });
}
function chevMini() {
  return h('span', { class: 'chev-mini', html: icon('chevron-down') });
}

/** Field with a leading key (letter or icon) and an optional unit. */
export function field({ key, iconName, value, unit = 'px', onChange, showUnit = true, sm = false }) {
  const parsed = parseLength(value);
  const input = h('input', { value: parsed.value, type: 'text', inputmode: 'decimal' });
  const unitEl = showUnit ? h('span', { class: 'unit', text: parsed.unit || unit }) : null;

  const commit = () => {
    const raw = input.value.trim();
    if (raw === '') return onChange('');
    const numeric = /^-?[\d.]+$/.test(raw);
    onChange(numeric && showUnit ? raw + (unitEl?.textContent || unit) : raw);
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') return input.blur();
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const cur = parseFloat(input.value) || 0;
      input.value = +(cur + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)).toFixed(2);
      commit(); e.preventDefault();
    }
  });
  if (showUnit && unitEl) {
    const units = ['px', '%', 'em', 'rem', 'vw', 'vh'];
    unitEl.style.cursor = 'pointer';
    unitEl.addEventListener('click', () => {
      unitEl.textContent = units[(units.indexOf(unitEl.textContent) + 1) % units.length];
      commit();
    });
  }
  return h('div', { class: 'field' + (sm ? ' sm' : '') }, [
    iconName ? ico(iconName) : (key ? h('span', { class: 'fk', text: key }) : null),
    input,
    unitEl,
  ]);
}

/** A <select> styled as a field, with the design's chevron. */
export function selectField({ value, options, onChange, iconName, key, sm = true }) {
  const sel = h('select', {});
  for (const opt of options) {
    const [v, l] = Array.isArray(opt) ? opt : [opt, opt];
    const o = h('option', { value: v, text: l });
    if (String(v) === String(value)) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return h('div', { class: 'field select-like' + (sm ? ' sm' : '') }, [
    iconName ? ico(iconName) : (key ? h('span', { class: 'fk', text: key }) : null),
    sel,
    chevMini(),
  ]);
}

/** A row of icon toggle buttons (alignment, flips, text-align). */
export function iconButtons(buttons, { active = -1, grow = false, onPick } = {}) {
  const row = h('div', { class: 'iconrow' + (grow ? ' grow' : '') });
  buttons.forEach((b, i) => {
    const btn = h('button', {
      class: 'ibtn' + (i === active ? ' active' : ''),
      title: b.title || '',
      html: icon(b.icon),
      onclick: () => onPick?.(b, i, btn),
    });
    row.appendChild(btn);
  });
  return row;
}

/** Color line: swatch + native picker + hex + percentage. */
export function colorLine(value, onChange, { showPct = true } = {}) {
  const parsed = rgbToHex(value);
  const hex = parsed.hex;
  let alpha = parsed.alpha === 0 ? 1 : parsed.alpha;
  const picker = h('input', { type: 'color', value: hex });
  const swatch = h('div', { class: 'swatch' }, [picker]);
  swatch.style.background = value && value !== 'rgba(0, 0, 0, 0)' ? value : 'transparent';
  const hexInput = h('input', { class: 'hex', value: hex.replace('#', '') });
  const pct = showPct ? h('span', { class: 'pct', text: Math.round(alpha * 100) + '%' }) : null;

  const push = (hx) => { const out = hexToRgba(hx, alpha); swatch.style.background = out; onChange(out); };
  picker.addEventListener('input', () => { hexInput.value = picker.value.replace('#', ''); push(picker.value); });
  hexInput.addEventListener('change', () => {
    let v = hexInput.value.trim().replace(/^#/, '');
    if (/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) { picker.value = '#' + v; push('#' + v); }
    else onChange(hexInput.value.trim());
  });
  return h('div', { class: 'colorline' }, [swatch, hexInput, pct]);
}

/** Collapsible section. */
export function section(title, contentNodes, { open = true } = {}) {
  const content = h('div', { class: 'sec-content' }, contentNodes);
  const head = h('div', { class: 'sec-head' }, [
    h('span', { text: title }),
    h('span', { class: 'chev', html: icon('chevron-down') }),
  ]);
  const sec = h('div', { class: 'section' + (open ? '' : ' closed') }, [head, content]);
  head.addEventListener('click', () => sec.classList.toggle('closed'));
  return sec;
}

/** Small labelled wrapper: label text above a control. */
export function labeled(label, node) {
  return h('div', { class: 'stack' }, [h('span', { class: 'label', text: label }), node]);
}

/**
 * The margin/padding box editor. Three nested boxes exactly as in the design:
 *   Margin  (outer, rgba(35,35,35,.4), r24)
 *   Padding (middle, #1b1b1b, r16)
 *   Size    (inner, #0b0b0b, r12)
 * Each box has a corner label and editable top/left/right/bottom edge values.
 */
export function spacingBox(sides, onChange) {
  const edge = (kind, side) => {
    const inp = h('input', { class: 'sp-edge', value: parseLength(sides[kind][side]).value });
    inp.addEventListener('change', () => {
      const raw = inp.value.trim();
      onChange(`${kind}-${side}`, /^-?[\d.]+$/.test(raw) ? raw + 'px' : raw);
    });
    return inp;
  };
  const box = (kind, cls, label, inner) =>
    h('div', { class: cls }, [
      h('span', { class: 'sp-tag', text: label }),
      edge(kind, 'top'),
      h('div', { class: 'sp-mid' }, [edge(kind, 'left'), inner, edge(kind, 'right')]),
      edge(kind, 'bottom'),
    ]);

  const sizeBox = h('div', { class: 'sp-size' }, [
    h('span', { class: 'sp-tag', text: 'Size' }),
    h('span', { html: `${parseLength(sides.width || '0').value} <span class="sp-x">x</span> ${parseLength(sides.height || '0').value}` }),
  ]);
  const padBox = box('padding', 'sp-box sp-padding', 'Padding', sizeBox);
  return box('margin', 'sp-box sp-margin', 'Margin', padBox);
}
