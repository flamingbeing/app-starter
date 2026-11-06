// Web Push from a Worker, on Web Crypto only (the Node `web-push` package needs Node's crypto and http): the VAPID
// header (RFC 8292: an ES256 JWT, the public key) and the message encryption (RFC 8291 over RFC 8188, aes128gcm, one record).
// The push recipe (recipes/push.json). The Worker holds the VAPID private key (secret VAPID_PRIVATE_KEY: the raw P-256 private
// value, base64url; tools/push-keys.mjs makes the pair); the public key is the page's (app/src/push/vapid.js). Apple's push
// service answers 403 to a bad VAPID header, so the header, TTL, Urgency and Content-Encoding below are all required.
//
//   sendPush({ subscription, payload, vapid, now?, ttl? }) -> the push service's Response (201 = accepted; 404 or 410 = the
//   subscription is gone), with vapid = { publicKey, privateKey, subject } (base64url strings, subject an https: or mailto: URL).
//   encrypt(...) is exported for the known-answer test (RFC 8291, appendix A).

const enc = new TextEncoder();

/** @param {string} s base64url -> bytes */
export const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
/** @param {Uint8Array} b bytes -> base64url */
export const b64 = b => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** @param {Uint8Array[]} parts */
const cat = parts => { const o = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };

/** a P-256 private key from its raw value d and public key (65 bytes, 04 || x || y) @param {Uint8Array} d @param {Uint8Array} pub @param {'ECDH' | 'ECDSA'} alg */
function importPrivate(d, pub, alg) {
  const jwk = { kty: 'EC', crv: 'P-256', d: b64(d), x: b64(pub.slice(1, 33)), y: b64(pub.slice(33, 65)) };
  return crypto.subtle.importKey('jwk', jwk, { name: alg, namedCurve: 'P-256' }, false, alg === 'ECDH' ? ['deriveBits'] : ['sign']);
}

/** @param {Uint8Array} ikm @param {Uint8Array} salt @param {Uint8Array} info @param {number} bytes */
async function hkdf(ikm, salt, info, bytes) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}

/**
 * The request body for one message: salt (16) || record size (4) || key id length (1) || sender public key (65) || ciphertext.
 * @param {{ payload: Uint8Array, p256dh: string, auth: string, salt?: Uint8Array, sender?: { d: Uint8Array, pub: Uint8Array } }} o
 *   p256dh and auth are the subscription's keys (base64url); salt and sender are random unless a test fixes them.
 */
export async function encrypt({ payload, p256dh, auth, salt, sender }) {
  const ua = unb64(p256dh), authSecret = unb64(auth);
  if (ua.length !== 65 || ua[0] !== 4 || authSecret.length !== 16) throw new Error('bad subscription keys');
  if (payload.length > 3993) throw new Error('payload too large');   // push services take 4096 bytes in all: less the 86-byte header, the delimiter and the 16-byte tag
  let as;
  if (sender) as = { priv: await importPrivate(sender.d, sender.pub, 'ECDH'), pub: sender.pub };
  else {
    const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    as = { priv: kp.privateKey, pub: new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)) };
  }
  salt ??= crypto.getRandomValues(new Uint8Array(16));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.priv, 256));
  const ikm = await hkdf(secret, authSecret, cat([enc.encode('WebPush: info\0'), ua, as.pub]), 32);
  const cek = await hkdf(ikm, salt, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat([payload, Uint8Array.of(2)])));   // 2 = the last (only) record
  return cat([salt, Uint8Array.of(0, 0, 16, 0), Uint8Array.of(as.pub.length), as.pub, body]);
}

/** The VAPID Authorization header value for a push service address. @param {string} endpoint @param {{ publicKey: string, privateKey: string, subject: string }} vapid */
export async function vapidHeader(endpoint, vapid, now = Date.now()) {
  const pub = unb64(vapid.publicKey);
  const head = b64(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await importPrivate(unb64(vapid.privateKey), pub, 'ECDSA'), enc.encode(`${head}.${claims}`)));
  return `vapid t=${head}.${claims}.${b64(sig)}, k=${vapid.publicKey}`;
}

/** @param {{ subscription: { endpoint: string, keys: { p256dh: string, auth: string } }, payload: unknown, vapid: { publicKey: string, privateKey: string, subject: string }, now?: number, ttl?: number }} o */
export async function sendPush({ subscription, payload, vapid, now = Date.now(), ttl = 900 }) {
  const body = await encrypt({ payload: enc.encode(JSON.stringify(payload)), p256dh: subscription.keys.p256dh, auth: subscription.keys.auth });
  return fetch(subscription.endpoint, { method: 'POST', body, headers: {
    Authorization: await vapidHeader(subscription.endpoint, vapid, now),
    'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: 'high',
  } });
}
