// @core/theme v0 (incubating in the starter, with @core/ui): this device's theme (Auto, Light, Dark) and layout
// (Comfortable, Compact), the switch for them, and theme/theme.css's custom properties (loaded with <link>).
// Nothing runs on import: the page calls applyTheme() once.
export { THEMES, LAYOUTS, themeChoice, applyTheme, chooseTheme } from './choice.js';
export { themeSwitch } from './switch.js';
