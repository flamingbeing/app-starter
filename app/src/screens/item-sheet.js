// The edit sheet (#edit) of the list screen. It follows its item on the server: a change made elsewhere shows under the
// field, and a delete made elsewhere closes the sheet and says so, unless the person has typed a change: then the sheet
// stays open, says so, and Save adds their text back as a new item. (An item not on the server yet is only "gone" once
// it was seen there.) Its photos and files (@core/files) are listed under the text: add one, open one, remove one.
import { confirmModal } from '@core/ui';
import { REFUSED } from '../cloud.js';
import { $, input, dialog } from '../dom.js';
import { attachmentRows } from './attachments.js';

/** @typedef {import('../cloud.js').Item} Item */
/** @typedef {import('../cloud.js').Attachment} Attachment */

/**
 * @param {import('../cloud.js').Started} app
 * @param {(message: string) => unknown} toast  a short note (the kit's toaster)
 * @param {(itemId: string) => Attachment[]} filesOf  an item's photos and files as this device has them
 * @returns {{ open: (item: Item) => void, redraw: () => void }} open the sheet on an item; redraw its files
 */
export function itemSheet(app, toast, filesOf) {
  const sheet = dialog('edit');
  /** @type {Item | null} */
  let editing = null;
  let editingGone = false;   // the item being edited was deleted elsewhere while the person had typed a change
  /** @type {(() => void) | null} */
  let stopLive = null;

  const redraw = () => {
    if (!editing) return;
    const list = filesOf(editing.id);
    $('edit-files').replaceChildren(...attachmentRows(app, list, async f => {
      if (!await confirmModal(`Remove ${f.name}?`, { title: 'Remove file', danger: true, yes: 'Remove' })) return;
      await app.detach(f);
      toast('Removed');
    }));
    $('edit-files').hidden = list.length === 0;
  };
  $('edit-attach').addEventListener('click', () => input('edit-file').click());
  input('edit-file').addEventListener('change', async () => {
    const picked = [...(input('edit-file').files || [])], item = editing;
    input('edit-file').value = '';
    if (!item || !picked.length) return;
    try {
      for (const file of picked) await app.attach(item, file);
      toast(picked.length > 1 ? `${picked.length} files added` : 'File added');
    } catch (e) {
      toast(/** @type {{ code?: string }} */ (e)?.code === 'too-big' ? 'That file is too big.' : 'Could not add the file.');
    }
  });

  sheet.addEventListener('close', async () => {
    stopLive?.(); stopLive = null;
    const item = editing; editing = null;
    if (sheet.returnValue === 'save' && item) {
      const text = input('edit-text').value.trim();
      if (text && editingGone) { if (await app.add(text)) toast(REFUSED); }
      else if (text && text !== item.text) toast(await app.edit(item, text) ? REFUSED : 'Saved');
    }
  });
  $('edit-delete').addEventListener('click', async () => {
    if (!await confirmModal('Delete this item? It goes to the bin.', { title: 'Delete item', danger: true, yes: 'Delete' })) return;
    const item = editing; editing = null;
    sheet.close('delete');
    if (item && !editingGone) { await app.remove(item, filesOf(item.id)); toast('Deleted'); }
  });

  const open = (/** @type {Item} */ item) => {
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
    redraw();
    sheet.showModal();
  };
  return { open, redraw };
}
