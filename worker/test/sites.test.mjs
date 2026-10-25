// worker/sites.js with a stand-in for the static assets. Run: node --test 'worker/test/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../sites.js';
import { SITES } from '../routes.js';

const HOST = Object.keys(SITES)[0];
const FILES = { '/app/index.html': '<h1>hi</h1>', '/app/sw.js': '//', '/app/list/index.html': 'list' };
const env = { FIREBASE_PROJECT: 'demo-x', ASSETS: { fetch: async req => {
  const p = new URL(req.url).pathname;
  return p in FILES ? new Response(FILES[p], { status: 200 }) : new Response('', { status: 404 });
} } };
const get = (url, init = {}) => worker.fetch(new Request(url, init), env);

test('serves the app at the root, noindex, with the security headers', async () => {
  const r = await get(`https://${HOST}/`);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '<h1>hi</h1>');
  assert.equal(r.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(r.headers.get('Strict-Transport-Security'), /max-age=31536000/);
  assert.match(r.headers.get('Content-Security-Policy-Report-Only') || r.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
});

test('folder without a slash redirects; missing files 404; unknown hosts 404', async () => {
  assert.equal((await get(`https://${HOST}/list`)).status, 301);
  assert.equal((await get(`https://${HOST}/nope.js`)).status, 404);
  assert.equal((await get('https://x.workers.dev/')).status, 404);
});

test('errors carry the headers too', async () => {
  const r = await get(`https://${HOST}/nope.js`);
  assert.equal(r.headers.get('X-Frame-Options'), 'DENY');
});

test('service worker is never cached', async () => {
  assert.equal((await get(`https://${HOST}/sw.js`)).headers.get('Cache-Control'), 'no-cache');
});

test('only GET and HEAD for files', async () => {
  assert.equal((await get(`https://${HOST}/`, { method: 'POST' })).status, 405);
});

test('/api/claims: 503 until the service account is set, 405 on GET', async () => {
  assert.equal((await get(`https://${HOST}/api/claims`, { method: 'POST' })).status, 503);
  assert.equal((await get(`https://${HOST}/api/claims`)).status, 405);
});

test('emulator claims only on localhost', async () => {
  const e = { ...env, EMULATOR: '1', AUTH_EMULATOR: '127.0.0.1:1', FIRESTORE_EMULATOR: '127.0.0.1:1' };
  const r = await worker.fetch(new Request(`https://${HOST}/api/claims`, { method: 'POST' }), e);
  assert.equal(r.status, 503);   // a real host ignores EMULATOR: no service account, not set up
  const l = await worker.fetch(new Request('http://localhost/api/claims', { method: 'POST' }), e);
  assert.equal(l.status, 401);   // set up (emulator), but no token
});
