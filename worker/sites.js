// The Cloudflare Worker for this repo's address. It serves the repo's files (the static assets, bound as ASSETS),
// decides which folder an address may see (routes.js), adds the security headers (headers.js), answers /api/claims
// (claims.js from app-devkit, roles from members.js) and /api/files/ (files.js, the R2 bucket bound as FILES), and
// passes Firebase's sign-in helper pages on to the project.
// wrangler.jsonc: "run_worker_first" sends every request here; FIREBASE_PROJECT is a var there, the service account
// (SA_EMAIL, SA_KEY) are Worker secrets.
import { resolve, publicFile } from './routes.js';
import { securityHeaders } from './headers.js';
import { admin, handleClaims, verifyIdToken } from './claims.js';
import { handleFiles } from './files.js';
import { loadClaims } from './members.js';

const NOINDEX = 'noindex, nofollow';
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const local = LOCAL.test(url.hostname);
    const project = env.FIREBASE_PROJECT || '';
    const finish = res => withHeaders(res, { project, local });

    if (url.pathname === '/api/claims') return finish(await claims(request, env, url, local, project));
    if (url.pathname.startsWith('/api/files/')) return finish(await files(request, env, url, local, project));
    if (request.method !== 'GET' && request.method !== 'HEAD') return finish(new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } }));
    // Firebase's sign-in helper pages, from the project's own Firebase address, so sign-in never leaves this one
    if (/^\/__\/(auth|firebase)\//.test(url.pathname) && project && !local) {
      const res = await fetch(new Request(`https://${project}.firebaseapp.com${url.pathname}${url.search}`, request));
      return withHeaders(new Response(res.body, res), { project, local, framedBySelf: true });
    }
    const r = resolve(url.hostname, url.pathname);
    if (r.redirect) return finish(redirect(url, r.redirect));
    if (r.notFound) return finish(notFound());

    // a folder (address ending in "/") serves its index.html
    let file = r.file;
    if (file === '' || file.endsWith('/')) file += 'index.html';
    let res = await asset(env, url, file);
    if (res.status === 404 && publicFile(file)) {
      const pub = await asset(env, url, publicFile(file));
      if (pub.status !== 404) { res = pub; file = publicFile(file); }
    }
    if (res.status === 404 && !/\.[^/]+$/.test(file)) {
      // no such file, but a folder of that name: send the browser to the address with a "/" (as GitHub Pages does)
      let dir = await asset(env, url, file + '/index.html');
      if (dir.status === 404 && publicFile(file + '/index.html')) dir = await asset(env, url, /** @type {string} */ (publicFile(file + '/index.html')));
      if (dir.status === 200) return finish(redirect(url, url.pathname + '/'));
    }
    if (res.status === 404) return finish(notFound());
    res = new Response(res.body, res);
    // service workers must always be checked fresh, or phones keep an old app for a day
    if (/(^|\/)sw\.js$/.test(file)) res.headers.set('Cache-Control', 'no-cache');
    return finish(res);
  },
};

// The real project with the service account in Worker secrets; on localhost with EMULATOR set (the e2e server only)
// the emulators, which need no account and accept only a demo- project.
function adminFor(env, local, project) {
  if (local && env.EMULATOR) return admin({ project, emulator: { auth: env.AUTH_EMULATOR, firestore: env.FIRESTORE_EMULATOR } });
  if (env.SA_EMAIL && env.SA_KEY && project) return admin({ project, sa: { email: env.SA_EMAIL, key: env.SA_KEY } });
  return null;
}
function claims(request, env, url, local, project) {
  const adm = adminFor(env, local, project);
  return handleClaims(request, { admin: adm, loadClaims, origin: url.origin, limit: env.CLAIMS_LIMIT, emulator: !!(local && env.EMULATOR) });
}

// The same ID token check as /api/claims (the emulators' unsigned tokens only on localhost with EMULATOR set), and the
// rules' revoked/{uid} gate, read as the service account (without one, no roles are ever issued).
function files(request, env, url, local, project) {
  const emulator = !!(local && env.EMULATOR);
  const verify = project ? idToken => verifyIdToken(idToken, { project, emulator }) : null;
  const adm = project ? adminFor(env, local, project) : null;
  const revoked = adm ? async (/** @type {string} */ uid) => !!(await adm.getDoc(`revoked/${uid}`)) : null;
  return handleFiles(request, { bucket: env.FILES, verify, revoked, origin: url.origin });
}

function withHeaders(res, opts) {
  const out = new Response(res.body, res);
  for (const [k, v] of securityHeaders(opts)) out.headers.set(k, v);
  out.headers.set('X-Robots-Tag', NOINDEX);
  return out;
}

const asset = (env, url, file) => env.ASSETS.fetch(new Request(new URL('/' + file, url), { method: 'GET' }));
const redirect = (url, path) => Response.redirect(new URL(path + url.search, url).toString(), 301);
const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
