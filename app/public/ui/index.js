// @core/ui v0 (incubating in the starter; graduates into core on a third app): the UI kit's parts. Each part reads
// only a module's public API (handed to it), builds its own elements into a host the page gives it and returns stop().
// Styles: ui/ui.css, loaded with <link>. Nothing runs on import.
export { LABELS } from './labels.js';
export { plural } from './dom.js';
export { syncChip } from './sync-chip.js';
export { signInSheet } from './sign-in-sheet.js';
export { conflictSheet } from './conflict-sheet.js';
export { updatePrompt } from './update-prompt.js';
export { refusedList } from './refused-list.js';
export { toaster } from './toast.js';
export { alertModal, confirmModal } from './modal.js';
export { emptyState } from './empty-state.js';
// gestures (ui/gestures.css): each part starts only where its markup is; startGestures() starts them all
export { startGestures } from './gestures.js';
export { largeTitle } from './large-title.js';
export { shrinkingTabBar } from './tab-bar.js';
export { holdMenus } from './hold-menu.js';
export { detentSheet } from './detent-sheet.js';
export { screenStack } from './screens.js';
export { selectMode } from './select-mode.js';
export { still, haptic } from './gesture.js';
// the adaptive shell (ui/shell/shell.css): phone tab bar, tablet and laptop side bar with list and detail
export { adaptiveShell, sizeClass, matchesSearch } from './shell/shell.js';
// layout parts (ui/layout.css): grid, stack, split are CSS; toolbars, steppers, clearable segments start here
export { startLayout, stepper, toolbar, clearableSegments, stepValue } from './layout.js';
