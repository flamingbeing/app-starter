// A theme choice -> the page's custom properties: the preset's look, the accent (the choice's, else the preset's, else
// the app's), the ground, then the light palette and the dark one (OLED when picked), each brought up to its contrast
// floor (colour.js). choice.js puts the text in the page; the tests read the same palettes. Pure, no DOM.
import { lightPalette, darkPalette, floor } from './colour.js';
import { PRESETS, SURFACES } from './presets.js';
import { cleanChoice } from './schema.js';

// The app's colour when it names none (applyTheme({ accent })): v0's light accent
export const DEFAULT_ACCENT = '#3a6390';

/** @typedef {import('./schema.js').Choice} Choice */
/** @typedef {import('./colour.js').Palette} Palette */
/** @typedef {{ accent?: string }} AppTheme  the app's own defaults (config) */

/** @param {Partial<Choice>} choice */
const presetOf = choice => PRESETS.find(p => p.id === choice.preset) ?? PRESETS[0];

/** @param {Partial<Choice>} choice @param {AppTheme} [app] @returns {string}  the accent picked: the choice's, the preset's or the app's */
export const accentOf = (choice, app = {}) => cleanChoice(choice).accent || presetOf(cleanChoice(choice)).accent || app.accent || DEFAULT_ACCENT;

/**
 * The two palettes a choice shows: light, and dark (pure black when the dark style is OLED; a ground never tints OLED).
 * @param {Partial<Choice>} choice @param {AppTheme} [app] @returns {{ light: Palette, dark: Palette }}
 */
export function palettes(choice, app = {}) {
  const c = cleanChoice(choice), preset = presetOf(c), accent = accentOf(c, app);
  const ground = SURFACES[c.surface || preset.surface || ''];
  const oled = c.dark === 'oled', strong = !!preset.strong;
  return {
    light: floor({ ...lightPalette(accent), ...ground?.light }, { strong }),
    dark: floor({ ...darkPalette(accent, oled), ...(oled ? {} : ground?.dark) }, { strong }),
  };
}

// corners per round level: small, normal, large (level 2 is v0's .4rem)
const ROUND = [['0', '0', '0'], ['.15rem', '.25rem', '.4rem'], ['.25rem', '.4rem', '.75rem'], ['.5rem', '.8rem', '1.25rem']];

/** @param {Partial<Choice>} choice @returns {Record<string, string>}  shape and type tokens (the same in light and dark) */
export function shapeTokens(choice) {
  const p = presetOf(cleanChoice(choice));
  const [s, m, l] = ROUND[p.round ?? 2];
  return {
    'radius-s': s, radius: m, 'radius-l': l, border: `${p.border ?? 1}px`,
    shadow: p.shadow === false ? 'none' : '0 1px 3px rgb(0 0 0 / .14)',
    'font-head': p.head === 'serif' ? 'ui-serif, Georgia, "Times New Roman", serif' : 'inherit',
    leading: String(p.leading ?? 1.5),
  };
}

/** @param {Record<string, string>} t */
const decl = t => Object.entries(t).map(([k, v]) => `--${k}: ${v};`).join(' ');

/**
 * The CSS text for a choice: light on :root, dark when chosen or when Auto meets a dark device.
 * @param {Partial<Choice>} choice @param {AppTheme} [app] @returns {string}
 */
export function paletteCss(choice, app = {}) {
  const { light, dark } = palettes(choice, app);
  return [
    `:root { ${decl(shapeTokens(choice))} ${decl(light)} }`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${decl(dark)} } }`,
    `:root[data-theme="dark"] { ${decl(dark)} }`,
  ].join('\n');
}
