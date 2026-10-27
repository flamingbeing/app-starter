// The options this app allows (@core/settings): a name here is the only way a value reaches the device. New options
// are off. A static app has no account, so every option is this device's (a cloud app can also keep one per account).
// A new app replaces these with its own.
export const SETTINGS_COLL = 'settings';

/** @type {Record<string, import('app-ui/settings/types').OptionSpec>} */
export const OPTIONS = {
  // this device only: a phone and a computer can differ
  bigRows: { scope: 'device', default: false },
  itemCount: { scope: 'device', default: false },
};

/** The options the sample sheet has a switch for (index.html: #opt-<name>). */
export const SWITCHES = Object.keys(OPTIONS);
