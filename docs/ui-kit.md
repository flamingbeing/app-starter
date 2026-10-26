# The UI kit (`@core/ui`)

Gesture parts, the adaptive shell, the looks and the placement rules every app built on this starter follows. The code is in
`app/public/ui/`; the galleries are `/kit/` (the gesture parts) and `/kit/shell/` (the sample list app in the shell).
Tests are listed in [kit-tests.md](kit-tests.md); stage notes in [ui-kit-progress.md](ui-kit-progress.md).

## The shell (`ui/shell/`)

One page, three layouts, picked by the window width (Material 3 size classes). `data-size` on the shell and on `<html>`
says which; a `ui-size` event fires when it changes (a window resize or a tablet turning).

| Width | Class | Layout |
| --- | --- | --- |
| under 600 px | phone | tab bar at the bottom, one pane at a time; opening a row pushes the detail screen (Back pops it) |
| 600–839 px | tablet | side bar, list and detail side by side; sheets stay bottom sheets |
| 840 px and up | laptop | wider side bar, list and detail side by side; sheets become centred dialogs, or a side panel |

Use it with the markup in `app/public/kit/shell/index.html`: a `.ui-shell` holding `.ui-sidebar`, `main.ui-screens.ui-panes`
(a `.ui-pane-list` and a `.ui-pane-detail` screen) and `nav.ui-tabbar`. Start it after `startGestures()`:

```js
const kit = startGestures();
const shell = adaptiveShell(document.querySelector('.ui-shell'), { screens: kit.screens, render: (row, detail) => { … } });
```

- **No router change.** The detail is an ordinary pushed `.ui-screen`; from 600 px the CSS shows both panes at once,
  so the screen stack's history entries (`{ uiScreens }`, `{ uiSheet }`) are unchanged.
- `shell.open(row)` selects a row (`aria-current="true"`) and fills the detail. Several rows ticked show a summary
  (`.ui-detail-multi`) instead of one item (`.ui-detail-one`).
- **Sheets.** From 840 px a sheet is a centred dialog. Give it `data-wide="panel"` and it docks to the right edge at
  full height instead (a form beside the list).

### Keyboard and pointer

| Input | Does |
| --- | --- |
| Right-click, Shift+F10, the context-menu key | the hold menu on the row |
| Click, Enter | open the row (when not selecting) |
| Up / Down | move between rows |
| Ctrl/Cmd-click | add or remove a row; starts select mode from the open row |
| Shift-click | tick the range from the open row (or the last clicked) to this one |
| Ctrl/Cmd+K | focus the search, wherever focus is (not while a dialog is open) |
| Esc | in search: clear, then leave; in select mode: leave it; a phone's pushed detail: go back; a menu or dialog closes first |
| Back (browser, Android) | pops the pushed screen or closes the open sheet |

## Placement rules

Where each thing goes, on every size.

- **Search:** phone, a pull-down field under the title (always one swipe away); tablet and laptop, the top of the
  side bar, and Ctrl/Cmd+K anywhere.
- **New item:** one primary button, top right on a phone, in the list header on bigger screens. Never a floating round
  button over content.
- **Filters:** chips under the title; more than five go into a Filter sheet.
- **Item actions:** hold (phone) or right-click (laptop) for the menu; the detail screen repeats them as buttons.
- **Select mode:** from the hold menu or Select in the header; actions in a bottom bar (phone) or the list header
  (tablet and laptop).
- **Sync, account, sign out:** in Settings, plus a small sync dot in the bar only when something is wrong.
- **Undo over "Are you sure":** toasts with Undo for moves and deletes; a typed confirmation only for wiping data.

## Settings rules

What Settings lets you change, by where it lives.

- **Per device:** look, density, light / dark / follow system, solid bars, text size (follows the phone first),
  reduce motion.
- **Per account:** name, sign-in, which group the account belongs to, notifications.
- **Per app:** only things that change what the app does (units, a default section, list sort), never layout.
- **Not offered:** custom colours per screen, moving buttons around. Fewer knobs keeps every look testable.

## Looks, density and the glass guard (`@core/theme`)

`@core/theme` (in `app/public/theme/`) and `@core/ui` (in `app/public/ui/`) are incubating in the starter. Each device
chooses three things, kept in `choice.js`: **look × theme × density**, plus Bars and sheets (glass or Solid). The
gallery at `/kit/` shows every part in every look; its tests are listed in [kit-tests.md](kit-tests.md).

### Looks

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

### Density

`comfortable` · `regular` (default) · `compact` set the row height to **60 / 50 / 44 px**, along with the gaps and the
text size. Taps are never smaller than 44 px. (An extra-dense density comes later.)

### Glass guard

On weak phones, glass costs a repaint on every frame. The guard (`theme/guard.js`) turns it down to Solid when:

- `navigator.deviceMemory` is 4 GB or less (only Chromium reports it), or
- a probe on the first scroll times 30 frames and their median is over 20 ms.

The verdict is kept on this device (`localStorage` key `core-glass-guard`). Settings then says why glass is off.
The person's own Solid always wins. "Glass, even here" (`always`) overrides the guard. Glass is only ever on floating
chrome, with at most three layers and two blur tiers. Reduce transparency, more contrast, and browsers without
`backdrop-filter` all get Solid from CSS.

### Switchers

- Settings (`themeSwitch`) has Look and Density with the rest of the theme choices.
- The gallery has its own Look and Density pickers (`lookSwitch`). `/kit/?look=b&density=compact` shows a look without
  keeping it; picking from the switcher keeps it. `?guard=again` forgets the guard's verdict so it runs again.

### Adding a look

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
