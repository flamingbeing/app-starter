# UI kit progress

Where the `@core/ui` kit stands, for whoever picks up the next stage. Stages K1–K5 are the owner's; keep this file
current at the end of each stage (what landed, what the next stage needs to know).

## K1: gestures + gallery (done)

- Modules in `app/public/ui/`, ES modules with no dependencies, each starting only where its markup is
  (`startGestures()` in `gestures.js` starts them all): `gesture.js` (shared: hold time, slop, Still, haptic,
  no-gesture zones), `hold-menu.js`, `select-mode.js`, `detent-sheet.js`, `screens.js`, `tab-bar.js`,
  `large-title.js`. Look: `ui/gestures.css`, on the theme's existing tokens only (no look work yet).
- Still: a per-device theme choice (`motion: 'auto' | 'still'`, default auto) shown as `html[data-motion="still"]`;
  `still()` also honours the device's Reduce Motion.
- Haptic: `navigator.vibrate`, or on iPhone the hidden `<input type=checkbox switch>` click.
- Edge swipe back is on only in the iPhone home-screen app (elsewhere the system has a Back gesture);
  `html[data-edge-back="always"]` (the gallery's `?edge=always`) forces it for tests.
- Toasts take an `action` (Undo): reversible actions never ask "are you sure?".
- Gallery: `app/public/kit/`, tests listed in [kit-tests.md](kit-tests.md).

Gotchas found:
- Chrome gives a modal `<dialog>` `overflow: auto`; a sheet must set `overflow: hidden` or a drag scrolls the whole sheet.
- A sideways scroller is its own scroll container, so its `touch-action` must match the sheet body's rule.
- Folders in `public/` (like `kit/`) needed the Worker's no-slash redirect to look in `public/` too.
- Measure the hold menu after its layer opens: a closed layer is `display: none`, so the menu measures 0 and lands off
  screen near the bottom.

## K2: looks + density + glass guard (done)

- Looks A/B/C are data in `theme/looks/` (token set + variants header/menu/glass/tick/tabbar), shown as `data-*` marks
  on `<html>`; every part in `ui.css`, `ui/gestures.css` and `glass.css` styles from the tokens and marks. How to add
  one: [ui-kit.md](ui-kit.md#adding-a-look). No component forks; the bottom-sheet hold menu is a class on the same menu.
- Density (`comfortable` 60 / `regular` 50 / `compact` 44 px rows) replaces v0's layout (`compact` migrates).
- Glass guard in `theme/guard.js`; material `always` ("Glass, even here") overrides it, Solid wins.
- Look and density switchers in Settings and the gallery (`?look=`, `?density=` preview without keeping; `?guard=again`).
- Tests: `e2e/looks.spec.mjs` (each look × 390/820/1280, screenshots in the test output), `app/test/looks.unit.test.mjs`.

Gotchas found:
- The e2e fixtures seed the guard's verdict as fast; a test of the guard needs its own context.
- With glass off, Chromium drew a dark box round the hold menu's lifted preview; `will-change: transform` on it fixed it.
- Measure the bottom-sheet menu after its rise animation settles.

## For K2 (looks and tokens, notes K1 left)

- Every colour, radius and timing in `ui/gestures.css` is a theme token; restyle there. Glass is for floating chrome
  only (bars, tab bar, menus, sheets, action bar).
- The gallery is the place to check each look at 390 / 820 / 1280.

## K3: tablet and laptop shell (done)

- `app/public/ui/shell/` (`shell.js`, `shell.css`): `adaptiveShell(shell, { screens, render })` sets `data-size`
  (phone / tablet / laptop at 600 and 840 px), opens rows into the detail, filters rows from the search fields,
  Ctrl/Cmd+K, Esc and arrow keys. Rules and keys are in [ui-kit.md](ui-kit.md); the sample is `app/public/kit/shell/`.
- `select-mode.js` gained Ctrl/Cmd-click (add) and Shift-click (range); `detent-sheet.js` leaves a
  `data-wide="panel"` sheet's height alone from 840 px.
- No router change: the detail is a pushed `.ui-screen` on a phone, and both panes just show from 600 px.
- Gotchas: the kit has `[hidden] { display: none !important }`, so the wide layout shows hidden screens with its own
  `!important`. Playwright needs `PW_CHROMIUM` when the pinned browser build isn't installed.

## For K4, K5

- A real app moves its list into the shell markup and passes its own `render`; Settings follows the rules in
  [ui-kit.md](ui-kit.md).

## K-fix: /kit blank on phones once the service worker was active (done)

- Cause: sw-core's `navigate()` answers any page address whose folder is not in SHELL with the app's own page
  (`./`). SHELL lists `kit/index.html` but not the folders `kit/` and `kit/shell/`, and `/kit` (no slash) never
  matches, so a phone that had opened the app once got the app's sign-in screen at `/kit`.
- Fix in `app/public/sw.js` (not in sw-core): `KIT_PAGES` in the `never` list sends page addresses under `/kit`
  (no dot in the path: `/kit`, `/kit/`, `/kit/shell/`, any later `/kit/<page>`) to the network. Files under `/kit/`
  still come from SHELL. A new gallery page needs no SW change. Cost: the gallery's pages open online only.
- `sw.js` changed byte for byte, so phones with the old worker fetch the new one on their next visit and take over
  as usual (`e2e/update.spec.mjs` covers the take-over). VERSION is `app-v2`.
- Test: `e2e/kit-sw.spec.mjs` (opens the app, waits for the worker, then `/kit`, `/kit/`, `/kit/shell/` show the gallery).
