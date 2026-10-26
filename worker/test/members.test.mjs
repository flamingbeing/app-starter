import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClaims, DEFAULT_ADMINS } from '../members.js';

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

test('the owner is admin by default, only with a verified email and no role doc', async () => {
  const email = DEFAULT_ADMINS[0];
  assert.deepEqual(await loadClaims({ uid: 'u1', token: { email, email_verified: true }, admin: adminWith(null) }), { g: { _: 'admin' }, v: 0 });
  assert.equal(await loadClaims({ uid: 'u1', token: { email, email_verified: false }, admin: adminWith(null) }), null);
  assert.equal(await loadClaims({ uid: 'u1', token: { email: 'x@y.z', email_verified: true }, admin: adminWith(null) }), null);
  assert.deepEqual(await loadClaims({ uid: 'u1', token: { email, email_verified: true }, admin: adminWith({ role: 'viewer', v: 2 }) }), { g: { _: 'viewer' }, v: 2 });
});
