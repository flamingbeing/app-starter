// The shell gallery: the plants list in the adaptive shell. window.kit (the started parts) and window.shell are for the tests.
import { startGestures, adaptiveShell, toaster } from '../../ui/index.js';
import { galleryPreview } from '../preview.js';

galleryPreview();   // ?look=, ?density=, ?edge= as on the other gallery pages

// the other sections are the same page (there is one list); the bars show which was picked
const tab = new URLSearchParams(location.search).get('tab') || 'plants';
for (const a of /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll('a.ui-tab, a.ui-side-link'))) {
  if (new URL(a.href).searchParams.get('tab') === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
}

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const kit = startGestures();
const toasts = toaster(document.body);
const list = $('plants');
const shell = adaptiveShell(/** @type {HTMLElement} */ (document.querySelector('.ui-shell')), { screens: kit.screens });
Object.assign(window, { kit, shell });

const count = () => { $('count-side').textContent = String(list.querySelectorAll('.ui-row').length); };
/** Delete with Undo (no "are you sure?" for something that can be put back) @param {HTMLElement[]} rows */
function remove(rows) {
  const kept = rows.map(r => ({ r, next: r.nextElementSibling }));
  rows.forEach(r => r.remove());
  count();
  toasts.show(rows.length === 1 ? `Deleted ${rows[0].dataset.name}` : `Deleted ${rows.length} plants`, {
    ms: 6000,
    action: { label: 'Undo', run: () => { for (const { r, next } of kept.reverse()) list.insertBefore(r, next && list.contains(next) ? next : null); count(); } },
  });
}
list.addEventListener('ui-menu', e => {
  const row = /** @type {HTMLElement} */ (e.target), { action } = /** @type {CustomEvent} */ (e).detail;
  if (action === 'select') list.dispatchEvent(new CustomEvent('ui-edit', { detail: { row } }));
  else if (action === 'delete') remove([row]);
});
$('delete-selected').addEventListener('click', () => {
  const rows = kit.selects.get('plants')?.selected() || [];
  kit.selects.get('plants')?.setEditing(false);
  if (rows.length) remove(rows);
});
$('compare').addEventListener('click', () => {
  toasts.show(`Comparing ${(kit.selects.get('plants')?.selected() || []).map(r => r.dataset.name).join(' and ')}`);
});
// the detail repeats the row's actions as buttons
$('delete-one').addEventListener('click', () => {
  const row = shell.current();
  if (!row) return;
  const was = shell.size() === 'phone';
  remove([row]);
  if (was) kit.screens?.pop();
});
$('water').addEventListener('click', () => toasts.show(`Watered ${shell.current()?.dataset.name ?? ''}`));
// the bar's Select only on the list's screen (phone)
document.addEventListener('ui-screen', e => {
  const home = /** @type {CustomEvent} */ (e).detail.top.id === 'home';
  document.querySelectorAll('.ui-bar [data-edit-for]').forEach(b => { /** @type {HTMLElement} */ (b).hidden = !home; });
  if (!home) kit.selects.get('plants')?.setEditing(false);
});
