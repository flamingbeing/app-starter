// The sample screen: a list with add, edit, delete (to the bin), a conflict sheet, a status chip, sign-in, sign-out
// (which wipes this device) and the version line. Replace it with the real app; keep the wiring in cloud.js.
import { start, explain, usingEmulator } from './cloud.js';
import { register, versionLabel, retryUpdate } from 'https://core.anawj.com/update/0.2.0/register.js';

const $ = id => document.getElementById(id);
const VIEWS = ['signed-out', 'no-access', 'not-set-up', 'list-view'];
const show = view => { for (const v of VIEWS) $(v).hidden = v !== view; };
const LABELS = { synced: 'Saved', pending: 'Sending…', offline: 'Offline, kept on this device', attention: 'Needs you', unknown: 'Connecting…', 'at-risk': 'Not saved on this device yet' };

let app = null, role = '', editing = null, conflicts = [];
const typing = () => document.activeElement?.tagName === 'INPUT' && !!document.activeElement.value;
const sheetOpen = () => $('edit').open || $('conflicts').open;

// app-update: a new version installs in the background; the reload waits while someone types, a sheet is open or
// saves are sending.
// (Off in the emulator tests unless ?sw is given.)
if ('serviceWorker' in navigator && (!usingEmulator || new URLSearchParams(location.search).has('sw'))) {
  register({ app: 'app', sw: 'sw.js', canReload: () => !typing() && !sheetOpen() && !app?.sending() });
  versionLabel().then(v => { $('version').textContent = v || 'not installed yet'; }, () => {});
  // the reasons to wait have gone: try an owed reload now
  document.addEventListener('focusout', () => setTimeout(retryUpdate, 0));
  for (const d of ['edit', 'conflicts']) $(d).addEventListener('close', () => setTimeout(retryUpdate, 0));
} else $('version').textContent = 'dev';

window.starter = { ready: false };   // for the tests
app = await start({
  onState(s) {
    role = s.role || '';
    $('who').textContent = s.user ? s.user.email : '';
    $('sign-out').hidden = !s.user;
    if (s.phase === 'no-access') $('uid').textContent = s.user.uid;
    show({ 'signed-out': 'signed-out', 'no-access': 'no-access', 'not-set-up': 'not-set-up', ready: 'list-view' }[s.phase]);
    $('add').hidden = !canWrite();
    window.starter.phase = s.phase;
    window.starter.role = role;
  },
  onList(items) {
    const ul = $('items');
    ul.replaceChildren(...[...items].sort((a, b) => String(a.text).localeCompare(String(b.text))).map(item => {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = item.text; b.disabled = !canWrite();
      b.addEventListener('click', () => openEdit(item));
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
    $('attention').textContent = `${list.length} change${list.length === 1 ? '' : 's'} met an edit from another device: choose`;
    if (!list.length && $('conflicts').open) $('conflicts').close();
    if ($('conflicts').open) renderConflicts();
    window.starter.conflicts = list.length;
  },
});
const canWrite = () => role === 'admin' || role === 'member';

$('sign-in').addEventListener('click', async () => {
  $('sign-in-error').textContent = '';
  try { await app.signIn(); } catch (e) { $('sign-in-error').textContent = explain(e, 'Sign-in'); }
});
$('sign-out').addEventListener('click', async () => {
  $('sign-out-msg').textContent = '';
  const ok = await app.signOut();
  if (!ok) $('sign-out-msg').textContent = 'Some changes haven’t reached the server yet. Stay online a moment, or choose a version for each conflict, then try again.';
});
$('add').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('new-text').value.trim();
  if (!text) return;
  await app.add(text);
  $('new-text').value = '';
});

function openEdit(item) {
  editing = item;
  $('edit-text').value = item.text;
  $('edit').showModal();
}
$('edit').addEventListener('close', async () => {
  const item = editing; editing = null;
  if ($('edit').returnValue === 'save' && item) {
    const text = $('edit-text').value.trim();
    if (text && text !== item.text) await app.edit(item, text);
  }
});
$('edit-delete').addEventListener('click', async () => {
  const item = editing; editing = null;
  $('edit').close('delete');
  if (item) await app.remove(item);
});

$('attention').addEventListener('click', () => { renderConflicts(); $('conflicts').showModal(); });
// One conflict: both versions side by side, each with when it changed (SGT) and who changed it (name, device).
// Choices: keep mine / keep theirs for the whole item; with several clashing fields, one choice per field as well.
const sideText = (v, deleted) => deleted ? '(deleted)' : v && typeof v === 'object' ? String(v.text ?? '') : String(v ?? '');
function sideBox(title, side, text) {
  const d = document.createElement('div');
  const h = document.createElement('h3'), q = document.createElement('p'), m = document.createElement('p');
  h.textContent = title; q.textContent = `“${text}”`;
  m.className = 'small';
  m.textContent = [side.when, [side.by, side.device].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'time and author unknown';
  d.append(h, q, m); return d;
}
function choiceButton(label, onClick) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label; b.addEventListener('click', onClick); return b;
}
function renderConflicts() {
  $('conflict-list').replaceChildren(...conflicts.map(c => {
    const li = document.createElement('li'), cols = document.createElement('div'), row = document.createElement('div');
    cols.className = 'sides'; row.className = 'row';
    cols.append(sideBox('Yours', c.mine, sideText(c.mine.value, c.deleted.mine)), sideBox('Other device', c.theirs, sideText(c.theirs.value, c.deleted.theirs)));
    row.append(choiceButton('Keep mine', () => app.resolve(c, 'mine')), choiceButton('Keep theirs', () => app.resolve(c, 'theirs')));
    li.append(cols, row);
    if (c.fields.length > 1) {
      const picks = {}, per = document.createElement('div'), go = choiceButton('Keep these choices', () => app.resolve(c, picks));
      go.disabled = true;
      for (const f of c.fields) {
        const r = document.createElement('div'), t = document.createElement('p');
        r.className = 'row'; t.className = 'small'; t.textContent = `${f.path}: yours “${f.mine.value}” (${f.mine.when}) · theirs “${f.theirs.value}” (${f.theirs.when})`;
        const pick = which => () => { picks[f.path] = which; go.disabled = c.fields.some(x => !picks[x.path]); };
        r.append(t, choiceButton('Mine', pick('mine')), choiceButton('Theirs', pick('theirs')));
        per.append(r);
      }
      li.append(per, go);
    }
    return li;
  }));
}
