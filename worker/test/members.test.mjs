import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClaims } from '../members.js';

const adminWith = doc => ({ getDoc: async p => { assert.equal(p, 'members/u1'); return doc; } });

test('a member doc becomes single-group claims', async () => {
  assert.deepEqual(await loadClaims({ uid: 'u1', admin: adminWith({ role: 'member', v: 3 }) }), { g: { _: 'member' }, v: 3 });
});

test('no doc, or an unknown role, clears the claims', async () => {
  assert.equal(await loadClaims({ uid: 'u1', admin: adminWith(null) }), null);
  assert.equal(await loadClaims({ uid: 'u1', admin: adminWith({ role: 'owner' }) }), null);
});

test('a missing v counts as 0', async () => {
  assert.deepEqual(await loadClaims({ uid: 'u1', admin: adminWith({ role: 'viewer' }) }), { g: { _: 'viewer' }, v: 0 });
});
