// All panel + toolbar styles, injected once into the Shadow DOM so the host
// page's CSS can never leak in (and ours never leaks out).

export const css = /* css */ `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.wrap {
  --bg: #16181d;
  --bg-2: #1c1f26;
  --bg-3: #23262f;
  --line: #2c303a;
  --text: #e7e9ee;
  --muted: #8b90a0;
  --accent: #4c8dff;
  --green: #4ade80;
  --pink: #f472d0;
  --radius: 12px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
}

/* ---- Panel shell ---- */
.panel {
  position: fixed;
  top: 16px; right: 16px;
  width: 380px;
  max-height: calc(100vh - 32px);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: 0 12px 40px rgba(0,0,0,.5);
  display: flex; flex-direction: column;
  overflow: hidden;
  z-index: 2147483647;
}
.panel.collapsed .panel-body, .panel.collapsed .tabs { display: none; }

.panel-head {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 12px 12px 10px;
  cursor: grab;
  border-bottom: 1px solid var(--line);
}
.panel-head:active { cursor: grabbing; }
.head-meta { flex: 1; min-width: 0; }
.head-title { color: var(--green); font-weight: 600; font-size: 13px; }
.head-sel {
  color: var(--pink); font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.head-dims { color: var(--muted); font-size: 11px; margin-top: 4px; display:flex; gap:10px; flex-wrap:wrap;}
.head-dims b { color: var(--text); font-weight: 500; }
.head-actions { display: flex; gap: 6px; }
.icon-btn {
  width: 26px; height: 26px; display: grid; place-items: center;
  background: transparent; border: 1px solid transparent; border-radius: 7px;
  color: var(--muted); cursor: pointer;
}
.icon-btn:hover { background: var(--bg-3); color: var(--text); }

/* ---- Tabs ---- */
.tabs { display: flex; gap: 2px; padding: 8px 10px 0; border-bottom: 1px solid var(--line); }
.tab {
  padding: 7px 12px; font-size: 12.5px; color: var(--muted);
  background: none; border: none; cursor: pointer; border-radius: 8px 8px 0 0;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tab:hover { color: var(--text); }
.tab.active { color: var(--text); border-bottom-color: var(--accent); }
.tab .badge-new {
  font-size: 9px; color: #fff; background: var(--pink);
  padding: 1px 4px; border-radius: 4px; margin-left: 5px; vertical-align: middle;
}

.panel-body { padding: 12px; overflow-y: auto; }
.panel-body::-webkit-scrollbar { width: 10px; }
.panel-body::-webkit-scrollbar-thumb { background: var(--bg-3); border-radius: 10px; border: 3px solid var(--bg); }

/* ---- Section ---- */
.section { border-top: 1px solid var(--line); padding: 12px 2px; }
.section:first-child { border-top: none; padding-top: 2px; }
.section-title {
  display: flex; align-items: center; justify-content: space-between;
  color: var(--green); font-weight: 600; font-size: 12px; margin-bottom: 10px;
  cursor: pointer; user-select: none;
}
.section-title .chev { color: var(--muted); transition: transform .15s; }
.section.closed .section-title .chev { transform: rotate(-90deg); }
.section.closed .section-content { display: none; }

/* ---- Select-row (media / pseudo) ---- */
.selectrow {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--bg-2); border: 1px solid var(--line);
  border-radius: 9px; padding: 9px 11px; margin-bottom: 8px;
}
.selectrow label { color: var(--muted); font-size: 12px; display:flex; align-items:center; gap:7px;}
.selectrow select {
  background: transparent; color: var(--accent); border: none;
  font-size: 12px; font-weight: 600; cursor: pointer; outline: none;
  max-width: 210px; text-align: right;
}
.selectrow select option { color: #000; }

/* ---- Field grid ---- */
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.field { display: flex; align-items: center; gap: 6px; background: var(--bg-2);
  border: 1px solid var(--line); border-radius: 8px; padding: 6px 9px; }
.field:focus-within { border-color: var(--accent); }
.field .k { color: var(--muted); font-size: 11px; }
.field input, .field select {
  flex: 1; min-width: 0; background: transparent; border: none; outline: none;
  color: var(--text); font-size: 12.5px; font-family: ui-monospace, Menlo, monospace;
}
.field select { font-family: inherit; cursor: pointer; }
.field select option { color: #000; }
.field .u { color: var(--muted); font-size: 11px; }

/* ---- Spacing box editor ---- */
.spacing {
  position: relative; background: var(--bg-2); border: 1px solid var(--line);
  border-radius: 10px; padding: 26px; margin-top: 4px;
}
.spacing .lab { position: absolute; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.spacing .lab.m { top: 5px; left: 9px; }
.spacing .lab.p { top: 5px; left: 50%; transform: translateX(-50%); font-style: italic; }
.spacing .inner { background: var(--bg-3); border: 1px dashed var(--line); border-radius: 8px; padding: 22px; text-align:center;}
.spacing .center { color: var(--muted); font-size: 11px; }
.spacing input {
  position: absolute; width: 40px; text-align: center; background: transparent;
  border: none; color: var(--text); font-size: 11.5px; outline: none;
  font-family: ui-monospace, Menlo, monospace;
}
.spacing input:focus { color: var(--accent); }
.spacing .m-top { top: 6px; left: 50%; transform: translateX(-50%); }
.spacing .m-bottom { bottom: 6px; left: 50%; transform: translateX(-50%); }
.spacing .m-left { left: 4px; top: 50%; transform: translateY(-50%); }
.spacing .m-right { right: 4px; top: 50%; transform: translateY(-50%); }
.spacing .p-top { top: 32px; left: 50%; transform: translateX(-50%); }
.spacing .p-bottom { bottom: 32px; left: 50%; transform: translateX(-50%); }
.spacing .p-left { left: 34px; top: 50%; transform: translateY(-50%); }
.spacing .p-right { right: 34px; top: 50%; transform: translateY(-50%); }

/* ---- Color row ---- */
.color-row { display: flex; align-items: center; gap: 8px; background: var(--bg-2);
  border: 1px solid var(--line); border-radius: 8px; padding: 6px 9px; margin-bottom: 8px; }
.color-row .k { color: var(--muted); font-size: 11.5px; flex: 1; }
.swatch { width: 22px; height: 22px; border-radius: 6px; border: 1px solid rgba(255,255,255,.15);
  position: relative; overflow: hidden; cursor: pointer; flex: none; }
.swatch input[type=color] { position: absolute; inset: -4px; width: 130%; height: 130%; border: none; padding: 0; cursor: pointer; }
.color-row .hex { width: 84px; background: transparent; border: none; outline: none; color: var(--text);
  font-family: ui-monospace, Menlo, monospace; font-size: 12px; text-align: right; }

/* ---- Code / HTML tab ---- */
.code {
  margin: 0; padding: 12px; background: var(--bg-2); border: 1px solid var(--line);
  border-radius: 10px; color: #cdd3e0; font-family: ui-monospace, Menlo, monospace;
  font-size: 12px; line-height: 1.6; white-space: pre; overflow: auto; max-height: 52vh;
}
.code .sel { color: var(--green); }
.code .prop { color: var(--pink); }
.code .val { color: #ffd479; }
.code-actions { display: flex; gap: 8px; margin-bottom: 10px; }
.btn {
  padding: 7px 12px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--bg-3); color: var(--text); font-size: 12px; cursor: pointer;
}
.btn:hover { border-color: var(--accent); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.empty { color: var(--muted); text-align: center; padding: 28px 12px; font-size: 12.5px; }

.seg { display: inline-flex; background: var(--bg-2); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.seg button { background: none; border: none; color: var(--muted); padding: 5px 9px; cursor: pointer; font-size: 11.5px; }
.seg button.active { background: var(--accent); color: #fff; }

/* ---- Toolbar (bottom dock) ---- */
.dock {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 4px;
  background: rgba(24,26,32,.92); backdrop-filter: blur(10px);
  border: 1px solid var(--line); border-radius: 999px; padding: 7px 9px;
  box-shadow: 0 10px 30px rgba(0,0,0,.45); z-index: 2147483647;
}
.dock .tool {
  width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
  background: transparent; border: none; color: var(--muted); cursor: pointer;
}
.dock .tool:hover { background: var(--bg-3); color: var(--text); }
.dock .tool.on { background: var(--accent); color: #fff; }
.dock .sep { width: 1px; height: 22px; background: var(--line); margin: 0 4px; }
.dock .brand { display:flex; align-items:center; gap:7px; padding: 0 10px 0 6px; color: var(--text); font-weight:600; font-size:13px;}
.dock .brand .logo { width: 22px; height: 22px; border-radius: 6px;
  background: linear-gradient(135deg, var(--accent), var(--green)); }
`;
