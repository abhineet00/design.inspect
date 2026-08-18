// Entry point. Boots the app into a Shadow-DOM host so nothing collides with
// the page, wires the store to the inspector/overlay/panel/dock, and exposes a
// tiny global API (window.InspectCSS).

import { store } from './core/store.js';
import { Overlay } from './core/overlay.js';
import { Inspector } from './core/inspector.js';
import { Panel } from './ui/panel.js';
import { Toolbar } from './ui/toolbar.js';
import { Tooltip } from './ui/tooltip.js';
import { TextEditor } from './core/textEdit.js';
import { DragMove } from './core/dragMove.js';
import { Responsive } from './core/responsive.js';
import { css } from './ui/theme.js';
import { fontFace } from './ui/font.js';
import { undo, redo } from './core/history.js';

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

    // Register Quicksand at the document level too, so light-DOM UI (the hover
    // badge / drop indicator) renders in the design font.
    this.fontStyle = document.createElement('style');
    this.fontStyle.setAttribute('data-inspect-ui', '');
    this.fontStyle.textContent = fontFace;
    document.head.appendChild(this.fontStyle);

    this.overlay = new Overlay(document.documentElement);
    this.panel = new Panel(wrap, {
      hover: (el) => { store.set({ hoverEl: el }); this.overlay.highlight(el); },
      unhover: () => { store.set({ hoverEl: null }); this.overlay.hideHover(); },
      pick: (el) => this.select(el),
    });
    this.tooltip = new Tooltip(wrap);
    this.toolbar = new Toolbar(wrap, {
      undo: () => { undo(); this._afterHistory(); },
      redo: () => { redo(); this._afterHistory(); },
      selectParent: () => this.selectRelative('parent'),
      selectChild: () => this.selectRelative('child'),
      toggleResponsive: () => this.toggleResponsive(),
    });
    this.inspector = new Inspector(this.overlay, (el) => this.select(el));
    this.textEditor = new TextEditor(() => this.panel.render());
    this.dragMove = new DragMove((el) => { if (el) { this.overlay.select(el); this.panel.render(); } });
    this.responsive = new Responsive();
    this.textEditor.start();
    this.dragMove.start();

    this._prevView = store.get().view;
    this._prevCollapsed = store.get().collapsed;
    this._prevDocked = store.get().docked;
    this.unsub = store.subscribe((s) => this.onState(s));

    // Keep the hover/selection overlays glued to their elements while the page
    // scrolls or resizes — always on, independent of picking mode.
    this._track = () => {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        const s = store.get();
        if (s.hoverEl) this.overlay.highlight(s.hoverEl);
        if (s.selectedEl) this.overlay.select(s.selectedEl);
      });
    };
    window.addEventListener('scroll', this._track, true);
    window.addEventListener('resize', this._track, true);
    this._keyHandler = (e) => this._onKey(e);
    window.addEventListener('keydown', this._keyHandler, true);

    store.set({ active: true });
    this.panel.render();
  }

  select(el) {
    // Stay in picking mode after a selection: hovering keeps showing guides and
    // you can click another element at any time. The pause button stops picking.
    // Selecting always shows that element's properties and reopens the panel.
    store.set({ selectedEl: el, collapsed: false, view: 'design' });
    this.overlay.select(el);
    this.panel.set(el);
  }

  // After an undo/redo: keep overlay + panel in sync with the restored state.
  _afterHistory() {
    const s = store.get();
    if (s.selectedEl && document.contains(s.selectedEl)) this.overlay.select(s.selectedEl);
    else { this.overlay.hideSelected(); store.set({ selectedEl: null }); }
    this.panel.render();
  }

  _onKey(e) {
    if (store.get().editing) return; // let contentEditable handle its own undo
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) { redo(); } else { undo(); }
      this._afterHistory();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault(); redo(); this._afterHistory();
    }
  }

  // Navigate the DOM: select the parent, or the first element child.
  selectRelative(dir) {
    const el = store.get().selectedEl;
    if (!el) return;
    let next = null;
    if (dir === 'parent') {
      // Walk all the way up to <body> / <html> (skip our own UI host).
      next = el.parentElement;
      while (next && next.closest && next.closest('[data-inspect-ui]')) next = next.parentElement;
      if (!next) return;
    } else {
      next = [...el.children].find((c) => !c.closest('[data-inspect-ui]'));
      if (!next) return;
    }
    store.set({ view: 'design', collapsed: false });
    this.select(next);
  }

  toggleResponsive() {
    const on = this.responsive.toggle();
    store.set({ responsive: on });
    const s = store.get();
    if (s.selectedEl) this.overlay.select(s.selectedEl);
  }

  onState(s) {
    if (s.active && !this._picking) { this._picking = true; this.inspector.start(); }
    else if (!s.active && this._picking) { this._picking = false; this.inspector.stop(); }
    if (s.selectedEl && document.contains(s.selectedEl)) this.overlay.select(s.selectedEl);
    else this.overlay.hideSelected();
    // hide the panel while dragging so the drop target is unobstructed
    this.panel.el.classList.toggle('drag-hidden', !!s.dragging);
    // dock / undock the panel to the side (pushes page content over)
    if (s.docked !== this._prevDocked) {
      this._prevDocked = s.docked;
      this.panel.el.classList.toggle('docked', s.docked);
      document.documentElement.style.transition = 'margin-right .2s ease';
      const w = Math.round(this.panel.el.getBoundingClientRect().width) || 340;
      document.documentElement.style.marginRight = s.docked ? w + 'px' : '';
      this.panel.render();
    }
    // re-render the panel when the view or visibility changes
    if (s.view !== this._prevView || s.collapsed !== this._prevCollapsed) {
      // fresh scan each time the Assets view opens
      if (s.view === 'assets' && this._prevView !== 'assets') this.panel._assetCache = null;
      this._prevView = s.view;
      this._prevCollapsed = s.collapsed;
      this.panel.render();
    }
  }

  destroy() {
    this.unsub?.();
    window.removeEventListener('scroll', this._track, true);
    window.removeEventListener('resize', this._track, true);
    window.removeEventListener('keydown', this._keyHandler, true);
    this.textEditor.stop();
    this.dragMove.stop();
    this.responsive.destroy();
    this.inspector.stop();
    this.overlay.destroy();
    this.host.remove();
    this.fontStyle?.remove();
    this.toggleResponsiveOff();
    const live = document.getElementById('inspect-css-live-styles');
    if (live) live.remove();
    delete window.InspectCSS;
  }
  toggleResponsiveOff() {
    document.documentElement.style.maxWidth = '';
    document.documentElement.style.margin = '';
    document.documentElement.style.marginRight = '';
  }
}

function boot() {
  if (window.InspectCSS) { window.InspectCSS.destroy(); return; }
  const app = new App();
  window.InspectCSS = { app, destroy: () => app.destroy(), version: '0.14.0' };
}

boot();
