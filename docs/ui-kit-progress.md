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

## For K2 (looks and tokens)

- Every colour, radius and timing in `ui/gestures.css` is a theme token; restyle there. Glass is for floating chrome
  only (bars, tab bar, menus, sheets, action bar).
- The gallery is the place to check each look at 390 / 820 / 1280.

## For K3 (shell)

- K3 owns `ui/shell/`. Screens push history entries `{ uiScreens: depth }`, sheets `{ uiSheet: id }`; keep both when
  adding routes. `.ui-screens` sends `ui-screen` events (detail.top) on every change.

## K4, K5

- (nothing yet)
