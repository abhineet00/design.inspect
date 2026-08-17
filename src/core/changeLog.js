// Records every change made through the inspector — CSS edits and inline text
// edits — as a chronological log, and turns them into a plain-language AI prompt
// that any assistant can apply to the real codebase.

import { store } from './store.js';

/** Append a change, coalescing repeated edits to the same target+property. */
export function logChange(entry) {
  entry.time = Date.now();
  const log = store.get().changeLog;
  const last = log[log.length - 1];
  const sameCss = entry.type === 'css' && last && last.type === 'css' &&
    last.id === entry.id && last.prop === entry.prop && last.pseudo === entry.pseudo;
  const sameText = entry.type === 'text' && last && last.type === 'text' && last.id === entry.id;
  if (sameCss || sameText) {
    last.to = entry.to;
    last.time = entry.time;
  } else {
    log.push(entry);
  }
  store.set({ changeLog: log });
}

export function getLog() { return store.get().changeLog; }

export function clearLog() {
  const log = store.get().changeLog;
  log.length = 0;
  store.set({ changeLog: log });
}

/** Human-readable one-liner for a log entry (used in the panel list). */
export function describe(e) {
  if (e.type === 'text') return `text → "${trim(e.to, 34)}"`;
  if (e.type === 'move') return 'reordered among siblings';
  if (e.type === 'delete') return 'removed from the page';
  return `${e.prop}: ${e.to}`;
}

/**
 * A plain-language prompt describing the final desired state, grouped by
 * element with the last value kept per property. Copy-paste into any AI.
 */
export function generateAiPrompt(diff = false) {
  const log = getLog();
  if (!log.length) return '';

  const groups = new Map();
  for (const e of log) {
    const key = e.selector || e.label;
    if (!groups.has(key)) groups.set(key, { label: e.label, selector: e.selector, css: new Map(), text: null, moved: false, deleted: false });
    const g = groups.get(key);
    if (e.type === 'css') {
      const prop = e.pseudo && e.pseudo !== 'none' ? `${e.prop} (:${e.pseudo})` : e.prop;
      const cur = g.css.get(prop);
      g.css.set(prop, { from: cur ? cur.from : e.from, to: e.to }); // first from, last to
    } else if (e.type === 'text') g.text = { from: g.text ? g.text.from : e.from, to: e.to };
    else if (e.type === 'move') g.moved = true;
    else if (e.type === 'delete') g.deleted = true;
  }

  let out = 'Apply the following design changes to my web page, then return the updated HTML/CSS.\n\n';
  let i = 1;
  for (const g of groups.values()) {
    out += `${i}. Element \`${g.selector || g.label}\`:\n`;
    if (g.deleted) { out += '   - remove this element from the page\n'; i++; continue; }
    for (const [prop, v] of g.css) {
      out += diff
        ? `   - change ${prop} from ${v.from || 'default'} to ${v.to}\n`
        : `   - set ${prop} to ${v.to}\n`;
    }
    if (g.text != null) {
      out += diff
        ? `   - change its text from "${g.text.from}" to "${g.text.to}"\n`
        : `   - change its text to: "${g.text.to}"\n`;
    }
    if (g.moved) out += '   - reorder it among its siblings to match the new layout\n';
    i++;
  }
  out += '\nKeep everything else unchanged.';
  return out.trim();
}

function trim(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + '…' : s; }
