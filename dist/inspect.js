(() => {
  // src/core/store.js
  var state = {
    active: false,
    // inspector picking mode on/off
    hoverEl: null,
    // element under cursor while picking
    selectedEl: null,
    // currently selected element
    pseudo: "none",
    // none | hover | focus | active
    view: "design",
    // design | code | html (driven by the dock)
    // Map<inspectId, { selector, pseudo, props: Map<prop,value> }>
    edits: /* @__PURE__ */ new Map(),
    panelPos: { x: null, y: 16 },
    // panel screen position (null x = right-docked)
    collapsed: false,
    editing: false,
    // inline text editing in progress
    dragging: false
    // drag-to-reorder in progress
  };
  var subs = /* @__PURE__ */ new Set();
  var store = {
    get: () => state,
    set(patch) {
      Object.assign(state, patch);
      subs.forEach((fn) => fn(state));
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    }
  };

  // src/core/util.js
  var idCounter = 0;
  var ID_ATTR = "data-inspect-id";
  function ensureInspectId(el) {
    let id = el.getAttribute(ID_ATTR);
    if (!id) {
      id = "ic-" + ++idCounter;
      el.setAttribute(ID_ATTR, id);
    }
    return id;
  }
  function inspectIdSelector(id) {
    return `[${ID_ATTR}="${id}"]`;
  }
  function round(n, p = 2) {
    if (n == null || Number.isNaN(n)) return 0;
    const f = Math.pow(10, p);
    return Math.round(n * f) / f;
  }
  function h(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v !== false && v != null) {
        el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const c of [].concat(children)) {
      if (c == null || c === false) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }
  function elementLabel(el) {
    if (!el || el.nodeType !== 1) return "";
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    else if (el.classList.length) s += "." + el.classList[0];
    return s;
  }
  function parseLength(str) {
    if (str == null) return { value: 0, unit: "px" };
    const m = String(str).trim().match(/^(-?[\d.]+)\s*([a-z%]*)$/i);
    if (!m) return { value: str, unit: "" };
    return { value: parseFloat(m[1]), unit: m[2] || "px" };
  }
  function rgbToHex(rgb) {
    if (!rgb) return { hex: "#000000", alpha: 1 };
    if (rgb.startsWith("#")) return { hex: rgb, alpha: 1 };
    const m = rgb.match(/rgba?\(([^)]+)\)/i);
    if (!m) return { hex: "#000000", alpha: 1 };
    const parts = m[1].split(",").map((x) => x.trim());
    const [r, g, b] = parts.map((x) => parseInt(x, 10));
    const a = parts[3] != null ? parseFloat(parts[3]) : 1;
    const hex = "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, x || 0)).toString(16).padStart(2, "0")).join("");
    return { hex, alpha: a };
  }
  function hexToRgba(hex, alpha = 1) {
    const clean = hex.replace("#", "");
    const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0");
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${round(alpha, 3)})`;
  }
  function isOwnUI(el) {
    return !!(el && el.closest && el.closest("[data-inspect-ui]"));
  }

  // src/core/overlay.js
  var Overlay = class {
    constructor(root) {
      this.el = h("div", {
        "data-inspect-ui": "",
        style: {
          position: "fixed",
          inset: "0",
          pointerEvents: "none",
          // Below the panel/dock (2147483646) so highlights never cover our UI.
          zIndex: "2147483640"
        }
      });
      this.margin = this._box("rgba(246, 178, 107, 0.28)");
      this.padding = this._box("rgba(147, 196, 125, 0.30)");
      this.content = h("div", { style: this._boxStyle("transparent", "#4c8dff") });
      this.selected = h("div", { style: this._boxStyle("transparent", "#7c5cff") });
      this.badge = h("div", {
        "data-inspect-ui": "",
        style: {
          position: "fixed",
          font: "500 12px/1.4 'Quicksand', -apple-system, 'Segoe UI', Roboto, sans-serif",
          color: "rgba(255,255,255,0.6)",
          background: "rgba(0,0,0,0.82)",
          border: "1px solid rgba(255,255,255,0.12)",
          padding: "4px 9px",
          borderRadius: "8px",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          boxShadow: "0 6px 20px rgba(0,0,0,.45)",
          backdropFilter: "blur(6px)"
        }
      });
      this.el.append(this.margin, this.padding, this.content, this.selected, this.badge);
      root.appendChild(this.el);
      this.hideHover();
      this.hideSelected();
    }
    _box(bg) {
      return h("div", { style: { position: "fixed", background: bg, pointerEvents: "none" } });
    }
    _boxStyle(bg, border) {
      return {
        position: "fixed",
        background: bg,
        outline: `1px solid ${border}`,
        outlineOffset: "-1px",
        pointerEvents: "none"
      };
    }
    _place(node, r) {
      Object.assign(node.style, {
        left: r.left + "px",
        top: r.top + "px",
        width: Math.max(0, r.width) + "px",
        height: Math.max(0, r.height) + "px",
        display: "block"
      });
    }
    highlight(el) {
      if (!el) return this.hideHover();
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const m = num(cs, "margin");
      const p = num(cs, "padding");
      this._place(this.margin, {
        left: r.left - m.left,
        top: r.top - m.top,
        width: r.width + m.left + m.right,
        height: r.height + m.top + m.bottom
      });
      this._place(this.content, r);
      this._place(this.padding, r);
      const label = elementLabel(el);
      this.badge.innerHTML = `<span style="color:#58aeff">${escapeHtml(label)}</span><span style="opacity:.5">&nbsp;&nbsp;${round(r.width)} \xD7 ${round(r.height)}</span>`;
      this.badge.style.display = "block";
      const bTop = r.top > 24 ? r.top - 22 : r.bottom + 6;
      this.badge.style.left = Math.max(4, r.left) + "px";
      this.badge.style.top = bTop + "px";
    }
    select(el) {
      if (!el) return this.hideSelected();
      this._place(this.selected, el.getBoundingClientRect());
    }
    hideHover() {
      [this.margin, this.padding, this.content, this.badge].forEach(
        (n) => n.style.display = "none"
      );
    }
    hideSelected() {
      this.selected.style.display = "none";
    }
    destroy() {
      this.el.remove();
    }
  };
  function num(cs, prop) {
    const g = (s) => parseFloat(cs.getPropertyValue(`${prop}-${s}`)) || 0;
    return { top: g("top"), right: g("right"), bottom: g("bottom"), left: g("left") };
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // src/core/inspector.js
  var Inspector = class {
    constructor(overlay, onSelect) {
      this.overlay = overlay;
      this.onSelect = onSelect;
      this._onMove = this._onMove.bind(this);
      this._onClick = this._onClick.bind(this);
      this._onKey = this._onKey.bind(this);
      this._onScroll = this._onScroll.bind(this);
    }
    start() {
      document.addEventListener("mousemove", this._onMove, true);
      document.addEventListener("click", this._onClick, true);
      document.addEventListener("keydown", this._onKey, true);
      window.addEventListener("scroll", this._onScroll, true);
      window.addEventListener("resize", this._onScroll, true);
      document.documentElement.style.cursor = "crosshair";
    }
    stop() {
      document.removeEventListener("mousemove", this._onMove, true);
      document.removeEventListener("click", this._onClick, true);
      document.removeEventListener("keydown", this._onKey, true);
      window.removeEventListener("scroll", this._onScroll, true);
      window.removeEventListener("resize", this._onScroll, true);
      document.documentElement.style.cursor = "";
      this.overlay.hideHover();
      store.set({ hoverEl: null });
    }
    _target(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || isOwnUI(el) || el === document.documentElement || el === document.body) return null;
      return el;
    }
    _onMove(e) {
      if (store.get().editing || store.get().dragging) return;
      const el = this._target(e);
      if (!el) return this.overlay.hideHover();
      if (el === store.get().hoverEl) return;
      store.set({ hoverEl: el });
      this.overlay.highlight(el);
    }
    _onClick(e) {
      if (isOwnUI(e.target)) return;
      if (store.get().editing || store.get().dragging) return;
      const el = this._target(e);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      this.onSelect(el);
    }
    _onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        store.set({ active: false });
      }
    }
    // Keep overlays glued to elements as the page moves.
    _onScroll() {
      const { hoverEl, selectedEl } = store.get();
      if (hoverEl) this.overlay.highlight(hoverEl);
      if (selectedEl) this.overlay.select(selectedEl);
    }
  };

  // src/core/selector.js
  function isValidClass(c) {
    return c && !/[^a-zA-Z0-9_-]/.test(c) && !/^(is-|has-|js-)/.test(c) === true ? true : c && !/[^a-zA-Z0-9_-]/.test(c);
  }
  function nth(el) {
    let i = 1;
    let sib = el;
    while (sib = sib.previousElementSibling) {
      if (sib.tagName === el.tagName) i++;
    }
    return i;
  }
  function segment(el) {
    const tag = el.tagName.toLowerCase();
    if (el.id && document.querySelectorAll("#" + CSS.escape(el.id)).length === 1) {
      return "#" + el.id;
    }
    const classes = Array.from(el.classList).filter(isValidClass).slice(0, 2);
    if (classes.length) {
      const sel = tag + "." + classes.map((c) => c).join(".");
      return sel;
    }
    return `${tag}:nth-of-type(${nth(el)})`;
  }
  function cssPath(el, maxDepth = 4) {
    if (!el || el.nodeType !== 1) return "";
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      const seg = segment(node);
      parts.unshift(seg);
      if (seg.startsWith("#")) break;
      try {
        if (document.querySelectorAll(parts.join(" > ")).length === 1) break;
      } catch {
      }
      node = node.parentElement;
      if (parts.length >= maxDepth) break;
    }
    return parts.join(" > ");
  }

  // src/core/liveStyles.js
  var STYLE_ID = "inspect-css-live-styles";
  function styleEl() {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      el.setAttribute("data-inspect-ui", "");
      document.head.appendChild(el);
    }
    return el;
  }
  var past = [];
  var future = [];
  function snapshot() {
    const { edits } = store.get();
    return [...edits.entries()].map(([k, e]) => [k, {
      inspectId: e.inspectId,
      pseudo: e.pseudo,
      selector: e.selector,
      props: [...e.props.entries()]
    }]);
  }
  function restore(snap) {
    const map = /* @__PURE__ */ new Map();
    for (const [k, e] of snap) {
      map.set(k, { inspectId: e.inspectId, pseudo: e.pseudo, selector: e.selector, props: new Map(e.props) });
    }
    store.get().edits = map;
    render();
    store.set({ edits: map });
  }
  function pushHistory() {
    past.push(snapshot());
    if (past.length > 100) past.shift();
    future.length = 0;
  }
  function undo() {
    if (!past.length) return;
    future.push(snapshot());
    restore(past.pop());
  }
  function redo() {
    if (!future.length) return;
    past.push(snapshot());
    restore(future.pop());
  }
  function setProp(el, prop, value) {
    pushHistory();
    const id = ensureInspectId(el);
    const { edits, pseudo } = store.get();
    const key = pseudo === "none" ? id : `${id}::${pseudo}`;
    let entry = edits.get(key);
    if (!entry) {
      entry = {
        inspectId: id,
        pseudo,
        selector: cssPath(el),
        props: /* @__PURE__ */ new Map()
      };
      edits.set(key, entry);
    }
    if (value === "" || value == null) entry.props.delete(prop);
    else entry.props.set(prop, value);
    if (entry.props.size === 0) edits.delete(key);
    render();
    store.set({ edits });
  }
  function getEditedProps(el, pseudo = "none") {
    const id = el.getAttribute("data-inspect-id");
    if (!id) return /* @__PURE__ */ new Map();
    const key = pseudo === "none" ? id : `${id}::${pseudo}`;
    const entry = store.get().edits.get(key);
    return entry ? entry.props : /* @__PURE__ */ new Map();
  }
  function render() {
    const { edits } = store.get();
    const rules = [];
    for (const entry of edits.values()) {
      if (entry.props.size === 0) continue;
      const sel = inspectIdSelector(entry.inspectId) + (entry.pseudo !== "none" ? ":" + entry.pseudo : "");
      const body = [...entry.props.entries()].map(([p, v]) => `  ${p}: ${v} !important;`).join("\n");
      rules.push(`${sel} {
${body}
}`);
    }
    styleEl().textContent = rules.join("\n\n");
  }
  function generateCss() {
    const { edits } = store.get();
    const out = [];
    for (const entry of edits.values()) {
      if (entry.props.size === 0) continue;
      const sel = (entry.selector || inspectIdSelector(entry.inspectId)) + (entry.pseudo !== "none" ? ":" + entry.pseudo : "");
      const body = [...entry.props.entries()].map(([p, v]) => `  ${p}: ${v};`).join("\n");
      out.push(`${sel} {
${body}
}`);
    }
    return out.join("\n\n");
  }
  function clearAll() {
    store.get().edits.clear();
    render();
    store.set({ edits: store.get().edits });
  }

  // src/core/styleModel.js
  function val(el, cs, prop, computedProp = prop) {
    const edited = getEditedProps(el, store.get().pseudo).get(prop);
    if (edited != null) return edited;
    return cs.getPropertyValue(computedProp).trim();
  }
  function readModel(el) {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      rect,
      tag: el.tagName.toLowerCase(),
      layout: {
        display: val(el, cs, "display"),
        position: val(el, cs, "position"),
        width: cs.width,
        height: cs.height,
        x: round(rect.left + window.scrollX),
        y: round(rect.top + window.scrollY),
        rowGap: cs.rowGap === "normal" ? "0" : cs.rowGap,
        columnGap: cs.columnGap === "normal" ? "0" : cs.columnGap,
        justify: val(el, cs, "justify-content"),
        align: val(el, cs, "align-items")
      },
      transform: parseTransform(el, cs),
      spacing: {
        margin: sides(cs, "margin"),
        padding: sides(cs, "padding")
      },
      radius: {
        all: val(el, cs, "border-radius"),
        tl: cs.borderTopLeftRadius,
        tr: cs.borderTopRightRadius,
        br: cs.borderBottomRightRadius,
        bl: cs.borderBottomLeftRadius
      },
      typography: {
        fontFamily: cs.fontFamily,
        fontSize: val(el, cs, "font-size"),
        fontWeight: val(el, cs, "font-weight"),
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing,
        textAlign: val(el, cs, "text-align"),
        color: val(el, cs, "color"),
        marginBottom: val(el, cs, "margin-bottom")
      },
      background: {
        color: val(el, cs, "background-color"),
        image: cs.backgroundImage
      },
      border: {
        width: cs.borderTopWidth,
        style: cs.borderTopStyle,
        color: cs.borderTopColor
      },
      effects: {
        opacity: val(el, cs, "opacity"),
        boxShadow: cs.boxShadow === "none" ? "" : cs.boxShadow
      }
    };
  }
  function sides(cs, prop) {
    return {
      top: cs.getPropertyValue(`${prop}-top`),
      right: cs.getPropertyValue(`${prop}-right`),
      bottom: cs.getPropertyValue(`${prop}-bottom`),
      left: cs.getPropertyValue(`${prop}-left`)
    };
  }
  function parseTransform(el, cs) {
    const edited = getEditedProps(el, store.get().pseudo).get("transform");
    const t = edited || cs.transform;
    const base = { tx: 0, ty: 0, rotate: 0 };
    if (!t || t === "none") return base;
    const tr = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/.exec(t);
    const ro = /rotate\(\s*(-?[\d.]+)deg\s*\)/.exec(t);
    if (tr) {
      base.tx = parseFloat(tr[1]);
      base.ty = parseFloat(tr[2]);
    }
    if (ro) base.rotate = parseFloat(ro[1]);
    if (tr || ro) return base;
    const m = /matrix\(([^)]+)\)/.exec(t);
    if (m) {
      const [a, b, , , e, f] = m[1].split(",").map(parseFloat);
      base.tx = round(e);
      base.ty = round(f);
      base.rotate = round(Math.atan2(b, a) * (180 / Math.PI));
    }
    return base;
  }
  function composeTransform({ tx = 0, ty = 0, rotate = 0 }) {
    const parts = [];
    if (tx || ty) parts.push(`translate(${round(tx)}px, ${round(ty)}px)`);
    if (rotate) parts.push(`rotate(${round(rotate)}deg)`);
    return parts.length ? parts.join(" ") : "";
  }

  // src/core/assets.js
  var MAX_ELEMENTS = 6e3;
  var isOurs = (el) => el.closest && el.closest("[data-inspect-ui]");
  function elements() {
    const all = document.body ? document.body.querySelectorAll("*") : [];
    const out = [];
    for (let i = 0; i < all.length && out.length < MAX_ELEMENTS; i++) {
      if (!isOurs(all[i])) out.push(all[i]);
    }
    return out;
  }
  function bump(map, key, value) {
    const e = map.get(key);
    if (e) e.count++;
    else map.set(key, { ...value, count: 1 });
  }
  function collectColors() {
    const map = /* @__PURE__ */ new Map();
    const props = [
      "color",
      "background-color",
      "border-top-color",
      "border-right-color",
      "border-bottom-color",
      "border-left-color",
      "outline-color",
      "fill",
      "stroke"
    ];
    for (const el of elements()) {
      const cs = getComputedStyle(el);
      for (const p of props) {
        const raw = cs.getPropertyValue(p).trim();
        if (!raw || raw === "none") continue;
        const { hex, alpha } = rgbToHex(raw);
        if (alpha === 0) continue;
        if (hex === "#000000" && p === "fill") continue;
        const key = hex + "|" + alpha;
        bump(map, key, { hex, alpha, css: raw });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 80);
  }
  function collectTypography() {
    const map = /* @__PURE__ */ new Map();
    for (const el of elements()) {
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasText) continue;
      const cs = getComputedStyle(el);
      const family = (cs.fontFamily || "").split(",")[0].replace(/["']/g, "").trim();
      const size = cs.fontSize;
      const weight = cs.fontWeight;
      const key = `${family}|${size}|${weight}`;
      const sample = el.textContent.trim().slice(0, 40);
      const e = map.get(key);
      if (e) e.count++;
      else map.set(key, { family, size, weight, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, sample, count: 1 });
    }
    return [...map.values()].sort((a, b) => parseFloat(b.size) - parseFloat(a.size) || b.count - a.count).slice(0, 60);
  }
  function collectSvgs() {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const svg of document.querySelectorAll("svg")) {
      if (isOurs(svg)) continue;
      let markup = svg.outerHTML;
      if (!/xmlns=/.test(markup)) markup = markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      const key = markup.slice(0, 400);
      if (seen.has(key) || markup.length > 4e4) continue;
      seen.add(key);
      const r = svg.getBoundingClientRect();
      out.push({ type: "inline", markup, w: Math.round(r.width), h: Math.round(r.height) });
      if (out.length > 120) break;
    }
    for (const img of document.querySelectorAll('img[src$=".svg"], img[src*=".svg?"]')) {
      if (isOurs(img) || seen.has(img.src)) continue;
      seen.add(img.src);
      out.push({ type: "url", src: img.src, markup: "" });
    }
    return out;
  }
  function collectImages() {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const add = (src) => {
      if (!src || seen.has(src) || src.endsWith(".svg") || src.startsWith("data:image/svg")) return;
      seen.add(src);
      out.push({ src });
    };
    for (const img of document.querySelectorAll("img")) {
      if (isOurs(img)) continue;
      if (img.currentSrc || img.src) add(img.currentSrc || img.src);
    }
    for (const el of elements()) {
      const bg = getComputedStyle(el).backgroundImage;
      if (!bg || bg === "none") continue;
      let m;
      const re = /url\((['"]?)([^'")]+)\1\)/g;
      while (m = re.exec(bg)) add(new URL(m[2], location.href).href);
      if (out.length > 120) break;
    }
    return out;
  }
  function collectAll() {
    return {
      colors: collectColors(),
      typography: collectTypography(),
      svgs: collectSvgs(),
      images: collectImages()
    };
  }

  // src/icons/index.js
  var icons = { "align-bottom": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="align-bottom">\n<path id="Vector" d="M11.0013 6.6682C11.5638 6.6682 12.2132 6.61263 12.534 7.1682C12.668 7.40027 12.668 7.7118 12.668 8.33487V9.00153C12.668 9.6246 12.668 9.93613 12.534 10.1682C12.2132 10.7238 11.5638 10.6682 11.0013 10.6682C10.4387 10.6682 9.78937 10.7238 9.46857 10.1682C9.33464 9.93613 9.33464 9.6246 9.33464 9.00153V8.33487C9.33464 7.7118 9.33464 7.40027 9.46857 7.1682C9.78937 6.61263 10.4387 6.6682 11.0013 6.6682Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M5.0013 2.66821C5.5639 2.66821 6.21323 2.61263 6.534 3.16821C6.668 3.40026 6.668 3.7118 6.668 4.33488V9.00153C6.668 9.6246 6.668 9.93613 6.534 10.1682C6.21323 10.7238 5.5639 10.6682 5.0013 10.6682C4.43871 10.6682 3.78938 10.7238 3.46862 10.1682C3.33464 9.93613 3.33464 9.6246 3.33464 9.00153V4.33488C3.33464 3.7118 3.33464 3.40026 3.46862 3.16821C3.78938 2.61263 4.43871 2.66821 5.0013 2.66821Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M14.6667 13.3333H1.33333" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "align-horizontal-center": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="align-horizontal-center">\n<path id="Vector" d="M8 12.6667V14.6667" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M8 6.66667V9.33333" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M8 1.33333V3.33333" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_4" d="M5.33358 5C5.33358 4.43741 5.278 3.78807 5.83358 3.46731C6.06563 3.33333 6.37717 3.33333 7.00027 3.33333H9.00027C9.62334 3.33333 9.93487 3.33333 10.1669 3.46731C10.7225 3.78807 10.6669 4.43741 10.6669 5C10.6669 5.56259 10.7225 6.21193 10.1669 6.53269C9.93487 6.66667 9.62334 6.66667 9.00027 6.66667H7.00027C6.37717 6.66667 6.06563 6.66667 5.83358 6.53269C5.278 6.21193 5.33358 5.56259 5.33358 5Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_5" d="M2.66691 11C2.66691 10.4374 2.61133 9.78807 3.16691 9.46733C3.39896 9.33333 3.7105 9.33333 4.33358 9.33333H11.6669C12.29 9.33333 12.6015 9.33333 12.8336 9.46733C13.3891 9.78807 13.3336 10.4374 13.3336 11C13.3336 11.5626 13.3891 12.2119 12.8336 12.5327C12.6015 12.6667 12.29 12.6667 11.6669 12.6667H4.33358C3.7105 12.6667 3.39896 12.6667 3.16691 12.5327C2.61133 12.2119 2.66691 11.5626 2.66691 11Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "align-left": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="align-left">\n<path id="Vector" d="M5.33488 5C5.33488 4.43741 5.2793 3.78807 5.83488 3.46731C6.06693 3.33333 6.37847 3.33333 7.00153 3.33333H7.6682C8.29127 3.33333 8.6028 3.33333 8.83487 3.46731C9.39047 3.78807 9.33487 4.43741 9.33487 5C9.33487 5.56259 9.39047 6.21193 8.83487 6.53269C8.6028 6.66667 8.29127 6.66667 7.6682 6.66667H7.00153C6.37847 6.66667 6.06693 6.66667 5.83488 6.53269C5.2793 6.21193 5.33488 5.56259 5.33488 5Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M5.33488 11C5.33488 10.4374 5.2793 9.78807 5.83488 9.46733C6.06693 9.33333 6.37847 9.33333 7.00153 9.33333H11.6682C12.2913 9.33333 12.6028 9.33333 12.8349 9.46733C13.3905 9.78807 13.3349 10.4374 13.3349 11C13.3349 11.5626 13.3905 12.2119 12.8349 12.5327C12.6028 12.6667 12.2913 12.6667 11.6682 12.6667H7.00153C6.37847 12.6667 6.06693 12.6667 5.83488 12.5327C5.2793 12.2119 5.33488 11.5626 5.33488 11Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M2.66667 1.33333V14.6667" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "align-right": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="align-right">\n<path id="Vector" d="M6.66691 5C6.66691 4.43741 6.6113 3.78807 7.16691 3.46731C7.39891 3.33333 7.71044 3.33333 8.33358 3.33333H9.00024C9.62331 3.33333 9.93485 3.33333 10.1669 3.46731C10.7224 3.78807 10.6669 4.43741 10.6669 5C10.6669 5.56259 10.7224 6.21193 10.1669 6.53269C9.93485 6.66667 9.62331 6.66667 9.00024 6.66667H8.33358C7.71044 6.66667 7.39891 6.66667 7.16691 6.53269C6.6113 6.21193 6.66691 5.56259 6.66691 5Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M2.66691 11C2.66691 10.4374 2.61133 9.78807 3.16691 9.46733C3.39896 9.33333 3.7105 9.33333 4.33358 9.33333H9.00027C9.62334 9.33333 9.93487 9.33333 10.1669 9.46733C10.7225 9.78807 10.6669 10.4374 10.6669 11C10.6669 11.5626 10.7225 12.2119 10.1669 12.5327C9.93487 12.6667 9.62334 12.6667 9.00027 12.6667H4.33358C3.7105 12.6667 3.39896 12.6667 3.16691 12.5327C2.61133 12.2119 2.66691 11.5626 2.66691 11Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M13.3333 1.33333V14.6667" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "align-top": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="align-top">\n<path id="Vector" d="M11.0013 5.33325C11.5638 5.33325 12.2132 5.27766 12.534 5.83325C12.668 6.0653 12.668 6.37684 12.668 6.99993V7.6666C12.668 8.28966 12.668 8.6012 12.534 8.83326C12.2132 9.3888 11.5638 9.33326 11.0013 9.33326C10.4387 9.33326 9.78937 9.3888 9.46857 8.83326C9.33464 8.6012 9.33464 8.28966 9.33464 7.6666V6.99993C9.33464 6.37684 9.33464 6.0653 9.46857 5.83325C9.78937 5.27766 10.4387 5.33325 11.0013 5.33325Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M5.0013 5.33325C5.5639 5.33325 6.21323 5.27766 6.534 5.83325C6.668 6.0653 6.668 6.37684 6.668 6.99993V11.6666C6.668 12.2897 6.668 12.6012 6.534 12.8333C6.21323 13.3888 5.5639 13.3333 5.0013 13.3333C4.43871 13.3333 3.78938 13.3888 3.46862 12.8333C3.33464 12.6012 3.33464 12.2897 3.33464 11.6666V6.99993C3.33464 6.37684 3.33464 6.0653 3.46862 5.83325C3.78938 5.27766 4.43871 5.33325 5.0013 5.33325Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M14.6667 2.66667H1.33333" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "align-vertical-center": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="align-vertical-center">\n<path id="Vector" d="M11 5.33488C11.5626 5.33488 12.2119 5.2793 12.5327 5.83488C12.6667 6.06693 12.6667 6.37847 12.6667 7.00153V9.00153C12.6667 9.6246 12.6667 9.93613 12.5327 10.1682C12.2119 10.7238 11.5626 10.6682 11 10.6682C10.4374 10.6682 9.78807 10.7238 9.46733 10.1682C9.33333 9.93613 9.33333 9.6246 9.33333 9.00153V7.00153C9.33333 6.37847 9.33333 6.06693 9.46733 5.83488C9.78807 5.2793 10.4374 5.33488 11 5.33488Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M5 2.66821C5.56259 2.66821 6.21193 2.61263 6.53269 3.16821C6.66667 3.40026 6.66667 3.7118 6.66667 4.33488V11.6682C6.66667 12.2913 6.66667 12.6028 6.53269 12.8349C6.21193 13.3905 5.56259 13.3349 5 13.3349C4.43741 13.3349 3.78807 13.3905 3.46731 12.8349C3.33333 12.6028 3.33333 12.2913 3.33333 11.6682V4.33488C3.33333 3.7118 3.33333 3.40026 3.46731 3.16821C3.78807 2.61263 4.43741 2.66821 5 2.66821Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M3.33333 8H1.33333" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_4" d="M9.33333 8H6.66667" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_5" d="M14.6667 8H12.6667" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "cancel-01": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="cancel-01">\n<path id="Vector" d="M18 6L6.00081 17.9992M17.9992 18L6 6.00085" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "chevron-down": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="chevron-down">\n<path id="Vector" d="M12 6.00003C12 6.00003 9.05407 10 8 10C6.94587 10 4 6 4 6" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "component": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="component">\n<path id="Vector" d="M9.19671 6.83999C9.33456 7.11818 9.59244 7.37605 10.1082 7.89181C10.6239 8.40756 10.8818 8.66544 11.16 8.80329C11.6893 9.06557 12.3107 9.06557 12.84 8.80329C13.1182 8.66544 13.3761 8.40756 13.8918 7.89181C14.4076 7.37605 14.6654 7.11818 14.8033 6.83999C15.0656 6.31071 15.0656 5.68929 14.8033 5.16001C14.6654 4.88182 14.4076 4.62395 13.8918 4.10819C13.3761 3.59244 13.1182 3.33456 12.84 3.19671C12.3107 2.93443 11.6893 2.93443 11.16 3.19671C10.8818 3.33456 10.6239 3.59244 10.1082 4.10819C9.59244 4.62395 9.33456 4.88182 9.19671 5.16001C8.93443 5.68929 8.93443 6.31071 9.19671 6.83999Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>\n<path id="Vector_2" d="M3.19671 12.84C3.33456 13.1182 3.59244 13.3761 4.10819 13.8918C4.62395 14.4076 4.88182 14.6654 5.16001 14.8033C5.68929 15.0656 6.31071 15.0656 6.83999 14.8033C7.11818 14.6654 7.37605 14.4076 7.89181 13.8918C8.40756 13.3761 8.66544 13.1182 8.80329 12.84C9.06557 12.3107 9.06557 11.6893 8.80329 11.16C8.66544 10.8818 8.40756 10.6239 7.89181 10.1082C7.37605 9.59244 7.11818 9.33456 6.83999 9.19671C6.31071 8.93443 5.68929 8.93443 5.16001 9.19671C4.88182 9.33456 4.62395 9.59244 4.10819 10.1082C3.59244 10.6239 3.33456 10.8818 3.19671 11.16C2.93443 11.6893 2.93443 12.3107 3.19671 12.84Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>\n<path id="Vector_3" d="M15.1967 12.84C15.3346 13.1182 15.5924 13.3761 16.1082 13.8918C16.6239 14.4076 16.8818 14.6654 17.16 14.8033C17.6893 15.0656 18.3107 15.0656 18.84 14.8033C19.1182 14.6654 19.3761 14.4076 19.8918 13.8918C20.4076 13.3761 20.6654 13.1182 20.8033 12.84C21.0656 12.3107 21.0656 11.6893 20.8033 11.16C20.6654 10.8818 20.4076 10.6239 19.8918 10.1082C19.3761 9.59244 19.1182 9.33456 18.84 9.19671C18.3107 8.93443 17.6893 8.93443 17.16 9.19671C16.8818 9.33456 16.6239 9.59244 16.1082 10.1082C15.5924 10.6239 15.3346 10.8818 15.1967 11.16C14.9344 11.6893 14.9344 12.3107 15.1967 12.84Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>\n<path id="Vector_4" d="M9.19671 18.84C9.33456 19.1182 9.59244 19.3761 10.1082 19.8918C10.6239 20.4076 10.8818 20.6654 11.16 20.8033C11.6893 21.0656 12.3107 21.0656 12.84 20.8033C13.1182 20.6654 13.3761 20.4076 13.8918 19.8918C14.4076 19.3761 14.6654 19.1182 14.8033 18.84C15.0656 18.3107 15.0656 17.6893 14.8033 17.16C14.6654 16.8818 14.4076 16.6239 13.8918 16.1082C13.3761 15.5924 13.1182 15.3346 12.84 15.1967C12.3107 14.9344 11.6893 14.9344 11.16 15.1967C10.8818 15.3346 10.6239 15.5924 10.1082 16.1082C9.59244 16.6239 9.33456 16.8818 9.19671 17.16C8.93443 17.6893 8.93443 18.3107 9.19671 18.84Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>\n</g>\n</svg>', "delete02": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="delete-02">\n<path id="Vector" d="M13 3.66667L12.5869 10.3501C12.4813 12.0576 12.4285 12.9114 12.0005 13.5253C11.7889 13.8287 11.5165 14.0849 11.2005 14.2773C10.5614 14.6667 9.706 14.6667 7.99513 14.6667C6.28208 14.6667 5.42553 14.6667 4.78603 14.2766C4.46987 14.0838 4.19733 13.8272 3.98579 13.5232C3.55792 12.9084 3.5063 12.0534 3.40307 10.3435L3 3.66667" stroke="currentColor" stroke-linecap="round"/>\n<path id="Vector_2" d="M2 3.66667H14M10.7038 3.66667L10.2487 2.72782C9.9464 2.10417 9.7952 1.79235 9.53447 1.59787C9.47667 1.55473 9.4154 1.51636 9.35133 1.48313C9.0626 1.33333 8.71607 1.33333 8.023 1.33333C7.31253 1.33333 6.95733 1.33333 6.66379 1.48941C6.59873 1.52401 6.53665 1.56393 6.47819 1.60878C6.21443 1.81113 6.06709 2.13437 5.77241 2.78084L5.36861 3.66667" stroke="currentColor" stroke-linecap="round"/>\n<path id="Vector_3" d="M6.33333 11V7" stroke="currentColor" stroke-linecap="round"/>\n<path id="Vector_4" d="M9.66667 11V7" stroke="currentColor" stroke-linecap="round"/>\n</g>\n</svg>', "expand-paragraph": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="expand-paragraph">\n<path id="Vector" d="M5.33333 4.66665C5.33333 4.66665 3.86035 2.66667 3.33332 2.66667C2.80628 2.66666 1.33333 4.66667 1.33333 4.66667" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M8 8H14.6667M8 5.33333H14.6667M8 10.6667H11.3333" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M1.33333 11.3333C1.33333 11.3333 2.80631 13.3333 3.33335 13.3333C3.86039 13.3333 5.33333 11.3333 5.33333 11.3333" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_4" d="M3.33333 3.33333V12.6667" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "file-diff": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="file-diff">\n<path id="Vector" d="M5.9925 12V18M9 14.9925H3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M3 22H9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M13 22C16.7712 22 18.6569 22 19.8284 20.8284C21 19.6569 21 17.7712 21 14V10.6569C21 9.83935 21 9.4306 20.8478 9.06306C20.6955 8.69552 20.4065 8.40649 19.8284 7.82843L15.0919 3.09188C14.593 2.593 14.3436 2.34355 14.0345 2.19575C13.9702 2.165 13.9044 2.13772 13.8372 2.11401C13.5141 2 13.1614 2 12.4558 2C9.21082 2 7.58831 2 6.48933 2.88607C6.26732 3.06508 6.06508 3.26731 5.88608 3.48933C5.14374 4.41003 5.02332 5.69818 5.00378 8M14 2.5V3C14 5.82843 14 7.24264 14.8787 8.12132C15.7574 9 17.1716 9 20 9H20.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "full-screen": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="full-screen">\n<path id="Vector" d="M10.3334 14C11.2638 14 11.7289 14 12.1074 13.8852C12.9597 13.6267 13.6267 12.9597 13.8852 12.1074C14 11.7289 14 11.2637 14 10.3333M14 5.66667C14 4.73629 14 4.27111 13.8852 3.89257C13.6267 3.04031 12.9597 2.37336 12.1074 2.11483C11.7289 2 11.2638 2 10.3334 2M5.66671 14C4.73633 14 4.27115 14 3.89261 13.8852C3.04035 13.6267 2.3734 12.9597 2.11487 12.1074C2.00004 11.7289 2.00004 11.2637 2.00004 10.3333M2.00004 5.66667C2.00004 4.73629 2.00004 4.27111 2.11487 3.89257C2.3734 3.04031 3.04035 2.37336 3.89261 2.11483C4.27115 2 4.73633 2 5.66671 2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "horizontal-resize": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="horizontal-resize">\n<path id="Vector" d="M6.66667 13.3333V2.66667" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M9.33333 13.3333V2.66667" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M6.66667 8H4" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_4" d="M1.33345 8.0336C1.31307 7.34313 4.00563 5.71958 4.25924 6.04183C4.54682 6.40726 3.85924 7.49313 3.70438 7.83893C3.61124 8.04687 3.61379 8.13707 3.71969 8.3448C4.19783 9.28273 4.4369 9.75167 4.29063 9.955L4.28932 9.9568C4.05365 10.2798 1.35334 8.7074 1.33345 8.0336Z" stroke="currentColor"/>\n<path id="Vector_5" d="M14.6666 7.9664C14.687 8.65687 11.9944 10.2804 11.7408 9.9582C11.4532 9.59273 12.1408 8.5068 12.2956 8.16107C12.3888 7.95313 12.3862 7.86293 12.2804 7.6552C11.8022 6.71727 11.5631 6.24834 11.7094 6.04501L11.7107 6.04319C11.9464 5.72023 14.6467 7.2926 14.6666 7.9664Z" stroke="currentColor"/>\n<path id="Vector_6" d="M12 8H9.33333" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "html-file-01": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="html-file-01">\n<path id="Vector" d="M19.5 14V10.6569C19.5 9.83935 19.5 9.4306 19.3478 9.06306C19.1955 8.69552 18.9065 8.40649 18.3284 7.82843L13.5919 3.09188C13.093 2.593 12.8436 2.34355 12.5345 2.19575C12.4702 2.165 12.4044 2.13772 12.3372 2.11401C12.0141 2 11.6614 2 10.9558 2C7.71082 2 6.08831 2 4.98933 2.88607C4.76731 3.06508 4.56508 3.26731 4.38607 3.48933C3.5 4.58831 3.5 6.21082 3.5 9.45584V14M12.5 2.5V3C12.5 5.82843 12.5 7.24264 13.3787 8.12132C14.2574 9 15.6716 9 18.5 9H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M5.5 17V19.5M5.5 19.5V22M5.5 19.5H2.5M2.5 19.5V17M2.5 19.5V22M9 17V22M9 17H7.5M9 17H10.5M12.5 22V17L14.5 19.5L16.5 17V22M19 17V22H21.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "image-flip-horizontal": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="image-flip -horizontal">\n<path id="Vector" d="M3.60595 7.02987L2.22329 9.64513C1.51345 10.9877 1.15854 11.6591 1.42115 12.1635C1.68375 12.668 2.38814 12.668 3.79691 12.668H5.17957C6.03836 12.668 6.46775 12.668 6.73457 12.3736C7.00137 12.0793 7.00137 11.6055 7.00137 10.6579V8.04267C7.00137 5.05139 7.00137 3.55575 6.32818 3.35495C5.65501 3.15416 4.97199 4.44606 3.60595 7.02987Z" stroke="currentColor" stroke-linejoin="round"/>\n<path id="Vector_2" d="M12.3954 7.02987L13.7781 9.64513C14.4879 10.9877 14.8428 11.6591 14.5802 12.1635C14.3176 12.668 13.6132 12.668 12.2045 12.668H10.8218C9.96304 12.668 9.53364 12.668 9.26684 12.3736C9.00004 12.0793 9.00004 11.6055 9.00004 10.6579V8.04267C9.00004 5.05139 9.00004 3.55575 9.67317 3.35495C10.3464 3.15416 11.0294 4.44606 12.3954 7.02987Z" stroke="currentColor" stroke-linejoin="round"/>\n</g>\n</svg>', "image-flip-vertical": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="image-flip-vertical">\n<path id="Vector" d="M8.97151 3.60461L6.35624 2.22195C5.01361 1.51211 4.3423 1.15719 3.83783 1.41981C3.33337 1.68241 3.33337 2.38679 3.33337 3.79556V5.17823C3.33337 6.03702 3.33337 6.46641 3.62774 6.7332C3.92211 7 4.39588 7 5.34343 7H7.95864C10.95 7 12.4456 7 12.6464 6.32683C12.8472 5.65367 11.5553 4.97065 8.97151 3.60461Z" stroke="currentColor" stroke-linejoin="round"/>\n<path id="Vector_2" d="M8.97151 12.3954L6.35624 13.7781C5.01361 14.4879 4.3423 14.8428 3.83783 14.5802C3.33337 14.3176 3.33337 13.6132 3.33337 12.2045V10.8218C3.33337 9.963 3.33337 9.5336 3.62774 9.2668C3.92211 9 4.39588 9 5.34343 9H7.95864C10.95 9 12.4456 9 12.6464 9.67313C12.8472 10.3463 11.5553 11.0293 8.97151 12.3954Z" stroke="currentColor" stroke-linejoin="round"/>\n</g>\n</svg>', "laptop-phone-sync": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="laptop-phone-sync">\n<path id="Vector" d="M15.9999 13.5001V17.5001C15.9999 18.9143 15.9999 19.6214 16.4392 20.0608C16.8786 20.5001 17.5857 20.5001 18.9999 20.5001C20.4141 20.5001 21.1212 20.5001 21.5605 20.0608C21.9999 19.6214 21.9999 18.9143 21.9999 17.5001V13.5001C21.9999 12.0859 21.9999 11.3788 21.5605 10.9395C21.1212 10.5001 20.4141 10.5001 18.9999 10.5001C17.5857 10.5001 16.8786 10.5001 16.4392 10.9395C15.9999 11.3788 15.9999 12.0859 15.9999 13.5001Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M3.99988 16.5005V8.50049C3.99988 6.14347 3.99988 4.96495 4.73254 4.23272C5.46521 3.50049 6.64442 3.50049 9.00283 3.50049H16.007C18.3654 3.50049 19.5446 3.50049 20.2773 4.23272C20.8346 4.78969 20.9679 5.60486 20.9999 7.00049" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M12.9999 20.5005H2.51567C2.13273 20.5005 1.88367 20.1093 2.05493 19.7769L3.99988 16.5005H12.9999" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "layer-bring-forward": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="layer-bring-forward">\n<path id="Vector" d="M15.8899 11.5L19.2873 13.0606C21.0958 13.8914 22 14.3067 22 15C22 15.6933 21.0958 16.1086 19.2873 16.9394L14.3943 19.187C13.2144 19.729 12.6245 20 12 20C11.3755 20 10.7856 19.729 9.60573 19.187L4.7127 16.9394C2.90423 16.1086 2 15.6933 2 15C2 14.3067 2.90423 13.8914 4.7127 13.0606L8.11012 11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M12 4.5V15M15 7C14.4102 6.39316 12.8403 4 12 4C11.1597 4 9.58984 6.39316 9 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "layer-send-backward": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="layer-send-backward">\n<path id="Vector" d="M15.8899 12.5L19.2873 10.9394C21.0958 10.1086 22 9.69326 22 9C22 8.30674 21.0958 7.89137 19.2873 7.06064L14.3943 4.81298C13.2144 4.27099 12.6245 4 12 4C11.3755 4 10.7856 4.27099 9.60573 4.81298L4.7127 7.06064C2.90423 7.89137 2 8.30674 2 9C2 9.69326 2.90423 10.1086 4.7127 10.9394L8.11012 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M12 19.5V9M15 17C14.4102 17.6068 12.8403 20 12 20C11.1597 20 9.58984 17.6068 9 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "letter-spacing": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="letter-spacing">\n<path id="Vector" d="M1.33333 14.6667V1.33333" stroke="currentColor" stroke-linecap="round"/>\n<path id="Vector_2" d="M14.6667 14.6667V1.33333" stroke="currentColor" stroke-linecap="round"/>\n<path id="Vector_3" d="M4.66667 12L7.10227 4.9909C7.29647 4.54186 7.65853 3.99771 7.96447 4.00001C8.41753 4.00341 8.65513 4.47172 8.91827 4.9909C9.1814 5.51009 11.3333 12 11.3333 12M6.00875 8.6608L9.92967 8.61953" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "line2": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 286 1" fill="none" xmlns="http://www.w3.org/2000/svg">\n<line id="Line 2" y1="0.5" x2="286" y2="0.5" stroke="#232323"/>\n</svg>', "minimize-screen": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="minimize-screen">\n<path id="Vector" d="M7.6222 10.7106L5.79413 10.6439C5.52243 10.634 5.30729 10.4109 5.30729 10.1389V8.39575M8.97393 7.04395L5.61144 10.3895" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M14.6667 4.66667C14.6667 5.92373 14.6667 6.55227 14.2761 6.9428C13.8856 7.33333 13.2571 7.33333 12 7.33333H11.3333C10.0763 7.33333 9.44773 7.33333 9.0572 6.9428C8.66667 6.55227 8.66667 5.92373 8.66667 4.66667V4C8.66667 2.74293 8.66667 2.1144 9.0572 1.72387C9.44773 1.33333 10.0763 1.33333 11.3333 1.33333H12C13.2571 1.33333 13.8856 1.33333 14.2761 1.72387C14.6667 2.1144 14.6667 2.74293 14.6667 4V4.66667Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M14.6667 10.3333V9M6.66667 14.6667H9.33333M1.33333 6.66667V9.33333M7 1.33333H5.66667M14.6267 12.3333C14.5241 13.0437 14.3243 13.5473 13.9358 13.9359C13.5473 14.3243 13.0437 14.5241 12.3333 14.6267M3.66667 14.6267C2.95627 14.5241 2.45267 14.3243 2.0642 13.9358C1.67567 13.5473 1.47593 13.0437 1.37327 12.3333M1.37327 3.66667C1.47593 2.95627 1.67567 2.45267 2.0642 2.0642C2.45267 1.67567 2.95627 1.47593 3.66667 1.37327" stroke="currentColor" stroke-linecap="round"/>\n</g>\n</svg>', "paragraph-spacing": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="paragraph-spacing">\n<path id="Vector" d="M2 1.33333H14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M2 14.6667H14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M6.3151 5.67251L7.5158 4.24963C7.7616 3.95528 8.1784 3.95274 8.4488 4.24963L9.63526 5.67251M7.98226 4.72295V7.60526L7.98126 11.3329M9.64846 10.3833L8.44773 11.8062C8.20193 12.1005 7.78513 12.1031 7.51473 11.8062L6.32826 10.3833" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "pause": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="pause">\n<path id="Vector" d="M4 7C4 5.58579 4 4.87868 4.43934 4.43934C4.87868 4 5.58579 4 7 4C8.41421 4 9.12132 4 9.56066 4.43934C10 4.87868 10 5.58579 10 7V17C10 18.4142 10 19.1213 9.56066 19.5607C9.12132 20 8.41421 20 7 20C5.58579 20 4.87868 20 4.43934 19.5607C4 19.1213 4 18.4142 4 17V7Z" stroke="currentColor" stroke-width="1.5"/>\n<path id="Vector_2" d="M14 7C14 5.58579 14 4.87868 14.4393 4.43934C14.8787 4 15.5858 4 17 4C18.4142 4 19.1213 4 19.5607 4.43934C20 4.87868 20 5.58579 20 7V17C20 18.4142 20 19.1213 19.5607 19.5607C19.1213 20 18.4142 20 17 20C15.5858 20 14.8787 20 14.4393 19.5607C14 19.1213 14 18.4142 14 17V7Z" stroke="currentColor" stroke-width="1.5"/>\n</g>\n</svg>', "plus": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="plus">\n<path id="Vector" d="M7.99478 2.66675V13.3334M13.3281 8.00007H2.66146" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "redo-01": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="redo-01">\n<path id="Vector" d="M20.9922 8H8.99219C5.67848 8 2.99219 10.6863 2.99219 14C2.99219 17.3137 5.67848 20 8.99219 20H12.9922" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M16.9922 4L18.146 4.87652C20.0435 6.31801 20.9922 7.03875 20.9922 8C20.9922 8.96125 20.0435 9.68199 18.146 11.1235L16.9922 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "rotate01": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="rotate-01">\n<path id="Vector" d="M13.3394 1.33333V3.42146C13.3394 3.61737 13.0945 3.70605 12.9691 3.55555C11.7484 2.19167 9.97443 1.33333 7.99996 1.33333C4.31806 1.33333 1.33329 4.3181 1.33329 8C1.33329 11.6819 4.31806 14.6667 7.99996 14.6667C11.6818 14.6667 14.6666 11.6819 14.6666 8" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "text-align-center": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="text-align-center">\n<path id="Vector" d="M2 2H14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M5.33333 6H10.6667" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M2 10H14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_4" d="M5.33333 14H10.6667" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "text-align-justify": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="text-align-justify">\n<path id="Vector" d="M2 2H14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M2 6H14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M2 10H14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_4" d="M2 14H14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "text-align-right": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="text-align-right">\n<path id="Vector" d="M2 2H14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M8.66667 6H14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M2 10H14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_4" d="M8.66667 14H14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "text-align-start": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="text-align-start">\n<path id="Vector" d="M2 2H14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M2 6H7.33333" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M2 10H14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_4" d="M2 14H7.33333" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "transparency": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="transparency">\n<path id="Vector" d="M10.6667 6C10.6667 8.57733 8.57733 10.6667 6 10.6667C3.42267 10.6667 1.33333 8.57733 1.33333 6C1.33333 3.42267 3.42267 1.33333 6 1.33333C8.57733 1.33333 10.6667 3.42267 10.6667 6Z" stroke="currentColor"/>\n<path id="Vector_2" d="M5.35062 10.4045C5.33917 10.2711 5.33333 10.1363 5.33333 10C5.33333 7.42267 7.42267 5.33333 10 5.33333C10.1911 5.33333 10.3795 5.34482 10.5646 5.36714M12.6646 6.16834C13.8747 7.01147 14.6667 8.41327 14.6667 10C14.6667 12.5773 12.5773 14.6667 10 14.6667C8.41327 14.6667 7.01147 13.8747 6.16834 12.6646" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M4.33333 1.66667L10.3333 7.66667M1.66667 4.33333L7.66667 10.3333" stroke="currentColor"/>\n</g>\n</svg>', "undo-03": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="undo-03">\n<path id="Vector" d="M3 8H15C18.3137 8 21 10.6863 21 14C21 17.3137 18.3137 20 15 20H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M7 4L5.8462 4.87652C3.94873 6.31801 3 7.03875 3 8C3 8.96125 3.94873 9.68199 5.8462 11.1235L7 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "vector": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="9.00007" height="5.00003" viewBox="0 0 9.00007 5.00003" fill="none" xmlns="http://www.w3.org/2000/svg">\n<path id="Vector" d="M8.50003 0.500066C8.50003 0.500066 5.5541 4.50003 4.50003 4.50003C3.4459 4.50003 0.500033 0.500033 0.500033 0.500033" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</svg>', "vertical-resize": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="vertical-resize">\n<path id="Vector" d="M2.66667 6.66667H13.3333" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_2" d="M2.66667 9.33333H13.3333" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_3" d="M8 6.66667V4" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n<path id="Vector_4" d="M7.9664 1.33345C8.65687 1.31307 10.2804 4.00563 9.9582 4.25924C9.59273 4.54682 8.5068 3.85924 8.16107 3.70438C7.95313 3.61124 7.86293 3.61379 7.6552 3.71969C6.71727 4.19783 6.24834 4.4369 6.04501 4.29063L6.04319 4.28932C5.72023 4.05365 7.2926 1.35334 7.9664 1.33345Z" stroke="currentColor"/>\n<path id="Vector_5" d="M8.0336 14.6665C7.34313 14.6869 5.71958 11.9944 6.04183 11.7408C6.40726 11.4532 7.49313 12.1407 7.83893 12.2956C8.04687 12.3887 8.13707 12.3862 8.3448 12.2803C9.28273 11.8022 9.75167 11.5631 9.955 11.7093L9.9568 11.7107C10.2798 11.9463 8.7074 14.6467 8.0336 14.6665Z" stroke="currentColor"/>\n<path id="Vector_6" d="M8 12V9.33333" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>', "x": '<svg preserveAspectRatio="xMidYMid meet" overflow="visible" style="display: block;" width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n<g id="x">\n<path id="Vector" d="M12 4L8 8M8 8L4 12M8 8L12 12M8 8L4 4" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>\n</g>\n</svg>' };
  function icon(name) {
    return icons[name] || "";
  }

  // src/ui/components.js
  function ico(name) {
    return h("span", { class: "fic", html: icon(name) });
  }
  function chevMini() {
    return h("span", { class: "chev-mini", html: icon("chevron-down") });
  }
  function field({ key, iconName, value, unit = "px", onChange, showUnit = true, sm = false }) {
    const parsed = parseLength(value);
    const hadUnit = /[a-z%]/i.test(String(value != null ? value : ""));
    const input = h("input", { value: parsed.value, type: "text", inputmode: "decimal" });
    const unitEl = showUnit ? h("span", { class: "unit", text: hadUnit ? parsed.unit : unit }) : null;
    const commit = () => {
      const raw = input.value.trim();
      if (raw === "") return onChange("");
      const numeric = /^-?[\d.]+$/.test(raw);
      onChange(numeric && showUnit ? raw + ((unitEl == null ? void 0 : unitEl.textContent) || unit) : raw);
    };
    input.addEventListener("change", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") return input.blur();
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const cur = parseFloat(input.value) || 0;
        input.value = +(cur + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1)).toFixed(2);
        commit();
        e.preventDefault();
      }
    });
    if (showUnit && unitEl) {
      const units = ["px", "%", "em", "rem", "vw", "vh"];
      unitEl.style.cursor = "pointer";
      unitEl.addEventListener("click", () => {
        unitEl.textContent = units[(units.indexOf(unitEl.textContent) + 1) % units.length];
        commit();
      });
    }
    return h("div", { class: "field" + (sm ? " sm" : "") }, [
      iconName ? ico(iconName) : key ? h("span", { class: "fk", text: key }) : null,
      input,
      unitEl
    ]);
  }
  function selectField({ value, options, onChange, iconName, key, sm = true }) {
    const sel = h("select", {});
    for (const opt of options) {
      const [v, l] = Array.isArray(opt) ? opt : [opt, opt];
      const o = h("option", { value: v, text: l });
      if (String(v) === String(value)) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => onChange(sel.value));
    return h("div", { class: "field select-like" + (sm ? " sm" : "") }, [
      iconName ? ico(iconName) : key ? h("span", { class: "fk", text: key }) : null,
      sel,
      chevMini()
    ]);
  }
  function iconButtons(buttons, { active = -1, grow = false, seg = false, onPick } = {}) {
    const row = h("div", { class: "iconrow" + (grow ? " grow" : "") + (seg ? " seg" : "") });
    buttons.forEach((b, i) => {
      const btn = h("button", {
        class: "ibtn" + (i === active ? " active" : ""),
        title: b.title || "",
        html: icon(b.icon),
        onclick: () => onPick == null ? void 0 : onPick(b, i, btn)
      });
      row.appendChild(btn);
    });
    return row;
  }
  function colorLine(value, onChange, { showPct = true } = {}) {
    const parsed = rgbToHex(value);
    const hex = parsed.hex;
    let alpha = parsed.alpha === 0 ? 1 : parsed.alpha;
    const picker = h("input", { type: "color", value: hex });
    const swatch = h("div", { class: "swatch" }, [picker]);
    swatch.style.background = value && value !== "rgba(0, 0, 0, 0)" ? value : "transparent";
    const hexInput = h("input", { class: "hex", value: hex.replace("#", "") });
    const pct = showPct ? h("span", { class: "pct", text: Math.round(alpha * 100) + "%" }) : null;
    const push = (hx) => {
      const out = hexToRgba(hx, alpha);
      swatch.style.background = out;
      onChange(out);
    };
    picker.addEventListener("input", () => {
      hexInput.value = picker.value.replace("#", "");
      push(picker.value);
    });
    hexInput.addEventListener("change", () => {
      let v = hexInput.value.trim().replace(/^#/, "");
      if (/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) {
        picker.value = "#" + v;
        push("#" + v);
      } else onChange(hexInput.value.trim());
    });
    return h("div", { class: "colorline" }, [swatch, hexInput, pct]);
  }
  function section(title, contentNodes, { open = true } = {}) {
    const content = h("div", { class: "sec-content" }, contentNodes);
    const head = h("div", { class: "sec-head" }, [
      h("span", { text: title }),
      h("span", { class: "chev", html: icon("chevron-down") })
    ]);
    const sec = h("div", { class: "section" + (open ? "" : " closed") }, [head, content]);
    head.addEventListener("click", () => sec.classList.toggle("closed"));
    return sec;
  }
  function labeled(label, node) {
    return h("div", { class: "stack" }, [h("span", { class: "label", text: label }), node]);
  }
  function spacingBox(sides2, onChange) {
    const edge = (kind, side) => {
      const inp = h("input", { class: "sp-edge", value: parseLength(sides2[kind][side]).value });
      inp.addEventListener("change", () => {
        const raw = inp.value.trim();
        onChange(`${kind}-${side}`, /^-?[\d.]+$/.test(raw) ? raw + "px" : raw);
      });
      return inp;
    };
    const box = (kind, cls, label, inner) => h("div", { class: cls }, [
      h("span", { class: "sp-tag", text: label }),
      edge(kind, "top"),
      h("div", { class: "sp-mid" }, [edge(kind, "left"), inner, edge(kind, "right")]),
      edge(kind, "bottom")
    ]);
    const sizeBox = h("div", { class: "sp-size" }, [
      h("span", { class: "sp-tag", text: "Size" }),
      h("span", { html: `${parseLength(sides2.width || "0").value} <span class="sp-x">x</span> ${parseLength(sides2.height || "0").value}` })
    ]);
    const padBox = box("padding", "sp-box sp-padding", "Padding", sizeBox);
    return box("margin", "sp-box sp-margin", "Margin", padBox);
  }

  // src/ui/panel.js
  var Panel = class {
    constructor(root) {
      this.root = root;
      this.el = h("div", { class: "panel", "data-inspect-ui": "" });
      root.appendChild(this.el);
      this._drag();
    }
    set(el) {
      this.selected = el;
      this.render();
    }
    render() {
      const st = store.get();
      this.el.classList.toggle("hidden", st.collapsed);
      this.el.innerHTML = "";
      this.el.append(this._head());
      const body = h("div", { class: "panel-body" });
      if (st.view === "assets") this._assets(body);
      else if (!this.selected) {
        body.append(h("div", { class: "empty", text: "Pick an element on the page to inspect and edit its styles." }));
      } else if (st.view === "code") this._code(body);
      else if (st.view === "html") this._html(body);
      else this._design(body);
      this.el.append(body);
    }
    // ---------------- Header ----------------
    _head() {
      const st = store.get();
      if (st.view === "assets") {
        return h("div", { class: "head" }, [
          h("div", { class: "head-top" }, [
            h("div", { class: "head-title", text: "Assets" }),
            h("div", { class: "head-actions" }, [
              hbtn("minimize-screen", "Collapse panel", () => store.set({ collapsed: true })),
              hbtn("x", "Close", () => {
                var _a;
                return (_a = window.InspectCSS) == null ? void 0 : _a.destroy();
              })
            ])
          ]),
          h("div", { class: "crumb", style: { color: "var(--muted)" }, text: "Everything this page uses" })
        ]);
      }
      const el = this.selected;
      const m = el ? readModel(el) : null;
      const crumb = el ? classChain(el) : [];
      return h("div", { class: "head" }, [
        h("div", { class: "head-top" }, [
          h("div", { class: "head-title", text: el ? elementLabel(el) || m.tag : "InspectCSS" }),
          h("div", { class: "head-actions" }, [
            hbtn("delete02", "Reset all edits", () => {
              clearAll();
              this.render();
            }, "danger"),
            hbtn("minimize-screen", "Collapse panel", () => store.set({ collapsed: true })),
            hbtn("x", "Close", () => {
              var _a;
              return (_a = window.InspectCSS) == null ? void 0 : _a.destroy();
            })
          ])
        ]),
        el ? h("div", { class: "crumb" }, crumb.map((c) => h("span", { text: c }))) : null,
        el ? h("div", { class: "dims" }, [
          h("span", { html: `<b>${round(m.rect.width)}</b> x <b>${round(m.rect.height)}</b> px` }),
          h("span", { html: `A <b>${parseInt(m.typography.fontSize)}px</b>` })
        ]) : h("div", { class: "crumb", text: "no selection" })
      ]);
    }
    // ---------------- Design view ----------------
    _design(body) {
      const el = this.selected;
      const m = readModel(el);
      const on = (prop) => (v) => setProp(el, prop, v);
      const t = m.transform;
      const setT = (patch) => {
        Object.assign(t, patch);
        setProp(el, "transform", composeTransform(t));
      };
      const alignIcons = [
        { icon: "align-left", title: "Align left", css: ["justify-content", "flex-start"] },
        { icon: "align-bottom", title: "Align bottom", css: ["align-items", "flex-end"] },
        { icon: "align-right", title: "Align right", css: ["justify-content", "flex-end"] },
        { icon: "align-top", title: "Align top", css: ["align-items", "flex-start"] },
        { icon: "align-horizontal-center", title: "Center horizontally", css: ["justify-content", "center"] },
        { icon: "align-vertical-center", title: "Center vertically", css: ["align-items", "center"] }
      ];
      body.append(section("Position", [
        labeled("Alignment", iconButtons(alignIcons, { grow: true, seg: true, onPick: (b) => setProp(el, b.css[0], b.css[1]) })),
        labeled("Position", h("div", { class: "row" }, [
          field({ key: "X", value: t.tx + "px", onChange: (v) => setT({ tx: parseFloat(v) || 0 }) }),
          field({ key: "Y", value: t.ty + "px", onChange: (v) => setT({ ty: parseFloat(v) || 0 }) })
        ])),
        labeled("Rotation", h("div", { class: "rot-row" }, [
          field({ iconName: "rotate01", value: t.rotate + "", showUnit: false, onChange: (v) => setT({ rotate: parseFloat(v) || 0 }) }),
          iconButtons([{ icon: "image-flip-horizontal", title: "Flip horizontal" }], { grow: true, onPick: () => flip(el, "x") }),
          iconButtons([{ icon: "image-flip-vertical", title: "Flip vertical" }], { grow: true, onPick: () => flip(el, "y") })
        ]))
      ]));
      body.append(section("Layout", [
        labeled("Size", h("div", { class: "row" }, [
          field({ key: "W", value: m.layout.width, onChange: on("width") }),
          field({ key: "H", value: m.layout.height, onChange: on("height") })
        ])),
        labeled("Display", selectField({
          value: m.layout.display,
          options: ["block", "inline", "inline-block", "flex", "inline-flex", "grid", "none"],
          onChange: on("display")
        })),
        h("div", { class: "row" }, [
          labeled("Row Gap", field({ iconName: "paragraph-spacing", value: m.layout.rowGap, showUnit: false, sm: true, onChange: on("row-gap") })),
          labeled("Column Gap", field({ iconName: "letter-spacing", value: m.layout.columnGap, showUnit: false, sm: true, onChange: on("column-gap") }))
        ]),
        h("div", { class: "row" }, [
          labeled("Horizontal Align", selectField({ value: m.layout.justify, options: [["flex-start", "Start"], ["center", "Center"], ["flex-end", "End"], ["space-between", "Between"]], onChange: on("justify-content") })),
          labeled("Vertical Align", selectField({ value: m.layout.align, options: [["flex-start", "Start"], ["center", "Center"], ["flex-end", "End"], ["stretch", "Stretch"]], onChange: on("align-items") }))
        ])
      ]));
      body.append(section("Spacing", [
        labeled("Padding", h("div", { class: "row" }, [
          field({ iconName: "horizontal-resize", value: m.spacing.padding.left, onChange: (v) => {
            on("padding-left")(v);
            on("padding-right")(v);
          } }),
          field({ iconName: "vertical-resize", value: m.spacing.padding.top, onChange: (v) => {
            on("padding-top")(v);
            on("padding-bottom")(v);
          } })
        ])),
        labeled("Margin", h("div", { class: "row" }, [
          field({ iconName: "horizontal-resize", value: m.spacing.margin.left, onChange: (v) => {
            on("margin-left")(v);
            on("margin-right")(v);
          } }),
          field({ iconName: "vertical-resize", value: m.spacing.margin.top, onChange: (v) => {
            on("margin-top")(v);
            on("margin-bottom")(v);
          } })
        ])),
        spacingBox({ ...m.spacing, width: m.layout.width, height: m.layout.height }, (prop, v) => setProp(el, prop, v))
      ]));
      const corners = [
        { key: "tl", prop: "border-top-left-radius", v: m.radius.tl },
        { key: "tr", prop: "border-top-right-radius", v: m.radius.tr },
        { key: "bl", prop: "border-bottom-left-radius", v: m.radius.bl },
        { key: "br", prop: "border-bottom-right-radius", v: m.radius.br }
      ];
      const mixed = (/* @__PURE__ */ new Set([m.radius.tl, m.radius.tr, m.radius.bl, m.radius.br])).size > 1;
      body.append(section("Appearance", [
        h("div", { class: "row" }, [
          labeled("Opacity", field({ iconName: "transparency", value: String(Math.round((parseFloat(m.effects.opacity) || 1) * 100)), unit: "%", onChange: (v) => on("opacity")((parseFloat(v) || 100) / 100) })),
          labeled("Corner", h("div", { class: "corner-mix" }, [
            field({ iconName: "full-screen", value: mixed ? "mix" : m.radius.all, showUnit: false, onChange: on("border-radius") }),
            iconButtons([{ icon: "full-screen", title: "Link corners" }], { onPick: () => on("border-radius")(m.radius.tl) })
          ]))
        ]),
        h("div", { class: "corner-grid" }, corners.map((c) => field({ iconName: "full-screen", value: c.v, showUnit: false, onChange: on(c.prop) }))),
        addRow("Fill", () => {
          this._fillOpen = !this._fillOpen;
          this.render();
        }),
        this._fillOpen ? colorLine(m.background.color, on("background-color")) : null,
        addRow("Stroke", () => {
          this._strokeOpen = !this._strokeOpen;
          this.render();
        }),
        this._strokeOpen ? colorLine(m.border.color, on("border-color")) : null
      ]));
      body.append(section("Typography", [
        labeled("Typeface", selectField({
          value: firstFont(m.typography.fontFamily),
          options: [firstFont(m.typography.fontFamily), "Quicksand", "Inter", "Arial", "Georgia", "system-ui", "monospace"],
          onChange: on("font-family")
        })),
        h("div", { class: "row" }, [
          selectField({ value: weightName(m.typography.fontWeight), options: [["300", "Light"], ["400", "Regular"], ["500", "Medium"], ["600", "SemiBold"], ["700", "Bold"], ["800", "Extra"]], onChange: on("font-weight") }),
          selectField({ value: parseInt(m.typography.fontSize) + "", options: ["10", "12", "13", "14", "16", "18", "20", "24", "32", "48"].map((x) => [x, x]), onChange: (v) => on("font-size")(v + "px") })
        ]),
        h("div", { class: "row" }, [
          labeled("Line Height", field({ iconName: "paragraph-spacing", value: normalizeLine(m.typography.lineHeight), showUnit: false, sm: true, onChange: on("line-height") })),
          labeled("Letter Spacing", field({ iconName: "letter-spacing", value: m.typography.letterSpacing, showUnit: false, sm: true, onChange: on("letter-spacing") }))
        ]),
        h("div", { class: "row" }, [
          labeled("Paragraph Spacing", field({ iconName: "expand-paragraph", value: parseLenSafe(m.typography.marginBottom), sm: true, onChange: on("margin-bottom") })),
          labeled("Alignment", iconButtons([
            { icon: "text-align-right", title: "Right", css: "right" },
            { icon: "text-align-center", title: "Center", css: "center" },
            { icon: "text-align-start", title: "Left", css: "left" },
            { icon: "text-align-justify", title: "Justify", css: "justify" }
          ], { grow: true, seg: true, active: ["right", "center", "left", "justify"].indexOf(m.typography.textAlign), onPick: (b) => on("text-align")(b.css) }))
        ])
      ]));
    }
    // ---------------- Code view ----------------
    _code(body) {
      const cssText = generateCss();
      body.append(
        h("div", { class: "view-actions" }, [
          h("button", { class: "btn primary", text: "Copy CSS", onclick: () => this._copy() }),
          h("button", { class: "btn", text: "Reset", onclick: () => {
            clearAll();
            this.render();
          } })
        ]),
        cssText ? h("pre", { class: "code", html: highlight(cssText) }) : h("div", { class: "empty", text: "No edits yet. Change a property in the Design view and the generated CSS appears here." })
      );
    }
    _html(body) {
      const el = this.selected;
      if (!el) return body.append(h("div", { class: "empty", text: "No element selected." }));
      const clone = el.cloneNode(false);
      clone.removeAttribute("data-inspect-id");
      body.append(h("pre", { class: "code", html: escapeHtml2(clone.outerHTML.replace(/></, ">\n  \u2026\n<")) }));
    }
    _copy() {
      var _a;
      const text = generateCss();
      if (!text) return;
      (_a = navigator.clipboard) == null ? void 0 : _a.writeText(text).then(() => this._toast("CSS copied"));
    }
    _toast(msg) {
      const t = h("div", { class: "toast", "data-inspect-ui": "", text: msg });
      this.root.appendChild(t);
      setTimeout(() => t.remove(), 1400);
    }
    // ---------------- Assets view ----------------
    _assets(body) {
      const a = this._assetCache || (this._assetCache = collectAll());
      const copy = (text, label) => {
        var _a;
        (_a = navigator.clipboard) == null ? void 0 : _a.writeText(text);
        this._toast(label || "Copied");
      };
      const colorGrid = h("div", { class: "asset-colors" }, a.colors.map((c) => {
        const sw = h("button", {
          class: "asset-swatch",
          title: `${c.hex} \xB7 used ${c.count}\xD7`,
          style: { background: c.css },
          onclick: () => copy(c.hex, c.hex + " copied")
        });
        return sw;
      }));
      const typeList = h("div", { class: "asset-type-list" }, a.typography.map((t) => {
        const row = h("button", {
          class: "asset-type",
          title: "Copy CSS",
          onclick: () => copy(`font-family: ${t.family};
font-size: ${t.size};
font-weight: ${t.weight};`, "Type style copied")
        }, [
          h("div", { class: "asset-type-preview", style: { fontFamily: t.family, fontSize: "min(" + t.size + ", 28px)", fontWeight: t.weight }, text: "Ag" }),
          h("div", { class: "asset-type-meta" }, [
            h("div", { class: "asset-type-name", text: t.family }),
            h("div", { class: "asset-type-sub", text: `${parseInt(t.size)}px \xB7 ${t.weight}` })
          ])
        ]);
        return row;
      }));
      const svgGrid = h("div", { class: "asset-grid" }, a.svgs.map((s) => {
        const thumb = h("div", { class: "asset-thumb asset-svg", title: "Copy SVG" });
        if (s.type === "inline") thumb.innerHTML = s.markup;
        else thumb.appendChild(h("img", { src: s.src, alt: "" }));
        thumb.addEventListener("click", () => copy(s.markup || s.src, "SVG copied"));
        return thumb;
      }));
      const imgGrid = h("div", { class: "asset-grid" }, a.images.map((im) => {
        const thumb = h("div", { class: "asset-thumb", title: "Copy image URL" }, [
          h("img", { src: im.src, alt: "", loading: "lazy" })
        ]);
        thumb.addEventListener("click", () => copy(im.src, "Image URL copied"));
        return thumb;
      }));
      body.append(
        h("div", { class: "view-actions" }, [
          h("button", { class: "btn primary", text: "Rescan page", onclick: () => {
            this._assetCache = null;
            this.render();
          } })
        ]),
        assetSection("Colors", a.colors.length, colorGrid),
        assetSection("Typography", a.typography.length, typeList),
        assetSection("SVGs", a.svgs.length, svgGrid),
        assetSection("Images", a.images.length, imgGrid)
      );
    }
    _drag() {
      let sx, sy, ox, oy, dragging = false;
      this.el.addEventListener("mousedown", (e) => {
        const head = e.target.closest(".head");
        if (!head || e.target.closest(".hbtn")) return;
        dragging = true;
        const r = this.el.getBoundingClientRect();
        sx = e.clientX;
        sy = e.clientY;
        ox = r.left;
        oy = r.top;
        this.el.style.right = "auto";
        document.addEventListener("mousemove", move, true);
        document.addEventListener("mouseup", up, true);
        e.preventDefault();
      });
      const move = (e) => {
        if (!dragging) return;
        this.el.style.left = ox + (e.clientX - sx) + "px";
        this.el.style.top = Math.max(0, oy + (e.clientY - sy)) + "px";
      };
      const up = () => {
        dragging = false;
        document.removeEventListener("mousemove", move, true);
        document.removeEventListener("mouseup", up, true);
      };
    }
  };
  function hbtn(name, title, onClick, extra = "") {
    return h("button", { class: "hbtn" + (extra ? " " + extra : ""), title, onclick: onClick, html: icon(name) });
  }
  function addRow(label, onAdd) {
    return h("div", { class: "addrow" }, [
      h("span", { class: "k", text: label }),
      h("button", { class: "addbtn", title: "Add " + label, html: icon("plus"), onclick: onAdd })
    ]);
  }
  function assetSection(title, count, content) {
    const head = h("div", { class: "sec-head" }, [
      h("span", {}, [title, h("span", { class: "asset-count", text: String(count) })]),
      h("span", { class: "chev", html: icon("chevron-down") })
    ]);
    const sec = h("div", { class: "section" }, [head, h("div", { class: "sec-content" }, [content])]);
    head.addEventListener("click", () => sec.classList.toggle("closed"));
    return sec;
  }
  function classChain(el) {
    const out = [];
    let node = el, depth = 0;
    while (node && node.nodeType === 1 && node !== document.documentElement && depth < 3) {
      if (node.classList.length) out.unshift("." + node.classList[0]);
      else out.unshift(node.tagName.toLowerCase());
      node = node.parentElement;
      depth++;
    }
    return out;
  }
  function flip(el, axis) {
    const cs = getComputedStyle(el);
    const cur = cs.transform === "none" ? "" : cs.transform + " ";
    setProp(el, "transform", cur + (axis === "x" ? "scaleX(-1)" : "scaleY(-1)"));
  }
  function firstFont(ff) {
    return (ff || "").split(",")[0].replace(/["']/g, "").trim() || "system-ui";
  }
  function weightName(w) {
    return String(w);
  }
  function normalizeLine(lh) {
    return lh === "normal" ? "1.4" : lh;
  }
  function parseLenSafe(v) {
    return v && v !== "auto" ? v : "0px";
  }
  function escapeHtml2(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function highlight(css2) {
    return escapeHtml2(css2).replace(/^([^{\n]+)\{/gm, '<span class="sel">$1</span>{').replace(/^(\s+)([\w-]+)(:)/gm, '$1<span class="prop">$2</span>$3').replace(/: ([^;]+);/g, ': <span class="val">$1</span>;');
  }

  // src/ui/toolbar.js
  var Toolbar = class {
    constructor(root, api) {
      this.api = api;
      this.el = h("div", { class: "dock", "data-inspect-ui": "" });
      root.appendChild(this.el);
      this.render();
      store.subscribe(() => this.sync());
    }
    render() {
      this.el.innerHTML = "";
      this.pauseBtn = circle("pause", "Pause / resume picking", () => store.set({ active: !store.get().active }));
      const group = h("div", { class: "dock-group" }, [
        dockBtn("undo-03", "Undo", () => {
          var _a, _b;
          return (_b = (_a = this.api).undo) == null ? void 0 : _b.call(_a);
        }),
        dockBtn("redo-01", "Redo", () => {
          var _a, _b;
          return (_b = (_a = this.api).redo) == null ? void 0 : _b.call(_a);
        }),
        sep(),
        dockBtn("layer-send-backward", "Select parent element", () => {
          var _a, _b;
          return (_b = (_a = this.api).selectParent) == null ? void 0 : _b.call(_a);
        }),
        dockBtn("layer-bring-forward", "Select child element", () => {
          var _a, _b;
          return (_b = (_a = this.api).selectChild) == null ? void 0 : _b.call(_a);
        }),
        sep(),
        this.assetsBtn = dockBtn("component", "Assets (page colors, type, SVGs, images)", () => {
          const v = store.get().view;
          store.set({ view: v === "assets" ? "design" : "assets", collapsed: false });
        }),
        this.codeBtn = dockBtn("file-diff", "Generated CSS", () => store.set({ view: "code", collapsed: false })),
        this.htmlBtn = dockBtn("html-file-01", "HTML", () => store.set({ view: "html", collapsed: false })),
        sep(),
        dockBtn("laptop-phone-sync", "Toggle responsive preview", () => {
          var _a, _b;
          return (_b = (_a = this.api).toggleResponsive) == null ? void 0 : _b.call(_a);
        })
      ]);
      const close = circle("cancel-01", "Exit InspectCSS", () => {
        var _a;
        return (_a = window.InspectCSS) == null ? void 0 : _a.destroy();
      });
      this.el.append(this.pauseBtn, group, close);
      this.sync();
    }
    sync() {
      var _a, _b, _c, _d;
      const s = store.get();
      (_a = this.pauseBtn) == null ? void 0 : _a.classList.toggle("active", s.active);
      (_b = this.assetsBtn) == null ? void 0 : _b.classList.toggle("active", s.view === "assets");
      (_c = this.codeBtn) == null ? void 0 : _c.classList.toggle("active", s.view === "code");
      (_d = this.htmlBtn) == null ? void 0 : _d.classList.toggle("active", s.view === "html");
    }
  };
  function circle(name, title, onClick) {
    return h("button", { class: "dock-circle", title, onclick: onClick, html: icon(name) });
  }
  function dockBtn(name, title, onClick) {
    return h("button", { class: "dock-btn", title, onclick: onClick, html: icon(name) });
  }
  function sep() {
    return h("div", { class: "dock-sep" });
  }

  // src/ui/tooltip.js
  var Tooltip = class {
    constructor(root) {
      this.root = root;
      this.el = h("div", { class: "tooltip", "data-inspect-ui": "" });
      root.appendChild(this.el);
      root.addEventListener("pointerover", (e) => this._over(e), true);
      root.addEventListener("pointerout", (e) => this._out(e), true);
      root.addEventListener("pointerdown", () => this.hide(), true);
    }
    _over(e) {
      const t = e.target.closest && e.target.closest("[title],[data-tip]");
      if (!t || !this.root.contains(t)) return;
      if (t.hasAttribute("title")) {
        const v = t.getAttribute("title");
        if (v) t.setAttribute("data-tip", v);
        t.removeAttribute("title");
      }
      const text = t.getAttribute("data-tip");
      if (text) this.show(text, t);
    }
    _out(e) {
      const t = e.target.closest && e.target.closest("[data-tip]");
      if (t && !t.contains(e.relatedTarget)) this.hide();
    }
    show(text, target) {
      this.el.textContent = text;
      this.el.classList.add("show");
      const r = target.getBoundingClientRect();
      const tr = this.el.getBoundingClientRect();
      let top = r.top - tr.height - 8;
      let left = r.left + r.width / 2 - tr.width / 2;
      if (top < 6) top = r.bottom + 8;
      left = Math.max(6, Math.min(left, window.innerWidth - tr.width - 6));
      this.el.style.left = Math.round(left) + "px";
      this.el.style.top = Math.round(top) + "px";
    }
    hide() {
      this.el.classList.remove("show");
    }
  };

  // src/core/textEdit.js
  var TextEditor = class {
    constructor(onChange) {
      this.onChange = onChange;
      this._onDblClick = this._onDblClick.bind(this);
      this._onKey = this._onKey.bind(this);
    }
    start() {
      document.addEventListener("dblclick", this._onDblClick, true);
    }
    stop() {
      document.removeEventListener("dblclick", this._onDblClick, true);
      this._finish();
    }
    _editable(el) {
      if (!el || el.nodeType !== 1 || isOwnUI(el)) return null;
      let node = el;
      while (node && node !== document.body) {
        const holdsText = [...node.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        const noBlockKids = ![...node.children].some((c) => {
          const d = getComputedStyle(c).display;
          return d === "block" || d === "flex" || d === "grid";
        });
        if (holdsText && noBlockKids) return node;
        node = node.parentElement;
      }
      return el.matches("h1,h2,h3,h4,h5,h6,p,span,a,button,li,td,th,label,strong,em,small,div") ? el : null;
    }
    _onDblClick(e) {
      var _a, _b;
      if (isOwnUI(e.target)) return;
      const el = this._editable(e.target);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      store.set({ editing: true, selectedEl: el });
      this.el = el;
      this._prevWS = el.style.whiteSpace;
      el.setAttribute("contenteditable", "true");
      el.setAttribute("data-inspect-editing", "");
      el.focus();
      const range = (_a = document.caretRangeFromPoint) == null ? void 0 : _a.call(document, e.clientX, e.clientY);
      const sel = window.getSelection();
      sel.removeAllRanges();
      if (range) sel.addRange(range);
      else (_b = document.execCommand) == null ? void 0 : _b.call(document, "selectAll", false, null);
      el.addEventListener("blur", () => this._finish(), { once: true });
      document.addEventListener("keydown", this._onKey, true);
    }
    _onKey(e) {
      if (!this.el) return;
      if (e.key === "Escape" || e.key === "Enter" && !e.shiftKey && this.el.tagName !== "DIV") {
        e.preventDefault();
        this.el.blur();
      }
    }
    _finish() {
      var _a;
      document.removeEventListener("keydown", this._onKey, true);
      if (this.el) {
        this.el.removeAttribute("contenteditable");
        this.el.removeAttribute("data-inspect-editing");
        this.el = null;
      }
      if (store.get().editing) store.set({ editing: false });
      (_a = this.onChange) == null ? void 0 : _a.call(this);
    }
  };

  // src/core/dragMove.js
  var THRESHOLD = 5;
  var DragMove = class {
    constructor(onReorder) {
      this.onReorder = onReorder;
      this.indicator = h("div", {
        "data-inspect-ui": "",
        style: {
          position: "fixed",
          background: "#58aeff",
          borderRadius: "2px",
          pointerEvents: "none",
          zIndex: "2147483645",
          display: "none",
          boxShadow: "0 0 6px rgba(88,174,255,.8)"
        }
      });
      document.documentElement.appendChild(this.indicator);
      this._down = this._down.bind(this);
      this._move = this._move.bind(this);
      this._up = this._up.bind(this);
    }
    start() {
      document.addEventListener("mousedown", this._down, true);
    }
    stop() {
      document.removeEventListener("mousedown", this._down, true);
      this.indicator.remove();
    }
    _down(e) {
      if (e.button !== 0 || isOwnUI(e.target)) return;
      const sel = store.get().selectedEl;
      if (!sel) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el !== sel && !sel.contains(el)) return;
      this.sx = e.clientX;
      this.sy = e.clientY;
      this.armed = true;
      this.dragging = false;
      document.addEventListener("mousemove", this._move, true);
      document.addEventListener("mouseup", this._up, true);
    }
    _move(e) {
      if (!this.armed) return;
      if (!this.dragging) {
        if (Math.hypot(e.clientX - this.sx, e.clientY - this.sy) < THRESHOLD) return;
        this.dragging = true;
        store.set({ dragging: true });
        document.documentElement.style.cursor = "grabbing";
      }
      this._updateTarget(e);
    }
    _updateTarget(e) {
      const el = store.get().selectedEl;
      const parent = el == null ? void 0 : el.parentElement;
      if (!parent) return;
      const siblings = [...parent.children].filter((c) => !isOwnUI(c));
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const sib = siblings.find((s) => s === under || s.contains(under));
      if (!sib || sib === el) {
        this.ref = void 0;
        return this.indicator.style.display = "none";
      }
      const row = /row/.test(getComputedStyle(parent).flexDirection) || getComputedStyle(parent).display.includes("inline");
      const r = sib.getBoundingClientRect();
      const after = row ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
      this.ref = after ? sib.nextElementSibling : sib;
      if (this.ref === el) this.ref = after ? el.nextElementSibling : el;
      if (row) {
        const x = after ? r.right : r.left;
        Object.assign(this.indicator.style, {
          display: "block",
          left: x - 1 + "px",
          top: r.top + "px",
          width: "3px",
          height: r.height + "px"
        });
      } else {
        const y = after ? r.bottom : r.top;
        Object.assign(this.indicator.style, {
          display: "block",
          left: r.left + "px",
          top: y - 1 + "px",
          width: r.width + "px",
          height: "3px"
        });
      }
    }
    _up() {
      var _a;
      document.removeEventListener("mousemove", this._move, true);
      document.removeEventListener("mouseup", this._up, true);
      this.indicator.style.display = "none";
      document.documentElement.style.cursor = "";
      const wasDragging = this.dragging;
      this.armed = false;
      this.dragging = false;
      if (wasDragging) {
        const el = store.get().selectedEl;
        if (el && this.ref !== void 0 && this.ref !== el) {
          el.parentElement.insertBefore(el, this.ref || null);
        }
        store.set({ dragging: false });
        this.ref = void 0;
        const swallow = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          document.removeEventListener("click", swallow, true);
        };
        document.addEventListener("click", swallow, true);
        (_a = this.onReorder) == null ? void 0 : _a.call(this, el);
      }
    }
  };

  // src/ui/font.js
  var fontFace = `@font-face {
  font-family: 'Quicksand';
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
  src: url(data:font/woff2;base64,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) format('woff2');
}`;

  // src/ui/theme.js
  var css = (
    /* css */
    `
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
  border: none;
  border-radius: var(--r-panel);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.6);
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
.head-actions { display: flex; gap: 8px; }
.hbtn {
  width: 20px; height: 20px; display: grid; place-items: center;
  background: transparent; border: none; border-radius: var(--r-sm);
  color: var(--text); cursor: pointer; opacity: .85; padding: 0;
}
.hbtn:hover { opacity: 1; }
.hbtn.danger { color: #e05151; opacity: 1; }
.hbtn svg { width: 20px; height: 20px; }
.crumb { color: var(--orange); font-size: 18px; font-weight: 500; margin-top: 2px; display: flex; gap: 8px; flex-wrap: wrap; }
.dims { color: var(--muted); font-size: 20px; margin-top: 6px; display: flex; gap: 12px; align-items: baseline; }
.dims b { color: var(--text); font-weight: 500; }

/* ---------- Section ---------- */
.section { padding: 16px 0; border-top: 1px solid var(--divider); }
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
.rot-row { display: grid; grid-template-columns: 1fr 67px 67px; gap: 8px; }
.rot-row .iconrow { height: 100%; }
.rot-row .ibtn { border-radius: 12px; width: 100%; }
.stack { display: flex; flex-direction: column; min-width: 0; }
/* Grid children default to min-width:auto and refuse to shrink; force them to
   0 so two-column rows always split evenly instead of overflowing. */
.row > *, .row-3 > *, .rot-row > *, .corner-grid > *, .corner-mix > * { min-width: 0; }

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
.field .unit { color: var(--muted); font-size: 18px; font-weight: 400; flex: none; }
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
/* Segmented group (alignment, text-align): outer corners 12px, inner 8px. */
.iconrow.seg .ibtn { border-radius: 8px; }
.iconrow.seg .ibtn:first-child { border-radius: 12px 8px 8px 12px; }
.iconrow.seg .ibtn:last-child { border-radius: 8px 12px 12px 8px; }

/* ---------- Spacing box (3 nested boxes, exact colors from design) ---------- */
.sp-box {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 8px; position: relative; width: 100%;
}
.sp-margin  { background: var(--field);       border-radius: 24px; }
.sp-padding { background: var(--box-margin);   border-radius: 16px; }
.sp-size {
  background: var(--box-content); border-radius: 12px; padding: 18px 10px;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  color: var(--text); font-size: 15px; position: relative; flex: 1 0 0; min-height: 60px;
}
.sp-mid { display: flex; align-items: center; gap: 8px; width: 100%; }
.sp-tag { position: absolute; top: 6px; left: 10px; font-size: 10px; color: var(--muted); font-weight: 500; z-index: 1; }
.sp-x { color: var(--muted); }
.sp-edge {
  width: 34px; text-align: center; background: transparent; border: none;
  color: var(--text); font-size: 15px; font-family: var(--font); outline: none; flex: none;
}
.sp-edge:focus { color: var(--blue); }

/* ---------- Corner grid (Appearance) ---------- */
.corner-mix { display: grid; grid-template-columns: 1fr 34px; gap: 4px; }
.corner-mix .ibtn { height: 34px; background: var(--field-active); }
.corner-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.corner-grid .field { background: var(--field-2); }

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

/* ---------- Assets view ---------- */
.asset-count {
  margin-left: 8px; font-size: 13px; font-weight: 500; color: var(--muted);
  background: var(--field); border-radius: 20px; padding: 1px 8px;
}
.asset-colors { display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; }
.asset-swatch {
  aspect-ratio: 1; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12);
  cursor: pointer; padding: 0; transition: transform .1s;
  background-clip: padding-box;
}
.asset-swatch:hover { transform: scale(1.08); border-color: var(--blue); }

.asset-type-list { display: flex; flex-direction: column; gap: 8px; }
.asset-type {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
  background: var(--field); border: 1px solid transparent; border-radius: var(--r-field);
  padding: 8px 12px; cursor: pointer; color: var(--text); font-family: var(--font);
}
.asset-type:hover { border-color: var(--blue); }
.asset-type-preview { width: 40px; flex: none; text-align: center; color: var(--text); overflow: hidden; line-height: 1; }
.asset-type-meta { min-width: 0; }
.asset-type-name { font-size: 15px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.asset-type-sub { font-size: 13px; color: var(--muted); }

.asset-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.asset-thumb {
  aspect-ratio: 1; border-radius: 10px; background: var(--field);
  border: 1px solid rgba(255,255,255,0.08); display: grid; place-items: center;
  cursor: pointer; overflow: hidden; padding: 8px;
}
.asset-thumb:hover { border-color: var(--blue); }
.asset-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
.asset-svg svg { width: 100%; height: 100%; max-width: 40px; max-height: 40px; color: var(--text); }

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
  background: var(--blue); color: #001427; padding: 10px 18px; border-radius: 12px;
  font-family: var(--font); font-weight: 600; font-size: 15px; z-index: 2147483647;
  box-shadow: 0 8px 24px rgba(0,0,0,.4); }
`
  );

  // src/index.js
  var App = class {
    constructor() {
      this.host = document.createElement("div");
      this.host.setAttribute("data-inspect-ui", "");
      this.host.style.cssText = "all: initial; position: static;";
      const shadow = this.host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = css;
      const wrap = document.createElement("div");
      wrap.className = "wrap";
      shadow.append(style, wrap);
      document.documentElement.appendChild(this.host);
      this.fontStyle = document.createElement("style");
      this.fontStyle.setAttribute("data-inspect-ui", "");
      this.fontStyle.textContent = fontFace;
      document.head.appendChild(this.fontStyle);
      this.overlay = new Overlay(document.documentElement);
      this.panel = new Panel(wrap);
      this.tooltip = new Tooltip(wrap);
      this.toolbar = new Toolbar(wrap, {
        undo: () => {
          undo();
          this.panel.render();
        },
        redo: () => {
          redo();
          this.panel.render();
        },
        selectParent: () => this.selectRelative("parent"),
        selectChild: () => this.selectRelative("child"),
        toggleResponsive: () => this.toggleResponsive()
      });
      this.inspector = new Inspector(this.overlay, (el) => this.select(el));
      this.textEditor = new TextEditor(() => this.panel.render());
      this.dragMove = new DragMove((el) => {
        if (el) {
          this.overlay.select(el);
          this.panel.render();
        }
      });
      this.textEditor.start();
      this.dragMove.start();
      this._prevView = store.get().view;
      this._prevCollapsed = store.get().collapsed;
      this.unsub = store.subscribe((s) => this.onState(s));
      this._track = () => {
        if (this._raf) return;
        this._raf = requestAnimationFrame(() => {
          this._raf = 0;
          const s = store.get();
          if (s.hoverEl) this.overlay.highlight(s.hoverEl);
          if (s.selectedEl) this.overlay.select(s.selectedEl);
        });
      };
      window.addEventListener("scroll", this._track, true);
      window.addEventListener("resize", this._track, true);
      store.set({ active: true });
      this.panel.render();
    }
    select(el) {
      store.set({ selectedEl: el });
      this.overlay.select(el);
      this.panel.set(el);
    }
    // Navigate the DOM: select the parent, or the first element child.
    selectRelative(dir) {
      const el = store.get().selectedEl;
      if (!el) return;
      let next = null;
      if (dir === "parent") {
        next = el.parentElement;
        if (!next || next === document.documentElement || next === document.body) return;
      } else {
        next = [...el.children].find((c) => !c.closest("[data-inspect-ui]"));
        if (!next) return;
      }
      store.set({ view: "design", collapsed: false });
      this.select(next);
    }
    toggleResponsive() {
      this._resp = !this._resp;
      const w = document.documentElement;
      if (this._resp) {
        w.style.maxWidth = "420px";
        w.style.margin = "0 auto";
        w.style.transition = "max-width .2s";
      } else {
        w.style.maxWidth = "";
        w.style.margin = "";
      }
      const s = store.get();
      if (s.selectedEl) this.overlay.select(s.selectedEl);
    }
    onState(s) {
      if (s.active && !this._picking) {
        this._picking = true;
        this.inspector.start();
      } else if (!s.active && this._picking) {
        this._picking = false;
        this.inspector.stop();
      }
      if (s.selectedEl) this.overlay.select(s.selectedEl);
      if (s.view !== this._prevView || s.collapsed !== this._prevCollapsed) {
        if (s.view === "assets" && this._prevView !== "assets") this.panel._assetCache = null;
        this._prevView = s.view;
        this._prevCollapsed = s.collapsed;
        this.panel.render();
      }
    }
    destroy() {
      var _a, _b;
      (_a = this.unsub) == null ? void 0 : _a.call(this);
      window.removeEventListener("scroll", this._track, true);
      window.removeEventListener("resize", this._track, true);
      this.textEditor.stop();
      this.dragMove.stop();
      this.inspector.stop();
      this.overlay.destroy();
      this.host.remove();
      (_b = this.fontStyle) == null ? void 0 : _b.remove();
      this.toggleResponsiveOff();
      const live = document.getElementById("inspect-css-live-styles");
      if (live) live.remove();
      delete window.InspectCSS;
    }
    toggleResponsiveOff() {
      document.documentElement.style.maxWidth = "";
      document.documentElement.style.margin = "";
    }
  };
  function boot() {
    if (window.InspectCSS) {
      window.InspectCSS.destroy();
      return;
    }
    const app = new App();
    window.InspectCSS = { app, destroy: () => app.destroy(), version: "0.5.0" };
  }
  boot();
})();
