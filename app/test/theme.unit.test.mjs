// @core/theme's pure parts: what a stored choice means (choice.js, schema.js), the palettes every look makes and their
// contrast floor (colour.js, palette-css.js), the presets and the accent grid. node --test app/test/theme.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChoice, chooseTheme, themeChoice, THEMES, LAYOUTS } from '../public/theme/choice.js';
import { cleanChoice, DARK_STYLES, PRESET_IDS, SURFACE_IDS, MATERIALS, MOTIONS } from '../public/theme/schema.js';
import { contrast, cleanHex, mix, nudge, lightPalette, darkPalette, floor, checkPalette, pairs, glassSamples, frostAlpha, glassStrengths, BACKDROP } from '../public/theme/colour.js';
import { palettes, paletteCss, shapeTokens, accentOf, glassTokens, DEFAULT_ACCENT } from '../public/theme/palette-css.js';
import { PRESETS, SURFACES } from '../public/theme/presets.js';
import { GRID, HUES, SHADES, gridIndex, snap } from '../public/theme/grid.js';

const DEFAULTS = { theme: 'auto', dark: 'dark', preset: 'default', accent: '', surface: '', layout: 'comfortable', material: 'glass', motion: 'auto' };

test('nothing stored: the defaults, so new options stay off until picked', () => {
  assert.deepEqual(parseChoice(null), DEFAULTS);
  assert.equal(THEMES[0], 'auto');
  assert.equal(LAYOUTS[0], 'comfortable');
  assert.equal(DARK_STYLES[0], 'dark');
  assert.equal(PRESET_IDS[0], 'default');
  assert.equal(SURFACE_IDS[0], '');
});

test("v0's stored { theme, layout } still reads as it did", () => {
  assert.deepEqual(parseChoice('{"theme":"dark","layout":"compact"}'), { ...DEFAULTS, theme: 'dark', layout: 'compact' });
  assert.deepEqual(parseChoice('{"theme":"light"}'), { ...DEFAULTS, theme: 'light' });
});

test('a stored choice is kept, hex lower-cased', () => {
  const all = { theme: 'light', dark: 'oled', preset: 'paper', accent: '#ABCDEF', surface: 'sepia', layout: 'compact', material: 'solid', motion: 'still' };
  assert.deepEqual(parseChoice(JSON.stringify(all)), { ...all, accent: '#abcdef' });
});

test('unknown values or unreadable storage: the defaults', () => {
  assert.deepEqual(parseChoice('{"theme":"neon","layout":7,"dark":"amoled","preset":"nuhs","accent":"red","surface":"plaid"}'), DEFAULTS);
  assert.deepEqual(parseChoice('not json'), DEFAULTS);
  assert.deepEqual(parseChoice('null'), DEFAULTS);
  assert.deepEqual(parseChoice('[1,2]'), DEFAULTS);
  assert.deepEqual(cleanChoice({ accent: '#12345' }), DEFAULTS);
  assert.deepEqual(cleanChoice(Object.create({ theme: 'dark' })).theme, 'dark', '(inherited keys are read like own ones: harmless, all cleaned)');
});

test('storage refused: picks on this page still build on each other', () => {
  const refuse = () => { throw new Error('storage refused'); };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: refuse, setItem: refuse } });
  const classes = new Set(['glass']);
  const classList = { toggle: (/** @type {string} */ c, /** @type {boolean} */ on) => { if (on) classes.add(c); else classes.delete(c); } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { dataset: {}, classList } } });
  chooseTheme({ theme: 'dark' });
  chooseTheme({ layout: 'compact' });
  chooseTheme({ dark: 'oled', preset: 'eye' });
  assert.deepEqual(themeChoice(), { ...DEFAULTS, theme: 'dark', layout: 'compact', dark: 'oled', preset: 'eye' });
  assert.deepEqual(document.documentElement.dataset, { theme: 'dark', layout: 'compact', dark: 'oled', preset: 'eye' });
  assert.ok(classes.has('glass'), 'glass by default');
  chooseTheme({ material: 'solid' });
  assert.ok(!classes.has('glass'), 'Solid takes the glass class off');
  chooseTheme({ theme: 'auto', dark: 'dark', preset: 'default', layout: 'comfortable', material: 'glass' });
  assert.deepEqual(document.documentElement.dataset, {});
  assert.ok(classes.has('glass'));
});

test('contrast maths', () => {
  assert.ok(contrast('#000000', '#ffffff') > 20.9);
  assert.equal(contrast('#777777', '#777777'), 1);
  assert.equal(cleanHex('#ABCDEF'), '#abcdef');
  assert.equal(cleanHex('red'), null);
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.ok(contrast(nudge('#ffff00', ['#ffffff'], 4.5), '#ffffff') >= 4.5, 'darkened on white');
  assert.ok(contrast(nudge('#000080', ['#000000'], 7), '#000000') >= 7, 'lightened on black');
  assert.equal(nudge('#808080', ['#777777', '#888888'], 21), '#000000', 'nothing short of black passes: black');
});

test('every look x light/dark/OLED: text 4.5:1, lines and focus 3:1 (strong: 7:1 and 4.5:1)', () => {
  for (const preset of PRESETS) for (const dark of DARK_STYLES) {
    const strong = !!preset.strong, p = palettes({ preset: preset.id, dark }, { accent: DEFAULT_ACCENT });
    for (const [side, pal] of Object.entries(p)) {
      assert.deepEqual(checkPalette(pal, { strong }), [], `${preset.id} ${side} (${dark})`);
      for (const [fg, bg, need] of [['text', 'surface', strong ? 7 : 4.5], ['muted', 'bg', strong ? 7 : 4.5], ['line', 'bg', strong ? 4.5 : 3], ['on-accent', 'accent', 4.5]]) {
        assert.ok(contrast(pal[fg], pal[bg]) >= need, `${preset.id} ${side} ${fg} on ${bg}`);
      }
    }
    if (dark === 'oled') assert.equal(p.dark.bg, '#000000', `${preset.id}: OLED stays black`);
  }
});

test('awkward accents and grounds still pass: pale, white, black, grey, neon, every grid colour', () => {
  const picks = ['#fff176', '#ffffff', '#000000', '#808080', '#39ff14', ...GRID.map(x => x.c)];
  for (const accent of picks) for (const surface of SURFACE_IDS) for (const dark of DARK_STYLES) {
    const { light, dark: d } = palettes({ accent, surface, dark });
    assert.deepEqual([...checkPalette(light), ...checkPalette(d)], [], `${accent} ${surface} ${dark}`);
  }
});

test('the floor only moves what fails: a passing palette is unchanged, a failing token is nudged', () => {
  const light = lightPalette('#2563eb');
  const floored = floor(light);
  for (const k of Object.keys(light)) assert.equal(floored[k], light[k], k);
  const pale = floor({ ...light, muted: '#cccccc', line: '#eeeeee' });
  assert.ok(contrast(pale.muted, pale.bg) >= 4.5 && contrast(pale.line, pale.bg) >= 3);
  assert.match(checkPalette({ ...floored, text: '#999999' })[0], /^text on bg: 2\.\d\d:1 \(needs 4\.5:1\)$/);
});

test('roles follow the accent unless set', () => {
  const p = floor(darkPalette('#2563eb'));
  for (const k of ['fill', 'link', 'focus']) assert.equal(p[k], p.accent, k);
  assert.equal(p['on-fill'], p['on-accent']);
  assert.equal(floor({ ...lightPalette('#2563eb'), link: '#0b5d1e' }).link, '#0b5d1e');
});

test("the accent: the choice's, else the look's, else the app's, else v0's", () => {
  assert.equal(accentOf({}), DEFAULT_ACCENT);
  assert.equal(accentOf({}, { accent: '#0f766e' }), '#0f766e');
  assert.equal(accentOf({ preset: 'paper' }, { accent: '#0f766e' }), '#5b4636');
  assert.equal(accentOf({ preset: 'paper', accent: '#c2417a' }, { accent: '#0f766e' }), '#c2417a');
  assert.equal(palettes({}, { accent: '#2563eb' }).light.accent, lightPalette('#2563eb').accent);
});

test('grounds tint light and dark, never OLED', () => {
  const s = palettes({ surface: 'sepia' }), o = palettes({ surface: 'sepia', dark: 'oled' });
  assert.equal(s.light.bg, SURFACES.sepia.light?.bg);
  assert.equal(s.dark.surface, SURFACES.sepia.dark?.surface);
  assert.equal(o.dark.bg, '#000000');
  assert.equal(o.dark.surface, '#000000');
  assert.equal(palettes({ preset: 'eye' }).light.bg, SURFACES.sepia.light?.bg, "the look's ground");
});

test('presets: 8 classic, unique ids, known grounds, no NUHS colours', () => {
  assert.equal(PRESETS.length, 8);
  assert.equal(new Set(PRESET_IDS).size, 8);
  assert.equal(PRESETS[0].id, 'default');
  assert.equal(PRESETS[0].accent, undefined, "the default look takes the app's colour");
  for (const p of PRESETS) if (p.surface) assert.ok(SURFACES[p.surface], p.id);
  const all = JSON.stringify(PRESETS).toLowerCase();
  for (const nuhs of ['#002f6c', '#e57200', '#e4002b', '#178fd7', 'nuhs']) assert.ok(!all.includes(nuhs), nuhs);
});

test('shape tokens: corners, borders, shadow, headings, line height', () => {
  assert.deepEqual(shapeTokens({}), { 'radius-s': '.25rem', radius: '.4rem', 'radius-l': '.75rem', border: '1px', shadow: '0 1px 3px rgb(0 0 0 / .14)', 'font-head': 'inherit', leading: '1.5' });
  assert.equal(shapeTokens({ preset: 'soft' }).radius, '.8rem');
  assert.equal(shapeTokens({ preset: 'flat' }).shadow, 'none');
  assert.equal(shapeTokens({ preset: 'contrast' }).border, '2px');
  assert.match(shapeTokens({ preset: 'paper' })['font-head'], /serif/);
  assert.equal(shapeTokens({ preset: 'eye' }).leading, '1.65');
});

test('paletteCss: light on :root, dark for a dark device (unless Light) and for Dark; only known tokens', () => {
  const css = paletteCss({ dark: 'oled' });
  const [root, auto, dark] = css.split('\n');
  assert.match(root, /^:root \{ --radius-s: .*--bg: #[0-9a-f]{6};/);
  assert.match(auto, /^@media \(prefers-color-scheme: dark\) \{ :root:not\(\[data-theme="light"\]\) \{ .*--bg: #000000;/);
  assert.match(dark, /^:root\[data-theme="dark"\] \{ .*--bg: #000000;/);
  const names = new Set([...css.matchAll(/--([a-z-]+):/g)].map(m => m[1]));
  const allowed = ['bg', 'surface', 'text', 'muted', 'line', 'accent', 'on-accent', 'danger', 'ok', 'warn', 'fill', 'on-fill', 'link', 'focus', 'selection',
    'radius-s', 'radius', 'radius-l', 'border', 'shadow', 'font-head', 'leading', 'glass', 'glass-thick', 'glass-clear'];
  assert.deepEqual([...names].sort(), allowed.sort());
  assert.ok(!paletteCss({ accent: '</style><script>', surface: '} body {' }).includes('<'), 'only cleaned values reach the CSS');
});

test('the accent grid: 13 rows of 8, named cells, snap to 6 bits a channel', () => {
  assert.equal(GRID.length, HUES.length * SHADES);
  assert.equal(GRID[0].name, 'Red, shade 1');
  assert.equal(GRID.at(-1)?.name, 'Black');
  assert.equal(gridIndex(GRID[17].c.toUpperCase()), 17);
  for (const x of GRID) assert.equal(snap(x.c), x.c, `${x.name} is already snapped`);
  assert.equal(snap('#3a6390'), '#396192');
  assert.equal(snap('nope'), null);
});

test('Solid: a per-device choice, glass unless picked; unknown values are glass', () => {
  assert.deepEqual(MATERIALS, ['glass', 'solid']);
  assert.equal(cleanChoice({}).material, 'glass');
  assert.equal(cleanChoice({ material: 'solid' }).material, 'solid');
  assert.equal(cleanChoice({ material: 'frosted' }).material, 'glass');
  assert.equal(parseChoice(JSON.stringify({ theme: 'dark', layout: 'compact' })).material, 'glass', 'v0 choices get glass');
});

// Text on glass: the glass is the card colour at strength a over whatever shows through it, so every pair that sits
// on a card must pass on mix(sample, surface, a) for every sample, at the strength the palette names.
/** @param {Record<string, string>} p @param {string[]} samples @param {number} a @param {boolean} strong */
const glassMisses = (p, samples, a, strong) => pairs(strong).filter(([, on]) => on.includes('surface'))
  .flatMap(([fg, , need]) => samples.map(s => [fg, s, need, contrast(p[fg], mix(s, p.surface, a))]))
  .filter(([, , need, ratio]) => ratio < need - 1e-9)
  .map(([fg, s, need, ratio]) => `${fg} over ${s}: ${Number(ratio).toFixed(2)}:1 (needs ${need}:1)`);

test('text on glass: every look x light/dark/OLED keeps its floor over the page, cards, fill and blurred text', () => {
  for (const preset of PRESET_IDS) for (const dark of DARK_STYLES) {
    const strong = !!PRESETS.find(p => p.id === preset)?.strong;
    const both = palettes({ preset, dark });
    for (const [mode, p] of Object.entries(both)) {
      const at = glassStrengths(p, { strong }), where = `${preset} ${dark} ${mode}`;
      assert.deepEqual(glassMisses(p, glassSamples(p), at.glass, strong), [], `${where}: glass`);
      assert.deepEqual(glassMisses(p, glassSamples(p, true), at.thick, strong), [], `${where}: thick glass over the backdrop`);
      // see-through on every look (no palette change needed): never the solid card colour
      for (const [tier, a] of Object.entries(at)) assert.ok(a >= 0.5 && a < 1, `${where}: ${tier} ${a}`);
      assert.ok(at.thick >= 0.88 && at.glass >= 0.72, `${where}: the least strength of each tier`);
    }
  }
});

test('frostAlpha (from logbook): the lowest passing strength, never under least, 1 when nothing short of solid passes', () => {
  const p = floor(lightPalette('#3a6390'));
  const a = frostAlpha(glassSamples(p), p);
  assert.ok(a > 0 && a < 1);
  assert.deepEqual(glassMisses(p, glassSamples(p), a, false), []);
  assert.notDeepEqual(glassMisses(p, glassSamples(p), a - 0.01, false), [], 'one step less fails');
  assert.equal(frostAlpha(glassSamples(p), p, { least: 0.95 }), 0.95);
  // a text colour that only just passes on the card: nothing see-through keeps it
  const tight = { ...p, muted: '#767676' };   // 4.54:1 on white, under 4.5:1 once any black shows through
  assert.equal(frostAlpha(['#000000'], tight), 1);
  // under a sheet the samples are shaded by the backdrop
  assert.equal(glassSamples(p, true)[1], mix(p.surface, '#000000', BACKDROP));
});

test('glass tokens: the card colour see-through at the palette strengths', () => {
  const p = palettes({}).light, at = glassStrengths(p);
  assert.deepEqual(glassTokens(p, {}), {
    glass: `color-mix(in srgb, var(--surface) ${Math.round(at.glass * 100)}%, transparent)`,
    'glass-thick': `color-mix(in srgb, var(--surface) ${Math.round(at.thick * 100)}%, transparent)`,
    'glass-clear': `color-mix(in srgb, var(--surface) ${Math.round(at.clear * 100)}%, transparent)`,
  });
  assert.match(paletteCss({}), /--glass: color-mix\(in srgb, var\(--surface\) \d+%, transparent\);/);
});

test('Still is off until picked on this device; unknown motion reads as auto', () => {
  assert.equal(MOTIONS[0], 'auto');
  assert.equal(cleanChoice({}).motion, 'auto');
  assert.equal(cleanChoice({ motion: 'still' }).motion, 'still');
  assert.equal(cleanChoice({ motion: 'slow' }).motion, 'auto');
  assert.equal(parseChoice(JSON.stringify({ theme: 'dark' })).motion, 'auto', 'older choices get auto');
});
