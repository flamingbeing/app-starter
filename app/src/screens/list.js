// The list screen (#list-view): the items, with add and edit (members and admins), the kit's conflict sheet and the
// list of saves the server refused. Each item shows its photos' thumbnails (and a clip for other files).
import { conflictSheet, refusedList, toaster, emptyState } from '@core/ui';
import { COLL } from '../cloud.js';
import { $, input, sectionScreen } from '../dom.js';
import { itemSheet } from './item-sheet.js';
import { thumbOf } from './attachments.js';

/** @typedef {import('../cloud.js').Item} Item */
/** @typedef {import('../cloud.js').Attachment} Attachment */

/** @param {unknown} record  an item, or a refused save's record -> its text */
const itemText = record => String(/** @type {{ text?: unknown } | null} */ (record)?.text ?? '');

/** @param {import('../cloud.js').Started} app */
export function listScreen(app) {
  let canWrite = false;
  /** @type {Item[]} */
  let shown = [];
  /** @type {Map<string, Attachment[]>} */
  let byItem = new Map();
  const toast = toaster($('toasts')).show;
  const sheet = itemSheet(app, toast, id => byItem.get(id) || []);
  const empty = emptyState($('empty'), { title: 'Nothing here yet', hint: 'Items you add show up here.', action: { label: 'Add the first item', onClick: () => input('new-text').focus() } });
  conflictSheet($('conflict-sheet'), { sync: app.sync, text: itemText });
  refusedList($('refused-list'), { sync: app.sync, kind: COLL, text: itemText });
  $('add').addEventListener('submit', async e => {
    e.preventDefault();
    const text = input('new-text').value.trim();
    if (!text) return;
    await app.add(text);
    input('new-text').value = '';
    toast('Added');
  });

  const screen = sectionScreen('list-view', s => {
    canWrite = s.role === 'admin' || s.role === 'member';
    $('add').hidden = !canWrite;
  });
  /** @param {Item[]} items @param {Set<string>} changed */
  const draw = (items, changed) => {
    shown = items;
    $('items').replaceChildren(...[...items].sort((a, b) => String(a.text).localeCompare(String(b.text))).map(item => {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = item.text; b.disabled = !canWrite;
      b.addEventListener('click', () => sheet.open(item));
      const attached = byItem.get(item.id) || [];
      if (attached.length) {
        // decorative here (the sheet names them), so the button's name stays the item's text
        const thumbs = document.createElement('span');
        thumbs.className = 'thumbs'; thumbs.setAttribute('aria-hidden', 'true');
        const others = attached.filter(f => !f.thumb).length;
        thumbs.append(...attached.flatMap(f => thumbOf(app, f, '') || []), ...(others ? [`📎${others > 1 ? others : ''}`] : []));
        b.append(thumbs);
      }
      li.classList.toggle('changed', changed.has(item.id));
      li.append(b);
      return li;
    }));
    empty.show(items.length === 0 && canWrite);
  };
  return {
    ...screen,
    /** @param {Item[]} items @param {Set<string>} changed  ids changed (here or elsewhere) since the last draw */
    draw,
    /** @param {Map<string, Attachment[]>} by  every item's photos and files */
    drawFiles(by) { byItem = by; draw(shown, new Set()); sheet.redraw(); },
  };
}
