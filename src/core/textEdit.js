// Double-click any text element on the page to edit its text inline. While
// editing, the inspector yields (via store.editing) so the caret behaves
// normally; committing on blur / Enter / Escape restores picking.

import { store } from './store.js';
import { isOwnUI, ensureInspectId, elementLabel } from './util.js';
import { cssPath } from './selector.js';
import { logChange } from './changeLog.js';

export class TextEditor {
  constructor(onChange) {
    this.onChange = onChange; // called after an edit commits (for panel refresh)
    this._onDblClick = this._onDblClick.bind(this);
    this._onKey = this._onKey.bind(this);
  }

  start() { document.addEventListener('dblclick', this._onDblClick, true); }
  stop() {
    document.removeEventListener('dblclick', this._onDblClick, true);
    this._finish();
  }

  _editable(el) {
    if (!el || el.nodeType !== 1 || isOwnUI(el)) return null;
    // Prefer the nearest element that directly holds text.
    let node = el;
    while (node && node !== document.body) {
      const holdsText = [...node.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const noBlockKids = ![...node.children].some((c) => {
        const d = getComputedStyle(c).display;
        return d === 'block' || d === 'flex' || d === 'grid';
      });
      if (holdsText && noBlockKids) return node;
      node = node.parentElement;
    }
    return el.matches('h1,h2,h3,h4,h5,h6,p,span,a,button,li,td,th,label,strong,em,small,div') ? el : null;
  }

  _onDblClick(e) {
    if (isOwnUI(e.target)) return;
    const el = this._editable(e.target);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    store.set({ editing: true, selectedEl: el });

    this.el = el;
    this._origText = el.textContent;
    ensureInspectId(el);
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('data-inspect-editing', '');
    el.focus();

    // Place the caret where the user double-clicked, else select all.
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    const sel = window.getSelection();
    sel.removeAllRanges();
    if (range) sel.addRange(range);
    else document.execCommand?.('selectAll', false, null);

    el.addEventListener('blur', () => this._finish(), { once: true });
    document.addEventListener('keydown', this._onKey, true);
  }

  _onKey(e) {
    if (!this.el) return;
    if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey && this.el.tagName !== 'DIV')) {
      e.preventDefault();
      this.el.blur();
    }
  }

  _finish() {
    document.removeEventListener('keydown', this._onKey, true);
    if (this.el) {
      const el = this.el;
      el.removeAttribute('contenteditable');
      el.removeAttribute('data-inspect-editing');
      const now = el.textContent;
      if (now !== this._origText) {
        logChange({
          type: 'text', id: el.getAttribute('data-inspect-id'),
          from: this._origText, to: now, label: elementLabel(el), selector: cssPath(el),
        });
      }
      this.el = null;
    }
    if (store.get().editing) store.set({ editing: false });
    this.onChange?.();
  }
}
