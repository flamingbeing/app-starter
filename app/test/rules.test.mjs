// The app's rules in the Firestore emulator: the rules kit's shared cases plus the app's own.
//   firebase emulators:exec --only firestore --project demo-starter-app "node --test app/test/rules.test.mjs"
// (from the repo root, after setup-tools or with .devkit/ copied from app-devkit)
// The app's own space mode (APP.space in src/config.js: shared or person) is tested; RULES_SPACES=shared,person tests
// both (the template's Checks do), each with its inSpace line as tools/modules.mjs writes it.
import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { suite } from '../../.devkit/rules/suite.mjs';
import { spaceRules, spaceOfConfig } from '../../tools/modules.mjs';

// The optional modules' cases (app/test/rules/<module>.mjs, written by tools/add.mjs): each exports `collections`
// (more rows for the shared cases) and `tests({ test, assert, emu, as, space })` (space(role): the space that role's
// test account works in, '_' or its own uid).
const dir = new URL('./rules/', import.meta.url);
const mods = existsSync(dir)
  ? await Promise.all(readdirSync(dir).filter(f => f.endsWith('.mjs')).sort().map(f => import(new URL(f, dir).href)))
  : [];

const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const asked = (process.env.RULES_SPACES || '').split(',').map(m => m.trim()).filter(Boolean);
const MODES = asked.length ? asked : [spaceOfConfig(readFileSync(new URL('../src/config.js', import.meta.url), 'utf8'))];
const ROLES = ['admin', 'member', 'viewer'];
// the kit's rows, in the shared space '_' (a personal app's are each owner's own: sharedClosed and the suite's {uid} paths below)
const ROWS = [
  { path: 'spaces/_/tasks/t1', read: ['admin', 'member', 'viewer'], write: ['admin', 'member'],
    data: { text: 'hello', done: false, updatedAt: 1 }, stamp: 'strict', list: { roles: ['admin', 'member', 'viewer'] } },
  { path: 'spaces/_/lists/l1', read: ['admin', 'member', 'viewer'], write: ['admin', 'member'],
    data: { name: 'Work', order: 1, updatedAt: 1 }, stamp: 'strict', list: { roles: ['admin', 'member', 'viewer'] } },
  ...mods.flatMap(m => m.collections ?? []),
];
const at = { serverAt: true };

/** A personal app: every row's collection is its owner's alone. The rules suite runs each row at `spaces/{uid}/…`
 * (app-devkit 1.18: each role in its own space; anyone else's, admins included, refused; no role, signed out, ended
 * access, revoked and unstamped as for a shared row). One more case here: nobody reads or writes the shared space '_'. */
const owned = row => ({ ...row, path: row.path.replace(/^spaces\/_\//, 'spaces/{uid}/') });
function sharedClosed(test, emu, as) {
  for (const row of ROWS) {
    const [, , coll] = row.path.split('/');
    const data = uid => (typeof row.data === 'function' ? row.data(uid) : row.data);
    const opts = row.stamp && row.stamp !== 'none' ? at : {};
    test(`${coll}: nobody reads or writes the shared space`, async () => {
      await emu.clear();
      await emu.seed(`spaces/_/${coll}/old`, data('u-old'));
      for (const role of ROLES) {
        assert.equal((await as(role).get(`spaces/_/${coll}/old`)).ok, false, `${coll}: ${role} reads the shared space`);
        assert.equal((await as(role).list(`spaces/_/${coll}`)).ok, false, `${coll}: ${role} lists the shared space`);
        assert.equal((await as(role).set(`spaces/_/${coll}/n`, data(`u-${role}`), opts)).ok, false, `${coll}: ${role} writes the shared space`);
      }
    });
  }
}

for (const mode of MODES) {
  // more than one mode: each case's name starts with it
  const test = (/** @type {string} */ name, /** @type {() => Promise<void>} */ fn) => nodeTest(MODES.length > 1 ? `${mode}: ${name}` : name, fn);
  const person = mode === 'person';
  /** the space a role's test account (u-<role>) works in */
  const space = role => (person ? `u-${role}` : '_');
  const emu = suite({
    project: 'demo-starter-app',
    rules: spaceRules(RULES, mode),
    roles: ROLES,
    collections: person ? ROWS.map(owned) : ROWS,
  });

  const as = role => emu.as(`u-${role}`, { g: { _: role }, v: 1 });
  if (person) sharedClosed(test, emu, as);

  test('people read their own role doc, not others’; nobody writes or deletes one from a page (the Worker does)', async () => {
    await emu.clear();
    await emu.seed('members/u-member', { role: 'member', v: 1 });
    await emu.seed('members/u-other', { role: 'member', v: 1 });
    assert.equal((await as('member').get('members/u-member')).ok, true);
    assert.equal((await emu.as('u-new', {}).get('members/u-new')).ok, true, 'no role yet: may still read (absent) own doc');
    assert.equal((await as('member').get('members/u-other')).ok, false);
    assert.equal((await as('member').set('members/u-member', { role: 'admin', v: 2 })).ok, false, 'no self-promotion');
    assert.equal((await as('admin').get('members/u-other')).ok, true, 'admins read every role doc');
    assert.equal((await as('admin').set('members/u-other', { role: 'viewer', v: 2 })).ok, false, 'role changes: /api/members/');
    assert.equal((await as('admin').set('members/u-new', { role: 'member', v: 1 })).ok, false);
    assert.equal((await as('admin').delete('members/u-other')).ok, false, 'removal: /api/members/ (it also revokes)');
    assert.equal((await as('member').delete('members/u-member')).ok, false);
  });

  test('tasks: text required and at most 500 characters; no extra fields; done is a bool', async () => {
    await emu.clear();
    const base = { text: 'ok', done: false, updatedAt: 1 };
    const put = (data, id = 'a') => as('member').set(`spaces/${space('member')}/tasks/${id}`, data, at);
    assert.equal((await put({ ...base, text: '' })).ok, false);
    assert.equal((await put({ ...base, text: 'x'.repeat(501) })).ok, false);
    assert.equal((await put({ ...base, owner: 'me' })).ok, false);
    assert.equal((await put(base)).ok, true);
    assert.equal((await put({ text: 'ok', updatedAt: 1 })).ok, false, 'done is required');
    assert.equal((await put({ ...base, done: 'no' })).ok, false, 'done is a bool');
    assert.equal((await put({ ...base, done: true, doneAt: 5 })).ok, true);
    assert.equal((await put({ ...base, done: false, doneAt: null })).ok, true, 'null clears doneAt');
    assert.equal((await put({ ...base, doneAt: 'x' })).ok, false);
    assert.equal((await put({ ...base, createdAt: 1 })).ok, true, 'createdAt allowed');
    assert.equal((await put({ ...base, createdAt: 'x' })).ok, false, 'createdAt is a number');
    assert.equal((await put({ ...base, createdAt: 2 })).ok, false, 'createdAt cannot change');
    const edits = { text: { by: 'Sam', device: 'Phone', at: 1 } };   // who changed each field and when (app-sync edits)
    assert.equal((await put({ ...base, _edits: edits })).ok, true, '_edits allowed');
    assert.equal((await put({ ...base, _edits: 'x' })).ok, false, '_edits is a map');
  });

  test('tasks: notes, list, day and time are checked; null clears an optional field', async () => {
    await emu.clear();
    const base = { text: 'ok', done: false, updatedAt: 1 };
    const put = data => as('member').set(`spaces/${space('member')}/tasks/n`, data, at);
    assert.equal((await put({ ...base, notes: 'a\nb', listId: 'l1', due: '2026-10-29', dueTime: '09:30' })).ok, true);
    assert.equal((await put({ ...base, notes: null, listId: null, due: null, dueTime: null })).ok, true, 'null clears');
    assert.equal((await put({ ...base, notes: 'x'.repeat(5001) })).ok, false);
    assert.equal((await put({ ...base, notes: 5 })).ok, false);
    assert.equal((await put({ ...base, listId: '' })).ok, false);
    assert.equal((await put({ ...base, listId: 'x'.repeat(65) })).ok, false);
    assert.equal((await put({ ...base, due: '29/10/2026' })).ok, false, 'a day is YYYY-MM-DD');
    assert.equal((await put({ ...base, due: 20261029 })).ok, false);
    assert.equal((await put({ ...base, due: '2026-10-29', dueTime: '24:00' })).ok, false, 'a time is HH:MM');
    assert.equal((await put({ ...base, due: '2026-10-29', dueTime: '9:30' })).ok, false);
    assert.equal((await put({ ...base, dueTime: '09:30' })).ok, false, 'no time without a day');
    assert.equal((await put({ ...base, due: null, dueTime: '09:30' })).ok, false);
  });

  test('tasks: viewers read, only admins and members write and delete', async () => {
    await emu.clear();
    const s = role => `spaces/${space(role)}/tasks/s`;
    await emu.seed(s('viewer'), { text: 'seed', done: false, updatedAt: 1 });
    await emu.seed(s('member'), { text: 'seed', done: false, updatedAt: 1 });
    assert.equal((await as('viewer').get(s('viewer'))).ok, true);
    assert.equal((await as('viewer').set(s('viewer'), { text: 'x', done: true, updatedAt: 2 }, at)).ok, false);
    assert.equal((await as('viewer').delete(s('viewer'))).ok, false);
    assert.equal((await emu.as('u-new', {}).get(s('viewer'))).ok, false, 'no role, no read');
    assert.equal((await as('member').delete(s('member'))).ok, true);
  });

  test('lists: a name of 1 to 60 characters and an order; no extra fields', async () => {
    await emu.clear();
    const base = { name: 'Home', order: 1, updatedAt: 1 };
    const put = (data, id = 'l') => as('member').set(`spaces/${space('member')}/lists/${id}`, data, at);
    assert.equal((await put(base)).ok, true);
    assert.equal((await put({ ...base, name: '' })).ok, false);
    assert.equal((await put({ ...base, name: 'x'.repeat(61) })).ok, false);
    assert.equal((await put({ name: 'Home', updatedAt: 1 })).ok, false, 'order is required');
    assert.equal((await put({ ...base, order: 'first' })).ok, false);
    assert.equal((await put({ ...base, color: 'red' })).ok, false);
    assert.equal((await put({ ...base, createdAt: 1 })).ok, true);
    assert.equal((await put({ ...base, createdAt: 2 })).ok, false, 'createdAt cannot change');
    await emu.seed(`spaces/${space('viewer')}/lists/l`, base);
    assert.equal((await as('viewer').set(`spaces/${space('viewer')}/lists/v`, base, at)).ok, false);
    assert.equal((await as('viewer').delete(`spaces/${space('viewer')}/lists/l`)).ok, false);
    assert.equal((await as('member').delete(`spaces/${space('member')}/lists/l`)).ok, true);
  });

  test('bin entries: writers stamp them; viewers only read', async () => {
    await emu.clear();
    const entry = { id: 'a', kind: 'tasks', data: { text: 'ok' }, deletedAt: 2, updatedAt: 2 };
    const bin = (role, id) => `spaces/${space(role)}/bin/tasks:${id}`;
    assert.equal((await as('viewer').set(bin('viewer', 'a'), entry, at)).ok, false);
    assert.equal((await as('member').set(bin('member', 'a'), entry, at)).ok, true);
    await emu.seed(bin('viewer', 'a'), entry);
    assert.equal((await as('viewer').get(bin('viewer', 'a'))).ok, true);
    assert.equal((await as('member').set(bin('member', 'b'), entry)).ok, false, 'unstamped');
  });

  test('account options: one doc per person, only theirs, only the allowed fields', async () => {
    await emu.clear();
    const mine = { showCounts: true, defaultList: 'l1', updatedAt: 1 };
    const doc = (role, uid = `u-${role}`) => `spaces/${space(role)}/settings/${uid}`;
    for (const role of ['admin', 'member', 'viewer']) {
      assert.equal((await as(role).set(doc(role), mine, at)).ok, true, `${role} saves their own`);
      assert.equal((await as(role).get(doc(role))).ok, true);
    }
    assert.equal((await as('member').set(doc('member', 'u-admin'), mine, at)).ok, false, 'not someone else’s doc');
    // a shared space: the group can read it (a list listen cannot ask for one doc); a personal one: only its owner
    assert.equal((await as('member').get(doc('admin'))).ok, !person, 'another person’s options');
    assert.equal((await emu.as('u-new', {}).get(doc('member'))).ok, false, 'no role, no read');
    assert.equal((await emu.as('u-new', {}).set(`spaces/${person ? 'u-new' : '_'}/settings/u-new`, mine, at)).ok, false, 'no role, no access');
    assert.equal((await as('member').set(doc('member'), mine)).ok, false, 'unstamped');
    assert.equal((await as('member').set(doc('member'), { ...mine, other: 1 }, at)).ok, false, 'an option the app did not list');
    assert.equal((await as('member').set(doc('member'), { showCounts: 'yes', updatedAt: 1 }, at)).ok, false, 'wrong type');
    assert.equal((await as('member').set(doc('member'), { defaultList: 'x'.repeat(65), updatedAt: 1 }, at)).ok, false, 'a list id is at most 64 characters');
    assert.equal((await as('member').set(doc('member'), { showCounts: null, defaultList: null, profile: null, updatedAt: 2 }, at)).ok, true, 'null forgets a value');
  });

  for (const m of mods) m.tests?.({ test, assert, emu, as, space });
}
