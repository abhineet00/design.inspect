// Drag-to-reorder via a small grab handle that appears on the selected element.
// Press the handle and drag to re-sequence the element among its siblings
// (flex/grid/list); a drop indicator shows where it will land.

import { store } from './store.js';
import { h, isOwnUI } from './util.js';

const THRESHOLD = 4;
const MOVE_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>';

export class DragMove {
  constructor(onReorder) {
    this.onReorder = onReorder;
    this.indicator = h('div', {
      'data-inspect-ui': '',
      style: {
        position: 'fixed', background: '#58aeff', borderRadius: '2px',
        pointerEvents: 'none', zIndex: '2147483644', display: 'none',
        boxShadow: '0 0 6px rgba(88,174,255,.8)',
      },
    });
    this.handle = h('div', {
      'data-inspect-ui': '', title: 'Drag to reorder', html: MOVE_ICON,
      style: {
        position: 'fixed', width: '26px', height: '26px', borderRadius: '999px',
        display: 'none', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.82)', border: '1px solid rgba(255,255,255,0.18)',
        color: '#fff', cursor: 'grab', zIndex: '2147483645',
        boxShadow: '0 4px 14px rgba(0,0,0,.5)', backdropFilter: 'blur(6px)',
      },
    });
    document.documentElement.append(this.indicator, this.handle);
    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);
    this._reposition = this._reposition.bind(this);
    this._sync = this._sync.bind(this);
  }

  start() {
    this.handle.addEventListener('mousedown', this._down, true);
    this.handle.addEventListener('mouseenter', () => (this.handle.style.background = '#58aeff'));
    this.handle.addEventListener('mouseleave', () => (this.handle.style.background = 'rgba(0,0,0,0.82)'));
    this.unsub = store.subscribe(this._sync);
    window.addEventListener('scroll', this._reposition, true);
    window.addEventListener('resize', this._reposition, true);
  }
  stop() {
    this.unsub?.();
    window.removeEventListener('scroll', this._reposition, true);
    window.removeEventListener('resize', this._reposition, true);
    this.indicator.remove();
    this.handle.remove();
  }

  // Show/hide the handle based on whether an element is selected.
  _sync() {
    const s = store.get();
    const show = s.selectedEl && !s.dragging && !s.editing;
    this.handle.style.display = show ? 'flex' : 'none';
    if (show) this._reposition();
  }
  _reposition() {
    const el = store.get().selectedEl;
    if (!el || this.dragging) return;
    const r = el.getBoundingClientRect();
    this.handle.style.left = Math.round(Math.max(4, r.left - 8)) + 'px';
    this.handle.style.top = Math.round(Math.max(4, r.top - 8)) + 'px';
  }

  _down(e) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    if (!store.get().selectedEl) return;
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
      this.handle.style.display = 'none';
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
    if (!sib || sib === el) { this.ref = undefined; this.indicator.style.display = 'none'; return; }

    const cs = getComputedStyle(parent);
    const row = /row/.test(cs.flexDirection) || cs.display.includes('inline') ||
      (cs.display === 'grid' && cs.gridAutoFlow.includes('column'));
    const r = sib.getBoundingClientRect();
    const after = row ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    this.ref = after ? sib.nextElementSibling : sib;

    if (row) {
      const x = after ? r.right : r.left;
      Object.assign(this.indicator.style, {
        display: 'block', left: x - 1.5 + 'px', top: r.top + 'px', width: '3px', height: r.height + 'px',
      });
    } else {
      const y = after ? r.bottom : r.top;
      Object.assign(this.indicator.style, {
        display: 'block', left: r.left + 'px', top: y - 1.5 + 'px', width: r.width + 'px', height: '3px',
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
      const swallow = (ev) => {
        ev.stopPropagation(); ev.preventDefault();
        document.removeEventListener('click', swallow, true);
      };
      document.addEventListener('click', swallow, true);
      this.onReorder?.(el);
    }
    this._sync();
  }
}
