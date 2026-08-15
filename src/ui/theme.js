// All panel + toolbar styles, injected once into the Shadow DOM.
// Colors, radii, spacing and typography are taken 1:1 from the Figma design.

export const css = /* css */ `
@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap');

:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.wrap {
  /* --- exact tokens from the Figma design --- */
  --panel-bg: rgba(0, 0, 0, 0.74);
  --field: #232323;
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
  font-size: 14px;
  font-weight: 500;
  line-height: normal;
  -webkit-font-smoothing: antialiased;
}

/* ---------- Panel ---------- */
.panel {
  position: fixed;
  top: 20px; right: 20px;
  width: 340px;
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

.panel-body { padding: 16px; overflow-y: auto; overflow-x: hidden; }
.panel-body::-webkit-scrollbar { width: 10px; }
.panel-body::-webkit-scrollbar-thumb { background: var(--field); border-radius: 10px; border: 3px solid transparent; background-clip: padding-box; }

/* ---------- Header ---------- */
.head { padding: 16px 16px 4px; cursor: grab; }
.head:active { cursor: grabbing; }
.head-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.head-title { color: var(--blue); font-weight: 600; font-size: 16px; }
.head-actions { display: flex; gap: 2px; }
.hbtn {
  width: 30px; height: 30px; display: grid; place-items: center;
  background: transparent; border: none; border-radius: var(--r-sm);
  color: var(--text); cursor: pointer; opacity: .8;
}
.hbtn:hover { background: var(--field); opacity: 1; }
.hbtn svg { width: 16px; height: 16px; }
.crumb { color: var(--orange); font-size: 14px; margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap; }
.dims { color: var(--muted); font-size: 14px; margin-top: 8px; display: flex; gap: 14px; align-items: center; }
.dims b { color: var(--text); font-weight: 500; }

/* ---------- Section ---------- */
.section { padding: 14px 0; border-top: 1px solid rgba(255,255,255,0.06); }
.section:first-child { border-top: none; }
.sec-head {
  display: flex; align-items: center; justify-content: space-between;
  font-weight: 600; font-size: 16px; color: var(--text);
  cursor: pointer; user-select: none; margin-bottom: 12px;
}
.sec-head .chev { width: 16px; height: 16px; color: var(--muted); transition: transform .15s; display: grid; place-items: center;}
.section.closed .sec-head .chev { transform: rotate(-90deg); }
.section.closed .sec-content { display: none; }
.sec-content { display: flex; flex-direction: column; gap: 12px; }

.label { color: var(--muted); font-size: 12px; font-weight: 400; margin-bottom: 6px; display: block; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.stack { display: flex; flex-direction: column; }

/* ---------- Field ---------- */
.field {
  display: flex; align-items: center; gap: 8px;
  background: var(--field); border: 1px solid transparent;
  border-radius: var(--r-field); padding: 10px 12px; min-width: 0;
}
.field:focus-within { border-color: var(--blue); }
.field .fic { width: 16px; height: 16px; color: var(--text); flex: none; opacity: .85; display: grid; place-items: center; }
.field .fic svg { width: 100%; height: 100%; }
.field .fk { color: var(--text); font-size: 14px; flex: none; }
.field input {
  flex: 1; min-width: 0; background: transparent; border: none; outline: none;
  color: var(--text); font-size: 14px; font-family: var(--font); font-weight: 500;
}
.field .unit { color: var(--muted); font-size: 14px; flex: none; }
.field.select-like { cursor: pointer; }
.field select {
  flex: 1; min-width: 0; background: transparent; border: none; outline: none;
  color: var(--text); font-size: 14px; font-family: var(--font); font-weight: 500; cursor: pointer;
  appearance: none; -webkit-appearance: none;
}
.field select option { background: #1b1b1b; color: #fff; }
.field .chev-mini { width: 16px; height: 16px; color: var(--muted); flex: none; pointer-events: none; }

/* ---------- Icon button group (alignment, flips, text-align) ---------- */
.iconrow { display: flex; gap: 8px; }
.iconrow.grow > * { flex: 1; }
.ibtn {
  height: 40px; min-width: 40px; display: grid; place-items: center;
  background: var(--field); border: 1px solid transparent; border-radius: var(--r-field);
  color: var(--text); cursor: pointer; padding: 0 8px;
}
.ibtn:hover { background: var(--field-2); }
.ibtn.active { background: var(--field-active); }
.ibtn svg { width: 20px; height: 20px; }

/* ---------- Spacing box ---------- */
.spacing-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.boxeditor { background: var(--box-margin); border-radius: 16px; padding: 8px; position: relative; }
.boxeditor .ring { border-radius: 12px; padding: 8px; position: relative; }
.boxeditor .ring.pad { background: var(--box-content); }
.boxeditor .tag { position: absolute; top: 6px; left: 10px; font-size: 10px; color: var(--muted); font-weight: 400; }
.boxeditor .center-size {
  background: #000; border: 1px dashed var(--line); border-radius: 10px;
  padding: 22px 8px; text-align: center; color: var(--text); font-size: 13px;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.boxeditor .edge {
  position: absolute; width: 34px; text-align: center; background: transparent;
  border: none; color: var(--text); font-size: 11px; font-family: var(--font); outline: none;
}
.boxeditor .edge:focus { color: var(--blue); }

/* ---------- Corner grid (Appearance) ---------- */
.corner-mix { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
.corner-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

/* ---------- Color / fill / stroke rows ---------- */
.addrow { display: flex; align-items: center; justify-content: space-between; }
.addrow .k { color: var(--muted); font-size: 12px; font-weight: 400; }
.addbtn { width: 20px; height: 20px; display: grid; place-items: center; background: transparent; border: none; color: var(--text); cursor: pointer; }
.addbtn:hover { color: var(--blue); }
.colorline { display: flex; align-items: center; gap: 8px; background: var(--field); border-radius: var(--r-field); padding: 8px 10px; }
.swatch { width: 24px; height: 24px; border-radius: 6px; border: 1px solid rgba(255,255,255,.18); position: relative; overflow: hidden; flex: none; cursor: pointer; }
.swatch input[type=color] { position: absolute; inset: -4px; width: 140%; height: 140%; border: none; padding: 0; cursor: pointer; }
.colorline .hex { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--text); font-size: 13px; font-family: var(--font); text-transform: uppercase; }
.colorline .pct { color: var(--muted); font-size: 13px; }

/* ---------- Code / HTML views ---------- */
.code { margin: 0; padding: 14px; background: var(--box-content); border-radius: var(--r-field);
  color: #d4d8e2; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px;
  line-height: 1.6; white-space: pre; overflow: auto; max-height: 60vh; }
.code .sel { color: var(--blue); } .code .prop { color: var(--orange); } .code .val { color: #ffd479; }
.view-actions { display: flex; gap: 8px; margin-bottom: 12px; }
.btn { padding: 9px 14px; border-radius: var(--r-field); border: none; background: var(--field); color: var(--text); font-family: var(--font); font-weight: 500; font-size: 13px; cursor: pointer; }
.btn:hover { background: var(--field-2); }
.btn.primary { background: var(--blue); color: #001427; }
.empty { color: var(--muted); text-align: center; padding: 32px 16px; font-size: 13px; }

/* ---------- Vertical toolbar dock ---------- */
.dock { position: fixed; top: 50%; left: 20px; transform: translateY(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 16px; z-index: 2147483646;
  filter: drop-shadow(5px 4px 6px rgba(0,0,0,.2)); }
.dock-circle {
  width: 56px; height: 56px; border-radius: 999px; display: grid; place-items: center;
  background: var(--tool-bg); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  border: 1px solid var(--border-soft); color: var(--text); cursor: pointer;
}
.dock-circle:hover { background: var(--tool-active); }
.dock-group {
  display: flex; flex-direction: column; align-items: center;
  background: var(--tool-bg); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  border: 1px solid var(--border-soft); border-radius: var(--r-panel); padding: 4px; gap: 0;
}
.dock-btn {
  width: 56px; height: 56px; display: grid; place-items: center; border-radius: var(--r-btn);
  background: transparent; border: none; color: var(--text); cursor: pointer;
}
.dock-btn:hover { background: rgba(255,255,255,0.06); }
.dock-btn.active { background: var(--tool-active); }
.dock-btn svg, .dock-circle svg { width: 24px; height: 24px; }
.dock-sep { width: 32px; height: 1px; background: var(--line); margin: 2px 0; }

/* toast */
.toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
  background: var(--blue); color: #001427; padding: 10px 18px; border-radius: 12px;
  font-family: var(--font); font-weight: 600; font-size: 13px; z-index: 2147483647;
  box-shadow: 0 8px 24px rgba(0,0,0,.4); }
`;
