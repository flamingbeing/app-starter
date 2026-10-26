// What a theme choice may hold, in one place: every way in (stored choice, the switch, a later share link) goes
// through cleanChoice, so a value the switch can't show is dropped. The first value of each list is the default, so a
// new option stays off until picked. Pure, no DOM.
import { cleanHex } from './colour.js';
import { PRESETS, SURFACES } from './presets.js';

export const THEMES = Object.freeze(['auto', 'light', 'dark']);
export const DARK_STYLES = Object.freeze(['dark', 'oled']);
export const PRESET_IDS = Object.freeze(PRESETS.map(p => p.id));
// '' = the preset's own ground
export const SURFACE_IDS = Object.freeze(['', ...Object.keys(SURFACES)]);
export const LAYOUTS = Object.freeze(['comfortable', 'compact']);
// glass bars and sheets (glass.css), or solid ones: the per-device off-switch
export const MATERIALS = Object.freeze(['glass', 'solid']);
// motion: follow the device's Reduce Motion, or Still (no springs, slides or lifts) on this device whatever it says
export const MOTIONS = Object.freeze(['auto', 'still']);

/**
 * @typedef {{ theme: string, dark: string, preset: string, accent: string, surface: string, layout: string,
 *   material: string, motion: string }} Choice
 * accent: '' = the preset's (or the app's) colour, else a six-digit hex
 */

/** @param {readonly string[]} list @param {unknown} v */
const oneOf = (list, v) => list.find(x => x === v) ?? list[0];

/** @param {unknown} raw  anything (a stored object, a v0 { theme, layout }) @returns {Choice}  only allowed values */
export function cleanChoice(raw) {
  const r = /** @type {Record<string, unknown>} */ (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});
  return {
    theme: oneOf(THEMES, r.theme),
    dark: oneOf(DARK_STYLES, r.dark),
    preset: oneOf(PRESET_IDS, r.preset),
    accent: cleanHex(r.accent) ?? '',
    surface: oneOf(SURFACE_IDS, r.surface),
    layout: oneOf(LAYOUTS, r.layout),
    material: oneOf(MATERIALS, r.material),
    motion: oneOf(MOTIONS, r.motion),
  };
}
