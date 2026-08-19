# InspectCSS

**A free, open-source visual CSS editor that runs on any website.**

Point at any element on any page, see its box model, size and fonts, then edit
spacing, color, radius and typography live and copy clean, first-class CSS.
No library to import, no build step in the target site, no code changes — it
runs entirely in the browser.

This is an open, MIT-licensed take on the kind of in-browser visual CSS editor
that usually sits behind a paywall.

> Run `npm run dev` and open the demo to try it — a bottom dock and a dark
> inspector panel appear over the page, matching the layout below.

---

## Features

- **Inspect anything** — hover to highlight any element with a live box-model
  overlay (margin / padding shading) and a size badge (`213 × 39`).
- **Click to select** — a floating, draggable panel shows the element's tag,
  selector breadcrumb, dimensions and font.
- **Edit live** — Design tab with controls for:
  - Position / size / rotation (`X`, `Y`, `∠`, `W`, `H`, radius)
  - `display` / `position`
  - Margin & padding via a visual box editor
  - Typography (font family, size, weight, line-height, letter-spacing, align, color)
    with a searchable picker: system/web-safe fonts (offline) plus curated
    Google Fonts that load on demand; used Google fonts are added as an
    `@import` in the copied CSS
  - Fill & border (background, border color/width/style)
  - Effects (opacity, box-shadow)
- **Pseudo states** — edit `:hover`, `:focus`, `:active` variants.
- **Generated CSS** — every change produces copyable CSS with a readable
  selector, shown in the Code tab and copied with one click.
- **HTML tab** — see the selected element's markup.
- **Never collides with the page** — the UI lives in a Shadow DOM; edits are
  applied through a single injected stylesheet and are fully reversible.

## Quick start

```bash
npm install
npm run build      # produces dist/inspect.js and dist/inspect.min.js
```

Then try the demo page:

```bash
npm run dev        # serves the demo with live rebuild at http://localhost:5173/demo/
```

## Use it on a real site

Three ways to load `dist/inspect.js`, pick whichever suits you.

### 1. Script tag (your own pages)

```html
<script src="/path/to/inspect.js"></script>
```

### 2. Bookmarklet (any site — no install, no store fee)

The easiest way for anyone to use it. Open the [landing page](demo/index.html)
and **drag either button to your bookmarks bar** — click it on any page
(including `localhost`) to toggle the editor on and off:

- **InspectCSS** — a tiny loader that pulls the latest build from jsDelivr, so
  it always stays up to date.
- **InspectCSS · offline** — the whole tool packed inside the bookmark, so it
  also runs on strict-CSP sites (GitHub, banks) that block loaded scripts.

Prefer to generate the loader yourself? It's served free from the repo via
jsDelivr:

```bash
node scripts/bookmarklet.mjs
# → javascript:… loading cdn.jsdelivr.net/gh/abhineet00/design.inspect@master/dist/inspect.min.js
```

Create a new bookmark and paste the printed `javascript:…` string as its URL.

### 3. Browser extension (Chrome / Edge, MV3)

```bash
npm run build
```

Then load it unpacked:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` folder
4. Click the toolbar icon on any page to launch InspectCSS

## How it works

```
src/
  index.js            boot into a Shadow-DOM host, wire everything together
  core/
    store.js          tiny reactive state container
    inspector.js      pick mode: hover tracking + click-to-select
    overlay.js        box-model highlight + size badge (light-DOM, fixed layer)
    selector.js       readable, unique CSS selector for the copied output
    styleModel.js     reads computed + edited values into a structured model
    liveStyles.js     applies edits via one injected stylesheet; generates CSS
    util.js           DOM helpers, color + length parsing
  ui/
    panel.js          the floating panel with Design / Code / HTML tabs
    components.js      field, select, color-row, spacing-box widgets
    toolbar.js         the bottom dock
    theme.js           all panel styles (injected into the Shadow DOM)
```

Edits are keyed by a private `data-inspect-id` attribute so they apply reliably
even to elements with no id or class, while the **copied** CSS uses a readable
selector derived from the element's real ids/classes.

## Public API

Loading the bundle exposes a small global:

```js
window.InspectCSS.version    // "0.16.0"
window.InspectCSS.destroy()  // remove the editor and all injected styles
window.InspectCSS.app.select(element)  // select an element programmatically
```

Loading the bundle a second time toggles it off.

## Roadmap

- Undo / redo history
- Export edits as a `.css` file
- Flex / grid inspector
- Multi-select and copy-between-elements
- Firefox extension packaging

## Contributing

Issues and PRs welcome. The project is plain ES modules bundled with esbuild —
no framework — so it stays small and portable.

## License

[MIT](LICENSE)
