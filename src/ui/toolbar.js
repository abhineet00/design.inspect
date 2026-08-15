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
      dockBtn('layer-bring-forward', 'Bring forward', () => this.api.bump?.(1)),
      dockBtn('layer-send-backward', 'Send backward', () => this.api.bump?.(-1)),
      sep(),
      this.designBtn = dockBtn('component', 'Design', () => store.set({ view: 'design', collapsed: false })),
      this.codeBtn = dockBtn('file-diff', 'Generated CSS', () => store.set({ view: 'code', collapsed: false })),
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
    this.designBtn?.classList.toggle('active', s.view === 'design');
    this.codeBtn?.classList.toggle('active', s.view === 'code');
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
