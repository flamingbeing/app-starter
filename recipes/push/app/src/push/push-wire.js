// Web Push on this device (the push recipe), loaded only once the option pushOn is on (push-settings.js imports it then).
// startPush(app): turning the option on asks for the notification permission (refused: the option goes back off); with it
// granted this device subscribes (push.js) and tells the Worker (POST /api/push/subscribe); then, a moment after each change
// to the items, it sends what to notify in the next week (push-items.js; POST /api/push/schedule) when that differs from
// what it sent last. The Worker's once-a-minute job sends each when due, so it arrives with the app closed. Turning the
// option off, or signing out, unsubscribes (the Worker empties the queue once no device is left). A subscribe that fails
// (offline, signed out, refused) is tried again, with a growing wait, at the next change, when the device is back online
// or the app comes to the front. iPhone: only an app added to the Home Screen gets push.
import { VAPID_PUBLIC_KEY } from './vapid.js';
import { subscribePush, unsubscribePush, pushSupported } from './push.js';
import { pushItems } from './push-items.js';

export const OPTION = 'pushOn';
const DEBOUNCE_MS = 4000;
const RETRY_MS = 30000, RETRY_MAX_MS = 30 * 60000;

/**
 * What push needs of the app (cloud.js start()).
 * @typedef {Pick<import('../items.js').ItemsApp, 'settings' | 'items' | 'idToken' | 'onSignOut' | 'onItems'>} PushApp
 */

/** @param {PushApp} app -> stop() */
export function startPush(app) {
  const w = wirePush(app);
  let busy = false, again = false;
  const apply = async () => {
    if (busy) { again = true; return; }
    busy = true;
    try {
      do {
        again = false;
        if (!app.settings.get(OPTION)) { await w.off(); continue; }
        if (await permission() !== 'granted') { await app.settings.set(OPTION, false); continue; }
        w.on();
      } while (again);
    } finally { busy = false; }
  };
  const offWatch = app.settings.watch(OPTION, () => { void apply(); });
  const offItems = app.onItems?.(list => w.update(list));
  w.update(app.items());
  void apply();
  return () => { offWatch(); offItems?.(); void w.off(); };
}

/** the notification permission, asked only when it has not been answered yet @returns {Promise<NotificationPermission | 'unsupported'>} */
async function permission() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

/**
 * The subscribe and schedule loop, without the option (startPush drives it; tests drive it directly).
 * @param {Pick<PushApp, 'idToken' | 'onSignOut'>} app
 * @param {{ now?: () => number, debounce?: number, items?: typeof pushItems, subscribe?: typeof subscribePush,
 *   unsubscribe?: typeof unsubscribePush, fetch?: typeof fetch, key?: string }} [o]  (for tests)
 */
export function wirePush(app, o = {}) {
  const now = o.now ?? Date.now, wait = o.debounce ?? DEBOUNCE_MS, items = o.items ?? pushItems;
  const subscribe = o.subscribe ?? subscribePush, unsubscribe = o.unsubscribe ?? unsubscribePush, key = o.key ?? VAPID_PUBLIC_KEY;
  const doFetch = o.fetch ?? ((/** @type {Parameters<typeof fetch>} */ ...a) => fetch(...a));
  /** the option is on (on() .. off()) */
  let want = false;
  let active = false;
  /** counts off() calls, so a start that was under way when the option went off knows */
  let gen = 0, fails = 0, retryAt = 0;
  /** @type {Promise<void> | null} */
  let starting = null;
  /** @type {import('../items.js').Item[]} */
  let list = [];
  /** @type {string | null} what the Worker has now */
  let sent = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  /** @type {(() => void) | undefined} */
  let unhook;

  /** @param {string} route @param {unknown} body */
  async function post(route, body) {
    try {
      const token = await app.idToken?.();
      if (!token) return false;
      const r = await doFetch(`/api/push/${route}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return r.ok;
    } catch { return false; }
  }
  async function schedule() {
    timer = null;
    if (!active) return;
    const queued = items(list, now());
    const k = JSON.stringify(queued);
    if (k === sent) return;
    if (await post('schedule', { items: queued })) sent = k;
  }
  const later = (/** @type {number} */ ms) => { if (timer) clearTimeout(timer); timer = setTimeout(() => void schedule(), ms); };
  /** drop this device at the Worker and in the browser (does not change `want`) */
  async function drop() {
    active = false; sent = null;
    if (timer) { clearTimeout(timer); timer = null; }
    const endpoint = await unsubscribe();
    if (endpoint) await post('unsubscribe', { endpoint });
  }
  /** subscribe when wanted and not yet (and not waiting out a failure) */
  function ensure() {
    if (!want || active || starting || now() < retryAt) return;
    const g = gen;
    starting = (async () => {
      const sub = await subscribe(key);
      const ok = !!sub && await post('subscribe', { subscription: sub });
      if (g !== gen) return;   // the option went off meanwhile: off() undoes it
      if (ok) { active = true; fails = 0; later(0); } else retryAt = now() + Math.min(RETRY_MAX_MS, RETRY_MS * 2 ** fails++);
    })().finally(() => { starting = null; });
  }
  const wake = () => { if (globalThis.document?.visibilityState !== 'hidden') ensure(); };

  return {
    /** the option is on */
    on() {
      if (want) return;
      want = true; fails = 0; retryAt = 0;
      globalThis.addEventListener?.('online', ensure);
      globalThis.document?.addEventListener('visibilitychange', wake);
      const offHook = app.onSignOut?.(drop);
      unhook = () => { globalThis.removeEventListener?.('online', ensure); globalThis.document?.removeEventListener('visibilitychange', wake); offHook?.(); };
      ensure();
    },
    /** the option is off: forget this device */
    async off() {
      if (!want) return;
      want = false; gen++;
      unhook?.();
      await starting;   // (a subscribe under way has finished by now; this undoes it)
      await drop();
    },
    /** the items changed @param {import('../items.js').Item[]} next */
    update(next) {
      list = next;
      if (!want) return;
      if (active) later(sent === null ? 0 : wait); else ensure();
    },
  };
}
