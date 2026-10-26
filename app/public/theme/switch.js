// The theme switch: labelled selects for this device's theme, dark style, look (preset), ground, layout and glass or
// Solid bars and sheets, and a colour well for the accent with a reset to the look's own colour (choice.js).
import { THEMES, LAYOUTS, themeChoice, chooseTheme, pickedAccent } from './choice.js';
import { DARK_STYLES, PRESET_IDS, SURFACE_IDS, MATERIALS } from './schema.js';
import { PRESETS, SURFACES } from './presets.js';
import { GRID, SHADES, snap } from './grid.js';

/** @type {Record<string, string>} */
const WORDS = {
  auto: 'Auto', light: 'Light', dark: 'Dark', oled: 'OLED black', comfortable: 'Comfortable', compact: 'Compact', glass: 'Glass', solid: 'Solid', '': "The look's own",
  ...Object.fromEntries(PRESETS.map(p => [p.id, p.name])),
  ...Object.fromEntries(Object.entries(SURFACES).map(([id, s]) => [id, s.label])),
};

/**
 * @param {'theme' | 'dark' | 'preset' | 'surface' | 'layout' | 'material'} key @param {string} label @param {readonly string[]} values
 * @param {() => void} after  runs after a pick (the colour well follows the look)
 * @returns {HTMLLabelElement}
 */
function picker(key, label, values, after) {
  const select = document.createElement('select');
  select.id = `${key}-pick`;
  select.append(...values.map(v => new Option(WORDS[v] ?? v, v)));
  select.value = themeChoice()[key];
  select.addEventListener('change', () => { chooseTheme({ [key]: select.value }); after(); });
  const wrap = document.createElement('label');
  wrap.append(`${label} `, select);
  return wrap;
}

// The accent: the phone's own colour picker, offered the grid's middle shade of each hue; Reset goes back to the
// look's (or the app's) colour.
function accentPicker() {
  const well = document.createElement('input');
  well.type = 'color';
  well.id = 'accent-pick';
  const list = document.createElement('datalist');
  list.id = 'accent-colours';
  list.append(...GRID.filter(x => x.hue !== 'Grey' && x.shade === SHADES - 2).map(x => new Option(x.name, x.c)));
  well.setAttribute('list', list.id);
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Reset colour';
  const sync = () => { well.value = pickedAccent(); reset.hidden = !themeChoice().accent; };
  well.addEventListener('change', () => { chooseTheme({ accent: snap(well.value) ?? '' }); sync(); });
  reset.addEventListener('click', () => { chooseTheme({ accent: '' }); sync(); well.focus(); });
  sync();
  const wrap = document.createElement('label');
  wrap.append('Colour ', well, list);
  return { parts: [wrap, reset], sync };
}

/**
 * @param {HTMLElement} host  the switch is added here
 * @returns {() => void} stop: removes it
 */
export function themeSwitch(host) {
  const box = document.createElement('div');
  box.className = 'row theme-switch';
  const accent = accentPicker();
  box.append(
    picker('theme', 'Theme', THEMES, accent.sync), picker('dark', 'Dark style', DARK_STYLES, accent.sync),
    picker('preset', 'Look', PRESET_IDS, accent.sync), picker('surface', 'Ground', SURFACE_IDS, accent.sync),
    ...accent.parts, picker('layout', 'Layout', LAYOUTS, accent.sync),
    picker('material', 'Bars and sheets', MATERIALS, accent.sync),
  );
  host.append(box);
  return () => box.remove();
}
