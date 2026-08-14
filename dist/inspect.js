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
    tab: "design",
    // design | code | html
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
  function breadcrumb(el) {
    const chain = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && node !== document.documentElement && depth < 3) {
      let s = node.tagName.toLowerCase();
      if (node.id) s = "#" + node.id;
      else if (node.classList.length) s = "." + node.classList[0];
      chain.unshift(s);
      node = node.parentElement;
      depth++;
    }
    return chain.join(" ");
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
  function setProp(el, prop, value) {
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
        y: round(rect.top + window.scrollY)
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
        color: val(el, cs, "color")
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

  // src/ui/components.js
  function field(label, value, onChange, opts = {}) {
    const { unit: showUnit = true } = opts;
    const { value: num2, unit } = parseLength(value);
    const input = h("input", {
      value: num2,
      type: "text",
      inputmode: "decimal",
      "aria-label": label
    });
    const u = h("span", { class: "u", text: unit || (showUnit ? "px" : "") });
    function commit() {
      const raw = input.value.trim();
      if (raw === "") return onChange("");
      const numeric = /^-?[\d.]+$/.test(raw);
      onChange(numeric && showUnit ? raw + (u.textContent || "px") : raw);
    }
    input.addEventListener("change", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        input.blur();
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const cur = parseFloat(input.value) || 0;
        input.value = cur + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1);
        commit();
        e.preventDefault();
      }
    });
    if (showUnit) {
      const units = ["px", "%", "em", "rem", "vw", "vh"];
      u.style.cursor = "pointer";
      u.addEventListener("click", () => {
        const i = units.indexOf(u.textContent);
        u.textContent = units[(i + 1) % units.length];
        commit();
      });
    }
    return h("div", { class: "field" }, [
      h("span", { class: "k", text: label }),
      input,
      showUnit ? u : null
    ]);
  }
  function selectField(label, value, options, onChange) {
    const sel = h("select", { "aria-label": label });
    for (const opt of options) {
      const [v, l] = Array.isArray(opt) ? opt : [opt, opt];
      const o = h("option", { value: v, text: l });
      if (v === value) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => onChange(sel.value));
    return h("div", { class: "field" }, [h("span", { class: "k", text: label }), sel]);
  }
  function colorRow(label, value, onChange) {
    const parsed = rgbToHex(value);
    const hex = parsed.hex;
    let alpha = parsed.alpha === 0 ? 1 : parsed.alpha;
    const picker = h("input", { type: "color", value: hex });
    const swatch = h("div", { class: "swatch" }, [picker]);
    swatch.style.background = value && value !== "rgba(0, 0, 0, 0)" ? value : "transparent";
    const hexInput = h("input", { class: "hex", value: hex });
    const push = (hx) => {
      const out = hexToRgba(hx, alpha);
      swatch.style.background = out;
      onChange(out);
    };
    picker.addEventListener("input", () => {
      hexInput.value = picker.value;
      push(picker.value);
    });
    hexInput.addEventListener("change", () => {
      let v = hexInput.value.trim();
      if (/^[0-9a-f]{3,6}$/i.test(v)) v = "#" + v;
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) {
        picker.value = v;
        push(v);
      } else onChange(v);
    });
    return h("div", { class: "color-row" }, [
      swatch,
      h("span", { class: "k", text: label }),
      hexInput
    ]);
  }
  function section(title, contentNodes, { open = true, right = null } = {}) {
    const content = h("div", { class: "section-content" }, contentNodes);
    const chev = h("span", { class: "chev", html: "&#9662;" });
    const head = h("div", { class: "section-title" }, [
      h("span", {}, [title]),
      right || chev
    ]);
    const sec = h("div", { class: "section" + (open ? "" : " closed") }, [head, content]);
    head.addEventListener("click", (e) => {
      if (right && right.contains(e.target)) return;
      sec.classList.toggle("closed");
    });
    return sec;
  }
  function spacingBox(sides2, onChange) {
    const mk = (kind, side, val2) => {
      const inp = h("input", { class: `${kind[0]}-${side}`, value: parseLength(val2).value });
      inp.addEventListener("change", () => {
        const raw = inp.value.trim();
        const v = /^-?[\d.]+$/.test(raw) ? raw + "px" : raw;
        onChange(`${kind}-${side}`, v);
      });
      return inp;
    };
    return h("div", { class: "spacing" }, [
      h("span", { class: "lab m", text: "margin" }),
      h("span", { class: "lab p", text: "padding" }),
      mk("margin", "top", sides2.margin.top),
      mk("margin", "right", sides2.margin.right),
      mk("margin", "bottom", sides2.margin.bottom),
      mk("margin", "left", sides2.margin.left),
      h("div", { class: "inner" }, [
        mk("padding", "top", sides2.padding.top),
        mk("padding", "right", sides2.padding.right),
        mk("padding", "bottom", sides2.padding.bottom),
        mk("padding", "left", sides2.padding.left),
        h("div", { class: "center", text: "content" })
      ])
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
      this.el.classList.toggle("collapsed", st.collapsed);
      this.el.innerHTML = "";
      this.el.append(this._head(), this._tabs());
      if (st.collapsed) return;
      const body = h("div", { class: "panel-body" });
      if (!this.selected) {
        body.append(h("div", { class: "empty", text: "Pick an element on the page to inspect and edit its styles." }));
      } else if (st.tab === "design") this._design(body);
      else if (st.tab === "code") this._code(body);
      else this._html(body);
      this.el.append(body);
    }
    _head() {
      const el = this.selected;
      const m = el ? readModel(el) : null;
      const actions = h("div", { class: "head-actions" }, [
        iconBtn("copy", "Copy CSS", () => this._copy()),
        iconBtn("collapse", "Collapse", () => store.set({ collapsed: !store.get().collapsed })),
        iconBtn("clear", "Reset all edits", () => {
          clearAll();
          this.render();
        }),
        iconBtn("close", "Close", () => {
          var _a;
          return (_a = window.InspectCSS) == null ? void 0 : _a.destroy();
        })
      ]);
      return h("div", { class: "panel-head" }, [
        h("div", { class: "head-meta" }, [
          h("div", { class: "head-title", text: el ? elementLabel(el) || m.tag : "InspectCSS" }),
          h("div", { class: "head-sel", text: el ? breadcrumb(el) : "no selection" }),
          el ? h("div", { class: "head-dims" }, [
            h("span", { html: `<b>${round(m.rect.width)}\xD7${round(m.rect.height)}</b> px` }),
            h("span", { html: `A <b>${m.typography.fontSize}</b>` })
          ]) : null
        ]),
        actions
      ]);
    }
    _tabs() {
      const st = store.get();
      const mk = (id, label, isNew) => h("button", {
        class: "tab" + (st.tab === id ? " active" : ""),
        onclick: () => {
          store.set({ tab: id });
          this.render();
        }
      }, [label, isNew ? h("span", { class: "badge-new", text: "NEW" }) : null]);
      return h("div", { class: "tabs" }, [
        mk("design", "Design"),
        mk("code", "Code"),
        mk("html", "HTML")
      ]);
    }
    // ---------------- Design tab ----------------
    _design(body) {
      const el = this.selected;
      const m = readModel(el);
      const on = (prop) => (v) => {
        setProp(el, prop, v);
        this._refreshLight();
      };
      body.append(
        selectRow("Media", "Auto \u2014 screen", []),
        pseudoRow((p) => {
          store.set({ pseudo: p });
          this.render();
        })
      );
      const t = m.transform;
      const setT = (patch) => {
        Object.assign(t, patch);
        const v = composeTransform(t);
        setProp(el, "transform", v);
        this._refreshLight();
      };
      body.append(section("Layout", [
        h("div", { class: "grid-3" }, [
          field("X", t.tx + "px", (v) => setT({ tx: parseFloat(v) || 0 })),
          field("Y", t.ty + "px", (v) => setT({ ty: parseFloat(v) || 0 })),
          field("\u2220", t.rotate + "", (v) => setT({ rotate: parseFloat(v) || 0 }), { unit: false })
        ]),
        h("div", { class: "grid-3", style: { marginTop: "8px" } }, [
          field("W", m.layout.width, on("width")),
          field("H", m.layout.height, on("height")),
          field("R", m.radius.all, on("border-radius"))
        ]),
        h("div", { class: "grid", style: { marginTop: "8px" } }, [
          selectField(
            "display",
            m.layout.display,
            ["block", "inline", "inline-block", "flex", "inline-flex", "grid", "none"],
            on("display")
          ),
          selectField(
            "position",
            m.layout.position,
            ["static", "relative", "absolute", "fixed", "sticky"],
            on("position")
          )
        ])
      ]));
      body.append(section("Spacing", [
        spacingBox(m.spacing, (prop, v) => {
          setProp(el, prop, v);
          this._refreshLight();
        })
      ]));
      body.append(section("Typography", [
        h("div", { class: "grid" }, [
          field("Size", m.typography.fontSize, on("font-size")),
          selectField(
            "Weight",
            String(m.typography.fontWeight),
            ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
            on("font-weight")
          )
        ]),
        h("div", { class: "grid", style: { marginTop: "8px" } }, [
          field("Line", m.typography.lineHeight === "normal" ? "1.4" : m.typography.lineHeight, on("line-height"), { unit: false }),
          field("Spacing", m.typography.letterSpacing, on("letter-spacing"))
        ]),
        h("div", { style: { marginTop: "8px" } }, [
          selectField(
            "Align",
            m.typography.textAlign,
            ["left", "center", "right", "justify"],
            on("text-align")
          )
        ]),
        h("div", { style: { marginTop: "8px" } }, [colorRow("color", m.typography.color, on("color"))])
      ]));
      body.append(section("Fill & Border", [
        colorRow("background", m.background.color, on("background-color")),
        colorRow("border", m.border.color, on("border-color")),
        h("div", { class: "grid" }, [
          field("Border", m.border.width, on("border-width")),
          selectField(
            "Style",
            m.border.style,
            ["none", "solid", "dashed", "dotted", "double"],
            on("border-style")
          )
        ])
      ]));
      body.append(section("Effects", [
        field("Opacity", m.effects.opacity, on("opacity"), { unit: false }),
        h("div", { style: { marginTop: "8px" } }, [
          field("Shadow", m.effects.boxShadow, on("box-shadow"), { unit: false })
        ])
      ], { open: false }));
    }
    // Re-read only the header dims without rebuilding inputs (keeps focus).
    _refreshLight() {
      store.get().panelDirty = true;
    }
    // ---------------- Code tab ----------------
    _code(body) {
      const cssText = generateCss();
      body.append(
        h("div", { class: "code-actions" }, [
          h("button", { class: "btn primary", text: "Copy CSS", onclick: () => this._copy() }),
          h("button", { class: "btn", text: "Reset", onclick: () => {
            clearAll();
            this.render();
          } })
        ]),
        cssText ? h("pre", { class: "code", html: highlight(cssText) }) : h("div", { class: "empty", text: "No edits yet. Change a property in the Design tab and the generated CSS appears here." })
      );
    }
    // ---------------- HTML tab ----------------
    _html(body) {
      const el = this.selected;
      if (!el) return body.append(h("div", { class: "empty", text: "No element selected." }));
      const clone = el.cloneNode(false);
      clone.removeAttribute("data-inspect-id");
      const open = clone.outerHTML.replace(/></, ">\n  ...\n<");
      body.append(h("pre", { class: "code", html: escapeHtml(open) }));
    }
    _copy() {
      var _a;
      const text = generateCss();
      if (!text) return;
      (_a = navigator.clipboard) == null ? void 0 : _a.writeText(text).then(() => this._toast("CSS copied"));
    }
    _toast(msg) {
      const t = h("div", {
        "data-inspect-ui": "",
        text: msg,
        style: {
          position: "fixed",
          bottom: "80px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "#4c8dff",
          color: "#fff",
          padding: "8px 16px",
          borderRadius: "8px",
          fontSize: "13px",
          zIndex: "2147483647",
          boxShadow: "0 6px 20px rgba(0,0,0,.4)"
        }
      });
      this.root.appendChild(t);
      setTimeout(() => t.remove(), 1400);
    }
    // Drag the panel by its header.
    _drag() {
      let sx, sy, ox, oy, dragging = false;
      this.el.addEventListener("mousedown", (e) => {
        const head = e.target.closest(".panel-head");
        if (!head || e.target.closest(".icon-btn")) return;
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
  function iconBtn(kind, title, onClick) {
    return h("button", { class: "icon-btn", title, onclick: onClick, html: ICONS[kind] || "" });
  }
  function selectRow(label, value) {
    return h("div", { class: "selectrow" }, [
      h("label", { html: `${ICONS.media} ${label}` }),
      h("select", {}, [h("option", { text: value, selected: true })])
    ]);
  }
  function pseudoRow(onChange) {
    const st = store.get();
    const sel = h("select", {}, ["none", "hover", "focus", "active"].map((p) => {
      const o = h("option", { value: p, text: p === "none" ? "None" : ":" + p });
      if (p === st.pseudo) o.selected = true;
      return o;
    }));
    sel.addEventListener("change", () => onChange(sel.value));
    return h("div", { class: "selectrow" }, [
      h("label", { html: `${ICONS.state} State or pseudo` }),
      sel
    ]);
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function highlight(css2) {
    return escapeHtml(css2).replace(/^([^{\n]+)\{/gm, '<span class="sel">$1</span>{').replace(/^(\s+)([\w-]+)(:)/gm, '$1<span class="prop">$2</span>$3').replace(/: ([^;]+);/g, ': <span class="val">$1</span>;');
  }
  var ICONS = {
    media: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8"/></svg>',
    state: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>',
    copy: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    collapse: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>',
    clear: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-9 0v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6"/></svg>',
    close: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'
  };

  // src/ui/toolbar.js
  var Toolbar = class {
    constructor(root) {
      this.el = h("div", { class: "dock", "data-inspect-ui": "" });
      root.appendChild(this.el);
      this.render();
      store.subscribe(() => this.sync());
    }
    render() {
      this.el.innerHTML = "";
      this.pick = tool("pick", "Pick element (Esc to stop)", () => store.set({ active: !store.get().active }));
      this.el.append(
        h("div", { class: "brand" }, [h("span", { class: "logo" }), "InspectCSS"]),
        h("div", { class: "sep" }),
        this.pick,
        tool("panel", "Show / hide panel", () => store.set({ collapsed: !store.get().collapsed })),
        tool("clear", "Reset all edits", () => clearAll()),
        h("div", { class: "sep" }),
        tool("close", "Exit InspectCSS", () => {
          var _a;
          return (_a = window.InspectCSS) == null ? void 0 : _a.destroy();
        })
      );
      this.sync();
    }
    sync() {
      if (this.pick) this.pick.classList.toggle("on", store.get().active);
    }
  };
  function tool(kind, title, onClick) {
    return h("button", { class: "tool", title, onclick: onClick, html: ICONS2[kind] });
  }
  var ICONS2 = {
    pick: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.5 18 2.5-7.5L20.5 11z"/></svg>',
    panel: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/></svg>',
    clear: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-9 0v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6"/></svg>',
    close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/></svg>'
  };

  // src/ui/theme.js
  var css = (
    /* css */
    `
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
      this.toolbar = new Toolbar(wrap);
      this.inspector = new Inspector(this.overlay, (el) => this.select(el));
      this.unsub = store.subscribe((s) => this.onState(s));
      store.set({ active: true });
      this.panel.render();
    }
    select(el) {
      store.set({ selectedEl: el, active: false });
      this.overlay.select(el);
      this.panel.set(el);
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
    }
    destroy() {
      var _a;
      (_a = this.unsub) == null ? void 0 : _a.call(this);
      this.inspector.stop();
      this.overlay.destroy();
      this.host.remove();
      const live = document.getElementById("inspect-css-live-styles");
      if (live) live.remove();
      delete window.InspectCSS;
    }
  };
  function boot() {
    if (window.InspectCSS) {
      window.InspectCSS.destroy();
      return;
    }
    const app = new App();
    window.InspectCSS = {
      app,
      destroy: () => app.destroy(),
      version: "0.1.0"
    };
  }
  boot();
})();
