// Makes the app's Web Push key pair (VAPID, P-256) for the push recipe: the private half goes straight to the Worker as the
// secret VAPID_PRIVATE_KEY (`npx wrangler secret put`, signed in to Cloudflare), never to a file or the screen; then the
// public half is written into app/src/push/vapid.js (commit that). Run it again to make a new pair: every device then
// subscribes afresh (push.js drops a subscription made with the old key) and the old one stops working.
//   node tools/push-keys.mjs [--dir <app>]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const b64 = (/** @type {Uint8Array} */ b) => Buffer.from(b).toString('base64url');

export async function makePair() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { publicKey: b64(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))), privateKey: String(jwk.d) };
}

/** vapid.js's text with the public key in @param {string} text @param {string} key */
export function withKey(text, key) {
  const re = /export const VAPID_PUBLIC_KEY = '[^']*';/;
  if (!re.test(text)) throw new Error('app/src/push/vapid.js has no VAPID_PUBLIC_KEY line');
  return text.replace(re, `export const VAPID_PUBLIC_KEY = '${key}';`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--dir');
  const dir = path.resolve(i > 0 ? process.argv[i + 1] : '.');
  const file = path.join(dir, 'app/src/push/vapid.js');
  const text = fs.readFileSync(file, 'utf8');
  const { publicKey, privateKey } = await makePair();
  execFileSync('npx', ['wrangler', 'secret', 'put', 'VAPID_PRIVATE_KEY'], { cwd: dir, input: privateKey, stdio: ['pipe', 'inherit', 'inherit'] });
  fs.writeFileSync(file, withKey(text, publicKey));
  console.log(`VAPID_PRIVATE_KEY is on the Worker; the public key is in app/src/push/vapid.js. Commit it and deploy.`);
}
