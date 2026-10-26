// The gallery: starts every gesture part on the page's made-up plants, signed out. Relative imports, so the page needs
// no import map. ?edge=always turns the edge swipe on outside the iPhone home-screen app (for tests and desktops);
// ?look=a|b|c and ?density=comfortable|regular|compact show that look or density on this page without keeping it
// (links and screenshots; the switcher on the page keeps a pick on this device); ?guard=again forgets the glass
// guard's verdict so it runs again. window.kit is the started parts, for the tests.
import { startGestures, toaster } from '../ui/index.js';
import { applyTheme, chooseTheme, previewTheme, themeChoice, lookSwitch, keepGlassVerdict } from '../theme/index.js';

const params = new URLSearchParams(location.search);
if (params.get('guard') === 'again') keepGlassVerdict(null);
applyTheme();
/** @type {Record<string, string>} */
const preview = {};
for (const k of ['look', 'density']) { const v = params.get(k); if (v) preview[k] = v; }
const shown = Object.keys(preview).length ? previewTheme(preview) : themeChoice();
lookSwitch(/** @type {HTMLElement} */ (document.getElementById('kit-looks')), () => {
  // a pick is kept and replaces the link's preview: the address loses ?look= and ?density=
  const url = new URL(location.href);
  url.searchParams.delete('look'); url.searchParams.delete('density');
  history.replaceState(history.state, '', url);
});
for (const k of /** @type {const} */ (['look', 'density'])) {
  const pick = /** @type {HTMLSelectElement | null} */ (document.getElementById(`${k}-pick`));
  if (pick) pick.value = shown[k];
}
const edge = new URLSearchParams(location.search).get('edge');
if (edge === 'always' || edge === 'off') document.documentElement.dataset.edgeBack = edge;

// the other tabs are the same page (the gallery has one list); the tab bar shows which was picked
const tab = new URLSearchParams(location.search).get('tab');
for (const a of /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll('a.ui-tab'))) {
  const t = a.dataset.tab;
  if (t) a.href = `?tab=${t}`;
  if ((t || null) === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
}

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const kit = startGestures();
/** @type {any} */ (window).kit = kit;
const toasts = toaster(document.body);
const list = $('plants');

// Still: this device only, off until picked
const stillBox = /** @type {HTMLInputElement} */ ($('still'));
stillBox.checked = themeChoice().motion === 'still';
stillBox.addEventListener('change', () => chooseTheme({ motion: stillBox.checked ? 'still' : 'auto' }));

/** @param {HTMLElement} row */
function openRow(row) {
  $('detail-title').textContent = row.dataset.name || 'Details';
  $('detail-text').textContent = row.querySelector('.ui-row-sub')?.textContent || '';
  kit.screens?.push('#detail', row);
}
/** Delete with Undo (no "are you sure?" for something that can be put back) @param {HTMLElement[]} rows */
function remove(rows) {
  const kept = rows.map(r => ({ r, next: r.nextElementSibling }));
  rows.forEach(r => r.remove());
  toasts.show(rows.length === 1 ? `Deleted ${rows[0].dataset.name}` : `Deleted ${rows.length} plants`, {
    ms: 6000,
    action: { label: 'Undo', run: () => { for (const { r, next } of kept.reverse()) list.insertBefore(r, next && list.contains(next) ? next : null); } },
  });
}

list.addEventListener('click', e => {
  const row = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('.ui-row'));
  if (row) openRow(row);
});
list.addEventListener('keydown', e => {
  const row = /** @type {Element} */ (e.target).closest('.ui-row');
  if (e.key === 'Enter' && row && !list.classList.contains('is-editing')) openRow(/** @type {HTMLElement} */ (row));
});
list.addEventListener('ui-menu', e => {
  const row = /** @type {HTMLElement} */ (e.target), { action } = /** @type {CustomEvent} */ (e).detail;
  if (action === 'open') openRow(row);
  else if (action === 'select') list.dispatchEvent(new CustomEvent('ui-edit', { detail: { row } }));
  else if (action === 'delete') remove([row]);
});
$('delete-selected').addEventListener('click', () => {
  const rows = kit.selects.get('plants')?.selected() || [];
  kit.selects.get('plants')?.setEditing(false);
  if (rows.length) remove(rows);
});
$('compare').addEventListener('click', () => {
  const names = (kit.selects.get('plants')?.selected() || []).map(r => r.dataset.name);
  toasts.show(`Comparing ${names.join(' and ')}`);
});
// the bar's Select only on the list's screen
document.addEventListener('ui-screen', e => {
  const home = /** @type {CustomEvent} */ (e).detail.top.id === 'home';
  $('select').hidden = !home;
  if (!home) kit.selects.get('plants')?.setEditing(false);
});
