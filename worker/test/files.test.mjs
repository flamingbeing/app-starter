// worker/files.js on an in-memory bucket, and its route in sites.js. Run: node --test 'worker/test/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleFiles, defaultAccess, MAX_BYTES } from '../files.js';
import worker from '../sites.js';
import { memoryBucket } from '../../e2e/memory-bucket.mjs';

const ORIGIN = 'https://app.example.com';
// made-up accounts: the token is the account's name, verify() looks it up
const TOKENS = {
  ann: { sub: 'ann', g: { _: 'member' } },
  vic: { sub: 'vic', g: { _: 'viewer' } },
  bob: { sub: 'bob', g: { _: 'admin' } },
  nob: { sub: 'nob' },
};
const verify = async t => { if (!TOKENS[t]) throw new Error('bad token'); return TOKENS[t]; };
const call = (bucket, method, path, { who, body, type, headers = {}, ...opts } = {}) => handleFiles(new Request(ORIGIN + path, {
  method, body,
  headers: { ...(who ? { Authorization: `Bearer ${who}` } : {}), ...(type ? { 'Content-Type': type } : {}), ...(body != null ? { 'Content-Length': String(new Blob([body]).size) } : {}), ...headers },
}), { bucket, verify, origin: ORIGIN, ...opts });

test('put, get and delete in a shared scope; the key is <scope>/<id>', async () => {
  const b = memoryBucket();
  let r = await call(b, 'PUT', '/api/files/_/abc', { who: 'ann', body: 'hello', type: 'image/webp' });
  assert.equal(r.status, 201);
  assert.deepEqual([...b.objects.keys()], ['_/abc']);
  assert.equal(b.objects.get('_/abc').httpMetadata.contentType, 'image/webp');
  assert.equal(b.objects.get('_/abc').customMetadata.by, 'ann');
  await call(b, 'PUT', '/api/files/_/abc.thumb', { who: 'ann', body: 't', type: 'image/webp' });
  r = await call(b, 'GET', '/api/files/_/abc', { who: 'vic' });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'hello');
  assert.equal(r.headers.get('Content-Type'), 'image/webp');
  assert.equal(r.headers.get('Cache-Control'), 'private');
  assert.equal(r.headers.get('Content-Disposition'), null);
  r = await call(b, 'DELETE', '/api/files/_/abc', { who: 'bob' });
  assert.equal(r.status, 204);
  assert.equal(b.objects.size, 0, 'the thumbnail goes with the file');
  assert.equal((await call(b, 'DELETE', '/api/files/_/abc', { who: 'bob' })).status, 204, 'gone already is fine');
  assert.equal((await call(b, 'GET', '/api/files/_/abc', { who: 'ann' })).status, 404);
});

test('access follows the Firestore rule: viewers read, members and admins write, no role nothing; own uid always', async () => {
  const b = memoryBucket();
  assert.equal((await call(b, 'PUT', '/api/files/_/a', { who: 'vic', body: 'x' })).status, 403);
  assert.equal((await call(b, 'PUT', '/api/files/_/a', { who: 'nob', body: 'x' })).status, 403);
  assert.equal((await call(b, 'DELETE', '/api/files/_/a', { who: 'vic' })).status, 403);
  assert.equal((await call(b, 'GET', '/api/files/_/a', { who: 'nob' })).status, 403);
  assert.equal((await call(b, 'PUT', '/api/files/nob/a', { who: 'nob', body: 'x' })).status, 201, 'a personal file');
  assert.equal((await call(b, 'GET', '/api/files/nob/a', { who: 'ann' })).status, 403, "someone else's personal file");
  assert.equal((await call(b, 'GET', '/api/files/other/a', { who: 'ann' })).status, 403, 'a scope the token has no role in');
  assert.equal(defaultAccess({ token: { sub: 'x', g: { s: 'member' } }, scope: 's', write: true }), true);
  assert.equal(defaultAccess({ token: { sub: 'x', g: 'member' }, scope: 's', write: false }), false);
});

test('the rules\' other gates: no access after the claims\' end (x), none once revoked; a failed lookup is 503', async () => {
  const b = memoryBucket();
  const late = { ...TOKENS, ann: { ...TOKENS.ann, x: 1000 } };
  const lateVerify = async (/** @type {string} */ t) => late[t];
  assert.equal((await call(b, 'PUT', '/api/files/_/a', { who: 'ann', body: 'x', verify: lateVerify, now: () => 999_999 })).status, 201);
  assert.equal((await call(b, 'GET', '/api/files/_/a', { who: 'ann', verify: lateVerify, now: () => 1_000_000 })).status, 403);
  assert.equal((await call(b, 'GET', '/api/files/ann/a', { who: 'ann', verify: lateVerify, now: () => 1_000_000 })).status, 403, 'own files too');
  const revoked = async (/** @type {string} */ uid) => uid === 'bob';
  assert.equal((await call(b, 'GET', '/api/files/_/a', { who: 'bob', revoked })).status, 403);
  assert.equal((await call(b, 'GET', '/api/files/_/a', { who: 'ann', revoked })).status, 200);
  assert.equal((await call(b, 'GET', '/api/files/_/a', { who: 'ann', revoked: async () => { throw new Error('down'); } })).status, 503);
});

test('an app passes its own access rule', async () => {
  const b = memoryBucket();
  const access = ({ scope, write }) => scope === 'open' && !write;
  assert.equal((await call(b, 'GET', '/api/files/open/a', { who: 'nob', access })).status, 404);
  assert.equal((await call(b, 'GET', '/api/files/_/a', { who: 'ann', access })).status, 403);
});

test('sign-in, origin, method, address and setup are checked first', async () => {
  const b = memoryBucket();
  assert.equal((await call(b, 'GET', '/api/files/_/a')).status, 401);
  assert.equal((await call(b, 'GET', '/api/files/_/a', { who: 'mallory' })).status, 401);
  assert.equal((await call(b, 'PUT', '/api/files/_/a', { who: 'ann', body: 'x', headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call(b, 'POST', '/api/files/_/a', { who: 'ann', body: 'x' })).status, 405);
  assert.equal((await call(b, 'DELETE', '/api/files/_/a.thumb', { who: 'ann' })).status, 400);
  for (const p of ['/api/files/a', '/api/files/_/a/b', '/api/files/_/../x', '/api/files/_/a.png', '/api/files/_/' + 'x'.repeat(65)]) {
    assert.equal((await call(b, 'GET', p, { who: 'ann' })).status, 404, p);
  }
  assert.equal((await call(null, 'GET', '/api/files/_/a', { who: 'ann' })).status, 503);
  assert.equal(b.objects.size, 0);
});

test('size cap and Content-Length; an odd Content-Type is stored as octet-stream and downloads', async () => {
  const b = memoryBucket();
  assert.equal(MAX_BYTES, 100_000_000);
  assert.equal((await call(b, 'PUT', '/api/files/_/a', { who: 'ann', body: '12345', maxBytes: 4 })).status, 413);
  assert.equal((await call(b, 'PUT', '/api/files/_/a', { who: 'ann', body: '1234', maxBytes: 4, type: 'text/html; charset=utf-8' })).status, 201);
  let r = await call(b, 'GET', '/api/files/_/a', { who: 'ann' });
  assert.equal(r.headers.get('Content-Type'), 'text/html');
  assert.equal(r.headers.get('Content-Disposition'), 'attachment', 'never shown as a page of the app');
  await call(b, 'PUT', '/api/files/_/b', { who: 'ann', body: 'x', type: 'not a type' });
  r = await call(b, 'GET', '/api/files/_/b', { who: 'ann' });
  assert.equal(r.headers.get('Content-Type'), 'application/octet-stream');
  const noLength = new Request(ORIGIN + '/api/files/_/c', { method: 'PUT', headers: { Authorization: 'Bearer ann' }, body: new Blob(['x']).stream(), duplex: 'half' });
  assert.equal((await handleFiles(noLength, { bucket: b, verify, origin: ORIGIN })).status, 411);
});

test('sites.js routes /api/files/: 503 without a bucket, then the emulator token on localhost', async () => {
  const unsigned = (claims) => [{ alg: 'none' }, claims, ''].map((x, i) => i < 2 ? Buffer.from(JSON.stringify(x)).toString('base64url') : '').join('.');
  const now = Math.floor(Date.now() / 1000);
  const tok = unsigned({ aud: 'demo-x', iss: 'https://securetoken.google.com/demo-x', sub: 'ann', exp: now + 60, iat: now, auth_time: now, g: { _: 'member' } });
  const env = { FIREBASE_PROJECT: 'demo-x', EMULATOR: '1' };
  const put = e => worker.fetch(new Request('http://localhost/api/files/_/a', { method: 'PUT', body: 'x', headers: { Authorization: `Bearer ${tok}`, 'Content-Length': '1' } }), e);
  let r = await put(env);
  assert.equal(r.status, 503);
  assert.equal(r.headers.get('X-Robots-Tag'), 'noindex, nofollow', 'with the security headers');
  const FILES = memoryBucket();
  const realFetch = globalThis.fetch, asked = [];
  // the revoked/{uid} lookup, as the emulators' admin: not there (404), then there
  let gone = false;
  globalThis.fetch = async (url) => { asked.push(String(url)); return gone ? Response.json({ fields: {} }) : new Response(null, { status: 404 }); };
  try {
    assert.equal((await put({ ...env, FILES, FIRESTORE_EMULATOR: 'fs' })).status, 201);
    assert.match(asked[0], /^http:\/\/fs\/v1\/projects\/demo-x\/databases\/\(default\)\/documents\/revoked\/ann$/);
    gone = true;
    assert.equal((await put({ ...env, FILES, FIRESTORE_EMULATOR: 'fs' })).status, 403, 'revoked');
  } finally { globalThis.fetch = realFetch; }
  assert.deepEqual([...FILES.objects.keys()], ['_/a']);
  r = await worker.fetch(new Request('https://app.example.com/api/files/_/a', { method: 'PUT', body: 'x', headers: { Authorization: `Bearer ${tok}`, 'Content-Length': '1' } }), { ...env, FILES });
  assert.equal(r.status, 401, 'unsigned tokens only on localhost');
});
