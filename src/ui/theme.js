// All panel + toolbar styles, injected once into the Shadow DOM.
// Colors, radii, spacing and typography are taken 1:1 from the Figma design
// ("full - final (@20px base size)").

import { fontFace } from './font.js';

export const css = /* css */ `
${fontFace}

:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.wrap {
  /* --- exact tokens from the Figma design --- */
  --panel-bg: rgba(0, 0, 0, 0.74);
  --field: rgba(35, 35, 35, 0.4);
  --field-2: #272727;
  --field-active: #505050;
  --box-margin: #1b1b1b;
  --box-content: #0b0b0b;
  --line: #505050;
  --border-soft: #afafaf;
  --tool-bg: rgba(0, 0, 0, 0.6);
  --tool-active: #353539;
  --text: #ffffff;
  --muted: rgba(255, 255, 255, 0.6);
  --blue: #58aeff;
  --orange: #ff8858;
  --font: 'Quicksand', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --r-field: 12px;
  --r-sm: 8px;
  --r-btn: 24px;
  --r-panel: 28px;

  font-family: var(--font);
  color: var(--text);
  font-size: 18px;
  font-weight: 500;
  line-height: normal;
  -webkit-font-smoothing: antialiased;
}

/* ---------- Panel ---------- */
.panel {
  position: fixed;
  top: 20px; right: 20px;
  width: 400px;
  max-height: calc(100vh - 40px);
  background: var(--panel-bg);
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-panel);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
  display: flex; flex-direction: column;
  overflow: hidden;
  z-index: 2147483646;
}
.panel.hidden { display: none; }

.panel-body { padding: 0 17px 17px; overflow-y: auto; overflow-x: hidden; }
.panel-body::-webkit-scrollbar { width: 10px; }
.panel-body::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 10px; border: 3px solid transparent; background-clip: padding-box; }

/* ---------- Header ---------- */
.head { padding: 17px 17px 0; cursor: grab; }
.head:active { cursor: grabbing; }
.head-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.head-title { color: var(--blue); font-weight: 600; font-size: 20px; }
.head-actions { display: flex; gap: 4px; }
.hbtn {
  width: 20px; height: 20px; display: grid; place-items: center;
  background: transparent; border: none; border-radius: var(--r-sm);
  color: var(--text); cursor: pointer; opacity: .85; padding: 0;
}
.hbtn:hover { opacity: 1; }
.hbtn.danger { color: #e05151; opacity: 1; }
.hbtn svg { width: 20px; height: 20px; }
.crumb { color: var(--orange); font-size: 18px; font-weight: 500; margin-top: 7px; display: flex; gap: 8px; flex-wrap: wrap; }
.dims { color: var(--muted); font-size: 20px; margin-top: 10px; display: flex; gap: 12px; align-items: baseline; }
.dims b { color: var(--text); font-weight: 500; }

/* ---------- Section ---------- */
.section { padding: 16px 0; border-top: 1px solid var(--line); }
.section:first-child { border-top: none; }
.sec-head {
  display: flex; align-items: center; justify-content: space-between;
  font-weight: 500; font-size: 20px; color: var(--text);
  cursor: pointer; user-select: none; margin-bottom: 16px;
}
.sec-head .chev { width: 20px; height: 20px; color: var(--text); transition: transform .15s; display: grid; place-items: center; }
.section.closed .sec-head .chev { transform: rotate(-90deg); }
.section.closed .sec-content { display: none; }
.sec-content { display: flex; flex-direction: column; gap: 16px; }

.label { color: var(--muted); font-size: 15px; font-weight: 500; margin-bottom: 4px; display: block; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.rot-row { display: grid; grid-template-columns: 1.6fr 1fr 1fr; gap: 8px; }
.rot-row .iconrow { height: 100%; }
.stack { display: flex; flex-direction: column; }

/* ---------- Field ---------- */
.field {
  display: flex; align-items: center; gap: 8px;
  background: var(--field); border: 1px solid transparent;
  border-radius: var(--r-field); padding: 8px; min-width: 0; height: 39px;
}
.field.sm { height: 34px; }
.field:focus-within { border-color: var(--blue); }
.field .fic { width: 16px; height: 16px; color: var(--text); flex: none; display: grid; place-items: center; }
.field .fic svg { width: 100%; height: 100%; }
.field .fk { color: var(--text); font-size: 18px; flex: none; width: 16px; text-align: center; }
.field input {
  flex: 1; min-width: 0; background: transparent; border: none; outline: none;
  color: var(--text); font-size: 18px; font-family: var(--font); font-weight: 500;
}
.field .unit { color: var(--muted); font-size: 18px; flex: none; }
.field.select-like { cursor: pointer; }
.field select {
  flex: 1; min-width: 0; background: transparent; border: none; outline: none;
  color: var(--text); font-size: 18px; font-family: var(--font); font-weight: 500; cursor: pointer;
  appearance: none; -webkit-appearance: none;
}
.field select option { background: #1b1b1b; color: #fff; }
.field .chev-mini { width: 20px; height: 20px; color: var(--text); flex: none; pointer-events: none; display: grid; place-items: center; }

/* ---------- Icon button group (alignment, flips, text-align) ---------- */
.iconrow { display: flex; gap: 2px; }
.iconrow.grow > * { flex: 1; }
.ibtn {
  height: 32px; min-width: 32px; display: grid; place-items: center;
  background: var(--field); border: 1px solid transparent; border-radius: var(--r-field);
  color: var(--text); cursor: pointer; padding: 0 8px;
}
.ibtn:hover { background: var(--field-2); }
.ibtn.active { background: var(--field-active); }
.ibtn svg { width: 16px; height: 16px; }

/* ---------- Spacing box ---------- */
.boxeditor { background: var(--box-margin); border-radius: 16px; padding: 27px 41px; position: relative; }
.boxeditor .ring { border-radius: 12px; padding: 27px 41px; position: relative; }
.boxeditor .ring.pad { background: var(--box-content); }
.boxeditor .tag { position: absolute; top: 6px; left: 12px; font-size: 10px; color: var(--muted); font-weight: 500; z-index: 1; }
.boxeditor .center-size {
  background: var(--box-content); border-radius: 10px;
  padding: 18px 8px; text-align: center; color: var(--text); font-size: 15px;
  display: flex; align-items: center; justify-content: center; gap: 6px; position: relative;
}
.boxeditor .center-size .tag { position: absolute; top: 6px; left: 8px; }
.boxeditor .edge {
  position: absolute; width: 42px; text-align: center; background: transparent;
  border: none; color: var(--text); font-size: 15px; font-family: var(--font); outline: none; z-index: 2;
}
.boxeditor .edge:focus { color: var(--blue); }

/* ---------- Corner grid (Appearance) ---------- */
.corner-mix { display: grid; grid-template-columns: 1fr 34px; gap: 4px; }
.corner-mix .ibtn { height: 34px; }
.corner-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

/* ---------- Fill / stroke add rows ---------- */
.addrow { display: flex; align-items: center; justify-content: space-between; height: 20px; }
.addrow .k { color: var(--muted); font-size: 15px; font-weight: 500; }
.addbtn { width: 20px; height: 20px; display: grid; place-items: center; background: transparent; border: none; color: var(--text); cursor: pointer; padding: 0; }
.addbtn:hover { color: var(--blue); }
.addbtn svg { width: 20px; height: 20px; }
.colorline { display: flex; align-items: center; gap: 8px; background: var(--field); border-radius: var(--r-field); padding: 8px; height: 39px; }
.swatch { width: 22px; height: 22px; border-radius: 6px; border: 1px solid rgba(255,255,255,.18); position: relative; overflow: hidden; flex: none; cursor: pointer; }
.swatch input[type=color] { position: absolute; inset: -4px; width: 140%; height: 140%; border: none; padding: 0; cursor: pointer; }
.colorline .hex { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--text); font-size: 18px; font-family: var(--font); text-transform: uppercase; }
.colorline .pct { color: var(--muted); font-size: 18px; }

/* ---------- Code / HTML views ---------- */
.code { margin: 0; padding: 14px; background: var(--box-content); border-radius: var(--r-field);
  color: #d4d8e2; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;
  line-height: 1.6; white-space: pre; overflow: auto; max-height: 60vh; }
.code .sel { color: var(--blue); } .code .prop { color: var(--orange); } .code .val { color: #ffd479; }
.view-actions { display: flex; gap: 8px; margin: 16px 0; }
.btn { padding: 9px 14px; border-radius: var(--r-field); border: none; background: var(--field); color: var(--text); font-family: var(--font); font-weight: 500; font-size: 15px; cursor: pointer; }
.btn:hover { background: var(--field-2); }
.btn.primary { background: var(--blue); color: #001427; }
.empty { color: var(--muted); text-align: center; padding: 32px 16px; font-size: 15px; }

/* ---------- Vertical toolbar dock ---------- */
.dock { position: fixed; top: 50%; left: 16px; transform: translateY(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 10px; z-index: 2147483646;
  filter: drop-shadow(4px 3px 5px rgba(0,0,0,.2)); }
.dock-circle {
  width: 44px; height: 44px; border-radius: 999px; display: grid; place-items: center;
  background: var(--tool-bg); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  border: 1px solid var(--border-soft); color: var(--text); cursor: pointer;
}
.dock-circle:hover { background: var(--tool-active); }
.dock-group {
  display: flex; flex-direction: column; align-items: center;
  background: var(--tool-bg); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  border: 1px solid var(--border-soft); border-radius: 22px; padding: 4px; gap: 0;
}
.dock-btn {
  width: 44px; height: 44px; display: grid; place-items: center; border-radius: 18px;
  background: transparent; border: none; color: var(--text); cursor: pointer;
}
.dock-btn:hover { background: rgba(255,255,255,0.06); }
.dock-btn.active { background: var(--tool-active); }
.dock-btn svg, .dock-circle svg { width: 20px; height: 20px; }
.dock-sep { width: 24px; height: 1px; background: var(--line); margin: 1px 0; }

/* toast */
.toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
  background: var(--blue); color: #001427; padding: 10px 18px; border-radius: 12px;
  font-family: var(--font); font-weight: 600; font-size: 15px; z-index: 2147483647;
  box-shadow: 0 8px 24px rgba(0,0,0,.4); }
`;
