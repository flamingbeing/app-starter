// The theme and layout switch: two labelled selects for this device's choice (choice.js).
import { THEMES, LAYOUTS, themeChoice, chooseTheme } from './choice.js';

/** @type {Record<string, string>} */
const WORDS = { auto: 'Auto', light: 'Light', dark: 'Dark', comfortable: 'Comfortable', compact: 'Compact' };

/**
 * @param {'theme' | 'layout'} key @param {string} label @param {readonly string[]} values
 * @returns {HTMLLabelElement}
 */
function picker(key, label, values) {
  const select = document.createElement('select');
  select.id = `${key}-pick`;
  select.append(...values.map(v => new Option(WORDS[v] || v, v)));
  select.value = themeChoice()[key];
  select.addEventListener('change', () => { chooseTheme({ [key]: select.value }); });
  const wrap = document.createElement('label');
  wrap.append(`${label} `, select);
  return wrap;
}

/**
 * @param {HTMLElement} host  the switch is added here
 * @returns {() => void} stop: removes it
 */
export function themeSwitch(host) {
  const box = document.createElement('div');
  box.className = 'row theme-switch';
  box.append(picker('theme', 'Theme', THEMES), picker('layout', 'Layout', LAYOUTS));
  host.append(box);
  return () => box.remove();
}
