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

const UNIT_OPTIONS = ['px', '%', 'em', 'rem', 'vw', 'vh', 'auto'];

// Clamp a number to the input's min/max attributes (when present) and round.
function clampToInput(input, n) {
  const mn = input.getAttribute('min'), mx = input.getAttribute('max');
  if (mn !== null && n < parseFloat(mn)) n = parseFloat(mn);
  if (mx !== null && n > parseFloat(mx)) n = parseFloat(mx);
  return +n.toFixed(2);
}

// Turn a handle (a field's leading icon/letter) into a horizontal scrubber:
// press and drag to change the number, shift for a coarse ×10 step.
export function attachScrub(handle, input, commit, onDone) {
  handle.classList.add('scrub');
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const startV = parseFloat(input.value) || 0;
    let moved = false;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) < 2) return;
      moved = true;
      input.value = clampToInput(input, startV + dx * (ev.shiftKey ? 10 : 1));
      commit();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      document.documentElement.style.cursor = '';
      if (moved) onDone?.();
    };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
    document.documentElement.style.cursor = 'ew-resize';
  });
}

// Scrub directly on a numeric input: a plain click still focuses it for typing,
// but dragging past a small threshold takes over and scrubs the value.
export function attachInputScrub(input, commit, onDone) {
  input.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startV = parseFloat(input.value) || 0;
    let moved = false;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) < 3) return;
      if (!moved) { moved = true; input.blur(); window.getSelection()?.removeAllRanges(); document.documentElement.style.cursor = 'ew-resize'; }
      input.value = clampToInput(input, startV + dx * (ev.shiftKey ? 10 : 1));
      commit();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      document.documentElement.style.cursor = '';
      if (moved) onDone?.();
    };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
  });
}

/** Field with a leading key (letter or icon) and an optional unit.
 *  The leading handle scrubs the value; the unit opens a unit dropdown. */
export function field({ key, iconName, value, unit = 'px', onChange, showUnit = true, sm = false, scrub = true, onDone, min, max }) {
  const parsed = parseLength(value);
  // Only trust the parsed unit if the incoming value actually carried one;
  // otherwise use the caller's unit (e.g. '%' for opacity), not the px default.
  const hadUnit = /[a-z%]/i.test(String(value ?? ''));
  const input = h('input', { value: parsed.value, type: 'text', inputmode: 'decimal' });
  if (min != null) input.setAttribute('min', min);
  if (max != null) input.setAttribute('max', max);
  const unitEl = showUnit ? h('span', { class: 'unit unit-pick', text: hadUnit ? parsed.unit : unit }) : null;

  const commit = () => {
    let raw = input.value.trim();
    if (raw === '') return onChange('');
    const numeric = /^-?[\d.]+$/.test(raw);
    if (numeric && (min != null || max != null)) { raw = String(clampToInput(input, parseFloat(raw))); input.value = raw; }
    onChange(numeric && showUnit ? raw + (unitEl?.textContent || unit) : raw);
  };
  input.addEventListener('change', () => { commit(); onDone?.(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') return input.blur();
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const cur = parseFloat(input.value) || 0;
      input.value = clampToInput(input, cur + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
      commit(); e.preventDefault();
    }
  });
  if (showUnit && unitEl) {
    unitEl.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      openMenu(unitEl, UNIT_OPTIONS.map((u) => [u, u]), unitEl.textContent, (u) => {
        unitEl.textContent = u; commit(); onDone?.();
      });
    });
  }

  const handle = iconName ? ico(iconName) : (key ? h('span', { class: 'fk', text: key }) : null);
  if (handle && scrub) attachScrub(handle, input, commit, onDone);

  return h('div', { class: 'field' + (sm ? ' sm' : '') }, [handle, input, unitEl]);
}

const CHECK_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 6.5"/></svg>';

let openMenuState = null;
function closeMenu() {
  if (!openMenuState) return;
  const { menu, anchor, onDoc, onKey } = openMenuState;
  menu.remove();
  anchor.classList.remove('open');
  document.removeEventListener('mousedown', onDoc, true);
  document.removeEventListener('keydown', onKey, true);
  window.removeEventListener('scroll', onDoc, true);
  openMenuState = null;
}
function openMenu(anchor, opts, current, onPick) {
  if (openMenuState && openMenuState.anchor === anchor) return closeMenu();
  closeMenu();
  const root = anchor.getRootNode();
  const wrap = (root.querySelector && root.querySelector('.wrap')) || document.body;

  const menu = h('div', { class: 'dropdown-menu', 'data-inspect-ui': '' },
    opts.map(([v, l]) => {
      const isActive = String(v) === String(current);
      const item = h('div', { class: 'dropdown-item' + (isActive ? ' active' : '') }, [
        h('span', { text: l }),
        isActive ? h('span', { class: 'dropdown-check', html: CHECK_SVG }) : null,
      ]);
      item.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); onPick(v); closeMenu(); });
      return item;
    })
  );
  wrap.appendChild(menu);

  const r = anchor.getBoundingClientRect();
  menu.style.left = Math.round(r.left) + 'px';
  menu.style.top = Math.round(r.bottom + 4) + 'px';
  menu.style.minWidth = Math.round(r.width) + 'px';
  const mr = menu.getBoundingClientRect();
  if (mr.bottom > window.innerHeight - 8) menu.style.top = Math.round(r.top - mr.height - 4) + 'px';
  const active = menu.querySelector('.dropdown-item.active');
  if (active) active.scrollIntoView({ block: 'nearest' });

  anchor.classList.add('open');
  const onDoc = (e) => { if (!e.composedPath().includes(menu) && !e.composedPath().includes(anchor)) closeMenu(); };
  const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
  setTimeout(() => {
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onDoc, true);
  }, 0);
  openMenuState = { menu, anchor, onDoc, onKey };
}

/** A custom dropdown styled as a field — matches the design language. */
export function selectField({ value, options, onChange, iconName, key, sm = true }) {
  const opts = options.map((o) => (Array.isArray(o) ? o : [o, o]));
  const current = opts.find(([v]) => String(v) === String(value));
  const valueEl = h('span', { class: 'sel-value', text: current ? current[1] : (value ?? '') });
  const field = h('div', { class: 'field select-like' + (sm ? ' sm' : ''), tabindex: '0' }, [
    iconName ? ico(iconName) : (key ? h('span', { class: 'fk', text: key }) : null),
    valueEl,
    chevMini(),
  ]);
  const open = () => openMenu(field, opts, value, (v) => {
    value = v;
    const nl = opts.find(([ov]) => String(ov) === String(v));
    valueEl.textContent = nl ? nl[1] : v;
    onChange(v);
  });
  field.addEventListener('mousedown', (e) => { e.preventDefault(); open(); });
  field.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return field;
}

/** The light "expand to per-side/per-corner" toggle button (34px in design). */
export function expandBtn(active, iconName, title, onClick) {
  return h('button', {
    class: 'exp-btn' + (active ? ' on' : ''), title,
    html: icon(iconName), onclick: onClick,
  });
}

/** Fill / Stroke sub-header: label on the left, a plus on the right to add it. */
export function subHead(label, onAdd, { disabled = false } = {}) {
  return h('div', { class: 'sub-head' }, [
    h('span', { class: 'sub-label', text: label }),
    h('button', {
      class: 'sub-add' + (disabled ? ' off' : ''), title: 'Add ' + label,
      html: icon('plus'), onclick: disabled ? null : onAdd,
    }),
  ]);
}

/** A row of icon toggle buttons (alignment, flips, text-align). */
export function iconButtons(buttons, { active = -1, grow = false, seg = false, onPick } = {}) {
  const row = h('div', { class: 'iconrow' + (grow ? ' grow' : '') + (seg ? ' seg' : '') });
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

/** Small link/unlink toggle that sits between the W and H size fields. */
export function linkToggle(linked, onToggle) {
  return h('button', {
    class: 'link-toggle' + (linked ? ' on' : ''),
    title: linked ? 'Unlink width & height' : 'Link width & height (keep aspect ratio)',
    html: icon(linked ? 'link' : 'link-off'),
    onclick: onToggle,
  });
}

/**
 * A fill/stroke colour row: [swatch + hex] [alpha %] [minus].
 * Matches the Appearance design — grouped pills with a light delete button.
 * onChange(rgbaString) fires on colour or alpha edits; onRemove removes the layer.
 */
export function colorRow(value, onChange, onRemove) {
  const parsed = rgbToHex(value);
  const hex = parsed.hex;
  let alpha = parsed.alpha == null ? 1 : parsed.alpha;

  const picker = h('input', { type: 'color', value: hex });
  const swatch = h('div', { class: 'cr-swatch' }, [picker]);
  swatch.style.background = value && value !== 'rgba(0, 0, 0, 0)' ? value : 'transparent';
  const hexInput = h('input', { class: 'cr-hex', value: hex.replace('#', '').toUpperCase() });
  const alphaInput = h('input', { class: 'cr-alpha', value: Math.round(alpha * 100), min: '0', max: '100' });

  const push = (hx) => { const out = hexToRgba(hx, alpha); swatch.style.background = out; onChange(out); };
  picker.addEventListener('input', () => { hexInput.value = picker.value.replace('#', '').toUpperCase(); push(picker.value); });
  hexInput.addEventListener('change', () => {
    const v = hexInput.value.trim().replace(/^#/, '');
    if (/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) { picker.value = '#' + v; push('#' + v); }
  });
  const alphaUnit = h('span', { class: 'cr-unit', text: '%' });
  const commitAlpha = () => {
    const pct = Math.max(0, Math.min(100, parseFloat(alphaInput.value) || 0));
    alphaInput.value = pct; alpha = pct / 100;
    push('#' + hexInput.value.trim().replace(/^#/, ''));
  };
  alphaInput.addEventListener('change', commitAlpha);
  attachInputScrub(alphaInput, commitAlpha);       // drag the number itself
  attachScrub(alphaUnit, alphaInput, commitAlpha); // …or drag the % as a handle

  return h('div', { class: 'color-row' }, [
    h('div', { class: 'cr-main' }, [swatch, hexInput]),
    h('div', { class: 'cr-pct' }, [alphaInput, alphaUnit]),
    h('button', { class: 'cr-del', title: 'Remove', html: icon('minus-sign'), onclick: onRemove }),
  ]);
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
export function spacingBox(sides, onChange, onDone) {
  const edge = (kind, side) => {
    const inp = h('input', { class: 'sp-edge', value: parseLength(sides[kind][side]).value });
    const commit = () => {
      const raw = String(inp.value).trim();
      onChange(`${kind}-${side}`, /^-?[\d.]+$/.test(raw) ? raw + 'px' : raw);
    };
    inp.addEventListener('change', () => { commit(); onDone?.(); });
    attachInputScrub(inp, commit, onDone); // drag the number to scrub; click to type
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
