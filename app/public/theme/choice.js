// This device's theme choice (schema.js: theme, dark style, preset, accent, surface, layout, material): kept in
// localStorage, shown as data-theme / data-dark / data-preset / data-layout / data-motion and the glass class on <html> and as the palette's custom properties in one
// constructed stylesheet (palette-css.js; constructed, so the Content-Security-Policy needs no inline style). Nothing
// chosen, an unknown value or no storage: the defaults, so a new option stays off until picked. v0's stored
// { theme, layout } reads as it did.
import { THEMES, LAYOUTS, cleanChoice } from './schema.js';
import { paletteCss, accentOf } from './palette-css.js';
import { cleanHex } from './colour.js';

export { THEMES, LAYOUTS };
const KEY = 'core-theme';
// The last look shown (marks + palette CSS), for early.js to put back before the first paint.
const PAINT = 'core-theme-paint';
// The choice made on this page while storage refuses it, so a second pick builds on the first.
/** @type {Choice | null} */
let unstored = null;
/** @type {import('./palette-css.js').AppTheme} */
let app = {};
/** @type {CSSStyleSheet | null} */
let sheet = null;

/** @typedef {import('./schema.js').Choice} Choice */

/** @param {string | null} stored  what KEY holds -> the choice it names, defaults where it names none */
export function parseChoice(stored) {
  let saved = null;
  try { saved = JSON.parse(stored || 'null'); } catch { /* unreadable: the defaults */ }
  return cleanChoice(saved);
}

/** @returns {Choice} */
export function themeChoice() {
  if (unstored) return unstored;
  try { return parseChoice(localStorage.getItem(KEY)); } catch { return parseChoice(null); }
}

/** @returns {string}  the accent this device's choice shows before its contrast floor (the switch's colour well) */
export const pickedAccent = () => accentOf(themeChoice(), app);

/** @param {HTMLElement} root @param {string} key @param {string} value @param {string} off  the value no attribute means */
function mark(root, key, value, off) {
  if (value === off) delete root.dataset[key]; else root.dataset[key] = value;
}

/** @param {Choice} c */
function show(c) {
  const root = document.documentElement;
  mark(root, 'theme', c.theme, THEMES[0]);
  mark(root, 'dark', c.dark, 'dark');
  mark(root, 'preset', c.preset, 'default');
  mark(root, 'layout', c.layout, LAYOUTS[0]);
  mark(root, 'motion', c.motion, 'auto');
  root.classList.toggle('glass', c.material === 'glass');
  // (no constructed stylesheets, as in node or an old browser: theme.css's own values stay)
  if (typeof CSSStyleSheet !== 'function' || !('adoptedStyleSheets' in document)) return;
  // (early.js's sheet, when it put back the last look before the first paint: this one replaces its values)
  if (!sheet) sheet = /** @type {any} */ (globalThis).coreThemeSheet ?? null;
  if (!sheet) { sheet = new CSSStyleSheet(); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]; }
  const css = paletteCss(c, app);
  sheet.replaceSync(css);
  const { theme, dark, preset, layout, motion } = root.dataset;
  try { localStorage.setItem(PAINT, JSON.stringify({ marks: { theme, dark, preset, layout, motion }, solid: c.material === 'solid', css })); } catch { /* early.js finds none */ }
}

/**
 * Shows this device's choice; call once, as early as the page can (the starter's boot.js, before first paint).
 * @param {import('./palette-css.js').AppTheme} [appTheme]  the app's own defaults: accent, its colour (hex)
 */
export function applyTheme(appTheme = {}) {
  const accent = cleanHex(appTheme.accent);
  app = accent ? { accent } : {};
  show(themeChoice());
}

/** @param {Partial<Choice>} change  -> the choice now (kept on this device when storage allows) */
export function chooseTheme(change) {
  const next = cleanChoice({ ...themeChoice(), ...change });
  try { localStorage.setItem(KEY, JSON.stringify(next)); unstored = null; } catch { unstored = next; }
  show(next);
  return next;
}
