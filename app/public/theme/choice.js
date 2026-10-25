// This device's theme and layout: kept in localStorage, shown as data-theme / data-layout on <html> (theme.css reads
// them). Nothing chosen, an unknown value or no storage: the defaults, so a new option stays off until picked.

export const THEMES = Object.freeze(['auto', 'light', 'dark']);
export const LAYOUTS = Object.freeze(['comfortable', 'compact']);
const KEY = 'core-theme';

/** @typedef {{ theme: string, layout: string }} Choice */

/** @param {string | null} stored  what KEY holds -> the choice it names, defaults where it names none */
export function parseChoice(stored) {
  /** @type {Record<string, unknown>} */
  let saved = {};
  try { saved = JSON.parse(stored || '{}') || {}; } catch { /* unreadable: the defaults */ }
  const theme = THEMES.find(t => t === saved.theme) || THEMES[0];
  const layout = LAYOUTS.find(l => l === saved.layout) || LAYOUTS[0];
  return { theme, layout };
}

/** @returns {Choice} */
export function themeChoice() {
  try { return parseChoice(localStorage.getItem(KEY)); } catch { return parseChoice(null); }
}

/** @param {Choice} c */
function show({ theme, layout }) {
  const root = document.documentElement;
  if (theme === THEMES[0]) delete root.dataset.theme; else root.dataset.theme = theme;
  if (layout === LAYOUTS[0]) delete root.dataset.layout; else root.dataset.layout = layout;
}

// Shows this device's choice; call once at start.
export function applyTheme() { show(themeChoice()); }

/** @param {Partial<Choice>} change  -> the choice now (kept on this device when storage allows) */
export function chooseTheme(change) {
  const next = parseChoice(JSON.stringify({ ...themeChoice(), ...change }));
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* no storage: this page only */ }
  show(next);
  return next;
}
