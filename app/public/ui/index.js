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
