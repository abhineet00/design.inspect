// The floating inspector panel: header, tabs, and the Design / Code / HTML views.

import { store } from '../core/store.js';
import { h, round, elementLabel } from '../core/util.js';
import { breadcrumb } from '../core/selector.js';
import { readModel, composeTransform } from '../core/styleModel.js';
import { setProp, generateCss, clearAll } from '../core/liveStyles.js';
import { field, selectField, colorRow, section, spacingBox } from './components.js';

export class Panel {
  constructor(root) {
    this.root = root;
    this.el = h('div', { class: 'panel', 'data-inspect-ui': '' });
    root.appendChild(this.el);
    this._drag();
  }

  set(el) {
    this.selected = el;
    this.render();
  }

  render() {
    const st = store.get();
    this.el.classList.toggle('collapsed', st.collapsed);
    this.el.innerHTML = '';
    this.el.append(this._head(), this._tabs());
    if (st.collapsed) return;
    const body = h('div', { class: 'panel-body' });
    if (!this.selected) {
      body.append(h('div', { class: 'empty', text: 'Pick an element on the page to inspect and edit its styles.' }));
    } else if (st.tab === 'design') this._design(body);
    else if (st.tab === 'code') this._code(body);
    else this._html(body);
    this.el.append(body);
  }

  _head() {
    const el = this.selected;
    const m = el ? readModel(el) : null;
    const actions = h('div', { class: 'head-actions' }, [
      iconBtn('copy', 'Copy CSS', () => this._copy()),
      iconBtn('collapse', 'Collapse', () => store.set({ collapsed: !store.get().collapsed })),
      iconBtn('clear', 'Reset all edits', () => { clearAll(); this.render(); }),
      iconBtn('close', 'Close', () => window.InspectCSS?.destroy()),
    ]);
    return h('div', { class: 'panel-head' }, [
      h('div', { class: 'head-meta' }, [
        h('div', { class: 'head-title', text: el ? elementLabel(el) || m.tag : 'InspectCSS' }),
        h('div', { class: 'head-sel', text: el ? breadcrumb(el) : 'no selection' }),
        el ? h('div', { class: 'head-dims' }, [
          h('span', { html: `<b>${round(m.rect.width)}×${round(m.rect.height)}</b> px` }),
          h('span', { html: `A <b>${m.typography.fontSize}</b>` }),
        ]) : null,
      ]),
      actions,
    ]);
  }

  _tabs() {
    const st = store.get();
    const mk = (id, label, isNew) =>
      h('button', {
        class: 'tab' + (st.tab === id ? ' active' : ''),
        onclick: () => { store.set({ tab: id }); this.render(); },
      }, [label, isNew ? h('span', { class: 'badge-new', text: 'NEW' }) : null]);
    return h('div', { class: 'tabs' }, [
      mk('design', 'Design'),
      mk('code', 'Code'),
      mk('html', 'HTML'),
    ]);
  }

  // ---------------- Design tab ----------------
  _design(body) {
    const el = this.selected;
    const m = readModel(el);
    const on = (prop) => (v) => { setProp(el, prop, v); this._refreshLight(); };

    // Media + pseudo context row
    body.append(
      selectRow('Media', 'Auto — screen', []),
      pseudoRow((p) => { store.set({ pseudo: p }); this.render(); })
    );

    // Position / size / transform
    const t = m.transform;
    const setT = (patch) => {
      Object.assign(t, patch);
      const v = composeTransform(t);
      setProp(el, 'transform', v);
      this._refreshLight();
    };
    body.append(section('Layout', [
      h('div', { class: 'grid-3' }, [
        field('X', t.tx + 'px', (v) => setT({ tx: parseFloat(v) || 0 })),
        field('Y', t.ty + 'px', (v) => setT({ ty: parseFloat(v) || 0 })),
        field('∠', t.rotate + '', (v) => setT({ rotate: parseFloat(v) || 0 }), { unit: false }),
      ]),
      h('div', { class: 'grid-3', style: { marginTop: '8px' } }, [
        field('W', m.layout.width, on('width')),
        field('H', m.layout.height, on('height')),
        field('R', m.radius.all, on('border-radius')),
      ]),
      h('div', { class: 'grid', style: { marginTop: '8px' } }, [
        selectField('display', m.layout.display,
          ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'none'], on('display')),
        selectField('position', m.layout.position,
          ['static', 'relative', 'absolute', 'fixed', 'sticky'], on('position')),
      ]),
    ]));

    // Spacing
    body.append(section('Spacing', [
      spacingBox(m.spacing, (prop, v) => { setProp(el, prop, v); this._refreshLight(); }),
    ]));

    // Typography
    body.append(section('Typography', [
      h('div', { class: 'grid' }, [
        field('Size', m.typography.fontSize, on('font-size')),
        selectField('Weight', String(m.typography.fontWeight),
          ['100','200','300','400','500','600','700','800','900'], on('font-weight')),
      ]),
      h('div', { class: 'grid', style: { marginTop: '8px' } }, [
        field('Line', m.typography.lineHeight === 'normal' ? '1.4' : m.typography.lineHeight, on('line-height'), { unit: false }),
        field('Spacing', m.typography.letterSpacing, on('letter-spacing')),
      ]),
      h('div', { style: { marginTop: '8px' } }, [
        selectField('Align', m.typography.textAlign,
          ['left', 'center', 'right', 'justify'], on('text-align')),
      ]),
      h('div', { style: { marginTop: '8px' } }, [colorRow('color', m.typography.color, on('color'))]),
    ]));

    // Fill & border
    body.append(section('Fill & Border', [
      colorRow('background', m.background.color, on('background-color')),
      colorRow('border', m.border.color, on('border-color')),
      h('div', { class: 'grid' }, [
        field('Border', m.border.width, on('border-width')),
        selectField('Style', m.border.style,
          ['none', 'solid', 'dashed', 'dotted', 'double'], on('border-style')),
      ]),
    ]));

    // Effects
    body.append(section('Effects', [
      field('Opacity', m.effects.opacity, on('opacity'), { unit: false }),
      h('div', { style: { marginTop: '8px' } }, [
        field('Shadow', m.effects.boxShadow, on('box-shadow'), { unit: false }),
      ]),
    ], { open: false }));
  }

  // Re-read only the header dims without rebuilding inputs (keeps focus).
  _refreshLight() {
    store.get().panelDirty = true;
  }

  // ---------------- Code tab ----------------
  _code(body) {
    const cssText = generateCss();
    body.append(
      h('div', { class: 'code-actions' }, [
        h('button', { class: 'btn primary', text: 'Copy CSS', onclick: () => this._copy() }),
        h('button', { class: 'btn', text: 'Reset', onclick: () => { clearAll(); this.render(); } }),
      ]),
      cssText
        ? h('pre', { class: 'code', html: highlight(cssText) })
        : h('div', { class: 'empty', text: 'No edits yet. Change a property in the Design tab and the generated CSS appears here.' })
    );
  }

  // ---------------- HTML tab ----------------
  _html(body) {
    const el = this.selected;
    if (!el) return body.append(h('div', { class: 'empty', text: 'No element selected.' }));
    const clone = el.cloneNode(false);
    clone.removeAttribute('data-inspect-id');
    const open = clone.outerHTML.replace(/></, '>\n  ...\n<');
    body.append(h('pre', { class: 'code', html: escapeHtml(open) }));
  }

  _copy() {
    const text = generateCss();
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => this._toast('CSS copied'));
  }

  _toast(msg) {
    const t = h('div', {
      'data-inspect-ui': '', text: msg,
      style: {
        position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
        background: '#4c8dff', color: '#fff', padding: '8px 16px', borderRadius: '8px',
        fontSize: '13px', zIndex: '2147483647', boxShadow: '0 6px 20px rgba(0,0,0,.4)',
      },
    });
    this.root.appendChild(t);
    setTimeout(() => t.remove(), 1400);
  }

  // Drag the panel by its header.
  _drag() {
    let sx, sy, ox, oy, dragging = false;
    this.el.addEventListener('mousedown', (e) => {
      const head = e.target.closest('.panel-head');
      if (!head || e.target.closest('.icon-btn')) return;
      dragging = true;
      const r = this.el.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      this.el.style.right = 'auto';
      document.addEventListener('mousemove', move, true);
      document.addEventListener('mouseup', up, true);
      e.preventDefault();
    });
    const move = (e) => {
      if (!dragging) return;
      this.el.style.left = ox + (e.clientX - sx) + 'px';
      this.el.style.top = Math.max(0, oy + (e.clientY - sy)) + 'px';
    };
    const up = () => {
      dragging = false;
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('mouseup', up, true);
    };
  }
}

// --- helpers ---
function iconBtn(kind, title, onClick) {
  return h('button', { class: 'icon-btn', title, onclick: onClick, html: ICONS[kind] || '' });
}

function selectRow(label, value) {
  return h('div', { class: 'selectrow' }, [
    h('label', { html: `${ICONS.media} ${label}` }),
    h('select', {}, [h('option', { text: value, selected: true })]),
  ]);
}

function pseudoRow(onChange) {
  const st = store.get();
  const sel = h('select', {}, ['none', 'hover', 'focus', 'active'].map((p) => {
    const o = h('option', { value: p, text: p === 'none' ? 'None' : ':' + p });
    if (p === st.pseudo) o.selected = true;
    return o;
  }));
  sel.addEventListener('change', () => onChange(sel.value));
  return h('div', { class: 'selectrow' }, [
    h('label', { html: `${ICONS.state} State or pseudo` }),
    sel,
  ]);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlight(css) {
  return escapeHtml(css)
    .replace(/^([^{\n]+)\{/gm, '<span class="sel">$1</span>{')
    .replace(/^(\s+)([\w-]+)(:)/gm, '$1<span class="prop">$2</span>$3')
    .replace(/: ([^;]+);/g, ': <span class="val">$1</span>;');
}

const ICONS = {
  media: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8"/></svg>',
  state: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>',
  copy: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  collapse: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>',
  clear: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-9 0v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6"/></svg>',
  close: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>',
};
