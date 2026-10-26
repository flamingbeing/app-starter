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
| Page held still | 390 and 1280 px: a wheel over an open sheet or hold menu doesn't scroll the page (the menu's preview stays on its row); closed, it scrolls again | |
| Home indicator | 390 px with a 34 px bottom inset: a full-height sheet's last row, look B's sheet menu and a toast on a page without a tab bar clear it | |

## Shell gallery

`/kit/shell/` is tested by `e2e/shell.spec.mjs` at 390, 820 and 1280 px (axe and CSP reports as above). Pure parts
(`sizeClass`, `matchesSearch`) are in `app/test/shell.unit.test.mjs`.

| Part | What is tested | axe |
| --- | --- | --- |
| Layout | phone: tab bar, one pane; tablet and laptop: side bar, list and detail side by side, in order; one level-1 heading at every size | yes |
| Open | clicking a row opens it; on a phone it pushes the detail, Back and Esc pop it | |
| Keyboard | Ctrl/Cmd+K focuses the search; typing filters; Esc clears, then leaves; arrows and Enter work the list | |
| Pointer | right-click opens the row menu; Ctrl/Cmd-click adds; Shift-click takes a range; the detail summarises a multi-selection; Esc leaves select mode | |
| Sheets | a side panel at 1280 px, a bottom sheet below; Back and Esc close it | open |
| Tab bar | 390 px: the picked section (`?tab=`) is marked in both bars; shrunk on scroll, its tab stays and Tab reaches it | |
| Delete | removing from the detail shows an Undo toast; Undo puts the row back | |
| Resize | the layout follows the width when the window crosses a size class | |
| Other pages | `startGestures()` on a page without the shell markup starts nothing | |

### Looks, density and the glass guard (`e2e/looks.spec.mjs`)

| Part | What is tested | axe |
| --- | --- | --- |
| Looks A, B, C | at 390, 820 and 1280 px: the look's `data-*` marks and glass class; band or plain title; floating or edge tab bar; card or flush list; C's glass only on pills; screenshots kept (`look-<id>-<width>[-select\|-menu].png`) | page, selecting, menu open |
| Look B's menu | under 840 px the hold menu is a bottom sheet on the bottom edge; from 840 px it opens beside the row | menu open |
| Ticks | square in B, round in A and C | |
| Density | rows 60 / 50 / 44 px; taps never under 44; a link's `?look=` is a preview, a pick is kept after reload | |
| Glass guard | little memory turns glass off, kept, with the reason in Settings; Solid and "Glass, even here" still win | yes |

### Layout parts and extra-dense (`e2e/dense.spec.mjs`)

| Part | What is tested | axe |
| --- | --- | --- |
| Both dense screens | in looks A, B, C at 390, 820 and 1280 px: every target 24 px or more (a radio or checkbox measured by its label), nothing wider than the screen; screenshots kept (`dense-<screen>-<look>-<width>.png`) | yes |
| Sizes | extra-dense is 32 / 24 px; unticking it gives the density's own sizes; Comfortable gets 44 / 36 px | |
| Segmented | arrows pick and move focus; a second tap clears a clearable one, Space does not; a plain one keeps its pick | |
| Stepper | − and + step by the step, stay in min/max, an empty box starts at `data-start`; buttons out of the Tab order | |
| Toolbar | one Tab stop; arrows wrap, Home, End; Tab leaves it | |
| Undo | clearing the boxes and setting a key time show an Undo toast, never a dialog | |
| Look B's band | the bar keeps the band's colour once the title has scrolled under it | |


### Cheap Android stand-in (`e2e/cheap-android.spec.mjs`)

| Part | What is checked | Screenshot |
|---|---|---|
| Glass guard, little memory | a phone that reports 2 GB shows Solid at once (verdict kept: memory); scrolling the gallery still gives frames | |
| Glass guard, slow frames | no memory figure plus 30 ms of work per frame: glass shows until the first scroll, then Solid (verdict kept: frames), and stays so after a reload | |
