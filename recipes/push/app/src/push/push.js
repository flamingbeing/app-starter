// The browser side of Web Push (the push recipe): subscribe this device with the app's public key, or unsubscribe it.
// push-wire.js uses it; nothing here runs on load and nothing asks for a permission.
//   subscribePush(vapidPublicKey) -> the browser's PushSubscription as JSON ({ endpoint, keys: { p256dh, auth } }) to send to
//   the Worker (POST /api/push/subscribe, signed in), or null when push is unsupported, not allowed, or no key is given. A
//   subscription made with another key (the pair was made again) is dropped and made afresh.
//   unsubscribePush() -> the endpoint it dropped (to tell the Worker), or null when there was none.

/** @param {string} b64 URL-safe base64 -> bytes */
function bytes(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
/** @param {ArrayBuffer | null | undefined} a @param {Uint8Array} b */
const sameKey = (a, b) => !!a && a.byteLength === b.length && new Uint8Array(a).every((v, i) => v === b[i]);

export const pushSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in globalThis && typeof Notification !== 'undefined';

/** @param {string} vapidPublicKey @returns {Promise<PushSubscriptionJSON | null>} */
export async function subscribePush(vapidPublicKey) {
  if (!vapidPublicKey || !pushSupported() || Notification.permission !== 'granted') return null;
  try {
    const reg = await navigator.serviceWorker.ready, key = bytes(vapidPublicKey);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options?.applicationServerKey, key)) { await sub.unsubscribe(); sub = null; }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    return sub.toJSON();
  } catch { return null; }
}

/** @returns {Promise<string | null>} */
export async function unsubscribePush() {
  if (!pushSupported()) return null;
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (!sub) return null;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    return endpoint;
  } catch { return null; }
}
