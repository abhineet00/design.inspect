// The floating inspector panel. Layout, colors and sections follow the Figma
// design 1:1. The active view (design / code / html) is driven by the toolbar.

import { store } from '../core/store.js';
import { h, round, elementLabel } from '../core/util.js';
import { readModel, composeTransform } from '../core/styleModel.js';
import { setProp, generateCss, clearAll } from '../core/liveStyles.js';
import { collectAll } from '../core/assets.js';
import { getLog, describe, generateAiPrompt, clearLog, logChange } from '../core/changeLog.js';
import { cssPath } from '../core/selector.js';
import { record } from '../core/history.js';
import { getFills, compose, layerCss, layerLabel, defaultLayer } from '../core/fills.js';
import { openColorPopover, closeColorPopover } from './colorPopover.js';
import { icon } from '../icons/index.js';
import {
  field, selectField, iconButtons, colorRow, section, labeled, spacingBox,
  linkToggle, expandBtn, subHead,
} from './components.js';

export class Panel {
  constructor(root, api = {}) {
    this.root = root;
    this.api = api;
    this.el = h('div', { class: 'panel', 'data-inspect-ui': '' });
    root.appendChild(this.el);
    this._drag();
  }

  set(el) { this.selected = el; this.render(); }

  render() {
    const st = store.get();
    closeColorPopover();
    // preserve scroll position across re-renders (edits re-render the body)
    const prevBody = this.el.querySelector('.panel-body');
    const prevScroll = prevBody ? prevBody.scrollTop : 0;
    this.el.classList.toggle('hidden', st.collapsed);
    this.el.innerHTML = '';
    this.el.append(this._head());
    const body = h('div', { class: 'panel-body' });
    if (st.view === 'assets') this._assets(body);
    else if (st.view === 'changes') this._changes(body);
    else if (st.view === 'html') this._html(body);
    else if (!this.selected) {
      body.append(h('div', { class: 'empty', text: 'Pick an element on the page to inspect and edit its styles.' }));
    } else this._design(body);
    this.el.append(body);
    body.scrollTop = prevScroll;
  }

  // ---------------- Header ----------------
  _head() {
    const st = store.get();
    // Assets and Changes are page-level views — a plain title, no element crumb.
    if (st.view === 'assets' || st.view === 'changes') {
      const meta = st.view === 'assets'
        ? { title: 'Assets', sub: 'Everything this page uses' }
        : { title: 'Changes', sub: 'Every edit you make, ready to copy' };
      return h('div', { class: 'head' }, [
        h('div', { class: 'head-top' }, [
          h('div', { class: 'head-id' }, [
            h('div', { class: 'head-title', text: meta.title }),
            h('div', { class: 'crumb', style: { color: 'var(--muted)' }, text: meta.sub }),
          ]),
          h('div', { class: 'head-actions' }, [
            dockToggleBtn(),
            hbtn('x', 'Close panel', () => store.set({ collapsed: true })),
          ]),
        ]),
      ]);
    }
    const el = this.selected;
    const m = el ? readModel(el) : null;
    const crumb = el ? classChain(el) : [];
    // Card info: element name (blue) + class breadcrumb (orange) stacked on the
    // left, action icons top-right, then the dimensions line below.
    return h('div', { class: 'head' }, [
      h('div', { class: 'head-top' }, [
        h('div', { class: 'head-id' }, [
          h('div', { class: 'head-title', text: el ? elementLabel(el) || m.tag : 'InspectCSS' }),
          el && crumb.length ? h('div', { class: 'crumb' }, crumb.map((c) => h('span', { text: c }))) : null,
        ]),
        h('div', { class: 'head-actions' }, [
          el ? hbtn('delete02', 'Delete this element', () => this._deleteSelected(), 'danger') : null,
          dockToggleBtn(),
          hbtn('x', 'Close panel (Exit InspectCSS from the left dock)', () => store.set({ collapsed: true })),
        ]),
      ]),
      el ? h('div', { class: 'dims' }, [
        h('span', {}, [h('b', { text: `${round(m.rect.width)} x ${round(m.rect.height)} ` }), h('span', { class: 'mut', text: 'px' })]),
        h('span', {}, [h('span', { class: 'mut', text: 'A ' }), h('b', { text: `${parseInt(m.typography.fontSize)}` }), h('span', { class: 'mut', text: 'px' })]),
      ]) : h('div', { class: 'crumb', text: 'no selection' }),
    ]);
  }

  // ---------------- Design view ----------------
  _design(body) {
    const el = this.selected;
    const m = readModel(el);
    const on = (prop) => (v) => setProp(el, prop, v);
    // For length props whose field hides the unit: append px to bare numbers.
    const onPx = (prop) => (v) => setProp(el, prop, /^-?[\d.]+$/.test(String(v).trim()) ? v + 'px' : v);
    // Re-render after a committed edit so the box visualization and the written
    // fields stay in sync (edit one, the other reflects it).
    const sync = () => this.render();

    // ----- Position -----
    const t = m.transform;
    const setT = (patch) => { Object.assign(t, patch); setProp(el, 'transform', composeTransform(t)); };
    // Alignment icon order matches the design exactly.
    const alignIcons = [
      { icon: 'align-left', title: 'Align left', css: ['justify-content', 'flex-start'] },
      { icon: 'align-bottom', title: 'Align bottom', css: ['align-items', 'flex-end'] },
      { icon: 'align-right', title: 'Align right', css: ['justify-content', 'flex-end'] },
      { icon: 'align-top', title: 'Align top', css: ['align-items', 'flex-start'] },
      { icon: 'align-horizontal-center', title: 'Center horizontally', css: ['justify-content', 'center'] },
      { icon: 'align-vertical-center', title: 'Center vertically', css: ['align-items', 'center'] },
    ];
    body.append(section('Position', [
      labeled('Alignment', iconButtons(alignIcons, { grow: true, seg: true, onPick: (b) => setProp(el, b.css[0], b.css[1]) })),
      labeled('Position', h('div', { class: 'row' }, [
        field({ key: 'X', value: t.tx + 'px', onChange: (v) => setT({ tx: parseFloat(v) || 0 }) }),
        field({ key: 'Y', value: t.ty + 'px', onChange: (v) => setT({ ty: parseFloat(v) || 0 }) }),
      ])),
      labeled('Rotation', h('div', { class: 'rot-row' }, [
        field({ iconName: 'rotate01', value: t.rotate + '', showUnit: false, scrub: true, onChange: (v) => setT({ rotate: parseFloat(v) || 0 }) }),
        iconButtons([
          { icon: 'image-flip-horizontal', title: 'Flip horizontal', axis: 'x' },
          { icon: 'image-flip-vertical', title: 'Flip vertical', axis: 'y' },
        ], { grow: true, seg: true, onPick: (b) => flip(el, b.axis) }),
      ])),
    ]));

    // ----- Layout -----
    // Size fields, with an optional aspect-ratio lock between W and H.
    const linked = !!this._sizeLinked;
    const wNum = parseFloat(m.layout.width);
    const hNum = parseFloat(m.layout.height);
    const ratio = wNum > 0 && hNum > 0 ? wNum / hNum : 0;
    const onW = (v) => {
      setProp(el, 'width', v);
      const n = parseFloat(v);
      if (linked && ratio && isFinite(n)) { setProp(el, 'height', Math.round(n / ratio) + 'px'); this.render(); }
    };
    const onH = (v) => {
      setProp(el, 'height', v);
      const n = parseFloat(v);
      if (linked && ratio && isFinite(n)) { setProp(el, 'width', Math.round(n * ratio) + 'px'); this.render(); }
    };
    body.append(section('Layout', [
      labeled('Size', h('div', { class: 'size-row' }, [
        field({ key: 'W', value: m.layout.width, onDone: sync, onChange: onW }),
        linkToggle(linked, () => { this._sizeLinked = !linked; this.render(); }),
        field({ key: 'H', value: m.layout.height, onDone: sync, onChange: onH }),
      ])),
      labeled('Display', selectField({
        value: m.layout.display,
        options: ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'none'],
        onChange: on('display'),
      })),
      h('div', { class: 'row' }, [
        labeled('Row Gap', field({ iconName: 'paragraph-spacing', value: m.layout.rowGap, showUnit: false, sm: true, onChange: onPx('row-gap') })),
        labeled('Column Gap', field({ iconName: 'letter-spacing', value: m.layout.columnGap, showUnit: false, sm: true, onChange: onPx('column-gap') })),
      ]),
      h('div', { class: 'row' }, [
        labeled('Horizontal Align', selectField({ value: m.layout.justify, options: [['flex-start', 'Start'], ['center', 'Center'], ['flex-end', 'End'], ['space-between', 'Between']], onChange: on('justify-content') })),
        labeled('Vertical Align', selectField({ value: m.layout.align, options: [['flex-start', 'Start'], ['center', 'Center'], ['flex-end', 'End'], ['stretch', 'Stretch']], onChange: on('align-items') })),
      ]),
    ]));

    // ----- Spacing -----
    body.append(section('Spacing', [
      labeled('Padding', h('div', { class: 'row' }, [
        field({ iconName: 'horizontal-resize', value: m.spacing.padding.left, onDone: sync, onChange: (v) => { on('padding-left')(v); on('padding-right')(v); } }),
        field({ iconName: 'vertical-resize', value: m.spacing.padding.top, onDone: sync, onChange: (v) => { on('padding-top')(v); on('padding-bottom')(v); } }),
      ])),
      labeled('Margin', h('div', { class: 'row' }, [
        field({ iconName: 'horizontal-resize', value: m.spacing.margin.left, onDone: sync, onChange: (v) => { on('margin-left')(v); on('margin-right')(v); } }),
        field({ iconName: 'vertical-resize', value: m.spacing.margin.top, onDone: sync, onChange: (v) => { on('margin-top')(v); on('margin-bottom')(v); } }),
      ])),
      spacingBox({ ...m.spacing, width: m.layout.width, height: m.layout.height }, (prop, v) => setProp(el, prop, v), sync),
    ]));

    // ----- Appearance -----
    const app = [];
    const cornerExp = !!this._cornerExpanded;
    const cornerMixed = new Set([m.radius.tl, m.radius.tr, m.radius.bl, m.radius.br]).size > 1;

    // Opacity + Corner (collapsed value + expand-to-4-corners toggle)
    app.push(h('div', { class: 'row' }, [
      labeled('Opacity', field({ iconName: 'transparency', value: String(Math.round((parseFloat(m.effects.opacity) || 1) * 100)), unit: '%', onChange: (v) => on('opacity')((parseFloat(v) || 100) / 100) })),
      labeled('Corner', h('div', { class: 'corner-mix' }, [
        field({ iconName: 'full-screen', value: cornerMixed ? 'mix' : m.radius.all, showUnit: false, onChange: onPx('border-radius') }),
        expandBtn(cornerExp, 'full-screen', cornerExp ? 'Collapse corners' : 'Edit each corner', () => { this._cornerExpanded = !cornerExp; this.render(); }),
      ])),
    ]));
    if (cornerExp) {
      const corners = [
        ['border-top-left-radius', m.radius.tl], ['border-top-right-radius', m.radius.tr],
        ['border-bottom-left-radius', m.radius.bl], ['border-bottom-right-radius', m.radius.br],
      ];
      app.push(h('div', { class: 'corner-grid' }, corners.map(([prop, v]) =>
        field({ iconName: 'full-screen', value: v, showUnit: false, onChange: onPx(prop) }))));
    }

    // Fill: an ordered list of layers (solid / gradient / image). Plus adds a
    // new layer on top; each row's swatch opens the colour editor.
    const fills = getFills(el);
    const applyFills = () => { const props = compose(getFills(el)); Object.entries(props).forEach(([k, v]) => setProp(el, k, v)); };
    app.push(subHead('Fill', () => { getFills(el).unshift(defaultLayer('solid')); applyFills(); this.render(); }));
    fills.forEach((layer, i) => app.push(this._fillRow(el, i, applyFills)));

    // Stroke (border): colour row + width row (single/"mix" + expand-to-4-sides).
    const strokeOn = m.border.present;
    app.push(subHead('Stroke', () => {
      if (!strokeOn) {
        setProp(el, 'border-style', 'solid');
        setProp(el, 'border-width', '1px');
        if (!hasColor(m.border.color)) setProp(el, 'border-color', '#FFFFFF');
        this.render();
      }
    }, { disabled: strokeOn }));
    if (strokeOn) {
      app.push(colorRow(m.border.color, on('border-color'),
        () => { setProp(el, 'border-width', '0px'); this.render(); }));
      const sw = m.border.sides;
      const widthMixed = new Set([sw.top, sw.right, sw.bottom, sw.left]).size > 1;
      const strokeExp = !!this._strokeSidesExpanded;
      app.push(h('div', { class: 'corner-mix' }, [
        field({ iconName: 'square', value: widthMixed ? 'mix' : parseFloat(m.border.width) + '', showUnit: false,
          onChange: (v) => setProp(el, 'border-width', /^-?[\d.]+$/.test(String(v).trim()) ? v + 'px' : v) }),
        expandBtn(strokeExp, 'border-all-01', strokeExp ? 'Collapse sides' : 'Edit each side', () => { this._strokeSidesExpanded = !strokeExp; this.render(); }),
      ]));
      if (strokeExp) {
        const sides = [
          ['border-top-width', 'stroke-top', sw.top], ['border-right-width', 'stroke-right', sw.right],
          ['border-left-width', 'stroke-left', sw.left], ['border-bottom-width', 'stroke-bottom', sw.bottom],
        ];
        app.push(h('div', { class: 'corner-grid' }, sides.map(([prop, ic, v]) =>
          field({ iconName: ic, value: parseFloat(v) + '', showUnit: false, onChange: onPx(prop) }))));
      }
    }
    body.append(section('Appearance', app));

    // ----- Typography -----
    body.append(section('Typography', [
      labeled('Typeface', selectField({ value: firstFont(m.typography.fontFamily),
        options: [firstFont(m.typography.fontFamily), 'Quicksand', 'Inter', 'Arial', 'Georgia', 'system-ui', 'monospace'],
        onChange: on('font-family') })),
      h('div', { class: 'row' }, [
        selectField({ value: weightName(m.typography.fontWeight), options: [['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'SemiBold'], ['700', 'Bold'], ['800', 'Extra']], onChange: on('font-weight') }),
        selectField({ value: parseInt(m.typography.fontSize) + '', options: ['10', '12', '13', '14', '16', '18', '20', '24', '32', '48'].map((x) => [x, x]), onChange: (v) => on('font-size')(v + 'px') }),
      ]),
      h('div', { class: 'row' }, [
        labeled('Line Height', field({ iconName: 'paragraph-spacing', value: normalizeLine(m.typography.lineHeight), showUnit: false, sm: true, onChange: on('line-height') })),
        labeled('Letter Spacing', field({ iconName: 'letter-spacing', value: m.typography.letterSpacing, showUnit: false, sm: true, onChange: onPx('letter-spacing') })),
      ]),
      h('div', { class: 'row' }, [
        labeled('Paragraph Spacing', field({ iconName: 'expand-paragraph', value: parseLenSafe(m.typography.marginBottom), sm: true, onChange: on('margin-bottom') })),
        labeled('Alignment', iconButtons([
          { icon: 'text-align-right', title: 'Right', css: 'right' },
          { icon: 'text-align-center', title: 'Center', css: 'center' },
          { icon: 'text-align-start', title: 'Left', css: 'left' },
          { icon: 'text-align-justify', title: 'Justify', css: 'justify' },
        ], { grow: true, seg: true, active: ['right', 'center', 'left', 'justify'].indexOf(m.typography.textAlign), onPick: (b) => on('text-align')(b.css) })),
      ]),
      // Text colour — a Fill sub-section, mirroring Appearance's Fill.
      subHead('Fill', () => { on('color')('#FFFFFF'); this.render(); }),
      colorRow(m.typography.color, on('color'), () => { setProp(el, 'color', 'inherit'); this.render(); }),
    ]));
  }

  // One fill-layer row: swatch preview + label, an alpha % for solids, a remove
  // button. Clicking the swatch/label opens the colour editor (solid/gradient/image).
  _fillRow(el, i, applyFills) {
    const layer = getFills(el)[i];
    const swatch = h('button', { class: 'cr-swatch cr-swatch-btn', title: 'Edit fill' });
    swatch.style.background = layerCss(layer);
    const desc = h('span', { class: 'cr-hex-text', text: layerLabel(layer) });
    const main = h('div', { class: 'cr-main cr-main-btn' }, [swatch, desc]);

    const alpha = h('input', { class: 'cr-alpha', value: Math.round((layer.alpha ?? 1) * 100) });
    alpha.addEventListener('change', () => {
      const cur = getFills(el)[i]; cur.alpha = Math.max(0, Math.min(100, parseFloat(alpha.value) || 0)) / 100;
      applyFills(); swatch.style.background = layerCss(cur);
    });

    main.addEventListener('click', () => openColorPopover(main, getFills(el)[i], (updated) => {
      getFills(el)[i] = updated;
      applyFills();
      swatch.style.background = layerCss(updated);
      desc.textContent = layerLabel(updated);
      alpha.value = Math.round((updated.alpha ?? 1) * 100);
    }));

    const del = h('button', { class: 'cr-del', title: 'Remove fill', html: icon('minus-sign'),
      onclick: () => { getFills(el).splice(i, 1); applyFills(); this.render(); } });

    const parts = [main];
    if (layer.type === 'solid') parts.push(h('div', { class: 'cr-pct' }, [alpha, h('span', { class: 'cr-unit', text: '%' })]));
    parts.push(del);
    return h('div', { class: 'color-row' }, parts);
  }

  // ---------------- Changes view (change log + generated CSS + AI prompt) ----------------
  _changes(body) {
    const st = store.get();
    const log = getLog();
    const cssText = generateCss();
    const prompt = generateAiPrompt(st.promptDiff);

    body.append(h('div', { class: 'view-actions' }, [
      h('button', { class: 'btn primary', text: 'Copy CSS', onclick: () => this._copy() }),
      h('button', { class: 'btn', text: 'Copy AI prompt', onclick: () => {
        if (prompt) navigator.clipboard?.writeText(prompt).then(() => this._toast('AI prompt copied'));
      } }),
      h('button', { class: 'btn', text: 'Clear', onclick: () => { clearLog(); this.render(); } }),
    ]));

    if (!log.length) {
      body.append(h('div', { class: 'empty', text: 'No changes yet. Edit a property, colour or text and every change is logged here.' }));
      return;
    }

    // Change log list
    body.append(assetSection('Change log', log.length,
      h('div', { class: 'log-list' }, [...log].reverse().map((e) =>
        h('div', { class: 'log-item' }, [
          h('span', { class: 'log-el', text: e.label || e.selector }),
          h('span', { class: 'log-desc', text: describe(e) }),
        ])
      ))
    ));

    // AI prompt preview (with a Final / Diff style toggle)
    const styleToggle = h('div', { class: 'seg-toggle' }, [
      h('button', { class: 'seg-btn' + (!st.promptDiff ? ' on' : ''), text: 'Final', onclick: () => { store.get().promptDiff = false; store.set({ promptDiff: false }); this.render(); } }),
      h('button', { class: 'seg-btn' + (st.promptDiff ? ' on' : ''), text: 'Diff', onclick: () => { store.get().promptDiff = true; store.set({ promptDiff: true }); this.render(); } }),
    ]);
    body.append(assetSection('AI prompt', 0,
      h('div', {}, [
        h('div', { class: 'ai-row' }, [
          h('div', { class: 'ai-hint', text: 'Paste into any AI to apply these changes.' }),
          styleToggle,
        ]),
        h('pre', { class: 'code ai-prompt', text: prompt }),
      ])
    ));

    // Generated CSS
    body.append(assetSection('Generated CSS', 0,
      cssText ? h('pre', { class: 'code', html: highlight(cssText) })
              : h('div', { class: 'empty', text: 'No CSS edits.' })
    ));
  }

  // ---------------- HTML view: interactive DOM tree ----------------
  _html(body) {
    this._expanded = this._expanded || new Set();
    // Always show the top-level structure; expand ancestors of the selection.
    this._expanded.add(document.documentElement);
    this._expanded.add(document.body);
    if (this.selected) {
      let n = this.selected.parentElement;
      while (n) { this._expanded.add(n); n = n.parentElement; }
    }

    const tree = h('div', { class: 'domtree' });
    this._renderNode(document.documentElement, tree, 0);

    const footer = h('div', { class: 'tree-footer' }, [
      h('button', { class: 'tree-btn', onclick: () => store.set({ view: 'design' }) },
        [h('span', { html: TREE_ICONS.back }), 'Back']),
      h('button', { class: 'tree-btn', onclick: () => store.set({ active: true }) },
        [h('span', { html: TREE_ICONS.pick }), 'Pick an element']),
    ]);
    body.append(tree, footer);

    const selRow = tree.querySelector('.tree-row.selected');
    if (selRow) setTimeout(() => selRow.scrollIntoView({ block: 'center' }), 0);
  }

  _renderNode(el, container, depth) {
    if (el.nodeType !== 1 || (el.hasAttribute && el.hasAttribute('data-inspect-ui'))) return;
    const kids = [...el.children].filter((c) => !(c.hasAttribute && c.hasAttribute('data-inspect-ui')));
    const hasKids = kids.length > 0;
    const expanded = this._expanded.has(el);
    const pad = depth * 14 + 8;

    const tw = h('span', { class: 'tree-tw' + (hasKids ? '' : ' leaf'),
      html: hasKids ? (expanded ? TREE_ICONS.caretDown : TREE_ICONS.caretRight) : '' });
    tw.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!hasKids) return;
      if (expanded) this._expanded.delete(el); else this._expanded.add(el);
      this.render();
    });

    const row = h('div', { class: 'tree-row' + (el === this.selected ? ' selected' : ''),
      style: { paddingLeft: pad + 'px' } }, [
      tw, h('span', { class: 'tree-tag', html: tagOpenHtml(el, hasKids && !expanded) }),
    ]);
    // Hover a row → highlight that element on the page (like picking).
    row.addEventListener('mouseenter', () => this.api.hover?.(el));
    row.addEventListener('mouseleave', () => this.api.unhover?.());
    // Click a row → select it and open its property panel (design view).
    row.addEventListener('click', () => {
      this.api.unhover?.();
      if (this.api.pick) this.api.pick(el);
      else { this.selected = el; store.set({ selectedEl: el, view: 'design' }); this.render(); }
    });
    container.append(row);

    if (hasKids && expanded) {
      kids.forEach((c) => this._renderNode(c, container, depth + 1));
      container.append(h('div', { class: 'tree-row tree-close', style: { paddingLeft: pad + 'px' } },
        [h('span', { class: 'tree-tag', html: tagCloseHtml(el) })]));
    }
  }

  _deleteSelected() {
    const el = this.selected;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const next = el.nextElementSibling;
    const label = elementLabel(el);
    const selector = cssPath(el);
    el.remove();
    logChange({ type: 'delete', id: el.getAttribute('data-inspect-id'), to: 'removed', label, selector });
    record({ undo: () => parent.insertBefore(el, next), redo: () => el.remove() });
    const nextSel = parent !== document.body && parent !== document.documentElement ? parent : null;
    this.selected = nextSel;
    store.set({ selectedEl: nextSel });
    this._toast('Element deleted');
    this.render();
  }

  _copy() {
    const text = generateCss();
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => this._toast('CSS copied'));
  }
  _toast(msg) {
    const t = h('div', { class: 'toast', 'data-inspect-ui': '', text: msg });
    this.root.appendChild(t);
    setTimeout(() => t.remove(), 1400);
  }

  // ---------------- Assets view ----------------
  _assets(body) {
    const a = this._assetCache || (this._assetCache = collectAll());
    const copy = (text, label) => { navigator.clipboard?.writeText(text); this._toast((label || 'Copied')); };

    // Colors
    const colorGrid = h('div', { class: 'asset-colors' }, a.colors.map((c) => {
      const sw = h('button', {
        class: 'asset-swatch', title: `${c.hex} · used ${c.count}×`,
        style: { background: c.css }, onclick: () => copy(c.hex, c.hex + ' copied'),
      });
      return sw;
    }));

    // Typography
    const typeList = h('div', { class: 'asset-type-list' }, a.typography.map((t) => {
      const row = h('button', {
        class: 'asset-type', title: 'Copy CSS',
        onclick: () => copy(`font-family: ${t.family};\nfont-size: ${t.size};\nfont-weight: ${t.weight};`, 'Type style copied'),
      }, [
        h('div', { class: 'asset-type-preview', style: { fontFamily: t.family, fontSize: 'min(' + t.size + ', 28px)', fontWeight: t.weight }, text: 'Ag' }),
        h('div', { class: 'asset-type-meta' }, [
          h('div', { class: 'asset-type-name', text: t.family }),
          h('div', { class: 'asset-type-sub', text: `${parseInt(t.size)}px · ${t.weight}` }),
        ]),
      ]);
      return row;
    }));

    // SVGs
    const svgGrid = h('div', { class: 'asset-grid' }, a.svgs.map((s) => {
      const thumb = h('div', { class: 'asset-thumb asset-svg', title: 'Copy SVG' });
      if (s.type === 'inline') thumb.innerHTML = s.markup;
      else thumb.appendChild(h('img', { src: s.src, alt: '' }));
      thumb.addEventListener('click', () => copy(s.markup || s.src, 'SVG copied'));
      return thumb;
    }));

    // Images
    const imgGrid = h('div', { class: 'asset-grid' }, a.images.map((im) => {
      const thumb = h('div', { class: 'asset-thumb', title: 'Copy image URL' }, [
        h('img', { src: im.src, alt: '', loading: 'lazy' }),
      ]);
      thumb.addEventListener('click', () => copy(im.src, 'Image URL copied'));
      return thumb;
    }));

    body.append(
      h('div', { class: 'view-actions' }, [
        h('button', { class: 'btn primary', text: 'Rescan page', onclick: () => { this._assetCache = null; this.render(); } }),
      ]),
      assetSection('Colors', a.colors.length, colorGrid),
      assetSection('Typography', a.typography.length, typeList),
      assetSection('SVGs', a.svgs.length, svgGrid),
      assetSection('Images', a.images.length, imgGrid),
    );
  }

  _drag() {
    let sx, sy, ox, oy, dragging = false;
    this.el.addEventListener('mousedown', (e) => {
      const head = e.target.closest('.head');
      if (!head || e.target.closest('.hbtn') || store.get().docked) return;
      dragging = true;
      const r = this.el.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      // Pin to the current spot up front. Otherwise clearing `right` without
      // yet setting `left` snaps the panel to the left edge on a plain click.
      this.el.style.right = 'auto';
      this.el.style.left = r.left + 'px';
      this.el.style.top = r.top + 'px';
      document.addEventListener('mousemove', move, true);
      document.addEventListener('mouseup', up, true);
      e.preventDefault();
    });
    const move = (e) => {
      if (!dragging) return;
      this.el.style.left = ox + (e.clientX - sx) + 'px';
      this.el.style.top = Math.max(0, oy + (e.clientY - sy)) + 'px';
    };
    const up = () => { dragging = false; document.removeEventListener('mousemove', move, true); document.removeEventListener('mouseup', up, true); };
  }
}

// ---- helpers ----
function hbtn(name, title, onClick, extra = '') {
  return h('button', { class: 'hbtn' + (extra ? ' ' + extra : ''), title, onclick: onClick, html: icon(name) });
}
function dockToggleBtn() {
  const docked = store.get().docked;
  return h('button', {
    class: 'hbtn' + (docked ? ' active' : ''),
    title: docked ? 'Undock panel (float)' : 'Dock panel to the side',
    onclick: () => store.set({ docked: !store.get().docked }),
    html: icon('sidebar-right-01'),
  });
}
// A colour counts as "present" when it isn't fully transparent.
function hasColor(c) {
  if (!c) return false;
  const s = String(c).trim();
  if (s === 'transparent' || s === 'none') return false;
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) { const a = m[1].split(',')[3]; return a == null || parseFloat(a) > 0; }
  return true;
}
function assetSection(title, count, content) {
  const head = h('div', { class: 'sec-head' }, [
    h('span', {}, [title, count ? h('span', { class: 'asset-count', text: String(count) }) : null]),
    h('span', { class: 'chev', html: icon('chevron-down') }),
  ]);
  const sec = h('div', { class: 'section' }, [head, h('div', { class: 'sec-content' }, [content])]);
  head.addEventListener('click', () => sec.classList.toggle('closed'));
  return sec;
}
function classChain(el) {
  const out = [];
  let node = el, depth = 0;
  while (node && node.nodeType === 1 && node !== document.documentElement && depth < 3) {
    if (node.classList.length) out.unshift('.' + node.classList[0]);
    else out.unshift(node.tagName.toLowerCase());
    node = node.parentElement; depth++;
  }
  return out;
}
function flip(el, axis) {
  const cs = getComputedStyle(el);
  const cur = cs.transform === 'none' ? '' : cs.transform + ' ';
  setProp(el, 'transform', cur + (axis === 'x' ? 'scaleX(-1)' : 'scaleY(-1)'));
}
function firstFont(ff) { return (ff || '').split(',')[0].replace(/["']/g, '').trim() || 'system-ui'; }
function weightName(w) { return String(w); }
function normalizeLine(lh) { return lh === 'normal' ? '1.4' : lh; }
function parseLenSafe(v) { return v && v !== 'auto' ? v : '0px'; }
function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
const TREE_ICONS = {
  caretRight: '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M3 1.5l4 3.5-4 3.5z"/></svg>',
  caretDown: '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M1.5 3h7l-3.5 4z"/></svg>',
  back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  pick: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="4"/></svg>',
};
function tagOpenHtml(el, showEllipsis) {
  const tag = el.tagName.toLowerCase();
  let attrs = '';
  for (const a of el.attributes) {
    if (a.name.startsWith('data-inspect')) continue;
    const val = a.value.length > 40 ? a.value.slice(0, 40) + '…' : a.value;
    attrs += ` <span class="t-attr">${escapeHtml(a.name)}</span><span class="t-br">=</span><span class="t-val">"${escapeHtml(val)}"</span>`;
  }
  let s = `<span class="t-br">&lt;</span><span class="t-tag">${tag}</span>${attrs}<span class="t-br">&gt;</span>`;
  if (showEllipsis) s += `<span class="t-ell">…</span><span class="t-br">&lt;/</span><span class="t-tag">${tag}</span><span class="t-br">&gt;</span>`;
  return s;
}
function tagCloseHtml(el) {
  const t = el.tagName.toLowerCase();
  return `<span class="t-br">&lt;/</span><span class="t-tag">${t}</span><span class="t-br">&gt;</span>`;
}
function highlight(css) {
  return escapeHtml(css)
    .replace(/^([^{\n]+)\{/gm, '<span class="sel">$1</span>{')
    .replace(/^(\s+)([\w-]+)(:)/gm, '$1<span class="prop">$2</span>$3')
    .replace(/: ([^;]+);/g, ': <span class="val">$1</span>;');
}
