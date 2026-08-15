// The floating inspector panel. Layout, colors and sections follow the Figma
// design 1:1. The active view (design / code / html) is driven by the toolbar.

import { store } from '../core/store.js';
import { h, round, elementLabel } from '../core/util.js';
import { readModel, composeTransform } from '../core/styleModel.js';
import { setProp, generateCss, clearAll } from '../core/liveStyles.js';
import { icon } from '../icons/index.js';
import {
  field, selectField, iconButtons, colorLine, section, labeled, spacingBox,
} from './components.js';

export class Panel {
  constructor(root) {
    this.root = root;
    this.el = h('div', { class: 'panel', 'data-inspect-ui': '' });
    root.appendChild(this.el);
    this._drag();
  }

  set(el) { this.selected = el; this.render(); }

  render() {
    const st = store.get();
    this.el.classList.toggle('hidden', st.collapsed);
    this.el.innerHTML = '';
    this.el.append(this._head());
    const body = h('div', { class: 'panel-body' });
    if (!this.selected) {
      body.append(h('div', { class: 'empty', text: 'Pick an element on the page to inspect and edit its styles.' }));
    } else if (st.view === 'code') this._code(body);
    else if (st.view === 'html') this._html(body);
    else this._design(body);
    this.el.append(body);
  }

  // ---------------- Header ----------------
  _head() {
    const el = this.selected;
    const m = el ? readModel(el) : null;
    const crumb = el ? classChain(el) : [];
    return h('div', { class: 'head' }, [
      h('div', { class: 'head-top' }, [
        h('div', { class: 'head-title', text: el ? elementLabel(el) || m.tag : 'InspectCSS' }),
        h('div', { class: 'head-actions' }, [
          hbtn('delete02', 'Reset all edits', () => { clearAll(); this.render(); }),
          hbtn('minimize-screen', 'Collapse panel', () => store.set({ collapsed: true })),
          hbtn('x', 'Close', () => window.InspectCSS?.destroy()),
        ]),
      ]),
      el ? h('div', { class: 'crumb' }, crumb.map((c) => h('span', { text: c }))) : null,
      el ? h('div', { class: 'dims' }, [
        h('span', { html: `<b>${round(m.rect.width)}</b> x <b>${round(m.rect.height)}</b> px` }),
        h('span', { html: `A <b>${parseInt(m.typography.fontSize)}px</b>` }),
      ]) : h('div', { class: 'crumb', text: 'no selection' }),
    ]);
  }

  // ---------------- Design view ----------------
  _design(body) {
    const el = this.selected;
    const m = readModel(el);
    const on = (prop) => (v) => setProp(el, prop, v);

    // ----- Position -----
    const t = m.transform;
    const setT = (patch) => { Object.assign(t, patch); setProp(el, 'transform', composeTransform(t)); };
    // Alignment icon order matches the design exactly.
    const alignIcons = [
      { icon: 'align-left', title: 'Align left', css: ['justify-content', 'flex-start'] },
      { icon: 'align-bottom', title: 'Align bottom', css: ['align-items', 'flex-end'] },
      { icon: 'align-right', title: 'Align right', css: ['justify-content', 'flex-end'] },
      { icon: 'align-top', title: 'Align top', css: ['align-items', 'flex-start'] },
      { icon: 'align-horizontal-center', title: 'Center horizontally', css: ['justify-content', 'center'] },
      { icon: 'align-vertical-center', title: 'Center vertically', css: ['align-items', 'center'] },
    ];
    body.append(section('Position', [
      labeled('Alignment', iconButtons(alignIcons, { grow: true, onPick: (b) => setProp(el, b.css[0], b.css[1]) })),
      labeled('Position', h('div', { class: 'row' }, [
        field({ key: 'X', value: t.tx + 'px', onChange: (v) => setT({ tx: parseFloat(v) || 0 }) }),
        field({ key: 'Y', value: t.ty + 'px', onChange: (v) => setT({ ty: parseFloat(v) || 0 }) }),
      ])),
      labeled('Rotation', h('div', { class: 'rot-row' }, [
        field({ iconName: 'rotate01', value: t.rotate + '', showUnit: false, onChange: (v) => setT({ rotate: parseFloat(v) || 0 }) }),
        iconButtons([{ icon: 'image-flip-horizontal', title: 'Flip horizontal' }], { grow: true, onPick: () => flip(el, 'x') }),
        iconButtons([{ icon: 'image-flip-vertical', title: 'Flip vertical' }], { grow: true, onPick: () => flip(el, 'y') }),
      ])),
    ]));

    // ----- Layout -----
    body.append(section('Layout', [
      labeled('Size', h('div', { class: 'row' }, [
        field({ key: 'W', value: m.layout.width, onChange: on('width') }),
        field({ key: 'H', value: m.layout.height, onChange: on('height') }),
      ])),
      labeled('Display', selectField({
        value: m.layout.display,
        options: ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'none'],
        onChange: on('display'),
      })),
      h('div', { class: 'row' }, [
        labeled('Row Gap', field({ iconName: 'paragraph-spacing', value: m.layout.rowGap, showUnit: false, sm: true, onChange: on('row-gap') })),
        labeled('Column Gap', field({ iconName: 'letter-spacing', value: m.layout.columnGap, showUnit: false, sm: true, onChange: on('column-gap') })),
      ]),
      h('div', { class: 'row' }, [
        labeled('Horizontal Align', selectField({ value: m.layout.justify, options: [['flex-start', 'Start'], ['center', 'Center'], ['flex-end', 'End'], ['space-between', 'Between']], onChange: on('justify-content') })),
        labeled('Vertical Align', selectField({ value: m.layout.align, options: [['flex-start', 'Start'], ['center', 'Center'], ['flex-end', 'End'], ['stretch', 'Stretch']], onChange: on('align-items') })),
      ]),
    ]));

    // ----- Spacing -----
    body.append(section('Spacing', [
      labeled('Padding', h('div', { class: 'row' }, [
        field({ iconName: 'horizontal-resize', value: m.spacing.padding.left, onChange: (v) => { on('padding-left')(v); on('padding-right')(v); } }),
        field({ iconName: 'vertical-resize', value: m.spacing.padding.top, onChange: (v) => { on('padding-top')(v); on('padding-bottom')(v); } }),
      ])),
      labeled('Margin', h('div', { class: 'row' }, [
        field({ iconName: 'horizontal-resize', value: m.spacing.margin.left, onChange: (v) => { on('margin-left')(v); on('margin-right')(v); } }),
        field({ iconName: 'vertical-resize', value: m.spacing.margin.top, onChange: (v) => { on('margin-top')(v); on('margin-bottom')(v); } }),
      ])),
      spacingBox({ ...m.spacing, width: m.layout.width, height: m.layout.height }, (prop, v) => setProp(el, prop, v)),
    ]));

    // ----- Appearance -----
    const corners = [
      { key: 'tl', prop: 'border-top-left-radius', v: m.radius.tl },
      { key: 'tr', prop: 'border-top-right-radius', v: m.radius.tr },
      { key: 'bl', prop: 'border-bottom-left-radius', v: m.radius.bl },
      { key: 'br', prop: 'border-bottom-right-radius', v: m.radius.br },
    ];
    const mixed = new Set([m.radius.tl, m.radius.tr, m.radius.bl, m.radius.br]).size > 1;
    body.append(section('Appearance', [
      h('div', { class: 'row' }, [
        labeled('Opacity', field({ iconName: 'transparency', value: String(Math.round((parseFloat(m.effects.opacity) || 1) * 100)), unit: '%', onChange: (v) => on('opacity')((parseFloat(v) || 100) / 100) })),
        labeled('Corner', h('div', { class: 'corner-mix' }, [
          field({ iconName: 'full-screen', value: mixed ? 'mix' : m.radius.all, showUnit: false, onChange: on('border-radius') }),
          iconButtons([{ icon: 'full-screen', title: 'Link corners' }], { onPick: () => on('border-radius')(m.radius.tl) }),
        ])),
      ]),
      h('div', { class: 'corner-grid' }, corners.map((c) =>
        field({ iconName: 'full-screen', value: c.v, showUnit: false, onChange: on(c.prop) }))),
      labeled('', addRow('Fill', () => on('background-color')('#ffffff'))),
      m.background.color && m.background.color !== 'rgba(0, 0, 0, 0)'
        ? colorLine(m.background.color, on('background-color')) : null,
      labeled('', addRow('Stroke', () => { on('border-style')('solid'); on('border-width')('1px'); on('border-color')('#ffffff'); })),
      m.border.style !== 'none'
        ? colorLine(m.border.color, on('border-color')) : null,
    ]));

    // ----- Typography -----
    body.append(section('Typography', [
      labeled('Typeface', selectField({ value: firstFont(m.typography.fontFamily),
        options: [firstFont(m.typography.fontFamily), 'Quicksand', 'Inter', 'Arial', 'Georgia', 'system-ui', 'monospace'],
        onChange: on('font-family') })),
      h('div', { class: 'row' }, [
        selectField({ value: weightName(m.typography.fontWeight), options: [['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'SemiBold'], ['700', 'Bold'], ['800', 'Extra']], onChange: on('font-weight') }),
        selectField({ value: parseInt(m.typography.fontSize) + '', options: ['10', '12', '13', '14', '16', '18', '20', '24', '32', '48'].map((x) => [x, x]), onChange: (v) => on('font-size')(v + 'px') }),
      ]),
      h('div', { class: 'row' }, [
        labeled('Line Height', field({ iconName: 'paragraph-spacing', value: normalizeLine(m.typography.lineHeight), showUnit: false, sm: true, onChange: on('line-height') })),
        labeled('Letter Spacing', field({ iconName: 'letter-spacing', value: m.typography.letterSpacing, showUnit: false, sm: true, onChange: on('letter-spacing') })),
      ]),
      h('div', { class: 'row' }, [
        labeled('Paragraph Spacing', field({ iconName: 'expand-paragraph', value: parseLenSafe(m.typography.marginBottom), sm: true, onChange: on('margin-bottom') })),
        labeled('Alignment', iconButtons([
          { icon: 'text-align-right', title: 'Right', css: 'right' },
          { icon: 'text-align-center', title: 'Center', css: 'center' },
          { icon: 'text-align-start', title: 'Left', css: 'left' },
          { icon: 'text-align-justify', title: 'Justify', css: 'justify' },
        ], { grow: true, active: ['right', 'center', 'left', 'justify'].indexOf(m.typography.textAlign), onPick: (b) => on('text-align')(b.css) })),
      ]),
    ]));
  }

  // ---------------- Code view ----------------
  _code(body) {
    const cssText = generateCss();
    body.append(
      h('div', { class: 'view-actions' }, [
        h('button', { class: 'btn primary', text: 'Copy CSS', onclick: () => this._copy() }),
        h('button', { class: 'btn', text: 'Reset', onclick: () => { clearAll(); this.render(); } }),
      ]),
      cssText ? h('pre', { class: 'code', html: highlight(cssText) })
              : h('div', { class: 'empty', text: 'No edits yet. Change a property in the Design view and the generated CSS appears here.' })
    );
  }

  _html(body) {
    const el = this.selected;
    if (!el) return body.append(h('div', { class: 'empty', text: 'No element selected.' }));
    const clone = el.cloneNode(false);
    clone.removeAttribute('data-inspect-id');
    body.append(h('pre', { class: 'code', html: escapeHtml(clone.outerHTML.replace(/></, '>\n  …\n<')) }));
  }

  _copy() {
    const text = generateCss();
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => this._toast('CSS copied'));
  }
  _toast(msg) {
    const t = h('div', { class: 'toast', 'data-inspect-ui': '', text: msg });
    this.root.appendChild(t);
    setTimeout(() => t.remove(), 1400);
  }

  _drag() {
    let sx, sy, ox, oy, dragging = false;
    this.el.addEventListener('mousedown', (e) => {
      const head = e.target.closest('.head');
      if (!head || e.target.closest('.hbtn')) return;
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
    const up = () => { dragging = false; document.removeEventListener('mousemove', move, true); document.removeEventListener('mouseup', up, true); };
  }
}

// ---- helpers ----
function hbtn(name, title, onClick) {
  return h('button', { class: 'hbtn', title, onclick: onClick, html: icon(name) });
}
function addRow(label, onAdd) {
  return h('div', { class: 'addrow' }, [
    h('span', { class: 'k', text: label }),
    h('button', { class: 'addbtn', title: 'Add ' + label, html: icon('plus'), onclick: onAdd }),
  ]);
}
function classChain(el) {
  const out = [];
  let node = el, depth = 0;
  while (node && node.nodeType === 1 && node !== document.documentElement && depth < 3) {
    if (node.classList.length) out.unshift('.' + node.classList[0]);
    else out.unshift(node.tagName.toLowerCase());
    node = node.parentElement; depth++;
  }
  return out;
}
function flip(el, axis) {
  const cs = getComputedStyle(el);
  const cur = cs.transform === 'none' ? '' : cs.transform + ' ';
  setProp(el, 'transform', cur + (axis === 'x' ? 'scaleX(-1)' : 'scaleY(-1)'));
}
function firstFont(ff) { return (ff || '').split(',')[0].replace(/["']/g, '').trim() || 'system-ui'; }
function weightName(w) { return String(w); }
function normalizeLine(lh) { return lh === 'normal' ? '1.4' : lh; }
function parseLenSafe(v) { return v && v !== 'auto' ? v : '0px'; }
function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function highlight(css) {
  return escapeHtml(css)
    .replace(/^([^{\n]+)\{/gm, '<span class="sel">$1</span>{')
    .replace(/^(\s+)([\w-]+)(:)/gm, '$1<span class="prop">$2</span>$3')
    .replace(/: ([^;]+);/g, ': <span class="val">$1</span>;');
}
