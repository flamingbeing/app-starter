// The default word for each sync state (the sync chip's) and for the modals and toasts. An app overrides any of them with the part's `labels`.
/** @type {Readonly<Record<string, string>>} */
export const LABELS = Object.freeze({
  synced: 'Saved',
  pending: 'Sending…',
  offline: 'Offline, kept on this device',
  attention: 'Needs you',
  unknown: 'Connecting…',
  'at-risk': 'Not saved on this device yet',
  // the modals' and toasts' words (modal.js, toast.js), overridable the same way
  ok: 'OK',
  cancel: 'Cancel',
  dismiss: 'Dismiss',
});
