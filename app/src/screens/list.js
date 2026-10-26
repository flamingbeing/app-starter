// The list screen (#list-view): the items, with add and edit (members and admins), the kit's conflict sheet and the
// list of saves the server refused.
import { conflictSheet, refusedList, toaster, emptyState } from '@core/ui';
import { COLL } from '../cloud.js';
import { $, input, sectionScreen } from '../dom.js';
import { itemSheet } from './item-sheet.js';

/** @typedef {import('../cloud.js').Item} Item */

/** @param {unknown} record  an item, or a refused save's record -> its text */
const itemText = record => String(/** @type {{ text?: unknown } | null} */ (record)?.text ?? '');

/** @param {import('../cloud.js').Started} app */
export function listScreen(app) {
  let canWrite = false;
  /** @type {[Item[], Set<string>] | null} the last list drawn (redrawn when the role arrives: a screen change is a view transition, so the list can come first) */
  let last = null;
  const toast = toaster($('toasts')).show;
  const openItem = itemSheet(app, toast);
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
    const could = canWrite;
    canWrite = s.role === 'admin' || s.role === 'member';
    $('add').hidden = !canWrite;
    if (last && canWrite !== could) draw(...last);
  });
  /** @param {Item[]} items @param {Set<string>} changed  ids changed (here or elsewhere) since the last draw */
  function draw(items, changed) {
    last = [items, changed];
    $('items').replaceChildren(...[...items].sort((a, b) => String(a.text).localeCompare(String(b.text))).map(item => {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = item.text; b.disabled = !canWrite;
      b.addEventListener('click', () => openItem(item));
      li.classList.toggle('changed', changed.has(item.id));
      li.append(b);
      return li;
    }));
    empty.show(items.length === 0 && canWrite);
  }
  return { ...screen, draw };
}
