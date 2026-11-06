// The push recipe's glue (recipes/push.json): its switch is the row on Settings > Features (option pushOn, this device,
// off until turned on). Made once the app is there (modules.js "push" slot, called by shell.js). Nothing more loads while
// the option is off; once it is on, push-wire.js does the rest (permission, subscribe, schedule; off again unsubscribes).
/** @type {import('../shell.js').SettingsSlot} */
export function pushSettings({ app }) {
  /** @type {Promise<unknown> | null} */
  let wired = null;
  const wire = () => { wired ??= import('./push-wire.js').then(m => m.startPush(app)); };
  app.settings.watch('pushOn', on => { if (on) wire(); });
  if (app.settings.get('pushOn')) wire();
  return null;   // the switch is a row on Settings > Features (options.js)
}
