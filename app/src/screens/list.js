// The list screen (#list-view): the items, with add and edit (members and admins), the kit's conflict sheet and the
// list of saves the server refused. Each item shows its photos' thumbnails (and a clip for other files).
import { conflictSheet, refusedList, toaster, emptyState } from '@core/ui';
import { createSearch } from '@core/search';
import { COLL, REFUSED } from '../cloud.js';
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
  // search over the list: kept current from each draw (only records whose text changed are fed)
  const search = createSearch({
    fields: ['text'],
    operators: {
      has: (rec, v) => v === 'number' && /\d/.test(itemText(rec)),
      is: (rec, v) => v === 'long' && itemText(rec).length >= 20,
    },
    onReady: () => api.draw(all, new Set()),   // MiniSearch came in after a search: search again with it
  });
  /** @type {Item[]} */
  let all = [];
  /** @type {Map<string, string>} id -> the text as indexed (a new subscription starts with no "changed" ids, so compare) */
  const known = new Map();
  /** @param {Item[]} items */
  const feed = items => {
    const now = new Set(items.map(i => i.id));
    for (const id of known.keys()) if (!now.has(id)) { search.remove(id); known.delete(id); }
    const stale = items.filter(i => known.get(i.id) !== itemText(i));
    search.feed(stale);
    for (const i of stale) known.set(i.id, itemText(i));
  };
  /** the items the box leaves in, in the order to show them */
  const visible = () => {
    const q = input('q').value.trim();
    if (!q) { $('search-msg').textContent = ''; return [...all].sort((a, b) => String(a.text).localeCompare(String(b.text))); }
    const { hits, unknown } = search.search(q, { limit: 500 });
    $('search-msg').textContent = unknown.length ? `Did you mean ${unknown.map(u => u.suggest).join(', ')}?` : hits.length ? '' : 'No matches';
    const byId = new Map(all.map(i => [i.id, i]));
    return hits.map(h => byId.get(h.id)).filter(/** @returns {i is Item} */ i => !!i);
  };
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
    // clear the box now, not after the save: on a slow network the next item may be typed while this one saves
    // (a refused save is kept in the refused list, not in the box)
    input('new-text').value = '';
    let refused;
    try { refused = await app.add(text); }
    catch (err) { if (!input('new-text').value) input('new-text').value = text; throw err; }   // not saved: give it back
    toast(refused ? REFUSED : 'Added');
  });

  input('q').addEventListener('input', () => api.draw(all, new Set()));
  input('q').addEventListener('focus', () => void search.prepare(), { once: true });
  // "/" jumps to the box on a computer
  document.addEventListener('keydown', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || document.querySelector('dialog[open]')) return;
    e.preventDefault(); input('q').focus();
  });

  const screen = sectionScreen('list-view', s => {
    const could = canWrite;
    canWrite = s.role === 'admin' || s.role === 'member';
    $('add').hidden = !canWrite;
    // (a screen change is a view transition, so the list can be drawn before the role arrives)
    if (canWrite !== could) draw(all, new Set());
  });
  /** @param {Item[]} items @param {Set<string>} changed */
  const draw = (items, changed) => {
    all = items; feed(items);
    const list = visible();
    $('items').replaceChildren(...list.map(item => {
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
    $('count').textContent = list.length === items.length ? `${items.length} ${items.length === 1 ? 'item' : 'items'}` : `${list.length} of ${items.length} items`;
    empty.show(items.length === 0 && canWrite);
  };
  const api = {
    ...screen,
    /** @param {Item[]} items @param {Set<string>} changed  ids changed (here or elsewhere) since the last draw */
    draw,
    /** @param {Map<string, Attachment[]>} by  every item's photos and files */
    drawFiles(by) { byItem = by; draw(all, new Set()); sheet.redraw(); },
  };
  return api;
}
