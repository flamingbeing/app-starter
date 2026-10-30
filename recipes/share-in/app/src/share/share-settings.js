// Settings > Share in (the share-in recipe's glue, recipes/share-in.json): the switch for receiving shares from other
// apps (Android, installed app), and the chooser that shows when one arrives. The option shareIn is off until turned on.
// Made once the app is there (modules.js "shareIn" slot, called by shell.js); the check for a share waiting runs then.
import { shareSheet } from './share-sheet.js';

// Lucide "share-2" (https://lucide.dev, ISC licence)
/** @type {import('app-ui/icons/lucide.js').IconNodes} */
const SHARE = [['circle', { cx: '18', cy: '5', r: '3' }], ['circle', { cx: '6', cy: '12', r: '3' }], ['circle', { cx: '18', cy: '19', r: '3' }],
  ['line', { x1: '8.59', x2: '15.42', y1: '13.51', y2: '17.49' }], ['line', { x1: '15.41', x2: '8.59', y1: '6.51', y2: '10.49' }]];

/** @type {import('../shell.js').SettingsSlot} */
export function shareInSettings({ app }) {
  void shareSheet(app).check();
  return {
    title: 'Share in', icon: SHARE, sub: 'Receive text and links from other apps', group: 'This device', find: 'share target android receive links text',
    rows: [{ key: 'shareIn', label: 'Receive shares from other apps', sub: 'This device. Android, installed app only' }],
  };
}
