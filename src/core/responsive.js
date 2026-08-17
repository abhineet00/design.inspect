// Responsive preview: constrains the page to a width you can drag — from mobile
// all the way up to the full screen — with a resize handle and a width readout.

import { h } from './util.js';

export class Responsive {
  constructor() {
    this.active = false;
    this.width = 0;
    this.handleR = this._makeHandle();
    this.handleL = this._makeHandle();
    this.label = h('div', {
      'data-inspect-ui': '',
      style: {
        position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)',
        zIndex: '2147483645', display: 'none', background: 'rgba(0,0,0,0.82)', color: '#fff',
        font: "500 12px 'Quicksand', -apple-system, sans-serif", padding: '4px 10px',
        borderRadius: '8px', border: '1px solid rgba(255,255,255,0.14)', pointerEvents: 'none',
      },
    });
    document.documentElement.append(this.handleR, this.handleL, this.label);
    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);
    this._reposition = this._reposition.bind(this);
    this.handleR.addEventListener('mousedown', this._down);
    this.handleL.addEventListener('mousedown', this._down);
  }

  // A draggable edge handle with a centered grip; there is one on each side and
  // both resize symmetrically about the centered page.
  _makeHandle() {
    const handle = h('div', {
      'data-inspect-ui': '',
      style: {
        position: 'fixed', top: '0', bottom: '0', width: '12px', cursor: 'ew-resize',
        zIndex: '2147483645', display: 'none',
      },
    });
    handle.appendChild(h('div', {
      style: {
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: '6px', height: '54px', borderRadius: '4px', background: '#58aeff',
        boxShadow: '0 0 8px rgba(88,174,255,.7)',
      },
    }));
    return handle;
  }

  toggle() { this.active ? this.disable() : this.enable(); return this.active; }

  enable() {
    this.active = true;
    this.width = Math.min(1024, window.innerWidth - 40);
    this._apply();
    this.handleR.style.display = 'block';
    this.handleL.style.display = 'block';
    this.label.style.display = 'block';
    window.addEventListener('resize', this._reposition);
  }

  disable() {
    this.active = false;
    const html = document.documentElement;
    html.style.width = ''; html.style.margin = ''; html.style.transition = '';
    this.handleR.style.display = 'none';
    this.handleL.style.display = 'none';
    this.label.style.display = 'none';
    window.removeEventListener('resize', this._reposition);
  }

  _apply() {
    const html = document.documentElement;
    html.style.width = this.width + 'px';
    html.style.margin = '0 auto';
    this._reposition();
  }

  _reposition() {
    const rightEdge = (window.innerWidth + this.width) / 2;
    const leftEdge = (window.innerWidth - this.width) / 2;
    this.handleR.style.left = rightEdge - 6 + 'px';
    this.handleL.style.left = leftEdge - 6 + 'px';
    this.label.textContent = Math.round(this.width) + ' px';
  }

  _down(e) {
    e.preventDefault();
    this.dragging = true;
    document.addEventListener('mousemove', this._move, true);
    document.addEventListener('mouseup', this._up, true);
    document.documentElement.style.userSelect = 'none';
  }
  _move(e) {
    if (!this.dragging) return;
    // Distance from the cursor to the page centre, doubled, works for either edge.
    const w = 2 * Math.abs(e.clientX - window.innerWidth / 2);
    this.width = Math.max(320, Math.min(w, window.innerWidth));
    this._apply();
  }
  _up() {
    this.dragging = false;
    document.removeEventListener('mousemove', this._move, true);
    document.removeEventListener('mouseup', this._up, true);
    document.documentElement.style.userSelect = '';
  }

  destroy() { this.disable(); this.handleR.remove(); this.handleL.remove(); this.label.remove(); }
}
