// The vertical dock (left of screen), matching the Figma design: a pause
// circle on top, a grouped pill of actions in the middle, and a close circle.
// The component / file-diff / html-file icons switch the panel view.

import { store } from '../core/store.js';
import { h } from '../core/util.js';
import { icon } from '../icons/index.js';
import { clearAll } from '../core/liveStyles.js';

export class Toolbar {
  constructor(root, api) {
    this.api = api;
    this.el = h('div', { class: 'dock', 'data-inspect-ui': '' });
    root.appendChild(this.el);
    this.render();
    store.subscribe(() => this.sync());
  }

  render() {
    this.el.innerHTML = '';

    // top: pause / resume picking
    this.pauseBtn = circle('pause', 'Pause / resume picking', () =>
      store.set({ active: !store.get().active }));

    // grouped pill
    const group = h('div', { class: 'dock-group' }, [
      dockBtn('undo-03', 'Undo', () => this.api.undo?.()),
      dockBtn('redo-01', 'Redo', () => this.api.redo?.()),
      sep(),
      dockBtn('layer-send-backward', 'Select parent element', () => this.api.selectParent?.()),
      dockBtn('layer-bring-forward', 'Select child element', () => this.api.selectChild?.()),
      sep(),
      this.assetsBtn = dockBtn('component', 'Assets (page colors, type, SVGs, images)', () => {
        const v = store.get().view;
        store.set({ view: v === 'assets' ? 'design' : 'assets', collapsed: false });
      }),
      this.codeBtn = dockBtn('file-diff', 'Changes & AI prompt', () => store.set({ view: 'changes', collapsed: false })),
      this.htmlBtn = dockBtn('html-file-01', 'HTML', () => store.set({ view: 'html', collapsed: false })),
      sep(),
      dockBtn('laptop-phone-sync', 'Toggle responsive preview', () => this.api.toggleResponsive?.()),
    ]);

    // bottom: close
    const close = circle('cancel-01', 'Exit InspectCSS', () => window.InspectCSS?.destroy());

    this.el.append(this.pauseBtn, group, close);
    this.sync();
  }

  sync() {
    const s = store.get();
    this.pauseBtn?.classList.toggle('active', s.active);
    this.assetsBtn?.classList.toggle('active', s.view === 'assets');
    this.codeBtn?.classList.toggle('active', s.view === 'changes');
    this.htmlBtn?.classList.toggle('active', s.view === 'html');
  }
}

function circle(name, title, onClick) {
  return h('button', { class: 'dock-circle', title, onclick: onClick, html: icon(name) });
}
function dockBtn(name, title, onClick) {
  return h('button', { class: 'dock-btn', title, onclick: onClick, html: icon(name) });
}
function sep() {
  return h('div', { class: 'dock-sep' });
}
