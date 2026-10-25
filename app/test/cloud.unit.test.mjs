// cloud.js's pure parts: roles from claims, and when new claims are needed. node --test app/test/cloud.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { roleOf, versionOf, needsClaims, configured } from '../cloud.js';

test('role and version from the token claims', () => {
  assert.equal(roleOf({ g: { _: 'member' }, v: 2 }), 'member');
  assert.equal(roleOf({}), '');
  assert.equal(versionOf({ v: 2 }), 2);
  assert.equal(versionOf({}), -1);
});

test('new claims when the token has none, or the role doc moved on', () => {
  assert.equal(needsClaims({}, null), true);
  assert.equal(needsClaims({ g: { _: 'member' }, v: 1 }, { role: 'member', v: 1 }), false);
  assert.equal(needsClaims({ g: { _: 'member' }, v: 1 }, { role: 'member', v: 2 }), true);
  assert.equal(needsClaims({ g: { _: 'viewer' }, v: 1 }, { role: 'member', v: 1 }), true);
  assert.equal(needsClaims({ g: { _: 'member' }, v: 1 }, null), true, 'doc gone: the role must go too');
  assert.equal(needsClaims({ v: 1 }, null), false, 'no doc and no role: nothing to do');
});

test('the unfilled template is not connected to a project', () => {
  assert.equal(configured, false);
});
