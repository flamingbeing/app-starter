// The default word for each sync state (the sync chip's). An app overrides any of them with syncChip's `labels`.
/** @type {Readonly<Record<string, string>>} */
export const LABELS = Object.freeze({
  synced: 'Saved',
  pending: 'Sending…',
  offline: 'Offline, kept on this device',
  attention: 'Needs you',
  unknown: 'Connecting…',
  'at-risk': 'Not saved on this device yet',
});
