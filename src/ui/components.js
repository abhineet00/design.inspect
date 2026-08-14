// Reusable panel control widgets. Each returns a DOM node and calls back
// with the new CSS value when the user edits it.

import { h, parseLength, rgbToHex, hexToRgba } from '../core/util.js';

/** A labelled numeric/text field with an editable unit, e.g.  W [200] px */
export function field(label, value, onChange, opts = {}) {
  const { unit: showUnit = true } = opts;
  const { value: num, unit } = parseLength(value);
  const input = h('input', {
    value: num,
    type: 'text',
    inputmode: 'decimal',
    'aria-label': label,
  });
  const u = h('span', { class: 'u', text: unit || (showUnit ? 'px' : '') });

  function commit() {
    const raw = input.value.trim();
    if (raw === '') return onChange('');
    const numeric = /^-?[\d.]+$/.test(raw);
    onChange(numeric && showUnit ? raw + (u.textContent || 'px') : raw);
  }
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { input.blur(); }
    // arrow-key nudge
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const cur = parseFloat(input.value) || 0;
      input.value = cur + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
      commit();
      e.preventDefault();
    }
  });
  // cycle common units on unit-click
  if (showUnit) {
    const units = ['px', '%', 'em', 'rem', 'vw', 'vh'];
    u.style.cursor = 'pointer';
    u.addEventListener('click', () => {
      const i = units.indexOf(u.textContent);
      u.textContent = units[(i + 1) % units.length];
      commit();
    });
  }
  return h('div', { class: 'field' }, [
    h('span', { class: 'k', text: label }),
    input,
    showUnit ? u : null,
  ]);
}

/** A labelled <select>. options: [[value,label], ...] */
export function selectField(label, value, options, onChange) {
  const sel = h('select', { 'aria-label': label });
  for (const opt of options) {
    const [v, l] = Array.isArray(opt) ? opt : [opt, opt];
    const o = h('option', { value: v, text: l });
    if (v === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return h('div', { class: 'field' }, [h('span', { class: 'k', text: label }), sel]);
}

/** Color row with swatch, native picker and hex input. */
export function colorRow(label, value, onChange) {
  const parsed = rgbToHex(value);
  const hex = parsed.hex;
  // If the element started fully transparent, a freshly-picked color should be
  // opaque — otherwise the user's edit would be invisible.
  let alpha = parsed.alpha === 0 ? 1 : parsed.alpha;
  const picker = h('input', { type: 'color', value: hex });
  const swatch = h('div', { class: 'swatch' }, [picker]);
  swatch.style.background = value && value !== 'rgba(0, 0, 0, 0)' ? value : 'transparent';
  const hexInput = h('input', { class: 'hex', value: hex });

  const push = (hx) => {
    const out = hexToRgba(hx, alpha);
    swatch.style.background = out;
    onChange(out);
  };
  picker.addEventListener('input', () => { hexInput.value = picker.value; push(picker.value); });
  hexInput.addEventListener('change', () => {
    let v = hexInput.value.trim();
    if (/^[0-9a-f]{3,6}$/i.test(v)) v = '#' + v;
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) { picker.value = v; push(v); }
    else onChange(v); // allow named colors / gradients typed directly
  });
  return h('div', { class: 'color-row' }, [
    swatch,
    h('span', { class: 'k', text: label }),
    hexInput,
  ]);
}

/** Collapsible section. */
export function section(title, contentNodes, { open = true, right = null } = {}) {
  const content = h('div', { class: 'section-content' }, contentNodes);
  const chev = h('span', { class: 'chev', html: '&#9662;' });
  const head = h('div', { class: 'section-title' }, [
    h('span', {}, [title]),
    right || chev,
  ]);
  const sec = h('div', { class: 'section' + (open ? '' : ' closed') }, [head, content]);
  head.addEventListener('click', (e) => {
    if (right && right.contains(e.target)) return;
    sec.classList.toggle('closed');
  });
  return sec;
}

/** The margin/padding box editor. sides = {margin:{top..}, padding:{top..}} */
export function spacingBox(sides, onChange) {
  const mk = (kind, side, val) => {
    const inp = h('input', { class: `${kind[0]}-${side}`, value: parseLength(val).value });
    inp.addEventListener('change', () => {
      const raw = inp.value.trim();
      const v = /^-?[\d.]+$/.test(raw) ? raw + 'px' : raw;
      onChange(`${kind}-${side}`, v);
    });
    return inp;
  };
  return h('div', { class: 'spacing' }, [
    h('span', { class: 'lab m', text: 'margin' }),
    h('span', { class: 'lab p', text: 'padding' }),
    mk('margin', 'top', sides.margin.top),
    mk('margin', 'right', sides.margin.right),
    mk('margin', 'bottom', sides.margin.bottom),
    mk('margin', 'left', sides.margin.left),
    h('div', { class: 'inner' }, [
      mk('padding', 'top', sides.padding.top),
      mk('padding', 'right', sides.padding.right),
      mk('padding', 'bottom', sides.padding.bottom),
      mk('padding', 'left', sides.padding.left),
      h('div', { class: 'center', text: 'content' }),
    ]),
  ]);
}
