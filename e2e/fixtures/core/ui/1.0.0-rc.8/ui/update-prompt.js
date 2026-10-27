// The update prompt: the version line (#version), "Check for updates" (#check-update) and its answer (#update-msg).
// A new version installs in the background and its reload waits while something is open; once a field is left or a
// sheet closes, the owed reload is tried again. Without the update module (no service worker) the version reads "dev".
import { el, button } from './dom.js';

/**
 * @param {HTMLElement} host  the version line and the answer are added here
 * @param {{ update: import('./types').UpdateApi | null }} o
 * @returns {() => void} stop: stops the retries and removes the prompt
 */
export function updatePrompt(host, { update }) {
  const version = el('span', { id: 'version' }, '…');
  const answer = el('p', { id: 'update-msg', class: 'small', role: 'status' });
  const check = button('Check for updates', async () => {
    if (!update) return;
    answer.textContent = 'Checking…';
    answer.textContent = await update.checkNow() ? 'Updated.' : 'This is the newest version (or the update waits until nothing is open).';
  }, { id: 'check-update' });
  const line = el('p', { class: 'small' }, 'Version ', version, ' ', check);
  host.append(line, answer);
  const remove = () => { line.remove(); answer.remove(); };
  if (!update) {
    version.textContent = 'dev';
    check.hidden = true;
    return remove;
  }
  update.versionLabel().then(v => { version.textContent = v || 'not installed yet'; }, () => {});
  const retry = () => setTimeout(() => update.retryUpdate(), 0);
  document.addEventListener('focusout', retry);
  document.addEventListener('close', retry, true);   // a dialog closing ('close' doesn't bubble, so on the way down)
  return () => {
    document.removeEventListener('focusout', retry);
    document.removeEventListener('close', retry, true);
    remove();
  };
}
