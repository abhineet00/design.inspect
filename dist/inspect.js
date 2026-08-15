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
    collapsed: false
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
          zIndex: "2147483646"
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
          font: "600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
          color: "#fff",
          background: "#4c8dff",
          padding: "2px 6px",
          borderRadius: "4px",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          boxShadow: "0 1px 4px rgba(0,0,0,.3)"
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
      this.badge.textContent = `${round(r.width)} \xD7 ${round(r.height)}`;
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
      const el = this._target(e);
      if (!el) return this.overlay.hideHover();
      if (el === store.get().hoverEl) return;
      store.set({ hoverEl: el });
      this.overlay.highlight(el);
    }
    _onClick(e) {
      if (isOwnUI(e.target)) return;
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
  function field({ key, iconName, value, unit = "px", onChange, showUnit = true }) {
    const parsed = parseLength(value);
    const input = h("input", { value: parsed.value, type: "text", inputmode: "decimal" });
    const unitEl = showUnit ? h("span", { class: "unit", text: parsed.unit || unit }) : null;
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
    return h("div", { class: "field" }, [
      iconName ? ico(iconName) : key ? h("span", { class: "fk", text: key }) : null,
      input,
      unitEl
    ]);
  }
  function selectField({ value, options, onChange, iconName, key }) {
    const sel = h("select", {});
    for (const opt of options) {
      const [v, l] = Array.isArray(opt) ? opt : [opt, opt];
      const o = h("option", { value: v, text: l });
      if (String(v) === String(value)) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => onChange(sel.value));
    return h("div", { class: "field select-like" }, [
      iconName ? ico(iconName) : key ? h("span", { class: "fk", text: key }) : null,
      sel,
      chevMini()
    ]);
  }
  function iconButtons(buttons, { active = -1, grow = false, onPick } = {}) {
    const row = h("div", { class: "iconrow" + (grow ? " grow" : "") });
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
    const mk = (kind, side, val2, cls) => {
      const inp = h("input", { class: "edge " + cls, value: parseLength(val2).value });
      inp.addEventListener("change", () => {
        const raw = inp.value.trim();
        onChange(`${kind}-${side}`, /^-?[\d.]+$/.test(raw) ? raw + "px" : raw);
      });
      return inp;
    };
    const positions = {
      top: "top:2px;left:50%;transform:translateX(-50%)",
      bottom: "bottom:2px;left:50%;transform:translateX(-50%)",
      left: "left:2px;top:50%;transform:translateY(-50%)",
      right: "right:2px;top:50%;transform:translateY(-50%)"
    };
    const place = (el, pos) => {
      el.setAttribute("style", positions[pos]);
      return el;
    };
    const marginEdges = ["top", "bottom", "left", "right"].map((s) => place(mk("margin", s, sides2.margin[s], "m-" + s), s));
    const padPos = {
      top: "top:2px;left:50%;transform:translateX(-50%)",
      bottom: "bottom:2px;left:50%;transform:translateX(-50%)",
      left: "left:2px;top:50%;transform:translateY(-50%)",
      right: "right:2px;top:50%;transform:translateY(-50%)"
    };
    const padEdges = ["top", "bottom", "left", "right"].map((s) => {
      const el = mk("padding", s, sides2.padding[s], "p-" + s);
      el.setAttribute("style", padPos[s]);
      return el;
    });
    const sizeBox = h("div", { class: "center-size" }, [
      h("span", { class: "tag", text: "Size" }),
      h("span", { text: parseLength(sides2.width || "0").value + " \xD7 " + parseLength(sides2.height || "0").value })
    ]);
    const padRing = h("div", { class: "ring pad" }, [
      h("span", { class: "tag", text: "Padding" }),
      ...padEdges,
      sizeBox
    ]);
    return h("div", { class: "boxeditor" }, [
      h("span", { class: "tag", text: "Margin" }),
      ...marginEdges,
      padRing
    ]);
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
      if (!this.selected) {
        body.append(h("div", { class: "empty", text: "Pick an element on the page to inspect and edit its styles." }));
      } else if (st.view === "code") this._code(body);
      else if (st.view === "html") this._html(body);
      else this._design(body);
      this.el.append(body);
    }
    // ---------------- Header ----------------
    _head() {
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
            }),
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
        labeled("Alignment", iconButtons(alignIcons, { grow: true, onPick: (b) => setProp(el, b.css[0], b.css[1]) })),
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
          labeled("Row Gap", field({ iconName: "paragraph-spacing", value: m.layout.rowGap, showUnit: false, onChange: on("row-gap") })),
          labeled("Column Gap", field({ iconName: "letter-spacing", value: m.layout.columnGap, showUnit: false, onChange: on("column-gap") }))
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
        labeled("", addRow("Fill", () => on("background-color")("#ffffff"))),
        m.background.color && m.background.color !== "rgba(0, 0, 0, 0)" ? colorLine(m.background.color, on("background-color")) : null,
        labeled("", addRow("Stroke", () => {
          on("border-style")("solid");
          on("border-width")("1px");
          on("border-color")("#ffffff");
        })),
        m.border.style !== "none" ? colorLine(m.border.color, on("border-color")) : null
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
          labeled("Line Height", field({ iconName: "paragraph-spacing", value: normalizeLine(m.typography.lineHeight), showUnit: false, onChange: on("line-height") })),
          labeled("Letter Spacing", field({ iconName: "letter-spacing", value: m.typography.letterSpacing, showUnit: false, onChange: on("letter-spacing") }))
        ]),
        h("div", { class: "row" }, [
          labeled("Paragraph Spacing", field({ iconName: "expand-paragraph", value: parseLenSafe(m.typography.marginBottom), onChange: on("margin-bottom") })),
          labeled("Alignment", iconButtons([
            { icon: "text-align-right", title: "Right", css: "right" },
            { icon: "text-align-center", title: "Center", css: "center" },
            { icon: "text-align-start", title: "Left", css: "left" },
            { icon: "text-align-justify", title: "Justify", css: "justify" }
          ], { grow: true, active: ["right", "center", "left", "justify"].indexOf(m.typography.textAlign), onPick: (b) => on("text-align")(b.css) }))
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
      body.append(h("pre", { class: "code", html: escapeHtml(clone.outerHTML.replace(/></, ">\n  \u2026\n<")) }));
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
  function hbtn(name, title, onClick) {
    return h("button", { class: "hbtn", title, onclick: onClick, html: icon(name) });
  }
  function addRow(label, onAdd) {
    return h("div", { class: "addrow" }, [
      h("span", { class: "k", text: label }),
      h("button", { class: "addbtn", title: "Add " + label, html: icon("plus"), onclick: onAdd })
    ]);
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
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function highlight(css2) {
    return escapeHtml(css2).replace(/^([^{\n]+)\{/gm, '<span class="sel">$1</span>{').replace(/^(\s+)([\w-]+)(:)/gm, '$1<span class="prop">$2</span>$3').replace(/: ([^;]+);/g, ': <span class="val">$1</span>;');
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
        dockBtn("layer-bring-forward", "Bring forward", () => {
          var _a, _b;
          return (_b = (_a = this.api).bump) == null ? void 0 : _b.call(_a, 1);
        }),
        dockBtn("layer-send-backward", "Send backward", () => {
          var _a, _b;
          return (_b = (_a = this.api).bump) == null ? void 0 : _b.call(_a, -1);
        }),
        sep(),
        this.designBtn = dockBtn("component", "Design", () => store.set({ view: "design", collapsed: false })),
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
      (_b = this.designBtn) == null ? void 0 : _b.classList.toggle("active", s.view === "design");
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

  // src/ui/theme.js
  var css = (
    /* css */
    `
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
  width: 320px;
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
.rot-row { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; }
.rot-row .iconrow { height: 100%; }
.stack { display: flex; flex-direction: column; }

/* ---------- Field ---------- */
.field {
  display: flex; align-items: center; gap: 8px;
  background: var(--field); border: 1px solid transparent;
  border-radius: var(--r-field); padding: 8px 10px; min-width: 0;
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
  height: 36px; min-width: 36px; display: grid; place-items: center;
  background: var(--field); border: 1px solid transparent; border-radius: var(--r-field);
  color: var(--text); cursor: pointer; padding: 0 6px;
}
.ibtn:hover { background: var(--field-2); }
.ibtn.active { background: var(--field-active); }
.ibtn svg { width: 18px; height: 18px; }

/* ---------- Spacing box ---------- */
.spacing-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.boxeditor { background: var(--box-margin); border-radius: 16px; padding: 22px 30px; position: relative; margin-top: 2px; }
.boxeditor .ring { border-radius: 12px; padding: 20px 30px; position: relative; }
.boxeditor .ring.pad { background: var(--box-content); border: 1px dashed var(--line); }
.boxeditor .tag { position: absolute; top: 6px; left: 10px; font-size: 10px; color: var(--muted); font-weight: 400; z-index: 1; }
.boxeditor .center-size {
  background: #000; border: 1px dashed var(--line); border-radius: 10px;
  padding: 18px 8px; text-align: center; color: var(--text); font-size: 12px;
  display: flex; align-items: center; justify-content: center; gap: 6px; position: relative;
}
.boxeditor .center-size .tag { position: absolute; top: 6px; left: 10px; }
.boxeditor .edge {
  position: absolute; width: 40px; text-align: center; background: transparent;
  border: none; color: var(--text); font-size: 11px; font-family: var(--font); outline: none; z-index: 2;
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
.dock { position: fixed; top: 50%; left: 16px; transform: translateY(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 10px; z-index: 2147483646;
  filter: drop-shadow(4px 3px 5px rgba(0,0,0,.2)); }
.dock-circle {
  width: 40px; height: 40px; border-radius: 999px; display: grid; place-items: center;
  background: var(--tool-bg); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  border: 1px solid var(--border-soft); color: var(--text); cursor: pointer;
}
.dock-circle:hover { background: var(--tool-active); }
.dock-group {
  display: flex; flex-direction: column; align-items: center;
  background: var(--tool-bg); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  border: 1px solid var(--border-soft); border-radius: 20px; padding: 4px; gap: 0;
}
.dock-btn {
  width: 40px; height: 40px; display: grid; place-items: center; border-radius: 16px;
  background: transparent; border: none; color: var(--text); cursor: pointer;
}
.dock-btn:hover { background: rgba(255,255,255,0.06); }
.dock-btn.active { background: var(--tool-active); }
.dock-btn svg, .dock-circle svg { width: 18px; height: 18px; }
.dock-sep { width: 22px; height: 1px; background: var(--line); margin: 1px 0; }

/* toast */
.toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
  background: var(--blue); color: #001427; padding: 10px 18px; border-radius: 12px;
  font-family: var(--font); font-weight: 600; font-size: 13px; z-index: 2147483647;
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
      this.overlay = new Overlay(document.documentElement);
      this.panel = new Panel(wrap);
      this.toolbar = new Toolbar(wrap, {
        undo: () => {
          undo();
          this.panel.render();
        },
        redo: () => {
          redo();
          this.panel.render();
        },
        bump: (dir) => this.bumpZ(dir),
        toggleResponsive: () => this.toggleResponsive()
      });
      this.inspector = new Inspector(this.overlay, (el) => this.select(el));
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
      store.set({ selectedEl: el, active: false });
      this.overlay.select(el);
      this.panel.set(el);
    }
    bumpZ(dir) {
      const el = store.get().selectedEl;
      if (!el) return;
      const z = parseInt(getComputedStyle(el).zIndex) || 0;
      setProp(el, "position", getComputedStyle(el).position === "static" ? "relative" : getComputedStyle(el).position);
      setProp(el, "z-index", String(z + dir));
      this.panel.render();
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
        this._prevView = s.view;
        this._prevCollapsed = s.collapsed;
        this.panel.render();
      }
    }
    destroy() {
      var _a;
      (_a = this.unsub) == null ? void 0 : _a.call(this);
      window.removeEventListener("scroll", this._track, true);
      window.removeEventListener("resize", this._track, true);
      this.inspector.stop();
      this.overlay.destroy();
      this.host.remove();
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
    window.InspectCSS = { app, destroy: () => app.destroy(), version: "0.2.0" };
  }
  boot();
})();
