// A floating colour editor opened from a fill swatch. Three modes — Solid,
// Gradient, Image — matching the panel's design language. onChange fires with
// the updated layer object on every edit so the fill applies live.

import { h } from '../core/util.js';
import { icon } from '../icons/index.js';
import { layerCss, defaultLayer } from '../core/fills.js';

const PRESETS = ['#FFFFFF', '#151515', '#58AEFF', '#FF8858', '#33D69F', '#FFCB47', '#E05151', '#B36BFF'];

let openState = null;
export function closeColorPopover() {
  if (!openState) return;
  const { pop, onDoc, onKey } = openState;
  pop.remove();
  document.removeEventListener('mousedown', onDoc, true);
  document.removeEventListener('keydown', onKey, true);
  window.removeEventListener('scroll', onDoc, true);
  openState = null;
}

export function openColorPopover(anchor, layer, onChange) {
  if (openState && openState.anchor === anchor) return closeColorPopover();
  closeColorPopover();
  const root = anchor.getRootNode();
  const wrap = (root.querySelector && root.querySelector('.wrap')) || document.body;

  // Work on a copy; push a fresh copy on every edit.
  let L = JSON.parse(JSON.stringify(layer));
  const emit = () => onChange(JSON.parse(JSON.stringify(L)));

  const body = h('div', { class: 'cpop-body' });
  const tab = (id, label) => h('button', {
    class: 'cpop-tab' + (L.type === id ? ' on' : ''), text: label,
    onclick: () => { if (L.type !== id) { L = defaultLayer(id); emit(); render(); } },
  });
  const tabs = h('div', { class: 'cpop-tabs' }, [tab('solid', 'Solid'), tab('linear', 'Gradient'), tab('image', 'Image')]);

  const pop = h('div', { class: 'cpop', 'data-inspect-ui': '' }, [tabs, body]);
  wrap.appendChild(pop);

  function refreshTabs() { [...tabs.children].forEach((b) => b.classList.toggle('on', b.textContent.toLowerCase().startsWith(L.type === 'linear' ? 'grad' : L.type))); }

  function render() {
    refreshTabs();
    body.innerHTML = '';
    if (L.type === 'solid') body.append(solidEditor());
    else if (L.type === 'linear') body.append(gradientEditor());
    else body.append(imageEditor());
  }

  // ---- Solid ----
  function solidEditor() {
    const wrapEl = h('div', { class: 'cpop-col' });
    const picker = h('input', { type: 'color', class: 'cpop-color', value: safeHex(L.color) });
    picker.addEventListener('input', () => { L.color = picker.value.toUpperCase(); hex.value = L.color.replace('#', ''); emit(); });
    const hex = h('input', { class: 'cpop-hex', value: (L.color || '#FFFFFF').replace('#', '') });
    hex.addEventListener('change', () => { const v = hex.value.trim().replace(/^#/, ''); if (/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) { L.color = '#' + v.toUpperCase(); picker.value = '#' + v; emit(); } });
    const alpha = h('input', { class: 'cpop-alpha', value: Math.round((L.alpha ?? 1) * 100) });
    alpha.addEventListener('change', () => { L.alpha = clamp01(parseFloat(alpha.value) / 100); emit(); });

    wrapEl.append(
      h('div', { class: 'cpop-field' }, [picker, hex, h('span', { class: 'cpop-unit' }, [alpha, h('span', { text: '%' })])]),
      h('div', { class: 'cpop-presets' }, PRESETS.map((c) =>
        h('button', { class: 'cpop-preset', style: { background: c }, title: c,
          onclick: () => { L.color = c; L.alpha = 1; emit(); render(); } }))),
    );
    return wrapEl;
  }

  // ---- Gradient ----
  function gradientEditor() {
    const col = h('div', { class: 'cpop-col' });
    const preview = h('div', { class: 'cpop-gradient-preview' });
    const paint = () => { preview.style.background = layerCss(L); };
    paint();

    const angle = h('input', { class: 'cpop-angle', value: L.angle ?? 180 });
    angle.addEventListener('change', () => { L.angle = parseFloat(angle.value) || 0; emit(); paint(); });

    const stopList = h('div', { class: 'cpop-stops' });
    const drawStops = () => {
      stopList.innerHTML = '';
      L.stops.forEach((s, i) => {
        const sw = h('input', { type: 'color', class: 'cpop-stop-color', value: safeHex(s.color) });
        sw.addEventListener('input', () => { s.color = sw.value.toUpperCase(); emit(); paint(); });
        const pos = h('input', { class: 'cpop-stop-pos', value: s.pos });
        pos.addEventListener('change', () => { s.pos = clamp(parseFloat(pos.value) || 0, 0, 100); emit(); paint(); });
        const del = h('button', { class: 'cpop-stop-del', html: icon('minus-sign'), title: 'Remove stop',
          onclick: () => { if (L.stops.length > 2) { L.stops.splice(i, 1); emit(); paint(); drawStops(); } } });
        stopList.append(h('div', { class: 'cpop-stop' }, [sw, h('span', { class: 'cpop-stop-hex', text: (s.color || '').replace('#', '') }), pos, h('span', { class: 'cpop-unit-s', text: '%' }), del]));
      });
    };
    drawStops();

    col.append(
      preview,
      h('div', { class: 'cpop-field cpop-angle-row' }, [h('span', { class: 'cpop-lab', text: 'Angle' }), angle, h('span', { class: 'cpop-unit-s', text: '°' })]),
      stopList,
      h('button', { class: 'cpop-add', html: icon('plus'), onclick: () => { L.stops.push({ color: '#FFFFFF', alpha: 1, pos: 100 }); emit(); paint(); drawStops(); } }, ['Add stop']),
    );
    return col;
  }

  // ---- Image ----
  function imageEditor() {
    const col = h('div', { class: 'cpop-col' });
    const url = h('input', { class: 'cpop-url', placeholder: 'Image URL', value: L.url || '' });
    url.addEventListener('change', () => { L.url = url.value.trim(); emit(); });
    const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { L.url = r.result; url.value = 'uploaded image'; emit(); };
      r.readAsDataURL(f);
    });
    const upload = h('button', { class: 'cpop-add', html: icon('component'), onclick: () => file.click() }, ['Upload']);
    const fits = ['cover', 'contain', 'fill'];
    const fitRow = h('div', { class: 'cpop-fits' }, fits.map((f) =>
      h('button', { class: 'cpop-fit' + ((L.fit || 'cover') === f ? ' on' : ''), text: f,
        onclick: () => { L.fit = f; emit(); [...fitRow.children].forEach((b) => b.classList.toggle('on', b.textContent === f)); } })));
    col.append(h('div', { class: 'cpop-field' }, [url]), h('div', { class: 'cpop-imgrow' }, [upload, file]), fitRow);
    return col;
  }

  render();

  // position under the anchor
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.round(Math.min(r.left, window.innerWidth - 250)) + 'px';
  pop.style.top = Math.round(r.bottom + 6) + 'px';
  const pr = pop.getBoundingClientRect();
  if (pr.bottom > window.innerHeight - 8) pop.style.top = Math.round(r.top - pr.height - 6) + 'px';

  const onDoc = (e) => { if (!e.composedPath().includes(pop) && !e.composedPath().includes(anchor)) closeColorPopover(); };
  const onKey = (e) => { if (e.key === 'Escape') closeColorPopover(); };
  setTimeout(() => {
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onDoc, true);
  }, 0);
  openState = { pop, anchor, onDoc, onKey };
}

function safeHex(c) { return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#FFFFFF'; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function clamp01(v) { return Math.max(0, Math.min(1, isFinite(v) ? v : 1)); }
