// All panel + toolbar styles, injected once into the Shadow DOM.
// Sizes are the Figma design scaled down ~0.82 for a more compact panel
// (kept as real px so dropdown/tooltip positioning stays pixel-accurate).

import { fontFace } from './font.js';

export const css = /* css */ `
${fontFace}

:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.wrap {
  --panel-bg: rgba(0, 0, 0, 0.74);
  --field: rgba(35, 35, 35, 0.4);
  --field-2: #272727;
  --field-active: #505050;
  --box-margin: #1b1b1b;
  --box-content: #0b0b0b;
  --line: #505050;
  --divider: rgba(255, 255, 255, 0.07);
  --border-soft: #afafaf;
  --tool-border: rgba(255, 255, 255, 0.12);
  --tool-bg: rgba(0, 0, 0, 0.6);
  --tool-active: #353539;
  --text: #ffffff;
  --muted: rgba(255, 255, 255, 0.6);
  --blue: #58aeff;
  --orange: #ff8858;
  --font: 'Quicksand', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --r-field: 10px;
  --r-sm: 7px;
  --r-btn: 20px;
  --r-panel: 24px;

  font-family: var(--font);
  color: var(--text);
  font-size: 15px;
  font-weight: 500;
  line-height: normal;
  -webkit-font-smoothing: antialiased;
}

/* ---------- Panel ---------- */
.panel {
  position: fixed;
  top: 20px; right: 20px;
  width: 330px;
  max-height: calc(100vh - 40px);
  background: var(--panel-bg);
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
  border: none;
  border-radius: var(--r-panel);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.6);
  display: flex; flex-direction: column;
  overflow: hidden;
  z-index: 2147483646;
}
.panel.hidden { display: none; }
.panel.drag-hidden { opacity: 0; pointer-events: none; transition: opacity .12s; }
.panel.docked {
  top: 0; right: 0; bottom: 0; width: 330px; max-height: 100vh; height: 100vh;
  border-radius: 0; border-left: 1px solid var(--tool-border);
  box-shadow: -12px 0 40px rgba(0,0,0,0.5);
}
.panel.docked .head { cursor: default; }

.panel-body { padding: 0 14px 14px; overflow-y: auto; overflow-x: hidden; }
.panel-body::-webkit-scrollbar { width: 9px; }
.panel-body::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 9px; border: 3px solid transparent; background-clip: padding-box; }

/* ---------- Header ---------- */
.head { padding: 14px 14px 0; cursor: grab; }
.head:active { cursor: grabbing; }
.head-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 7px; }
.head-title { color: var(--blue); font-weight: 600; font-size: 16px; }
.head-actions { display: flex; gap: 7px; }
.hbtn {
  width: 17px; height: 17px; display: grid; place-items: center;
  background: transparent; border: none; border-radius: var(--r-sm);
  color: var(--text); cursor: pointer; opacity: .85; padding: 0;
}
.hbtn:hover { opacity: 1; }
.hbtn.danger { color: #e05151; opacity: 1; }
.hbtn.active { color: var(--blue); opacity: 1; }
.hbtn svg { width: 17px; height: 17px; }
.crumb { color: var(--orange); font-size: 15px; font-weight: 500; margin-top: 2px; display: flex; gap: 7px; flex-wrap: wrap; }
.dims { color: var(--muted); font-size: 16px; margin-top: 5px; display: flex; gap: 10px; align-items: baseline; }
.dims b { color: var(--text); font-weight: 500; }

/* ---------- Section ---------- */
.section { padding: 13px 0; border-top: 1px solid var(--divider); }
.section:first-child { border-top: none; }
.sec-head {
  display: flex; align-items: center; justify-content: space-between;
  font-weight: 500; font-size: 16px; color: var(--text);
  cursor: pointer; user-select: none; margin-bottom: 13px;
}
.sec-head .chev { width: 17px; height: 17px; color: var(--text); transition: transform .15s; display: grid; place-items: center; }
.section.closed .sec-head .chev { transform: rotate(-90deg); }
.section.closed .sec-content { display: none; }
.sec-content { display: flex; flex-direction: column; gap: 13px; }

.label { color: var(--muted); font-size: 12.5px; font-weight: 500; margin-bottom: 4px; display: block; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 7px; }
.rot-row { display: grid; grid-template-columns: 1fr 55px 55px; gap: 7px; }
.rot-row .iconrow { height: 100%; }
.rot-row .ibtn { border-radius: 10px; width: 100%; }
.stack { display: flex; flex-direction: column; min-width: 0; }
.row > *, .row-3 > *, .rot-row > *, .corner-grid > *, .corner-mix > * { min-width: 0; }

/* ---------- Field ---------- */
.field {
  display: flex; align-items: center; gap: 7px;
  background: var(--field); border: 1px solid transparent;
  border-radius: var(--r-field); padding: 7px; min-width: 0; height: 32px;
}
.field.sm { height: 28px; }
.field:focus-within { border-color: var(--blue); }
.field .fic { width: 14px; height: 14px; color: var(--text); flex: none; display: grid; place-items: center; }
.field .fic svg { width: 100%; height: 100%; }
.field .fk { color: var(--text); font-size: 15px; flex: none; width: 14px; text-align: center; }
.field input {
  flex: 1; min-width: 0; background: transparent; border: none; outline: none;
  color: var(--text); font-size: 15px; font-family: var(--font); font-weight: 500;
}
.field .unit { color: var(--muted); font-size: 15px; font-weight: 400; flex: none; }
.field.select-like { cursor: pointer; }
.field .chev-mini { width: 17px; height: 17px; color: var(--text); flex: none; pointer-events: none; display: grid; place-items: center; }

/* ---------- Icon button group (alignment, flips, text-align) ---------- */
.iconrow { display: flex; gap: 2px; }
.iconrow.grow > * { flex: 1; }
.ibtn {
  height: 27px; min-width: 27px; display: grid; place-items: center;
  background: var(--field); border: 1px solid transparent; border-radius: var(--r-field);
  color: var(--text); cursor: pointer; padding: 0 6px;
}
.ibtn:hover { background: var(--field-2); }
.ibtn.active { background: var(--field-active); }
.ibtn svg { width: 14px; height: 14px; }
.iconrow.seg .ibtn { border-radius: 7px; }
.iconrow.seg .ibtn:first-child { border-radius: 10px 7px 7px 10px; }
.iconrow.seg .ibtn:last-child { border-radius: 7px 10px 10px 7px; }

/* ---------- Spacing box (3 nested boxes) ---------- */
.sp-box {
  display: flex; flex-direction: column; align-items: center; gap: 7px;
  padding: 7px; position: relative; width: 100%;
}
.sp-margin  { background: var(--field);     border-radius: 20px; }
.sp-padding { background: var(--box-margin); border-radius: 14px; }
.sp-size {
  background: var(--box-content); border-radius: 10px; padding: 15px 8px;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  color: var(--text); font-size: 13px; position: relative; flex: 1 0 0; min-height: 50px;
}
.sp-mid { display: flex; align-items: center; gap: 7px; width: 100%; }
.sp-tag { position: absolute; top: 5px; left: 9px; font-size: 9px; color: var(--muted); font-weight: 500; z-index: 1; }
.sp-x { color: var(--muted); }
.sp-edge {
  width: 28px; text-align: center; background: transparent; border: none;
  color: var(--text); font-size: 13px; font-family: var(--font); outline: none; flex: none;
}
.sp-edge:focus { color: var(--blue); }

/* ---------- Size row (W · link · H) ---------- */
.size-row { display: flex; align-items: center; gap: 4px; }
.size-row .field { flex: 1; }
.link-toggle {
  width: 22px; height: 22px; flex: none; padding: 0; border: none; border-radius: 6px;
  background: transparent; color: var(--muted); cursor: pointer; display: grid; place-items: center;
}
.link-toggle:hover, .link-toggle.on { color: var(--text); }
.link-toggle svg { width: 16px; height: 16px; }

/* ---------- Corner / stroke expand grids (Appearance) ---------- */
.corner-mix { display: grid; grid-template-columns: 1fr 28px; gap: 4px; }
.corner-mix .field { border-radius: 10px 7px 7px 10px; }
.corner-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.corner-grid .field { background: var(--field-2); }
.exp-btn {
  height: 28px; min-width: 28px; display: grid; place-items: center; padding: 0;
  background: var(--field); border: none; border-radius: 7px 10px 10px 7px;
  color: var(--text); cursor: pointer;
}
.exp-btn:hover { background: var(--field-2); }
.exp-btn.on { background: #dbdbdb; color: #151515; }
.exp-btn svg { width: 14px; height: 14px; }

/* ---------- Fill / stroke ---------- */
.sub-head { display: flex; align-items: center; justify-content: space-between; height: 16px; }
.sub-label { color: var(--muted); font-size: 12.5px; font-weight: 500; }
.sub-add { width: 16px; height: 16px; display: grid; place-items: center; background: transparent; border: none; color: var(--text); cursor: pointer; padding: 0; }
.sub-add:hover { color: var(--blue); }
.sub-add.off { opacity: .35; cursor: default; }
.sub-add svg { width: 16px; height: 16px; }

.color-row { display: flex; align-items: stretch; gap: 4px; }
.cr-main {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px; height: 32px;
  background: var(--field); border: 1px solid transparent; border-radius: 12px 8px 8px 12px; padding: 7px;
}
.cr-main:focus-within, .cr-pct:focus-within { border-color: var(--blue); }
.cr-swatch { width: 16px; height: 16px; border-radius: 6px; border: 1px solid rgba(255,255,255,.18); position: relative; overflow: hidden; flex: none; cursor: pointer; }
.cr-swatch input[type=color] { position: absolute; inset: -4px; width: 140%; height: 140%; border: none; padding: 0; cursor: pointer; }
.cr-hex { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--text); font-size: 14px; font-weight: 500; font-family: var(--font); text-transform: uppercase; }
.cr-pct { display: flex; align-items: center; gap: 3px; height: 32px; background: var(--field); border: 1px solid transparent; border-radius: 8px; padding: 7px; flex: none; }
.cr-alpha { width: 26px; background: transparent; border: none; outline: none; color: var(--text); font-size: 14px; font-weight: 500; font-family: var(--font); text-align: right; }
.cr-unit { color: var(--muted); font-size: 14px; font-weight: 400; flex: none; }
.cr-del { width: 30px; flex: none; display: grid; place-items: center; background: var(--field); border: none; border-radius: 8px 12px 12px 8px; color: var(--text); cursor: pointer; }
.cr-del:hover { color: #e05151; }
.cr-del svg { width: 14px; height: 14px; }

/* legacy single colour line (kept for compatibility) */
.colorline { display: flex; align-items: center; gap: 7px; background: var(--field); border-radius: var(--r-field); padding: 7px; height: 32px; }
.swatch { width: 18px; height: 18px; border-radius: 5px; border: 1px solid rgba(255,255,255,.18); position: relative; overflow: hidden; flex: none; cursor: pointer; }
.swatch input[type=color] { position: absolute; inset: -4px; width: 140%; height: 140%; border: none; padding: 0; cursor: pointer; }
.colorline .hex { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--text); font-size: 15px; font-family: var(--font); text-transform: uppercase; }
.colorline .pct { color: var(--muted); font-size: 15px; }

/* ---------- Code / views ---------- */
.code { margin: 0; padding: 12px; background: var(--box-content); border-radius: var(--r-field);
  color: #d4d8e2; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
  line-height: 1.6; white-space: pre; overflow: auto; max-height: 60vh; }
.code .sel { color: var(--blue); } .code .prop { color: var(--orange); } .code .val { color: #ffd479; }
.view-actions { display: flex; gap: 7px; margin: 14px 0; }
.btn { padding: 8px 12px; border-radius: var(--r-field); border: none; background: var(--field); color: var(--text); font-family: var(--font); font-weight: 500; font-size: 13px; cursor: pointer; }
.btn:hover { background: var(--field-2); }
.btn.primary { background: var(--blue); color: #001427; }
.empty { color: var(--muted); text-align: center; padding: 28px 14px; font-size: 13px; }

/* ---------- Assets view ---------- */
.asset-count {
  margin-left: 7px; font-size: 12px; font-weight: 500; color: var(--muted);
  background: var(--field); border-radius: 20px; padding: 1px 7px;
}
.asset-colors { display: grid; grid-template-columns: repeat(8, 1fr); gap: 7px; }
.asset-swatch {
  aspect-ratio: 1; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12);
  cursor: pointer; padding: 0; transition: transform .1s; background-clip: padding-box;
}
.asset-swatch:hover { transform: scale(1.08); border-color: var(--blue); }
.asset-type-list { display: flex; flex-direction: column; gap: 7px; }
.asset-type {
  display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
  background: var(--field); border: 1px solid transparent; border-radius: var(--r-field);
  padding: 7px 10px; cursor: pointer; color: var(--text); font-family: var(--font);
}
.asset-type:hover { border-color: var(--blue); }
.asset-type-preview { width: 34px; flex: none; text-align: center; color: var(--text); overflow: hidden; line-height: 1; }
.asset-type-meta { min-width: 0; }
.asset-type-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.asset-type-sub { font-size: 11px; color: var(--muted); }
.asset-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
.asset-thumb {
  aspect-ratio: 1; border-radius: 8px; background: var(--field);
  border: 1px solid rgba(255,255,255,0.08); display: grid; place-items: center;
  cursor: pointer; overflow: hidden; padding: 7px;
}
.asset-thumb:hover { border-color: var(--blue); }
.asset-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
.asset-svg svg { width: 100%; height: 100%; max-width: 34px; max-height: 34px; color: var(--text); }

/* ---------- Vertical toolbar dock ---------- */
.dock { position: fixed; top: 50%; left: 16px; transform: translateY(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 10px; z-index: 2147483646;
  filter: drop-shadow(4px 3px 5px rgba(0,0,0,.2)); }
.dock-circle {
  width: 44px; height: 44px; border-radius: 999px; display: grid; place-items: center;
  background: var(--tool-bg); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  border: 1px solid var(--tool-border); color: var(--text); cursor: pointer;
}
.dock-circle:hover { background: var(--tool-active); }
.dock-group {
  display: flex; flex-direction: column; align-items: center;
  background: var(--tool-bg); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  border: 1px solid var(--tool-border); border-radius: 22px; padding: 4px; gap: 0;
}
.dock-btn {
  width: 44px; height: 44px; display: grid; place-items: center; border-radius: 18px;
  background: transparent; border: none; color: var(--text); cursor: pointer;
}
.dock-btn:hover { background: rgba(255,255,255,0.06); }
.dock-btn.active { background: var(--tool-active); }
.dock-btn svg, .dock-circle svg { width: 20px; height: 20px; }
.dock-sep { width: 24px; height: 1px; background: var(--line); margin: 1px 0; }

/* ---------- DOM tree (HTML view) ---------- */
.domtree {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.55;
  padding: 8px 0 12px; overflow-x: auto;
}
.tree-row { display: flex; align-items: flex-start; gap: 4px; padding-right: 8px; cursor: pointer;
  white-space: nowrap; border-radius: 6px; }
.tree-row:hover { background: rgba(255,255,255,0.05); }
.tree-row.selected { background: rgba(88,174,255,0.16); }
.tree-tw { width: 12px; flex: none; display: grid; place-items: center; color: var(--muted); margin-top: 4px; }
.tree-tw.leaf { visibility: hidden; }
.tree-tag { min-width: 0; }
.t-br { color: #6b7280; }
.t-tag { color: #58aeff; }
.t-attr { color: #ff8858; }
.t-val { color: #9ece6a; }
.t-ell { color: var(--muted); padding: 0 2px; }
.tree-close .tree-tag { opacity: .8; }
.tree-footer { position: sticky; bottom: 0; display: flex; gap: 7px; padding: 12px 0 2px;
  background: linear-gradient(to top, var(--panel-bg) 70%, transparent); }
.tree-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px;
  padding: 9px 11px; border-radius: 999px; border: 1px solid var(--tool-border);
  background: var(--field); color: var(--text); font-family: var(--font); font-weight: 500;
  font-size: 13px; cursor: pointer; }
.tree-btn:hover { background: var(--field-2); }
.tree-btn svg { display: block; }

/* ---------- Change log ---------- */
.log-list { display: flex; flex-direction: column; gap: 6px; }
.log-item {
  display: flex; align-items: baseline; gap: 9px;
  background: var(--field); border-radius: 9px; padding: 7px 9px;
}
.log-el { color: var(--blue); font-size: 12px; font-weight: 600; flex: none; max-width: 45%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-desc { color: var(--text); font-size: 12px; font-family: ui-monospace, Menlo, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-row { display: flex; align-items: center; justify-content: space-between; gap: 9px; margin-bottom: 8px; }
.ai-hint { color: var(--muted); font-size: 12px; }
.ai-prompt { white-space: pre-wrap; color: #cdd3e0; font-size: 11.5px; }
.seg-toggle { display: inline-flex; background: var(--field); border-radius: 7px; padding: 2px; flex: none; }
.seg-btn { background: none; border: none; color: var(--muted); font-family: var(--font); font-weight: 500;
  font-size: 12px; padding: 4px 10px; border-radius: 6px; cursor: pointer; }
.seg-btn.on { background: var(--field-active); color: var(--text); }

/* ---------- Custom dropdown ---------- */
.field.select-like.open { border-color: var(--blue); }
.sel-value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--text); font-size: 15px; font-weight: 500; }
.dropdown-menu {
  position: fixed; z-index: 2147483647;
  background: #1b1b1b; border: 1px solid var(--tool-border); border-radius: 10px;
  padding: 5px; max-height: 280px; overflow-y: auto;
  box-shadow: 0 14px 44px rgba(0,0,0,.6);
  font-family: var(--font); color: var(--text);
}
.dropdown-menu::-webkit-scrollbar { width: 8px; }
.dropdown-menu::-webkit-scrollbar-thumb { background: var(--field-2); border-radius: 8px; }
.dropdown-item {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 7px 9px; border-radius: 7px; cursor: pointer; white-space: nowrap;
  font-size: 14px; font-weight: 500;
}
.dropdown-item:hover { background: var(--field-2); }
.dropdown-item.active { color: var(--blue); }
.dropdown-check { width: 14px; height: 14px; display: grid; place-items: center; flex: none; }

/* ---------- Custom tooltip ---------- */
.tooltip {
  position: fixed; z-index: 2147483647; pointer-events: none;
  background: #1b1b1b; color: var(--text);
  border: 1px solid var(--tool-border);
  font-family: var(--font); font-size: 12px; font-weight: 500;
  padding: 5px 9px; border-radius: 8px; white-space: nowrap;
  box-shadow: 0 6px 20px rgba(0,0,0,.45);
  opacity: 0; transform: translateY(2px); transition: opacity .1s, transform .1s;
}
.tooltip.show { opacity: 1; transform: translateY(0); }

/* toast */
.toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
  background: var(--blue); color: #001427; padding: 9px 16px; border-radius: 10px;
  font-family: var(--font); font-weight: 600; font-size: 14px; z-index: 2147483647;
  box-shadow: 0 8px 24px rgba(0,0,0,.4); }
`;
