// Entry point. Boots the app into a Shadow-DOM host so nothing collides with
// the page, wires the store to the inspector/overlay/panel/dock, and exposes a
// tiny global API (window.InspectCSS).

import { store } from './core/store.js';
import { Overlay } from './core/overlay.js';
import { Inspector } from './core/inspector.js';
import { Panel } from './ui/panel.js';
import { Toolbar } from './ui/toolbar.js';
import { css } from './ui/theme.js';
import { undo, redo, setProp } from './core/liveStyles.js';

class App {
  constructor() {
    this.host = document.createElement('div');
    this.host.setAttribute('data-inspect-ui', '');
    this.host.style.cssText = 'all: initial; position: static;';
    const shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = css;
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    shadow.append(style, wrap);
    document.documentElement.appendChild(this.host);

    this.overlay = new Overlay(document.documentElement);
    this.panel = new Panel(wrap);
    this.toolbar = new Toolbar(wrap, {
      undo: () => { undo(); this.panel.render(); },
      redo: () => { redo(); this.panel.render(); },
      bump: (dir) => this.bumpZ(dir),
      toggleResponsive: () => this.toggleResponsive(),
    });
    this.inspector = new Inspector(this.overlay, (el) => this.select(el));

    this._prevView = store.get().view;
    this._prevCollapsed = store.get().collapsed;
    this.unsub = store.subscribe((s) => this.onState(s));
    store.set({ active: true });
    this.panel.render();
  }

  select(el) {
    store.set({ selectedEl: el, active: false });
    this.overlay.select(el);
    this.panel.set(el);
  }

  bumpZ(dir) {
    const el = store.get().selectedEl;
    if (!el) return;
    const z = parseInt(getComputedStyle(el).zIndex) || 0;
    setProp(el, 'position', getComputedStyle(el).position === 'static' ? 'relative' : getComputedStyle(el).position);
    setProp(el, 'z-index', String(z + dir));
    this.panel.render();
  }

  toggleResponsive() {
    this._resp = !this._resp;
    const w = document.documentElement;
    if (this._resp) { w.style.maxWidth = '420px'; w.style.margin = '0 auto'; w.style.transition = 'max-width .2s'; }
    else { w.style.maxWidth = ''; w.style.margin = ''; }
    const s = store.get();
    if (s.selectedEl) this.overlay.select(s.selectedEl);
  }

  onState(s) {
    if (s.active && !this._picking) { this._picking = true; this.inspector.start(); }
    else if (!s.active && this._picking) { this._picking = false; this.inspector.stop(); }
    if (s.selectedEl) this.overlay.select(s.selectedEl);
    // re-render the panel when the view or visibility changes
    if (s.view !== this._prevView || s.collapsed !== this._prevCollapsed) {
      this._prevView = s.view;
      this._prevCollapsed = s.collapsed;
      this.panel.render();
    }
  }

  destroy() {
    this.unsub?.();
    this.inspector.stop();
    this.overlay.destroy();
    this.host.remove();
    this.toggleResponsiveOff();
    const live = document.getElementById('inspect-css-live-styles');
    if (live) live.remove();
    delete window.InspectCSS;
  }
  toggleResponsiveOff() {
    document.documentElement.style.maxWidth = '';
    document.documentElement.style.margin = '';
  }
}

function boot() {
  if (window.InspectCSS) { window.InspectCSS.destroy(); return; }
  const app = new App();
  window.InspectCSS = { app, destroy: () => app.destroy(), version: '0.2.0' };
}

boot();
