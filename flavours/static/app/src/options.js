// The options this app allows (@core/settings): a name here is the only way a value reaches the device. New options
// are off. A static app has no account, so every option is this device's (a cloud app can also keep one per account).
// A new app replaces these with its own.
export const SETTINGS_COLL = 'settings';

/** how a day's tasks are ordered (Today and Upcoming): by due time, by text, newest first */
export const SORTS = /** @type {[string, string][]} */ ([['due', 'By due time'], ['title', 'By text'], ['newest', 'Newest first']]);

/** @type {Record<string, import('app-ui/settings/types').OptionSpec>} */
export const OPTIONS = {
  bigRows: { scope: 'device', default: false },
  sort: { scope: 'device', default: 'due', clean: v => (SORTS.some(([k]) => k === v) ? v : 'due') },
  showCounts: { scope: 'device', default: false },
  // the list the tabs show: 'all', 'inbox' or a list's id (a deleted list falls back to 'all'); new tasks go into it
  defaultList: { scope: 'device', default: 'all', clean: v => (typeof v === 'string' && v.length <= 80 ? v : 'all') },
};

/** The Settings page's rows (src/shell.js: @core/ui settingsScreen); a row is a switch for a yes/no option. */
export const SETTING_SECTIONS = [
  { title: 'Tasks', rows: [
    { key: 'sort', label: 'Order within a day', sub: 'This device', choices: SORTS },
    { key: 'showCounts', label: 'Show how many are open in each list', sub: 'This device' },
    { key: 'bigRows', label: 'Larger rows', sub: 'This device' },
  ] },
];
