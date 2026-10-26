// worker/sites.js with a stand-in for the static assets. Run: node --test 'worker/test/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { settledClaims } from '../sites.js';
import { handleClaims } from '../claims.js';
import { loadClaims } from '../members.js';
import { SITES } from '../routes.js';

const HOST = Object.keys(SITES)[0];
const FILES = { '/app/index.html': '<h1>hi</h1>', '/app/public/sw.js': '//', '/app/public/app.css': 'css', '/app/src/app.js': 'js', '/app/list/index.html': 'list', '/app/public/kit/index.html': 'kit' };
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

test('the sign-in helper pages may be framed by this address (Firebase auth iframe), nothing else may', async () => {
  const fetched = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>helper</html>', { status: 200 });
  try {
    const r = await get(`https://${HOST}/__/auth/iframe?apiKey=x`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('X-Frame-Options'), 'SAMEORIGIN');
    assert.match(r.headers.get('Content-Security-Policy-Report-Only') || r.headers.get('Content-Security-Policy'), /frame-ancestors 'self'/);
  } finally { globalThis.fetch = fetched; }
});

test('folder without a slash redirects; missing files 404; unknown hosts 404', async () => {
  assert.equal((await get(`https://${HOST}/list`)).status, 301);
  assert.equal((await get(`https://${HOST}/kit`)).status, 301, 'a page folder in public/ too');
  assert.equal(await (await get(`https://${HOST}/kit/`)).text(), 'kit');
  assert.equal((await get(`https://${HOST}/nope.js`)).status, 404);
  for (const path of ['//list', '///list']) {   // never a redirect to another host ("//list/" reads as https://list/)
    // an asset store that, like many static servers, merges repeated slashes
    const merging = { ...env, ASSETS: { fetch: req => env.ASSETS.fetch(new Request(req.url.replace(/(?<!:)\/{2,}/g, '/'))) } };
    const r = await worker.fetch(new Request(`https://${HOST}${path}`), merging);
    const to = r.headers.get('location');
    if (to) assert.equal(new URL(to, `https://${HOST}/`).host, HOST, path);
  }
  assert.equal((await get('https://x.workers.dev/')).status, 404);
});

test('files are found in public/ when the folder lacks them (Vite layout, no build); src/ as it is', async () => {
  assert.equal(await (await get(`https://${HOST}/app.css`)).text(), 'css');
  assert.equal(await (await get(`https://${HOST}/src/app.js`)).text(), 'js');
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

test('/api/claims: of two asks at once, the one that read the doc before it existed cannot leave the role off', async () => {
  // A (the page's first ask, before the role doc exists) reads, then is slow to write; B (set off by the new doc)
  // reads and writes in between. A's stale empty claims must not be the last word.
  const store = new Map();
  let release = () => {};
  const held = new Promise(r => { release = r; });
  const written = [];
  let writes = 0;
  const adm = {
    project: 'demo-x',
    getDoc: async p => store.get(p) ?? null,
    setClaims: async (uid, claims) => { if (writes++ === 0) await held; written.push(claims); },
    clearRevoked: async () => {},
  };
  const verify = async () => ({ sub: 'u1', firebase: { sign_in_provider: 'google.com' } });
  const ask = () => settledClaims(a => handleClaims(new Request('https://x/api/claims', { method: 'POST', headers: { Authorization: 'Bearer t' } }),
    { admin: a, loadClaims, verify }), adm);
  const a = ask();
  await new Promise(r => setTimeout(r, 10));   // A has read (no doc) and waits to write
  store.set('members/u1', { role: 'member', v: 1 });
  assert.equal((await ask()).status, 200);   // B: read the doc, wrote the role
  release();
  assert.equal((await a).status, 200);
  assert.equal(written.at(-1)?.g?._, 'member');
});
