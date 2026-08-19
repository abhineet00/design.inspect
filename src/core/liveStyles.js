// Applies tracked edits to the live page via a single injected stylesheet,
// and records them so we can regenerate copyable CSS.

import { store } from './store.js';
import { ensureInspectId, inspectIdSelector, elementLabel } from './util.js';
import { cssPath } from './selector.js';
import { logChange } from './changeLog.js';
import { record } from './history.js';
import { googleImportsFor } from './fonts.js';

const STYLE_ID = 'inspect-css-live-styles';

function styleEl() {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    el.setAttribute('data-inspect-ui', '');
    document.head.appendChild(el);
  }
  return el;
}

// ---- edits-map snapshots (used to make CSS edits undoable) ----
function snapshot() {
  const { edits } = store.get();
  return [...edits.entries()].map(([k, e]) => [k, {
    inspectId: e.inspectId, pseudo: e.pseudo, selector: e.selector,
    props: [...e.props.entries()],
  }]);
}
function applySnapshot(snap) {
  const map = new Map();
  for (const [k, e] of snap) {
    map.set(k, { inspectId: e.inspectId, pseudo: e.pseudo, selector: e.selector, props: new Map(e.props) });
  }
  store.get().edits = map;
  render();
  store.set({ edits: map });
}

/** Record + apply one property edit on an element. */
export function setProp(el, prop, value) {
  const before = snapshot();
  const id = ensureInspectId(el);
  const { edits, pseudo } = store.get();
  const key = pseudo === 'none' ? id : `${id}::${pseudo}`;
  // Capture the pre-edit value (for the change log) before applying.
  const from = (edits.get(key)?.props.get(prop)) ?? getComputedStyle(el).getPropertyValue(prop).trim();
  let entry = edits.get(key);
  if (!entry) {
    entry = {
      inspectId: id,
      pseudo,
      selector: cssPath(el),
      props: new Map(),
    };
    edits.set(key, entry);
  }
  if (value === '' || value == null) entry.props.delete(prop);
  else entry.props.set(prop, value);
  if (entry.props.size === 0) edits.delete(key);
  render();
  store.set({ edits });
  if (value !== '' && value != null) {
    logChange({ type: 'css', id, prop, from, to: value, pseudo, label: elementLabel(el), selector: entry.selector });
  }
  const after = snapshot();
  record({ undo: () => applySnapshot(before), redo: () => applySnapshot(after) });
}

export function getEditedProps(el, pseudo = 'none') {
  const id = el.getAttribute('data-inspect-id');
  if (!id) return new Map();
  const key = pseudo === 'none' ? id : `${id}::${pseudo}`;
  const entry = store.get().edits.get(key);
  return entry ? entry.props : new Map();
}

/** Rebuild the injected stylesheet from all tracked edits. */
export function render() {
  const { edits } = store.get();
  const rules = [];
  for (const entry of edits.values()) {
    if (entry.props.size === 0) continue;
    const sel = inspectIdSelector(entry.inspectId) + (entry.pseudo !== 'none' ? ':' + entry.pseudo : '');
    const body = [...entry.props.entries()]
      .map(([p, v]) => `  ${p}: ${v} !important;`)
      .join('\n');
    rules.push(`${sel} {\n${body}\n}`);
  }
  styleEl().textContent = rules.join('\n\n');
}

/** Human-readable CSS using nice selectors (no !important, real selectors). */
export function generateCss() {
  const { edits } = store.get();
  const out = [];
  for (const entry of edits.values()) {
    if (entry.props.size === 0) continue;
    const sel = (entry.selector || inspectIdSelector(entry.inspectId)) +
      (entry.pseudo !== 'none' ? ':' + entry.pseudo : '');
    const body = [...entry.props.entries()]
      .map(([p, v]) => `  ${p}: ${v};`)
      .join('\n');
    out.push(`${sel} {\n${body}\n}`);
  }
  const css = out.join('\n\n');
  // Prepend @import lines for any Google font used, so the copied CSS is
  // self-contained when pasted into another project.
  const imports = googleImportsFor(css);
  return imports.length ? imports.join('\n') + '\n\n' + css : css;
}

export function clearAll() {
  store.get().edits.clear();
  render();
  store.set({ edits: store.get().edits });
}
