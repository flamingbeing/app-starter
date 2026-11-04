// The signed-out screen (#signed-out): the kit's sign-in screen (icon, name, one line, "Continue with Google",
// and "Forget this device" while this phone keeps a copy).
import { signInScreen } from '@core/ui';
import { $, sectionScreen } from '../dom.js';
import { APP } from '../config.js';

/**
 * @param {import('../cloud.js').Started} app
 * @param {{ onForget: (ok: boolean) => void }} o  told whether this device was forgotten
 */
export function signedOutScreen(app, { onForget }) {
  signInScreen($('signed-out'), {
    name: APP.title, tagline: 'A simple task list that stays in sync.',
    icon: 'icons/icon.svg', accent: APP.accent, auth: app.auth, onForget,
  });
  return sectionScreen('signed-out');
}
