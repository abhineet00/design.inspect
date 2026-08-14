// The bottom dock: brand + tool buttons (pick, panel toggle, clear, close).

import { store } from '../core/store.js';
import { h } from '../core/util.js';
import { clearAll } from '../core/liveStyles.js';

export class Toolbar {
  constructor(root) {
    this.el = h('div', { class: 'dock', 'data-inspect-ui': '' });
    root.appendChild(this.el);
    this.render();
    store.subscribe(() => this.sync());
  }

  render() {
    this.el.innerHTML = '';
    this.pick = tool('pick', 'Pick element (Esc to stop)', () =>
      store.set({ active: !store.get().active }));
    this.el.append(
      h('div', { class: 'brand' }, [h('span', { class: 'logo' }), 'InspectCSS']),
      h('div', { class: 'sep' }),
      this.pick,
      tool('panel', 'Show / hide panel', () =>
        store.set({ collapsed: !store.get().collapsed })),
      tool('clear', 'Reset all edits', () => clearAll()),
      h('div', { class: 'sep' }),
      tool('close', 'Exit InspectCSS', () => window.InspectCSS?.destroy())
    );
    this.sync();
  }

  sync() {
    if (this.pick) this.pick.classList.toggle('on', store.get().active);
  }
}

function tool(kind, title, onClick) {
  return h('button', { class: 'tool', title, onclick: onClick, html: ICONS[kind] });
}

const ICONS = {
  pick: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.5 18 2.5-7.5L20.5 11z"/></svg>',
  panel: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/></svg>',
  clear: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-9 0v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6"/></svg>',
  close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/></svg>',
};
