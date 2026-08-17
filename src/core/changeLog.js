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
  if (e.type === 'text') return `text → "${trim(e.to, 40)}"`;
  return `${e.prop}: ${e.to}`;
}

/**
 * A plain-language prompt describing the final desired state, grouped by
 * element with the last value kept per property. Copy-paste into any AI.
 */
export function generateAiPrompt() {
  const log = getLog();
  if (!log.length) return '';

  const groups = new Map();
  for (const e of log) {
    const key = e.selector || e.label;
    if (!groups.has(key)) groups.set(key, { label: e.label, selector: e.selector, css: new Map(), text: null });
    const g = groups.get(key);
    if (e.type === 'css') g.css.set(e.pseudo && e.pseudo !== 'none' ? `${e.prop} (:${e.pseudo})` : e.prop, e.to);
    else g.text = e.to;
  }

  let out = 'Apply the following design changes to my web page, then return the updated HTML/CSS.\n\n';
  let i = 1;
  for (const g of groups.values()) {
    out += `${i}. Element \`${g.selector || g.label}\`:\n`;
    for (const [prop, val] of g.css) out += `   - set ${prop} to ${val}\n`;
    if (g.text != null) out += `   - change its text to: "${g.text}"\n`;
    i++;
  }
  out += '\nKeep everything else unchanged.';
  return out.trim();
}

function trim(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + '…' : s; }
