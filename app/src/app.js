// The sample screen: a list with add, edit (the sheet follows its item live), delete (to the bin), a conflict sheet, a
// list of saves the server refused, a status chip, sign-in, sign-out (which keeps this device's data), "Forget this
// device", the version line and "Check for updates". Replace it with the real app; keep the wiring in cloud.js.
import { start, explain, usingEmulator, emulatorSignIn } from './cloud.js';

/** @param {string} id @returns {HTMLElement} */
const $ = id => { const el = document.getElementById(id); if (!el) throw new Error(`#${id} is missing`); return el; };
/** @param {string} id */
const input = id => /** @type {HTMLInputElement} */ ($(id));
/** @param {string} id */
const dialog = id => /** @type {HTMLDialogElement} */ ($(id));
const VIEWS = ['signed-out', 'no-access', 'not-set-up', 'list-view'];
/** @param {string} view */
const show = view => { for (const v of VIEWS) $(v).hidden = v !== view; };
/** @type {Record<string, string>} */
const LABELS = { synced: 'Saved', pending: 'Sending…', offline: 'Offline, kept on this device', attention: 'Needs you', unknown: 'Connecting…', 'at-risk': 'Not saved on this device yet' };
/** @param {number} n @param {string} one */
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** @typedef {import('./cloud.js').Item} Item */
/** @type {Awaited<ReturnType<typeof start>>} */
let app = null;
let role = '';
/** @type {Item | null} */
let editing = null;
let editingGone = false;   // the item being edited was deleted elsewhere while the person had typed a change
/** @type {(() => void) | null} */
let stopLive = null;
/** @type {any[]} */
let conflicts = [];
const typing = () => document.activeElement?.tagName === 'INPUT' && !!(/** @type {HTMLInputElement} */ (document.activeElement).value);
const sheetOpen = () => dialog('edit').open || dialog('conflicts').open;
const canWrite = () => role === 'admin' || role === 'member';

// app-update (the update module): a new version installs in the background; the reload waits while someone types, a
// sheet is open or saves are unsent. (Off in the emulator tests unless ?sw is given.)
const withSW = 'serviceWorker' in navigator && (!usingEmulator || new URLSearchParams(location.search).has('sw'));

window.starter = { ready: false, add: text => app?.add(text), signInAs: emulatorSignIn };   // for the tests
app = await start({
  canReload: withSW ? () => !typing() && !sheetOpen() : null,
  onState(s) {
    role = s.role || '';
    $('who').textContent = s.user ? s.user.email : '';
    $('sign-out').hidden = !s.user;
    if (s.user) { $('sign-out-msg').textContent = ''; $('forget-msg').textContent = ''; $('forget-force').hidden = true; }
    if (s.phase === 'no-access' && s.user) $('uid').textContent = s.user.uid;
    show({ 'signed-out': 'signed-out', 'no-access': 'no-access', 'not-set-up': 'not-set-up', ready: 'list-view' }[s.phase]);
    $('add').hidden = !canWrite();
    window.starter.phase = s.phase;
    window.starter.role = role;
  },
  onList(items, changed) {
    const ul = $('items');
    ul.replaceChildren(...[...items].sort((a, b) => String(a.text).localeCompare(String(b.text))).map(item => {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = item.text; b.disabled = !canWrite();
      b.addEventListener('click', () => openEdit(item));
      li.classList.toggle('changed', changed.has(item.id));   // changed here or elsewhere since the last time
      li.append(b); return li;
    }));
    $('empty').hidden = items.length > 0;
    window.starter.items = items.map(x => x.text);
    window.starter.ready = true;
  },
  onStatus(st) {
    const chip = $('status');
    chip.dataset.state = st.state;
    chip.textContent = (LABELS[st.state] || st.state) + (st.count ? ` (${st.count})` : '');
    window.starter.status = st.state;
  },
  onConflicts(list) {
    conflicts = list;
    $('attention').hidden = !list.length;
    $('attention').textContent = `${plural(list.length, 'change')} met an edit from another device: choose`;
    if (!list.length && dialog('conflicts').open) dialog('conflicts').close();
    if (dialog('conflicts').open) renderConflicts();
    window.starter.conflicts = list.length;
  },
  onRefused(list) {
    $('refused-box').hidden = !list.length;
    $('refused').replaceChildren(...list.map(r => {
      const li = document.createElement('li'), t = document.createElement('p');
      t.textContent = `“${r.text.length > 60 ? r.text.slice(0, 60) + '…' : r.text}”${r.why ? ` (${r.why})` : ''}`;
      const retry = choiceButton('Try again', () => app?.retry(r.key)), discard = choiceButton('Discard', () => app?.discard(r.key));
      retry.className = 'retry'; discard.className = 'discard danger';
      li.append(t, retry, discard); return li;
    }));
  },
});

if (app?.update) {
  const u = app.update;
  u.versionLabel().then((/** @type {string} */ v) => { $('version').textContent = v || 'not installed yet'; }, () => {});
  // the reasons to wait have gone: try an owed reload now
  document.addEventListener('focusout', () => setTimeout(() => u.retryUpdate(), 0));
  for (const d of ['edit', 'conflicts']) $(d).addEventListener('close', () => setTimeout(() => u.retryUpdate(), 0));
  $('check-update').hidden = false;
  $('check-update').addEventListener('click', async () => {
    $('update-msg').textContent = 'Checking…';
    const took = await u.checkNow();
    $('update-msg').textContent = took ? 'Updated.' : 'This is the newest version (or the update waits until nothing is open).';
  });
} else $('version').textContent = 'dev';

$('sign-in').addEventListener('click', async () => {
  $('sign-in-error').textContent = '';
  try { $('sign-in-error').textContent = await app?.signIn() || ''; } catch (e) { $('sign-in-error').textContent = explain(e, 'Sign-in'); }
});
$('sign-out').addEventListener('click', async () => {
  const unsent = await app?.signOut() || 0;
  $('sign-out-msg').textContent = unsent
    ? `Signed out. ${plural(unsent, 'unsent change')} kept on this device; they send when you sign in again.`
    : 'Signed out. The list is kept on this device for your next sign-in.';
});
/** @param {boolean} force */
async function forget(force) {
  if (!app) return;
  $('forget-msg').textContent = '';
  const r = await app.forget({ force });
  $('forget-force').hidden = r.ok || r.reason !== 'unsent';
  $('forget-msg').textContent = r.ok && r.failed.length
    ? `Signed out, but some of this app's data could not be cleared (${r.failed.join(', ')}). Close every tab of this app and forget again.`
    : r.ok ? 'Forgotten: this device holds nothing of this app now.'
    : 'Some changes on this device are not sent yet. Sign in to send them, or forget anyway and lose them.';
  if (r.ok) $('sign-out-msg').textContent = '';
}
$('forget').addEventListener('click', () => forget(false));
$('forget-force').addEventListener('click', () => forget(true));
$('add').addEventListener('submit', async e => {
  e.preventDefault();
  const text = input('new-text').value.trim();
  if (!text || !app) return;
  await app.add(text);
  input('new-text').value = '';
});

// The edit sheet follows its item on the server: a change made elsewhere shows under the field, and a delete made
// elsewhere closes the sheet and says so, unless the person has typed a change: then the sheet stays open, says so,
// and Save adds their text back as a new item. (An item not on the server yet is only "gone" once it was seen there.)
/** @param {Item} item */
function openEdit(item) {
  if (!app) return;
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
      dialog('edit').close('gone');
      $('edit-msg').textContent = `“${item.text}” was deleted on another device.`;
    }
  });
  dialog('edit').showModal();
}
$('edit').addEventListener('close', async () => {
  stopLive?.(); stopLive = null;
  const item = editing; editing = null;
  if (dialog('edit').returnValue === 'save' && item && app) {
    const text = input('edit-text').value.trim();
    if (text && editingGone) await app.add(text);
    else if (text && text !== item.text) await app.edit(item, text);
  }
});
$('edit-delete').addEventListener('click', async () => {
  const item = editing; editing = null;
  dialog('edit').close('delete');
  if (item && app && !editingGone) await app.remove(item);
});

$('attention').addEventListener('click', () => { renderConflicts(); dialog('conflicts').showModal(); });
// One conflict: both versions side by side, each with when it changed (SGT) and who changed it (name, device).
// Choices: keep mine / keep theirs for the whole item; with several clashing fields, one choice per field as well.
/** @param {any} v @param {boolean} deleted */
const sideText = (v, deleted) => deleted ? '(deleted)' : v && typeof v === 'object' ? String(v.text ?? '') : String(v ?? '');
/** @param {string} title @param {{ when?: string, by?: string, device?: string }} side @param {string} text */
function sideBox(title, side, text) {
  const d = document.createElement('div');
  const h = document.createElement('h3'), q = document.createElement('p'), m = document.createElement('p');
  h.textContent = title; q.textContent = `“${text}”`;
  m.className = 'small';
  m.textContent = [side.when, [side.by, side.device].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'time and author unknown';
  d.append(h, q, m); return d;
}
/** @param {string} label @param {() => unknown} onClick */
function choiceButton(label, onClick) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label; b.addEventListener('click', onClick); return b;
}
function renderConflicts() {
  $('conflict-list').replaceChildren(...conflicts.map(c => {
    const li = document.createElement('li'), cols = document.createElement('div'), row = document.createElement('div');
    cols.className = 'sides'; row.className = 'row';
    cols.append(sideBox('Yours', c.mine, sideText(c.mine.value, c.deleted.mine)), sideBox('Other device', c.theirs, sideText(c.theirs.value, c.deleted.theirs)));
    row.append(choiceButton('Keep mine', () => app?.resolve(c, 'mine')), choiceButton('Keep theirs', () => app?.resolve(c, 'theirs')));
    li.append(cols, row);
    if (c.fields.length > 1) {
      /** @type {Record<string, 'mine' | 'theirs'>} */
      const picks = {};
      const per = document.createElement('div'), go = choiceButton('Keep these choices', () => app?.resolve(c, picks));
      go.disabled = true;
      for (const f of c.fields) {
        const r = document.createElement('div'), t = document.createElement('p');
        r.className = 'row'; t.className = 'small'; t.textContent = `${f.path}: yours “${f.mine.value}” (${f.mine.when}) · theirs “${f.theirs.value}” (${f.theirs.when})`;
        /** @param {'mine' | 'theirs'} which */
        const pick = which => () => { picks[f.path] = which; go.disabled = c.fields.some((/** @type {{ path: string }} */ x) => !picks[x.path]); };
        r.append(t, choiceButton('Mine', pick('mine')), choiceButton('Theirs', pick('theirs')));
        per.append(r);
      }
      li.append(per, go);
    }
    return li;
  }));
}
