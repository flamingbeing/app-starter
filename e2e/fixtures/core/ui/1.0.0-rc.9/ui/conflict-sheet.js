// The conflict "pick one" sheet: a button (#attention) while this phone holds saves that met an edit from another
// device, opening a sheet (#conflicts) with both versions of each side by side, when each changed (SGT) and who changed
// it (name, device). Keep mine / keep theirs for the whole record; with several clashing fields, one pick per field too.
import { el, button, plural } from './dom.js';

/** @param {unknown} v */
const asWords = v => v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');

/** @param {string} title @param {import('./types').Side} side @param {string} words */
function sideBox(title, side, words) {
  const meta = [side.when, [side.by, side.device].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  return el('div', {}, el('h3', {}, title), el('p', {}, `“${words}”`), el('p', { class: 'small' }, meta || 'time and author unknown'));
}

/**
 * @param {import('./types').SyncApi} sync
 * @param {import('./types').Conflict} c
 */
function fieldPicks(sync, c) {
  /** @type {Record<string, import('./types').Pick>} */
  const picks = {};
  const keep = button('Keep these choices', () => sync.resolve(c.key, picks));
  keep.disabled = true;
  const rows = c.fields.map(f => {
    /** @param {import('./types').Pick} which */
    const pick = which => () => { picks[f.path] = which; keep.disabled = c.fields.some(x => !picks[x.path]); };
    return el('div', { class: 'row' },
      el('p', { class: 'small' }, `${f.path}: yours “${f.mine.value}” (${f.mine.when}) · theirs “${f.theirs.value}” (${f.theirs.when})`),
      button('Mine', pick('mine')), button('Theirs', pick('theirs')));
  });
  return [el('div', {}, ...rows), keep];
}

/**
 * @param {HTMLElement} host  the button and the sheet are added here
 * @param {{ sync: import('./types').SyncApi, text?: (value: unknown) => string }} o
 *   text: one side's record in words (default: as JSON)
 * @returns {() => void} stop: unsubscribes and removes both
 */
export function conflictSheet(host, { sync, text = asWords }) {
  const open = el('button', { id: 'attention', type: 'button', class: 'attention' });
  const list = el('ul', { id: 'conflict-list' });
  const sheet = el('dialog', { id: 'conflicts', 'aria-labelledby': 'conflicts-title' },
    el('h2', { id: 'conflicts-title' }, 'Changed on another device'),
    el('p', { class: 'small' }, 'Choose which version to keep. Nothing is lost until you choose.'),
    list,
    el('form', { method: 'dialog' }, el('button', {}, 'Close')));
  host.append(open, sheet);

  /** @param {import('./types').Conflict} c */
  const item = c => el('li', {},
    el('div', { class: 'sides' },
      sideBox('Yours', c.mine, c.deleted.mine ? '(deleted)' : text(c.mine.value)),
      sideBox('Other device', c.theirs, c.deleted.theirs ? '(deleted)' : text(c.theirs.value))),
    el('div', { class: 'row' }, button('Keep mine', () => sync.resolve(c.key, 'mine')), button('Keep theirs', () => sync.resolve(c.key, 'theirs'))),
    ...(c.fields.length > 1 ? fieldPicks(sync, c) : []));
  const held = () => sync.conflicts().map(c => sync.describe(c.key)).filter(d => d !== null);
  const drawList = () => list.replaceChildren(...held().map(item));
  const draw = () => {
    const n = sync.conflicts().length;
    open.hidden = !n;
    open.textContent = `${plural(n, 'change')} met an edit from another device: choose`;
    if (!n && sheet.open) sheet.close();
    if (sheet.open) drawList();
  };
  open.addEventListener('click', () => { drawList(); sheet.showModal(); });
  const off = sync.queue.onChange(draw);
  draw();
  return () => { off(); open.remove(); sheet.remove(); };
}
