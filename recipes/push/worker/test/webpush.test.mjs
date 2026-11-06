// worker/webpush.js: the RFC 8291 appendix A example (known answer), a round trip, and the VAPID header. Run: node --test 'worker/test/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, vapidHeader, sendPush, unb64, b64 } from '../webpush.js';

// RFC 8291 appendix A
const AS_PRIVATE = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw';
const AS_PUBLIC = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
const UA_PRIVATE = 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94';
const UA_PUBLIC = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const AUTH = 'BTBZMqHH6r4Tts7J_aSIgg';
const SALT = 'DGv6ra1nlYgDCS1FRnbzlw';
const TEXT = 'When I grow up, I want to be a watermelon';
const BODY = 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';

test('encrypt matches the RFC 8291 appendix A message', async () => {
  const out = await encrypt({ payload: new TextEncoder().encode(TEXT), p256dh: UA_PUBLIC, auth: AUTH, salt: unb64(SALT), sender: { d: unb64(AS_PRIVATE), pub: unb64(AS_PUBLIC) } });
  assert.equal(b64(out), BODY);
});

test('a random-key message decrypts with the receiver key (round trip)', async () => {
  const out = await encrypt({ payload: new TextEncoder().encode('{"title":"Call"}'), p256dh: UA_PUBLIC, auth: AUTH });
  assert.equal(out[20], 65);
  assert.equal(out[16] * 2 ** 24 + out[17] * 2 ** 16 + out[18] * 256 + out[19], 4096);
  const salt = out.slice(0, 16), asPub = out.slice(21, 86), cipher = out.slice(86);
  const ua = unb64(UA_PUBLIC);
  const priv = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: UA_PRIVATE, x: b64(ua.slice(1, 33)), y: b64(ua.slice(33)) }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, priv, 256));
  const e = new TextEncoder();
  const hk = async (ikm, s, info, n) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8));
  const ikm = await hk(secret, unb64(AUTH), new Uint8Array([...e.encode('WebPush: info\0'), ...ua, ...asPub]), 32);
  const key = await crypto.subtle.importKey('raw', await hk(ikm, salt, e.encode('Content-Encoding: aes128gcm\0'), 16), 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: await hk(ikm, salt, e.encode('Content-Encoding: nonce\0'), 12) }, key, cipher));
  assert.equal(plain.at(-1), 2);
  assert.equal(new TextDecoder().decode(plain.slice(0, -1)), '{"title":"Call"}');
});

test('encrypt refuses bad keys and a payload over one record', async () => {
  await assert.rejects(encrypt({ payload: new Uint8Array(3), p256dh: 'AAAA', auth: AUTH }));
  await assert.rejects(encrypt({ payload: new Uint8Array(4000), p256dh: UA_PUBLIC, auth: AUTH }));
});

async function vapidPair() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return { kp, vapid: { publicKey: b64(pub), privateKey: jwk.d, subject: 'https://push.example.test' } };
}

test('the VAPID header: vapid t=<ES256 JWT for the push service origin>, k=<public key>', async () => {
  const { kp, vapid } = await vapidPair();
  const h = await vapidHeader('https://web.push.apple.com/abc/def', vapid, 1_700_000_000_000);
  const m = h.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/);
  assert.ok(m, h);
  assert.equal(m[4], vapid.publicKey);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(unb64(m[1]))), { typ: 'JWT', alg: 'ES256' });
  const c = JSON.parse(new TextDecoder().decode(unb64(m[2])));
  assert.deepEqual(c, { aud: 'https://web.push.apple.com', exp: 1_700_000_000 + 12 * 3600, sub: 'https://push.example.test' });
  const sig = unb64(m[3]);
  assert.equal(sig.length, 64);
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, sig, new TextEncoder().encode(`${m[1]}.${m[2]}`)), true);
});

test('sendPush posts the encrypted body with the headers Apple and the others require', async () => {
  const { vapid } = await vapidPair();
  const seen = [], real = globalThis.fetch;
  globalThis.fetch = async (url, init) => { seen.push([url, init]); return new Response(null, { status: 201 }); };
  try {
    const r = await sendPush({ subscription: { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: UA_PUBLIC, auth: AUTH } }, payload: { title: 'T' }, vapid });
    assert.equal(r.status, 201);
  } finally { globalThis.fetch = real; }
  const [url, init] = seen[0];
  assert.equal(url, 'https://web.push.apple.com/x');
  assert.equal(init.method, 'POST');
  assert.match(init.headers.Authorization, /^vapid t=\S+, k=\S+$/);
  assert.equal(init.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(init.headers.TTL, '900');
  assert.equal(init.headers.Urgency, 'high');
  assert.ok(init.body instanceof Uint8Array && init.body.length > 86 + 17);
});
