// @core/theme (incubating in the starter, with @core/ui): this device's theme choice (theme, dark style, look,
// accent, ground, layout), the palettes worked out from it with a contrast floor, the switch, and theme/theme.css's
// custom properties (loaded with <link>; the palette replaces its values once applyTheme runs).
// Nothing runs on import: the page calls applyTheme() once, as early as it can.
export { THEMES, LAYOUTS, themeChoice, applyTheme, chooseTheme } from './choice.js';
export { themeSwitch } from './switch.js';
export { DARK_STYLES, PRESET_IDS, SURFACE_IDS, cleanChoice } from './schema.js';
export { PRESETS, SURFACES } from './presets.js';
export { palettes, paletteCss, DEFAULT_ACCENT } from './palette-css.js';
export { contrast, checkPalette } from './colour.js';
