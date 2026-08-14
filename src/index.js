// Entry point. Boots the app into a Shadow-DOM host so nothing collides with
// the page, wires the store to the inspector/overlay/panel/toolbar, and
// exposes a tiny global API (window.InspectCSS).

import { store } from './core/store.js';
import { Overlay } from './core/overlay.js';
import { Inspector } from './core/inspector.js';
import { Panel } from './ui/panel.js';
import { Toolbar } from './ui/toolbar.js';
import { css } from './ui/theme.js';

class App {
  constructor() {
    // Shadow host isolates our UI styles from the page.
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

    // Overlay must live in the light DOM so fixed positioning tracks the page.
    this.overlay = new Overlay(document.documentElement);
    this.panel = new Panel(wrap);
    this.toolbar = new Toolbar(wrap);
    this.inspector = new Inspector(this.overlay, (el) => this.select(el));

    this.unsub = store.subscribe((s) => this.onState(s));
    store.set({ active: true }); // start in pick mode
    this.panel.render();
  }

  select(el) {
    store.set({ selectedEl: el, active: false });
    this.overlay.select(el);
    this.panel.set(el);
  }

  onState(s) {
    // toggle picking
    if (s.active && !this._picking) { this._picking = true; this.inspector.start(); }
    else if (!s.active && this._picking) { this._picking = false; this.inspector.stop(); }
    // keep selection outline synced; re-render panel on tab/pseudo/collapse change
    if (s.selectedEl) this.overlay.select(s.selectedEl);
  }

  destroy() {
    this.unsub?.();
    this.inspector.stop();
    this.overlay.destroy();
    this.host.remove();
    const live = document.getElementById('inspect-css-live-styles');
    if (live) live.remove();
    delete window.InspectCSS;
  }
}

function boot() {
  if (window.InspectCSS) { window.InspectCSS.destroy(); return; }
  const app = new App();
  window.InspectCSS = {
    app,
    destroy: () => app.destroy(),
    version: '0.1.0',
  };
}

boot();
