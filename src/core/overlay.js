// A full-viewport, click-through overlay that draws highlight boxes,
// margin/padding shading and a size badge over the hovered/selected element.

import { h, round, elementLabel } from './util.js';

export class Overlay {
  constructor(root) {
    this.el = h('div', {
      'data-inspect-ui': '',
      style: {
        position: 'fixed',
        inset: '0',
        pointerEvents: 'none',
        // Below the panel/dock (2147483646) so highlights never cover our UI.
        zIndex: '2147483640',
      },
    });
    // Layers: margin, padding, content border, size badge, selected outline.
    this.margin = this._box('rgba(246, 178, 107, 0.28)');
    this.padding = this._box('rgba(147, 196, 125, 0.30)');
    this.content = h('div', { style: this._boxStyle('transparent', '#4c8dff') });
    this.selected = h('div', { style: this._boxStyle('transparent', '#7c5cff') });
    this.badge = h('div', {
      'data-inspect-ui': '',
      style: {
        position: 'fixed',
        font: "500 12px/1.4 'Quicksand', -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: 'rgba(255,255,255,0.6)',
        background: 'rgba(0,0,0,0.82)',
        border: '1px solid rgba(255,255,255,0.12)',
        padding: '4px 9px',
        borderRadius: '8px',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        boxShadow: '0 6px 20px rgba(0,0,0,.45)',
        backdropFilter: 'blur(6px)',
      },
    });
    this.el.append(this.margin, this.padding, this.content, this.selected, this.badge);
    root.appendChild(this.el);
    this.hideHover();
    this.hideSelected();
  }

  _box(bg) {
    return h('div', { style: { position: 'fixed', background: bg, pointerEvents: 'none' } });
  }
  _boxStyle(bg, border) {
    return {
      position: 'fixed',
      background: bg,
      outline: `1px solid ${border}`,
      outlineOffset: '-1px',
      pointerEvents: 'none',
    };
  }

  _place(node, r) {
    Object.assign(node.style, {
      left: r.left + 'px',
      top: r.top + 'px',
      width: Math.max(0, r.width) + 'px',
      height: Math.max(0, r.height) + 'px',
      display: 'block',
    });
  }

  highlight(el) {
    if (!el) return this.hideHover();
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const m = num(cs, 'margin');
    const p = num(cs, 'padding');

    // margin box (outer)
    this._place(this.margin, {
      left: r.left - m.left,
      top: r.top - m.top,
      width: r.width + m.left + m.right,
      height: r.height + m.top + m.bottom,
    });
    // content border box
    this._place(this.content, r);
    // padding shade sits just inside the border box
    this._place(this.padding, r);

    // name + size badge above the element (or below if no room)
    const label = elementLabel(el);
    this.badge.innerHTML =
      `<span style="color:#58aeff">${escapeHtml(label)}</span>` +
      `<span style="opacity:.5">&nbsp;&nbsp;${round(r.width)} × ${round(r.height)}</span>`;
    this.badge.style.display = 'block';
    const bTop = r.top > 24 ? r.top - 22 : r.bottom + 6;
    this.badge.style.left = Math.max(4, r.left) + 'px';
    this.badge.style.top = bTop + 'px';
  }

  select(el) {
    if (!el) return this.hideSelected();
    this._place(this.selected, el.getBoundingClientRect());
  }

  hideHover() {
    [this.margin, this.padding, this.content, this.badge].forEach(
      (n) => (n.style.display = 'none')
    );
  }
  hideSelected() {
    this.selected.style.display = 'none';
  }
  destroy() {
    this.el.remove();
  }
}

function num(cs, prop) {
  const g = (s) => parseFloat(cs.getPropertyValue(`${prop}-${s}`)) || 0;
  return { top: g('top'), right: g('right'), bottom: g('bottom'), left: g('left') };
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
