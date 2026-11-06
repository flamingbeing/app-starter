// Web Push (the push recipe, recipes/push.json): notifications that arrive with the app closed. Three signed-in routes and
// a once-a-minute job.
//
//   POST /api/push/subscribe    { subscription: { endpoint, keys: { p256dh, auth } } }  keeps this device's subscription
//   POST /api/push/unsubscribe  { endpoint }                                            forgets it (no device left: the queue goes too)
//   POST /api/push/schedule     { items: [{ key, at, title, body, itemId, stamp }] }    replaces this person's queued notifications
//   runDue (the once-a-minute job, worker/push-route.js, listed in worker/modules.js SCHEDULED): sends what is due.
//
// The page decides what to notify (app/src/push/push-items.js pushItems): key names one notification (and is its tag, so a
// later one with the same key replaces it), at is when (ms), itemId the item it is about and stamp what that item looked
// like when it was queued (push-items.js stampOf). The job reads the item again just before sending and drops the
// notification when the item is gone or its stamp has changed (done, moved, deleted), so a stale one never goes out.
//
// Firestore (the Worker's service account; the rules refuse every page, app/rules/push.rules):
//   pushSubs/{uid}/devices/{sha256(endpoint)}  = { endpoint, p256dh, auth, createdAt }
//   pushDevices/{sha256(endpoint)}             = { uid }: who a device belongs to now (a shared browser moves to the latest person)
//   pushQueue/{uid}_{sha256(key)[0..40]}       = { uid, key, at, title, body, itemId, stamp, leaseUntil?, sentAt? }
//     leaseUntil: a run took it (no other run sends it until then). sentAt: sent; the doc stays until `at` + LATE_MS so a
//     client's later /schedule cannot bring the same notification back.
// The same ID token check as /api/claims; a person needs a role (as the files route) and not be revoked.
import { unb64, sendPush } from './webpush.js';
import { fromValue, toValue } from './claims.js';
import { ROLES } from './members.js';
import { itemPath, stampOf } from '../app/src/push/push-items.js';

export const MAX_ITEMS = 200, MAX_DEVICES = 10, MAX_BODY = 300_000;
export const AHEAD_MS = 8 * 24 * 3600 * 1000;
/** a notification later than this after its time is dropped */
export const LATE_MS = 15 * 60 * 1000;
/** due within this much of now is sent now (the job runs on the minute) */
export const SOON_MS = 30 * 1000;
/** at most this many notifications per run */
export const PER_RUN = 10;
/** the Workers free plan allows 50 outgoing requests (subrequests) per run: a run counts its own and stops short of this */
export const BUDGET = 45;
/** a run holds the items it sends this long; a failed send is tried again after it */
export const LEASE_MS = 2 * 60 * 1000;
/** the push services (the only addresses the Worker will post to) */
const SERVICES = /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)\//;

/** @param {string} s */
export async function sha256(s) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
}

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
const text = (v, max) => typeof v === 'string' && v.length <= max;
const isB64 = (v, bytes) => { try { return typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v) && unb64(v).length === bytes; } catch { return false; } };

/** @param {any} s @returns {{ endpoint: string, keys: { p256dh: string, auth: string } } | null} */
export function cleanSubscription(s) {
  if (!s || typeof s !== 'object' || !text(s.endpoint, 1000) || !SERVICES.test(s.endpoint)) return null;
  if (!isB64(s.keys?.p256dh, 65) || unb64(s.keys.p256dh)[0] !== 4 || !isB64(s.keys?.auth, 16)) return null;
  return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
}

/** The items worth queueing: well-formed ones later than SOON_MS from now and within AHEAD_MS (others are dropped), at most MAX_ITEMS, soonest first. null: malformed.
 * @param {any} items @param {number} now */
export function cleanItems(items, now) {
  if (!Array.isArray(items) || items.length > MAX_ITEMS) return null;
  const out = [];
  for (const i of items) {
    if (!i || typeof i !== 'object' || !text(i.key, 300) || !i.key || !text(i.title, 200) || !text(i.body, 300)) return null;
    if (!text(i.itemId, 128) || !i.itemId || i.itemId.includes('/') || !text(i.stamp, 200) || !i.stamp || !Number.isFinite(i.at)) return null;
    if (i.at <= now + SOON_MS || i.at > now + AHEAD_MS) continue;   // about to be sent (or sent) already: the job's, not the queue's
    out.push({ key: i.key, at: Math.round(i.at), title: i.title || 'Reminder', body: i.body, itemId: i.itemId, stamp: i.stamp });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** is the item still what the notification was made from? (its stamp, push-items.js stampOf) @param {any} q @param {any} item */
export const stillDue = (q, item) => !!q.stamp && !!item && !item._deleted && stampOf(item) === q.stamp;

/**
 * The routes. deps: { store, verify, revoked, origin, now }; store as `firestoreStore` (a test gives a memory one).
 * Answers { ok: true } or { error } with 400/401/403/405/413/503.
 */
export async function handlePush(request, { store, verify, revoked = null, origin, now = Date.now } = {}) {
  const m = new URL(request.url).pathname.match(/^\/api\/push\/(subscribe|unsubscribe|schedule)$/);
  if (!m) return json({ error: 'Not found.' }, 404);
  if (request.method !== 'POST') return json({ error: 'POST only.' }, 405, { Allow: 'POST' });
  if (!store || typeof verify !== 'function') return json({ error: 'Push is not set up yet.' }, 503);
  const from = request.headers.get('Origin');
  if (origin && from && from !== origin) return json({ error: 'Wrong origin.' }, 403);
  const idToken = (request.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)$/)?.[1];
  if (!idToken) return json({ error: 'Sign in first.' }, 401);
  let token;
  try { token = await verify(idToken); } catch (e) { return json({ error: 'Sign in again.', why: e?.message }, 401); }
  const g = token.g && typeof token.g === 'object' ? token.g : {};
  if (!Object.values(g).some(r => ROLES.includes(/** @type {string} */ (r)))) return json({ error: 'No access.' }, 403);
  if (token.x != null && !(now() < Number(token.x) * 1000)) return json({ error: 'No access.' }, 403);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'Too big.' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { body = null; }
  if (!body || typeof body !== 'object') return json({ error: 'JSON object expected.' }, 400);
  const uid = String(token.sub);
  try {
    if (revoked && await revoked(uid)) return json({ error: 'No access.' }, 403);
    if (m[1] === 'subscribe') {
      const sub = cleanSubscription(body.subscription);
      if (!sub) return json({ error: 'subscription: a push service address and its keys.' }, 400);
      const id = await sha256(sub.endpoint), have = await store.devices(uid);
      const others = have.filter(d => d.id !== id);
      // a person's devices are few; past the cap the oldest go (a reinstall leaves a dead one behind)
      const drop = others.length >= MAX_DEVICES ? others.sort((a, b) => (a.data.createdAt || 0) - (b.data.createdAt || 0)).slice(0, others.length - MAX_DEVICES + 1) : [];
      // a browser shared by two people has one endpoint: it belongs to whoever subscribed last
      const owner = (await store.batchGet([`pushDevices/${id}`])).get(`pushDevices/${id}`)?.uid;
      const del = drop.map(d => `pushSubs/${uid}/devices/${d.id}`);
      if (owner && owner !== uid) del.push(`pushSubs/${owner}/devices/${id}`);
      await store.write({ set: [[`pushSubs/${uid}/devices/${id}`, { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, createdAt: have.find(d => d.id === id)?.data.createdAt || now() }],
        [`pushDevices/${id}`, { uid }]], del });
    } else if (m[1] === 'unsubscribe') {
      if (!text(body.endpoint, 1000) || !body.endpoint) return json({ error: 'endpoint: text.' }, 400);
      const id = await sha256(body.endpoint), left = (await store.devices(uid)).filter(d => d.id !== id);
      const del = [`pushSubs/${uid}/devices/${id}`];
      if ((await store.batchGet([`pushDevices/${id}`])).get(`pushDevices/${id}`)?.uid === uid) del.push(`pushDevices/${id}`);
      if (!left.length) for (const q of await store.queueOf(uid)) if (!q.data.sentAt) del.push(`pushQueue/${q.id}`);
      await store.write({ del });
    } else {
      const items = cleanItems(body.items, now());
      if (!items) return json({ error: `items: up to ${MAX_ITEMS}, each { key, at, title, body, itemId, stamp }.` }, 400);
      const want = new Map();
      for (const i of items) want.set(`${uid}_${(await sha256(i.key)).slice(0, 40)}`, { uid, ...i });
      const set = [], del = [];
      for (const q of await store.queueOf(uid)) {
        const w = want.get(q.id);
        if (q.data.sentAt) {   // sent: stays (so it is not queued again) until it is too late to send anyway
          if (w) want.delete(q.id);
          else if (now() > q.data.at + LATE_MS) del.push(`pushQueue/${q.id}`);
        } else if (!w) del.push(`pushQueue/${q.id}`);
        else if (['at', 'title', 'body', 'itemId', 'key', 'stamp'].every(k => q.data[k] === w[k])) want.delete(q.id);
        else if (q.data.leaseUntil) w.leaseUntil = q.data.leaseUntil;
      }
      for (const [id, data] of want) set.push([`pushQueue/${id}`, data]);
      if (set.length || del.length) await store.write({ set, del });
    }
    return json({ ok: true });
  } catch (e) {
    console.error('push failed', m[1], e?.message);
    return json({ error: 'Couldn’t do that. Try again.' }, 500);
  }
}

/**
 * The once-a-minute job. Sends what is due (or due within SOON_MS) to each of its person's devices, in these steps, all
 * within BUDGET outgoing requests (the free plan's 50 per run; what does not fit waits for the next minute):
 *  1. the due items (one query); too-late ones (after LATE_MS), old sent ones, and those of a removed person or whose item
 *     is gone or changed (stillDue) are dropped (one batched read of revoked/ and the items);
 *  2. the rest are leased (a run in progress, or a slow one, will not send them too);
 *  3. each one: its person's devices, a send to each, then one commit: a sent item stays as a tombstone (sentAt), a device the
 *     push service says is gone (404, 410) is removed. A busy push service (429, 5xx) or a network error keeps the item, to be
 *     tried again when its lease ends, while it is not too late; any other refusal is final.
 * -> { sent, dropped, gone, retry, deferred } counts (deferred: left for the next minute for want of budget).
 * @param {{ store: any, vapid: { publicKey: string, privateKey: string, subject: string }, now?: number, send?: typeof sendPush, budget?: number }} o
 */
export async function runDue({ store, vapid, now = Date.now(), send = sendPush, budget = BUDGET }) {
  const out = { sent: 0, dropped: 0, gone: 0, retry: 0, deferred: 0 };
  let left = budget - 1;   // (the access token)
  const spend = (/** @type {number} */ n, keep = 1) => left >= n + keep ? (left -= n, true) : false;   // keep: for the final release commit
  if (!spend(1)) return out;
  const rows = await store.dueItems(now + SOON_MS, PER_RUN * 4);
  const del = /** @type {string[]} */ ([]);
  let ready = /** @type {{ id: string, data: any }[]} */ ([]);
  for (const q of rows) {
    const d = q.data, over = now - d.at > LATE_MS;
    if (d.sentAt) { if (over) del.push(`pushQueue/${q.id}`); }   // (else it waits to be forgotten)
    else if (over) { del.push(`pushQueue/${q.id}`); out.dropped++; }
    else if (!(d.leaseUntil > now) && ready.length < PER_RUN) ready.push(q);
  }
  if (ready.length) {
    if (!spend(1)) return out;
    const paths = [...new Set(ready.flatMap(q => [`revoked/${q.data.uid}`, itemPath(q.data.itemId)]))];
    const docs = await store.batchGet(paths);
    ready = ready.filter(q => {
      if (!docs.get(`revoked/${q.data.uid}`) && stillDue(q.data, docs.get(itemPath(q.data.itemId)))) return true;
      del.push(`pushQueue/${q.id}`); out.dropped++;
      return false;
    });
  }
  if (ready.length || del.length) {
    if (!spend(1, 0)) return out;
    await store.write({ del, set: ready.map(q => [`pushQueue/${q.id}`, { ...q.data, leaseUntil: now + LEASE_MS }]) });
  }
  /** @type {Map<string, any[]>} */
  const devices = new Map();
  const todo = [...ready];
  while (todo.length) {
    const q = todo[0], d = q.data;
    // (a lookup, a send each, the commit)
    if (!devices.has(d.uid)) {
      if (!spend(1, 2)) break;
      try { devices.set(d.uid, await store.devices(d.uid)); } catch (e) { console.error('devices failed', e?.message); todo.shift(); out.retry++; continue; }
    }
    const devs = devices.get(d.uid).filter((/** @type {any} */ v) => !v.gone);
    if (!spend(devs.length + 1)) break;
    todo.shift();
    const payload = { title: d.title, body: d.body, itemId: d.itemId, tag: d.key };
    let again = false;
    const gone = /** @type {string[]} */ ([]);
    for (const dev of devs) {
      try {
        const r = await send({ subscription: { endpoint: dev.data.endpoint, keys: { p256dh: dev.data.p256dh, auth: dev.data.auth } }, payload, vapid, now });
        if (r.status === 404 || r.status === 410) { dev.gone = true; out.gone++; gone.push(`pushSubs/${d.uid}/devices/${dev.id}`); }
        else if (r.ok) out.sent++;
        else if (r.status === 429 || r.status >= 500) again = true;
        else console.error('push refused', new URL(dev.data.endpoint).host, r.status);
      } catch (e) { again = true; console.error('push failed', e?.message); }
    }
    if (again) out.retry++;
    if (!again || gone.length) await store.write({ del: gone, set: again ? [] : [[`pushQueue/${q.id}`, { ...d, leaseUntil: null, sentAt: now }]] });
  }
  if (todo.length) {   // no budget left for these: free them for the next minute
    out.deferred = todo.length;
    await store.write({ set: todo.map(q => [`pushQueue/${q.id}`, q.data]) });
  }
  return out;
}

/** The queue and the devices in Firestore (REST), as the service account. base: 'https://firestore.googleapis.com' or an emulator's.
 * @param {{ project: string, accessToken: () => Promise<string> }} adm @param {string} base */
export function firestoreStore(adm, base = 'https://firestore.googleapis.com') {
  const root = `projects/${encodeURIComponent(adm.project)}/databases/(default)/documents`;
  const call = async (/** @type {string} */ path, /** @type {unknown} */ body) => {
    const r = await fetch(`${base}/v1/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${await adm.accessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${path.split(':').pop()} ${r.status}`);
    return r.json();
  };
  const plain = (/** @type {any} */ doc) => fromValue({ mapValue: { fields: doc.fields || {} } });
  const run = async (/** @type {string} */ parent, /** @type {any} */ q) =>
    (await call(`${root}${parent}:runQuery`, { structuredQuery: q })).filter((/** @type {any} */ r) => r.document)
      .map((/** @type {any} */ r) => ({ id: r.document.name.split('/').pop(), data: plain(r.document) }));
  const field = (/** @type {string} */ f, /** @type {string} */ op, /** @type {any} */ v) => ({ fieldFilter: { field: { fieldPath: f }, op, value: toValue(v) } });
  return {
    devices: (/** @type {string} */ uid) => run(`/pushSubs/${encodeURIComponent(uid)}`, { from: [{ collectionId: 'devices' }], limit: 50 }),
    queueOf: (/** @type {string} */ uid) => run('', { from: [{ collectionId: 'pushQueue' }], where: field('uid', 'EQUAL', uid), limit: MAX_ITEMS * 2 }),
    dueItems: (/** @type {number} */ until, /** @type {number} */ limit) => run('', { from: [{ collectionId: 'pushQueue' }], where: field('at', 'LESS_THAN_OR_EQUAL', until), orderBy: [{ field: { fieldPath: 'at' } }], limit }),
    /** several docs in one request -> Map of path to its fields (null: not there) @param {string[]} paths @returns {Promise<Map<string, any>>} */
    async batchGet(paths) {
      const res = await call(`${root}:batchGet`, { documents: paths.map(p => `${root}/${p}`) });
      const out = new Map(paths.map(p => [p, null]));
      for (const r of res) if (r.found) out.set(r.found.name.slice(root.length + 1), plain(r.found));
      return out;
    },
    /** @param {{ set?: [string, any][], del?: string[] }} w one commit (a single request, up to 500 writes) */
    async write({ set = [], del = [] }) {
      const writes = [
        ...set.map(([p, data]) => ({ update: { name: `${root}/${p}`, fields: toValue(data).mapValue.fields } })),
        ...del.map(p => ({ delete: `${root}/${p}` })),
      ];
      for (let i = 0; i < writes.length; i += 400) await call(`${root}:commit`, { writes: writes.slice(i, i + 400) });
    },
  };
}
