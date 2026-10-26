# Kit gallery tests

The gallery is `app/public/kit/` (served at `/kit/`, or `/app/kit/` on the e2e server): every `@core/ui` gesture part
on made-up plants, signed out. Its browser tests are `e2e/kit.spec.mjs`; each runs with an emulated finger (touch
through the DevTools protocol) at **390, 820 and 1280 px**, fails on any Content-Security-Policy report, and checks axe
(serious and critical) where noted. Pure parts have unit tests in `app/test/gestures.unit.test.mjs`.

Add a line here, and a test, for every part or behaviour the gallery gains.

| Part | What is tested | axe |
| --- | --- | --- |
| Page | loads, every part starts (menus, large title, screens, one sheet, one select list) | yes |
| Hold menu | 500 ms touch opens it; not before; lifting doesn't open the row; a 30 px move cancels; a tap opens the row | menu open |
| Hold menu | right-click, Shift+F10, the context-menu key; arrows, End, wrap; Esc gives focus back to the row | |
| Hold menu | Delete removes the row with an Undo toast (no confirm); Undo puts it back in place | |
| Hold menu | its Select starts select mode with that row ticked; no hold menu while selecting | |
| Hold menu | a menu for a row near the bottom of the screen stays fully on screen | |
| Select mode | Select/Done; listbox + aria-selected; tap ticks (doesn't open); drag down the ticks takes a range; action bar replaces the tab bar; `data-needs` enables buttons; Esc leaves | selecting |
| Sheet | opens at medium; drag up to large, down to medium, down to close (phone); Enter on the grabber cycles; Back closes it; centred dialog from 840 px, bottom edge below | open |
| Sheet | a drag from a field or a sideways scroller neither moves the sheet nor scrolls the body; the same drag from the body does | |
| Screens | push twice, Back pops with focus on the pusher; bar title follows; edge swipe (forced on) follows the finger, goes back past a third; a short swipe springs back; the tab bar doesn't move | pushed |
| Screens | without `?edge=always` (Android, browsers) the screen doesn't follow an edge swipe | |
| Tab bar + title | scrolling down shrinks the tab bar to the current tab and collapses the large title into the bar; up / top brings them back | |
| Still | off until picked; on: no lifted preview, no slide; kept after reload | |
| Reduce Motion | the device setting counts as Still | |
| Other pages | `startGestures()` on a page without the markup starts nothing | |

## Shell gallery

`/kit/shell/` is tested by `e2e/shell.spec.mjs` at 390, 820 and 1280 px (axe and CSP reports as above). Pure parts
(`sizeClass`, `matchesSearch`) are in `app/test/shell.unit.test.mjs`.

| Part | What is tested | axe |
| --- | --- | --- |
| Layout | phone: tab bar, one pane; tablet and laptop: side bar, list and detail side by side, in order | yes |
| Open | clicking a row opens it; on a phone it pushes the detail, Back and Esc pop it | |
| Keyboard | Ctrl/Cmd+K focuses the search; typing filters; Esc clears, then leaves; arrows and Enter work the list | |
| Pointer | right-click opens the row menu; Ctrl/Cmd-click adds; Shift-click takes a range; the detail summarises a multi-selection; Esc leaves select mode | |
| Sheets | a side panel at 1280 px, a bottom sheet below; Back and Esc close it | open |
| Delete | removing from the detail shows an Undo toast; Undo puts the row back | |
| Resize | the layout follows the width when the window crosses a size class | |
| Other pages | `startGestures()` on a page without the shell markup starts nothing | |

