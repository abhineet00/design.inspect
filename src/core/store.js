// Tiny reactive store. Subscribers get notified on any change.

const state = {
  active: false,          // inspector picking mode on/off
  hoverEl: null,          // element under cursor while picking
  selectedEl: null,       // currently selected element
  pseudo: 'none',         // none | hover | focus | active
  view: 'design',         // design | code | html (driven by the dock)
  // Map<inspectId, { selector, pseudo, props: Map<prop,value> }>
  edits: new Map(),
  panelPos: { x: null, y: 16 }, // panel screen position (null x = right-docked)
  collapsed: false,
  editing: false,               // inline text editing in progress
  dragging: false,              // drag-to-reorder in progress
};

const subs = new Set();

export const store = {
  get: () => state,
  set(patch) {
    Object.assign(state, patch);
    subs.forEach((fn) => fn(state));
  },
  subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};
