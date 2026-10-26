# UI kit: looks, density and the glass guard

`@core/theme` (in `app/public/theme/`) and `@core/ui` (in `app/public/ui/`) are incubating in the starter. Each device
chooses three things, kept in `choice.js`: **look × theme × density**, plus Bars and sheets (glass or Solid). The
gallery at `/kit/` shows every part in every look; its tests are listed in [kit-tests.md](kit-tests.md).

## Looks

A look is data, not a fork. Each one is a file in `theme/looks/` with:

- **variants**: a few named choices that `choice.js` shows as `data-*` marks on `<html>`. The CSS styles from them.

  | Variant | Values |
  | --- | --- |
  | `header` | `plain` (the large title sits on the page) · `band` (the title sits on a band of the accent colour) |
  | `menu` | `popover` (the hold menu opens beside its row) · `sheet` (it opens from the bottom on phones, under 840 px) |
  | `glass` | `bars` (all floating chrome) · `pill` (only the floating pills: the action bar, toasts and a floating tab bar) · `none` |
  | `tick` | `round` · `square` (the ticks in select mode) |
  | `tabbar` | `float` (a pill over the content) · `edge` (full width along the bottom) |

- **tokens**: custom properties that `palette-css.js` puts on `:root`. Every look sets the same keys: the heading font,
  the title size, weight and tracking, the bar line, list card radius, inset, edge, separator and shadow, the row
  weight, the radii of controls, pills, menus and sheets, the tick size, the active tab's background, and the glass
  tint (how much of the accent colour the glass takes).

The three looks so far:

| Look | Name | In short |
| --- | --- | --- |
| A | Tinted glass | Glass bars with a hint of the accent, a floating tab bar, card lists, round ticks |
| B | Colour band | The title on a band of the accent, solid bars, bottom-sheet menus, square ticks, a tab bar along the edge |
| C | Dense and quiet | Flush lists, small titles, glass only on the floating pills |

The app picks its own look with `applyTheme({ look: 'b' })`. A device's own pick wins. Without either, the look is A.

## Density

`comfortable` · `regular` (default) · `compact` set the row height to **60 / 50 / 44 px**, along with the gaps and the
text size. Taps are never smaller than 44 px. (An extra-dense density comes later.)

## Glass guard

On weak phones, glass costs a repaint on every frame. The guard (`theme/guard.js`) turns it down to Solid when:

- `navigator.deviceMemory` is 4 GB or less (only Chromium reports it), or
- a probe on the first scroll times 30 frames and their median is over 20 ms.

The verdict is kept on this device (`localStorage` key `core-glass-guard`). Settings then says why glass is off.
The person's own Solid always wins. "Glass, even here" (`always`) overrides the guard. Glass is only ever on floating
chrome, with at most three layers and two blur tiers. Reduce transparency, more contrast, and browsers without
`backdrop-filter` all get Solid from CSS.

## Switchers

- Settings (`themeSwitch`) has Look and Density with the rest of the theme choices.
- The gallery has its own Look and Density pickers (`lookSwitch`). `/kit/?look=b&density=compact` shows a look without
  keeping it; picking from the switcher keeps it. `?guard=again` forgets the guard's verdict so it runs again.

## Adding a look

No component code. If a look seems to need a fork of a part, add a variant instead, and ask first.

1. Copy `app/public/theme/looks/c.js` to a new file (say `d.js`). Give it an `id`, a `name` and a one-line `desc`, then
   pick its variants and set every token. `app/test/looks.unit.test.mjs` fails if a key is missing or a variant is
   unknown.
2. Import it in `theme/looks.js` and add it to `LOOKS`. Its words show up in both switchers on their own.
3. Add it to `LOOKS` in `e2e/looks.spec.mjs` with the variants it should show. It then gets axe and screenshots at 390,
   820 and 1280 px. Add a row to [kit-tests.md](kit-tests.md).
4. Run `node tools/sw-files.mjs app` (the new file is part of the shell), then the checks in `AGENTS.md`.
5. Check the gallery by eye in light and dark: `/kit/?look=d`.

A new variant value takes one more step. Add it to `VARIANTS` in `looks.js`, add the CSS that styles
`[data-<variant>="<value>"]` (in `ui.css`, `ui/gestures.css` or `glass.css`), add the mark to `early.js`'s list if the
variant is new, and give it a test.
