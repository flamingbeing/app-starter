// The list screen (#list-view): the items, with add and edit (members and admins), the kit's conflict sheet and the
// list of saves the server refused.
import { conflictSheet, refusedList, toaster, emptyState } from '@core/ui';
import { createSearch } from '@core/search';
import { COLL } from '../cloud.js';
import { $, input, sectionScreen } from '../dom.js';
import { itemSheet } from './item-sheet.js';

/** @typedef {import('../cloud.js').Item} Item */

/** @param {unknown} record  an item, or a refused save's record -> its text */
const itemText = record => String(/** @type {{ text?: unknown } | null} */ (record)?.text ?? '');

/** @param {import('../cloud.js').Started} app */
export function listScreen(app) {
  let canWrite = false;
  // search over the list: kept current from each draw (only what changed is fed), so a long list is not re-indexed
  const search = createSearch({
    fields: ['text'],
    operators: {
      has: (rec, v) => v === 'number' && /\d/.test(itemText(rec)),
      is: (rec, v) => v === 'long' && itemText(rec).length >= 20,
    },
  });
  /** @type {Item[]} */
  let all = [];
  const known = new Set();
  /** @param {Item[]} items @param {Set<string>} changed */
  const feed = (items, changed) => {
    const now = new Set(items.map(i => i.id));
    for (const id of known) if (!now.has(id)) { search.remove(id); known.delete(id); }
    search.feed(items.filter(i => !known.has(i.id) || changed.has(i.id)));
    for (const id of now) known.add(id);
  };
  /** the items the box leaves in, in the order to show them */
  const shown = () => {
    const q = input('q').value.trim();
    if (!q) { $('search-msg').textContent = ''; return [...all].sort((a, b) => String(a.text).localeCompare(String(b.text))); }
    const { hits, unknown } = search.search(q, { limit: 500 });
    $('search-msg').textContent = unknown.length ? `Did you mean ${unknown.map(u => u.suggest).join(', ')}?` : hits.length ? '' : 'No matches';
    const byId = new Map(all.map(i => [i.id, i]));
    return hits.map(h => byId.get(h.id)).filter(/** @returns {i is Item} */ i => !!i);
  };
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

  input('q').addEventListener('input', () => api.draw(all, new Set()));
  // "/" jumps to the box on a computer
  document.addEventListener('keydown', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || document.querySelector('dialog[open]')) return;
    e.preventDefault(); input('q').focus();
  });

  const screen = sectionScreen('list-view', s => {
    canWrite = s.role === 'admin' || s.role === 'member';
    $('add').hidden = !canWrite;
  });
  const api = {
    ...screen,
    /** @param {Item[]} items @param {Set<string>} changed  ids changed (here or elsewhere) since the last draw */
    draw(items, changed) {
      all = items; feed(items, changed);
      const list = shown();
      $('items').replaceChildren(...list.map(item => {
        const li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button'; b.textContent = item.text; b.disabled = !canWrite;
        b.addEventListener('click', () => openItem(item));
        li.classList.toggle('changed', changed.has(item.id));
        li.append(b);
        return li;
      }));
      $('count').textContent = list.length === items.length ? `${items.length} ${items.length === 1 ? 'item' : 'items'}` : `${list.length} of ${items.length} items`;
      empty.show(items.length === 0 && canWrite);
    },
  };
  return api;
}
