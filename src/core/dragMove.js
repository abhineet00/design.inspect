// Drag the selected element to reorder it among its siblings (e.g. re-sequence
// flex/grid/list children). A drop indicator shows where it will land; the
// element keeps its selection after the move.

import { store } from './store.js';
import { h, isOwnUI } from './util.js';

const THRESHOLD = 5;

export class DragMove {
  constructor(onReorder) {
    this.onReorder = onReorder;
    this.indicator = h('div', {
      'data-inspect-ui': '',
      style: {
        position: 'fixed', background: '#58aeff', borderRadius: '2px',
        pointerEvents: 'none', zIndex: '2147483645', display: 'none',
        boxShadow: '0 0 6px rgba(88,174,255,.8)',
      },
    });
    document.documentElement.appendChild(this.indicator);
    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);
  }

  start() { document.addEventListener('mousedown', this._down, true); }
  stop() {
    document.removeEventListener('mousedown', this._down, true);
    this.indicator.remove();
  }

  _down(e) {
    if (e.button !== 0 || isOwnUI(e.target)) return;
    const sel = store.get().selectedEl;
    if (!sel) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    // only start a drag when the press begins on the already-selected element
    if (!el || (el !== sel && !sel.contains(el))) return;
    this.sx = e.clientX; this.sy = e.clientY;
    this.armed = true; this.dragging = false;
    document.addEventListener('mousemove', this._move, true);
    document.addEventListener('mouseup', this._up, true);
  }

  _move(e) {
    if (!this.armed) return;
    if (!this.dragging) {
      if (Math.hypot(e.clientX - this.sx, e.clientY - this.sy) < THRESHOLD) return;
      this.dragging = true;
      store.set({ dragging: true });
      document.documentElement.style.cursor = 'grabbing';
    }
    this._updateTarget(e);
  }

  _updateTarget(e) {
    const el = store.get().selectedEl;
    const parent = el?.parentElement;
    if (!parent) return;
    const siblings = [...parent.children].filter((c) => !isOwnUI(c));
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const sib = siblings.find((s) => s === under || s.contains(under));
    if (!sib || sib === el) { this.ref = undefined; return this.indicator.style.display = 'none'; }

    const row = /row/.test(getComputedStyle(parent).flexDirection) ||
      getComputedStyle(parent).display.includes('inline');
    const r = sib.getBoundingClientRect();
    const after = row ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    this.ref = after ? sib.nextElementSibling : sib;
    if (this.ref === el) this.ref = after ? el.nextElementSibling : el; // no-op guard

    // draw the indicator in the gap
    if (row) {
      const x = after ? r.right : r.left;
      Object.assign(this.indicator.style, {
        display: 'block', left: x - 1 + 'px', top: r.top + 'px', width: '3px', height: r.height + 'px',
      });
    } else {
      const y = after ? r.bottom : r.top;
      Object.assign(this.indicator.style, {
        display: 'block', left: r.left + 'px', top: y - 1 + 'px', width: r.width + 'px', height: '3px',
      });
    }
  }

  _up() {
    document.removeEventListener('mousemove', this._move, true);
    document.removeEventListener('mouseup', this._up, true);
    this.indicator.style.display = 'none';
    document.documentElement.style.cursor = '';
    const wasDragging = this.dragging;
    this.armed = false; this.dragging = false;

    if (wasDragging) {
      const el = store.get().selectedEl;
      if (el && this.ref !== undefined && this.ref !== el) {
        el.parentElement.insertBefore(el, this.ref || null);
      }
      store.set({ dragging: false });
      this.ref = undefined;
      // swallow the click that follows this mouseup so it doesn't re-select
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault();
        document.removeEventListener('click', swallow, true); };
      document.addEventListener('click', swallow, true);
      this.onReorder?.(el);
    }
  }
}
