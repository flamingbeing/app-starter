// The app's rules in the Firestore emulator: the rules kit's shared cases plus the app's own.
//   firebase emulators:exec --only firestore --project demo-starter-app "node --test app/test/rules.test.mjs"
// (from the repo root, after setup-tools or with .devkit/ copied from app-devkit)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { suite } from '../../.devkit/rules/suite.mjs';

const emu = suite({
  project: 'demo-starter-app',
  rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
  roles: ['admin', 'member', 'viewer'],
  collections: [
    { path: 'spaces/_/items/i1', read: ['admin', 'member', 'viewer'], write: ['admin', 'member'],
      data: { text: 'hello', updatedAt: 1 }, stamp: 'strict', list: { roles: ['admin', 'member', 'viewer'] } },
    { path: 'spaces/_/files/f1', read: ['admin', 'member', 'viewer'], write: ['admin', 'member'],
      data: { name: 'a.webp', type: 'image/webp', size: 10, state: 'local', item: 'i1', updatedAt: 1 }, stamp: 'strict',
      list: { roles: ['admin', 'member', 'viewer'] } },
  ],
});

const as = role => emu.as(`u-${role}`, { g: { _: role }, v: 1 });

test('people read their own role doc, not others’; only admins write role docs', async () => {
  await emu.clear();
  await emu.seed('members/u-member', { role: 'member', v: 1 });
  await emu.seed('members/u-other', { role: 'member', v: 1 });
  assert.equal((await as('member').get('members/u-member')).ok, true);
  assert.equal((await emu.as('u-new', {}).get('members/u-new')).ok, true, 'no role yet: may still read (absent) own doc');
  assert.equal((await as('member').get('members/u-other')).ok, false);
  assert.equal((await as('member').set('members/u-member', { role: 'admin', v: 2 })).ok, false, 'no self-promotion');
  assert.equal((await as('admin').set('members/u-other', { role: 'viewer', v: 2 })).ok, true);
  assert.equal((await as('admin').set('members/u-other', { role: 'owner', v: 3 })).ok, false, 'unknown role');
});

test('items: text required and at most 500 characters; no extra fields', async () => {
  await emu.clear();
  const at = { serverAt: true };
  assert.equal((await as('member').set('spaces/_/items/a', { text: '', updatedAt: 1 }, at)).ok, false);
  assert.equal((await as('member').set('spaces/_/items/a', { text: 'x'.repeat(501), updatedAt: 1 }, at)).ok, false);
  assert.equal((await as('member').set('spaces/_/items/a', { text: 'ok', updatedAt: 1, owner: 'me' }, at)).ok, false);
  assert.equal((await as('member').set('spaces/_/items/a', { text: 'ok', updatedAt: 1 }, at)).ok, true);
  const edits = { text: { by: 'Sam', device: 'Phone', at: 1 } };   // who changed each field and when (app-sync edits)
  assert.equal((await as('member').set('spaces/_/items/a', { text: 'ok', updatedAt: 1, _edits: edits }, at)).ok, true, '_edits allowed');
  assert.equal((await as('member').set('spaces/_/items/a', { text: 'ok', updatedAt: 1, _edits: 'x' }, at)).ok, false, '_edits is a map');
});

test('bin entries: writers stamp them; viewers only read', async () => {
  await emu.clear();
  const entry = { id: 'a', kind: 'items', data: { text: 'ok' }, deletedAt: 2, updatedAt: 2 };
  assert.equal((await as('viewer').set('spaces/_/bin/items:a', entry, { serverAt: true })).ok, false);
  assert.equal((await as('member').set('spaces/_/bin/items:a', entry, { serverAt: true })).ok, true);
  assert.equal((await as('viewer').get('spaces/_/bin/items:a')).ok, true);
  assert.equal((await as('member').set('spaces/_/bin/items:b', entry)).ok, false, 'unstamped');
});

test('files: the record of a photo or file on an item; known fields only, in their shapes', async () => {
  await emu.clear();
  const at = { serverAt: true }, ok = { name: 'a.webp', type: 'image/webp', size: 10, w: 4, h: 3, thumb: true, taken: 5, state: 'local', item: 'i1', updatedAt: 1 };
  const put = data => as('member').set('spaces/_/files/f', data, at);
  assert.equal((await put(ok)).ok, true);
  assert.equal((await put({ ...ok, state: 'stored' })).ok, true);
  assert.equal((await as('viewer').set('spaces/_/files/f', ok, at)).ok, false, 'viewers only read');
  assert.equal((await put({ ...ok, place: { lat: 1, lng: 2 } })).ok, false, 'the place is never kept here');
  assert.equal((await put({ ...ok, state: 'gone' })).ok, false);
  assert.equal((await put({ ...ok, item: '' })).ok, false, 'on an item');
  assert.equal((await put({ ...ok, name: '' })).ok, false);
  assert.equal((await put({ ...ok, size: 1.5 })).ok, false);
  assert.equal((await put({ ...ok, thumb: 'yes' })).ok, false);
  assert.equal((await as('member').set('spaces/_/files/g', ok)).ok, false, 'unstamped');
});

test('account options: one doc per person, only theirs, only the allowed fields', async () => {
  await emu.clear();
  const at = { serverAt: true };
  const mine = { itemCount: true, updatedAt: 1 };
  for (const role of ['admin', 'member', 'viewer']) {
    assert.equal((await as(role).set(`spaces/_/settings/u-${role}`, mine, at)).ok, true, `${role} saves their own`);
    assert.equal((await as(role).get(`spaces/_/settings/u-${role}`)).ok, true);
  }
  assert.equal((await as('member').set('spaces/_/settings/u-admin', mine, at)).ok, false, 'not someone else’s doc');
  assert.equal((await as('member').get('spaces/_/settings/u-admin')).ok, true, 'the group can read it (a list listen cannot ask for one doc)');
  assert.equal((await emu.as('u-new', {}).get('spaces/_/settings/u-member')).ok, false, 'no role, no read');
  assert.equal((await emu.as('u-new', {}).set('spaces/_/settings/u-new', mine, at)).ok, false, 'no role, no access');
  assert.equal((await as('member').set('spaces/_/settings/u-member', mine)).ok, false, 'unstamped');
  assert.equal((await as('member').set('spaces/_/settings/u-member', { ...mine, other: 1 }, at)).ok, false, 'an option the app did not list');
  assert.equal((await as('member').set('spaces/_/settings/u-member', { itemCount: 'yes', updatedAt: 1 }, at)).ok, false, 'wrong type');
  assert.equal((await as('member').set('spaces/_/settings/u-member', { itemCount: null, profile: null, updatedAt: 2 }, at)).ok, true, 'null forgets a value');
});
