// A generic undo/redo stack. Each recorded action carries its own undo() and
// redo() closures, so CSS edits, text edits, reorders and deletions all share
// one history and one Ctrl/Cmd+Z.

const past = [];
const future = [];
const MAX = 200;

/** Record an already-performed action. { undo, redo, label? } */
export function record(action) {
  past.push(action);
  if (past.length > MAX) past.shift();
  future.length = 0;
}

export function undo() {
  const a = past.pop();
  if (!a) return null;
  a.undo();
  future.push(a);
  return a;
}

export function redo() {
  const a = future.pop();
  if (!a) return null;
  a.redo();
  past.push(a);
  return a;
}

export function canUndo() { return past.length > 0; }
export function canRedo() { return future.length > 0; }
export function clearHistory() { past.length = 0; future.length = 0; }
