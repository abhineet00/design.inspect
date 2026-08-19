// Font library for the Typography font-family picker.
//
// System fonts never touch the network. Google fonts load strictly on demand:
// a tiny name-subset request powers the menu previews (only when the menu is
// opened), and the full family loads only when a font is actually applied.

export const SYSTEM_FONTS = [
  { name: 'System UI', stack: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` },
  { name: 'Sans Serif', stack: `-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif` },
  { name: 'Serif', stack: `Georgia, 'Times New Roman', Times, serif` },
  { name: 'Monospace', stack: `ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace` },
  { name: 'Arial', stack: `Arial, Helvetica, sans-serif` },
  { name: 'Georgia', stack: `Georgia, serif` },
  { name: 'Times New Roman', stack: `'Times New Roman', Times, serif` },
  { name: 'Courier New', stack: `'Courier New', Courier, monospace` },
  { name: 'Verdana', stack: `Verdana, Geneva, sans-serif` },
  { name: 'Trebuchet MS', stack: `'Trebuchet MS', Helvetica, sans-serif` },
];

// [name, generic-fallback]. A generous, curated slice of Google Fonts spanning
// sans / serif / display / mono / handwriting — the ones people actually reach
// for, without a 1,800-row menu.
const G = (name, cat = 'sans-serif') => ({ name, cat });
export const GOOGLE_FONTS = [
  G('Inter'), G('Roboto'), G('Open Sans'), G('Lato'), G('Montserrat'), G('Poppins'),
  G('Raleway'), G('Nunito'), G('Work Sans'), G('Rubik'), G('DM Sans'), G('Manrope'),
  G('Mulish'), G('Quicksand'), G('Josefin Sans'), G('Karla'), G('Figtree'), G('Outfit'),
  G('Space Grotesk'), G('Oswald'), G('Archivo'),
  G('Playfair Display', 'serif'), G('Merriweather', 'serif'), G('Lora', 'serif'),
  G('PT Serif', 'serif'), G('Roboto Slab', 'serif'), G('Bitter', 'serif'),
  G('Cormorant Garamond', 'serif'), G('Libre Baskerville', 'serif'), G('EB Garamond', 'serif'),
  G('Bebas Neue'), G('Anton'), G('Abril Fatface', 'serif'),
  G('Roboto Mono', 'monospace'), G('Space Mono', 'monospace'), G('JetBrains Mono', 'monospace'),
  G('IBM Plex Mono', 'monospace'), G('Fira Code', 'monospace'), G('Source Code Pro', 'monospace'),
  G('Dancing Script', 'cursive'), G('Caveat', 'cursive'), G('Pacifico', 'cursive'),
  G('Lobster', 'cursive'), G('Sacramento', 'cursive'),
];

const googleByName = new Map(GOOGLE_FONTS.map((f) => [f.name, f]));

export function isGoogle(name) { return googleByName.has(name); }

// The full CSS `font-family` value for a chosen name — a system stack, a Google
// family with its generic fallback, or an unknown literal passed through as-is.
export function fontStack(name) {
  const sys = SYSTEM_FONTS.find((s) => s.name === name);
  if (sys) return sys.stack;
  const g = googleByName.get(name);
  if (g) return `'${g.name}', ${g.cat}`;
  return name;
}

// The preview `font-family` for a menu row (renders the label in its own face).
export function previewStack(name) { return fontStack(name); }

function famParam(name) { return 'family=' + name.trim().replace(/\s+/g, '+'); }
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

function addLink(href, id) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.id = id;
  link.setAttribute('data-inspect-ui', '');
  document.head.appendChild(link);
}

// Load the full family (a few weights) so an applied Google font renders on the
// page. Deduped; no-op for system fonts. Document-level @font-face is visible
// inside the panel's Shadow DOM too, so previews there work as well.
const loadedFull = new Set();
export function ensureGoogleFont(name) {
  if (!isGoogle(name) || loadedFull.has(name)) return;
  loadedFull.add(name);
  addLink(
    `https://fonts.googleapis.com/css2?${famParam(name)}:wght@300;400;500;600;700&display=swap`,
    'inspect-font-' + slug(name),
  );
}

// One small request that subsets every menu font to just the characters used in
// the font names — enough to preview each row in its own face. Loaded once, the
// first time the picker opens.
let previewLoaded = false;
export function loadFontPreviews() {
  if (previewLoaded) return;
  previewLoaded = true;
  const fams = GOOGLE_FONTS.map((f) => famParam(f.name)).join('&');
  const chars = [...new Set(GOOGLE_FONTS.map((f) => f.name).join('').split(''))].join('');
  addLink(
    `https://fonts.googleapis.com/css2?${fams}&text=${encodeURIComponent(chars)}&display=swap`,
    'inspect-font-previews',
  );
}

// For copied/exported CSS: an @import line for every Google font that appears in
// the generated output, so the CSS is self-contained when pasted elsewhere.
export function googleImportsFor(cssText) {
  const out = [];
  for (const f of GOOGLE_FONTS) {
    if (cssText.includes(`'${f.name}'`) || cssText.includes(`"${f.name}"`)) {
      out.push(`@import url('https://fonts.googleapis.com/css2?${famParam(f.name)}:wght@300;400;500;600;700&display=swap');`);
    }
  }
  return out;
}
