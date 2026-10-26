# The UI kit (`@core/ui`)

Gesture parts, the adaptive shell and the placement rules every app built on this starter follows. The code is in
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
