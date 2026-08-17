// Custom tooltips for our own UI, styled in the design language. Replaces the
// browser's native title tooltips (which can't be styled) for every [title]
// element inside the panel and dock.

import { h } from '../core/util.js';

export class Tooltip {
  constructor(root) {
    this.root = root; // the .wrap inside the shadow root
    this.el = h('div', { class: 'tooltip', 'data-inspect-ui': '' });
    root.appendChild(this.el);
    root.addEventListener('pointerover', (e) => this._over(e), true);
    root.addEventListener('pointerout', (e) => this._out(e), true);
    root.addEventListener('pointerdown', () => this.hide(), true);
    // Also cover our light-DOM UI (e.g. the drag handle) so its tooltip matches.
    document.addEventListener('pointerover', (e) => this._over(e, true), true);
    document.addEventListener('pointerout', (e) => this._out(e), true);
    document.addEventListener('pointerdown', () => this.hide(), true);
  }

  _over(e, lightDom = false) {
    const t = e.target.closest && e.target.closest('[title],[data-tip]');
    if (!t) return;
    // In light DOM, only act on our own UI elements.
    if (lightDom && !t.hasAttribute('data-inspect-ui')) return;
    if (!lightDom && !this.root.contains(t)) return;
    // Move the native title out of the way so the browser tooltip never appears.
    if (t.hasAttribute('title')) {
      const v = t.getAttribute('title');
      if (v) t.setAttribute('data-tip', v);
      t.removeAttribute('title');
    }
    const text = t.getAttribute('data-tip');
    if (text) this.show(text, t);
  }

  _out(e) {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t && !t.contains(e.relatedTarget)) this.hide();
  }

  show(text, target) {
    this.el.textContent = text;
    this.el.classList.add('show');
    const r = target.getBoundingClientRect();
    const tr = this.el.getBoundingClientRect();
    let top = r.top - tr.height - 8;
    let left = r.left + r.width / 2 - tr.width / 2;
    if (top < 6) top = r.bottom + 8;                    // flip below if no room above
    left = Math.max(6, Math.min(left, window.innerWidth - tr.width - 6));
    this.el.style.left = Math.round(left) + 'px';
    this.el.style.top = Math.round(top) + 'px';
  }

  hide() { this.el.classList.remove('show'); }
}
