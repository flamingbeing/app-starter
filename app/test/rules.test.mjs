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
});

test('bin entries: writers stamp them; viewers only read', async () => {
  await emu.clear();
  const entry = { id: 'a', kind: 'items', data: { text: 'ok' }, deletedAt: 2, updatedAt: 2 };
  assert.equal((await as('viewer').set('spaces/_/bin/items:a', entry, { serverAt: true })).ok, false);
  assert.equal((await as('member').set('spaces/_/bin/items:a', entry, { serverAt: true })).ok, true);
  assert.equal((await as('viewer').get('spaces/_/bin/items:a')).ok, true);
  assert.equal((await as('member').set('spaces/_/bin/items:b', entry)).ok, false, 'unstamped');
});
