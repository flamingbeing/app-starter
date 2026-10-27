// The page's shell: the theme, the kit's update prompt, the settings sheet and the list. A static app has no sign-in:
// the list is this device's (local.js). The sample screens (screens/) show a list with add, edit and delete; a new app
// replaces them and keeps this wiring, local.js and the kit (@core/ui, @core/theme).
import { updatePrompt } from '@core/ui';
import { themeSwitch } from '@core/theme';
import { start } from './local.js';
import { $ } from './dom.js';
import { listScreen } from './screens/list.js';
import { settingsSheet } from './settings-sheet.js';

const typing = () => document.activeElement?.tagName === 'INPUT' && !!(/** @type {HTMLInputElement} */ (document.activeElement).value);
const sheetOpen = () => !!document.querySelector('dialog[open]');

// app-update (the update module): a new version installs in the background; the reload waits while someone types or a
// sheet is open. (Off in the browser tests, ?test, unless ?sw is given.)
const params = new URLSearchParams(location.search);
const withSW = 'serviceWorker' in navigator && (!params.has('test') || params.has('sw'));

themeSwitch($('theme-switch'));
window.starter = { ready: false, add: text => app?.add(text) };   // for the tests
const app = await start({ canReload: withSW ? () => !typing() && !sheetOpen() : null });
updatePrompt($('update-prompt'), { update: app.update });
app.status$(st => { window.starter.status = st.state; });
$('open-settings').hidden = false;
settingsSheet(app, () => true);
const list = listScreen(app);
app.follow({
  onState(s) { list.show(s); },
  onList(items, changed) {
    list.draw(items, changed);
    window.starter.ready = true;
  },
});
