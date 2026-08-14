// Picking mode: track the element under the cursor, highlight it, and
// select on click. Keeps the host page from reacting while picking.

import { store } from './store.js';
import { isOwnUI } from './util.js';

export class Inspector {
  constructor(overlay, onSelect) {
    this.overlay = overlay;
    this.onSelect = onSelect;
    this._onMove = this._onMove.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onKey = this._onKey.bind(this);
    this._onScroll = this._onScroll.bind(this);
  }

  start() {
    document.addEventListener('mousemove', this._onMove, true);
    document.addEventListener('click', this._onClick, true);
    document.addEventListener('keydown', this._onKey, true);
    window.addEventListener('scroll', this._onScroll, true);
    window.addEventListener('resize', this._onScroll, true);
    document.documentElement.style.cursor = 'crosshair';
  }

  stop() {
    document.removeEventListener('mousemove', this._onMove, true);
    document.removeEventListener('click', this._onClick, true);
    document.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('scroll', this._onScroll, true);
    window.removeEventListener('resize', this._onScroll, true);
    document.documentElement.style.cursor = '';
    this.overlay.hideHover();
    store.set({ hoverEl: null });
  }

  _target(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isOwnUI(el) || el === document.documentElement || el === document.body) return null;
    return el;
  }

  _onMove(e) {
    const el = this._target(e);
    if (!el) return this.overlay.hideHover();
    if (el === store.get().hoverEl) return;
    store.set({ hoverEl: el });
    this.overlay.highlight(el);
  }

  _onClick(e) {
    if (isOwnUI(e.target)) return; // let our UI work normally
    const el = this._target(e);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    this.onSelect(el);
  }

  _onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      store.set({ active: false });
    }
  }

  // Keep overlays glued to elements as the page moves.
  _onScroll() {
    const { hoverEl, selectedEl } = store.get();
    if (hoverEl) this.overlay.highlight(hoverEl);
    if (selectedEl) this.overlay.select(selectedEl);
  }
}
