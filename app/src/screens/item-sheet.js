// The edit sheet (#edit) of the list screen. It follows its item on the server: a change made elsewhere shows under the
// field, and a delete made elsewhere closes the sheet and says so, unless the person has typed a change: then the sheet
// stays open, says so, and Save adds their text back as a new item. (An item not on the server yet is only "gone" once
// it was seen there.)
import { confirmModal } from '@core/ui';
import { $, input, dialog } from '../dom.js';

/** @typedef {import('../cloud.js').Item} Item */

/**
 * @param {import('../cloud.js').Started} app
 * @param {(message: string) => unknown} toast  a short note (the kit's toaster)
 * @returns {(item: Item) => void} open the sheet on an item
 */
export function itemSheet(app, toast) {
  const sheet = dialog('edit');
  /** @type {Item | null} */
  let editing = null;
  let editingGone = false;   // the item being edited was deleted elsewhere while the person had typed a change
  /** @type {(() => void) | null} */
  let stopLive = null;

  sheet.addEventListener('close', async () => {
    stopLive?.(); stopLive = null;
    const item = editing; editing = null;
    if (sheet.returnValue === 'save' && item) {
      const text = input('edit-text').value.trim();
      if (text && editingGone) await app.add(text);
      else if (text && text !== item.text) { await app.edit(item, text); toast('Saved'); }
    }
  });
  $('edit-delete').addEventListener('click', async () => {
    if (!await confirmModal('Delete this item? It goes to the bin.', { title: 'Delete item', danger: true, yes: 'Delete' })) return;
    const item = editing; editing = null;
    sheet.close('delete');
    if (item && !editingGone) { await app.remove(item); toast('Deleted'); }
  });

  return item => {
    editing = item;
    input('edit-text').value = item.text;
    $('edit-live').textContent = ''; $('edit-msg').textContent = '';
    let seen = false;
    editingGone = false;
    stopLive?.();
    stopLive = app.watchItem(item.id, doc => {
      if (editing?.id !== item.id) return;
      if (doc) {
        seen = true;
        $('edit-live').textContent = doc.text !== item.text ? `Changed on another device: “${doc.text}”` : '';
      } else if (seen && input('edit-text').value.trim() !== item.text) {
        editingGone = true;
        $('edit-live').textContent = 'This item was deleted on another device. Save adds your text back as a new item.';
      } else if (seen) {
        editing = null;
        sheet.close('gone');
        $('edit-msg').textContent = `“${item.text}” was deleted on another device.`;
      }
    });
    sheet.showModal();
  };
}
