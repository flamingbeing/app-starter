// The Settings sheet (#settings) and what the options do to the page: a switch per option (@core/settings), and the
// settings file (export, import). A switch for an account option waits for sign-in.
import { toaster } from '@core/ui';
import { $, input, dialog } from './dom.js';
import { SWITCHES } from './options.js';

/** @param {{ settings: import('../public/settings/types').SettingsApi }} app  @param {() => boolean} signedIn */
export function settingsSheet(app, signedIn) {
  const { settings } = app;
  const sheet = dialog('settings');
  const toast = toaster($('toasts')).show;
  const msg = $('settings-msg');

  // what the options do to the page, now and whenever one changes (here or on another device)
  const apply = () => {
    $('items').classList.toggle('big', settings.get('bigRows'));
    $('count').hidden = !settings.get('itemCount');
  };
  settings.watch(null, apply);
  apply();

  const draw = () => {
    for (const key of SWITCHES) {
      const box = input(`opt-${key}`);
      box.checked = !!settings.get(key);
    }
    input('opt-itemCount').disabled = !signedIn();
    $('settings-note').hidden = signedIn();
  };
  for (const key of SWITCHES) {
    input(`opt-${key}`).addEventListener('change', async e => {
      try { await settings.set(key, /** @type {HTMLInputElement} */ (e.target).checked); msg.textContent = ''; }
      catch (err) { msg.textContent = /** @type {Error} */ (err).message; draw(); }
    });
  }
  settings.watch(null, () => { if (sheet.open) draw(); });

  $('open-settings').addEventListener('click', () => { msg.textContent = ''; draw(); sheet.showModal(); });
  $('settings-close').addEventListener('click', () => sheet.close());

  $('settings-export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([settings.exportFile()], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'settings.json' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Settings file saved');
  });
  input('settings-import').addEventListener('change', async e => {
    const el = /** @type {HTMLInputElement} */ (e.target), file = el.files?.[0];
    el.value = '';
    if (!file) return;
    try {
      const { changed, dropped } = await settings.importFile(await file.text());
      msg.textContent = `Imported: ${changed.length} changed${dropped.length ? `, ${dropped.length} skipped (${dropped.join(', ')})` : ''}.`;
    } catch (err) { msg.textContent = /** @type {Error} */ (err).message; }
  });
}
