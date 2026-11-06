// worker/push.js (the push recipe) with an in-memory store and a fake sender. Run: node --test 'worker/test/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePush, runDue, cleanItems, cleanSubscription, stillDue, sha256, firestoreStore, MAX_ITEMS, PER_RUN, PAGE, LEASE_MS } from '../push.js';
import { itemPath } from '../../app/src/push/push-items.js';

const NOW = Date.UTC(2026, 10, 5, 3, 0, 0);
const P256DH = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const AUTH = 'BTBZMqHH6r4Tts7J_aSIgg';
const sub = (n = 1, host = 'web.push.apple.com') => ({ endpoint: `https://${host}/${n}`, keys: { p256dh: P256DH, auth: AUTH } });

/** a memory store with the same interface as firestoreStore */
function memory() {
  const docs = new Map();
  const under = prefix => [...docs].filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/')).map(([p, data]) => ({ id: p.split('/').pop(), data }));
  return { docs,
    devices: async uid => under(`pushSubs/${uid}/devices/`),
    queueOf: async uid => under('pushQueue/').filter(d => d.data.uid === uid),
    dueItems: async (until, limit, after) => under('pushQueue/').filter(d => d.data.at <= until)
      .sort((a, b) => a.data.at - b.data.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .filter(d => !after || d.data.at > after.at || (d.data.at === after.at && d.id > after.id)).slice(0, limit),
    batchGet: async paths => new Map(paths.map(p => [p, docs.get(p) ?? null])),
    write: async ({ set = [], del = [] }) => { for (const [p, d] of set) docs.set(p, d); for (const p of del) docs.delete(p); } };
}
const verify = async t => { if (t === 'bad') throw new Error('bad'); return { sub: t, g: { _: 'member' } }; };
const call = (store, route, body, { token = 'u1', method = 'POST', extra = {}, revoked = null, verifyFn = verify } = {}) =>
  handlePush(new Request(`https://app.test/api/push/${route}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, body: method === 'POST' ? JSON.stringify(body) : undefined }),
    { store, verify: verifyFn, revoked, origin: 'https://app.test', now: () => NOW });
const item = (n, over = {}) => ({ key: `t${n}|2026-11-05 14:00`, at: NOW + (n + 1) * 60000, title: `Task ${n}`, body: 'Due at 14:00', itemId: `t${n}`, stamp: '2026-11-05 14:00', ...over });
/** the item doc a notification was made from (what the job reads) */
const itemOf = (it, over = {}) => ({ id: it.itemId, text: it.title, done: false, due: '2026-11-05', dueTime: '14:00', ...over });
const seedItem = (s, it, over, uid = 'u1') => s.docs.set(itemPath(it.itemId, uid), itemOf(it, over));

test('only a signed-in person with a role, from the app’s own origin, by POST', async () => {
  const s = memory();
  assert.equal((await call(s, 'schedule', { items: [] }, { token: null })).status, 401);
  assert.equal((await call(s, 'schedule', { items: [] }, { token: 'bad' })).status, 401);
  assert.equal((await call(s, 'schedule', { items: [] }, { verifyFn: async () => ({ sub: 'u', g: {} }) })).status, 403, 'no role');
  assert.equal((await call(s, 'schedule', { items: [] }, { revoked: async () => true })).status, 403, 'removed');
  assert.equal((await call(s, 'schedule', { items: [] }, { extra: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await call(s, 'schedule', null, { method: 'GET' })).status, 405);
  assert.equal((await call(s, 'other', {})).status, 404);
  assert.equal((await call(null, 'schedule', { items: [] })).status, 503);
  assert.equal((await call(s, 'schedule', { items: [] })).status, 200);
});

test('subscribe keeps a device under the person, once per endpoint; bad or foreign addresses are refused', async () => {
  const s = memory();
  assert.equal((await call(s, 'subscribe', { subscription: sub(1) })).status, 200);
  assert.equal((await call(s, 'subscribe', { subscription: sub(1) })).status, 200);
  const id = await sha256(sub(1).endpoint);
  assert.deepEqual([...s.docs.keys()].sort(), [`pushDevices/${id}`, `pushSubs/u1/devices/${id}`]);
  assert.deepEqual(s.docs.get(`pushSubs/u1/devices/${id}`), { endpoint: sub(1).endpoint, p256dh: P256DH, auth: AUTH, createdAt: NOW });
  for (const bad of [null, {}, sub(2, 'evil.example.com'), { endpoint: 'http://web.push.apple.com/x', keys: sub().keys }, { endpoint: sub().endpoint, keys: { p256dh: 'AAAA', auth: AUTH } },
    { endpoint: sub().endpoint, keys: { p256dh: P256DH, auth: 'AAAA' } }, { endpoint: 'https://web.push.apple.com.evil.test/x', keys: sub().keys },
    sub(4, 'firestore.googleapis.com'), sub(5, 'fcm.googleapis.com.evil.test')]) {
    assert.equal((await call(s, 'subscribe', { subscription: bad })).status, 400, JSON.stringify(bad));
  }
  assert.equal(cleanSubscription(sub(3, 'fcm.googleapis.com'))?.endpoint, 'https://fcm.googleapis.com/3');
  assert.ok(cleanSubscription(sub(4, 'updates.push.services.mozilla.com')));
});

test('a browser shared by two people belongs to whoever subscribed last: the first loses it', async () => {
  const s = memory();
  await call(s, 'subscribe', { subscription: sub(1) }, { token: 'u1' });
  await call(s, 'subscribe', { subscription: sub(2) }, { token: 'u1' });
  await call(s, 'subscribe', { subscription: sub(1) }, { token: 'u2' });
  assert.equal((await s.devices('u1')).length, 1);
  assert.deepEqual((await s.devices('u2')).map(d => d.data.endpoint), [sub(1).endpoint]);
  assert.equal(s.docs.get(`pushDevices/${await sha256(sub(1).endpoint)}`).uid, 'u2');
  // the first person unsubscribing the shared endpoint later changes nothing for the second
  await call(s, 'unsubscribe', { endpoint: sub(1).endpoint }, { token: 'u1' });
  assert.equal((await s.devices('u2')).length, 1);
  assert.equal(s.docs.get(`pushDevices/${await sha256(sub(1).endpoint)}`).uid, 'u2');
});

test('a person keeps at most 10 devices: the oldest go', async () => {
  const s = memory();
  for (let n = 1; n <= 12; n++) { s.docs.set(`pushSubs/u1/devices/d${n}`, { endpoint: sub(n).endpoint, p256dh: P256DH, auth: AUTH, createdAt: n }); }
  await call(s, 'subscribe', { subscription: sub(99) });
  const ids = (await s.devices('u1')).map(d => d.id);
  assert.equal(ids.length, 10);
  assert.ok(!ids.includes('d1') && !ids.includes('d2') && !ids.includes('d3') && ids.includes('d4'));
});

test('unsubscribe removes the device; the last one also empties the queue', async () => {
  const s = memory();
  await call(s, 'subscribe', { subscription: sub(1) });
  await call(s, 'subscribe', { subscription: sub(2) });
  await call(s, 'schedule', { items: [item(1)] });
  await call(s, 'unsubscribe', { endpoint: sub(1).endpoint });
  assert.equal((await s.devices('u1')).length, 1);
  assert.equal((await s.queueOf('u1')).length, 1);
  assert.equal(s.docs.has(`pushDevices/${await sha256(sub(1).endpoint)}`), false);
  await call(s, 'unsubscribe', { endpoint: sub(2).endpoint });
  assert.equal((await s.devices('u1')).length, 0);
  assert.equal((await s.queueOf('u1')).length, 0);
  assert.equal((await call(s, 'unsubscribe', {})).status, 400);
});

test('schedule replaces the person’s queue: new in, changed updated, missing out, other people untouched', async () => {
  const s = memory();
  await call(s, 'schedule', { items: [item(1), item(2)] }, { token: 'u2' });
  await call(s, 'schedule', { items: [item(1), item(2), item(3)] });
  assert.equal((await s.queueOf('u1')).length, 3);
  await call(s, 'schedule', { items: [item(1, { title: 'Renamed' }), item(3)] });
  const q = (await s.queueOf('u1')).sort((a, b) => a.data.at - b.data.at);
  assert.deepEqual(q.map(d => d.data.title), ['Renamed', 'Task 3']);
  assert.equal(q[0].id, `u1_${(await sha256(item(1).key)).slice(0, 40)}`);
  assert.deepEqual(q[0].data, { uid: 'u1', ...item(1, { title: 'Renamed' }) });
  assert.equal((await s.queueOf('u2')).length, 2);
  await call(s, 'schedule', { items: [] });
  assert.equal((await s.queueOf('u1')).length, 0);
});

test('schedule checks sizes and times: malformed is refused, out of range or about to be sent is skipped', async () => {
  const s = memory();
  const bad = [{ items: 'x' }, { items: [{ ...item(1), title: 'x'.repeat(201) }] }, { items: [{ ...item(1), body: 'x'.repeat(301) }] }, { items: [{ ...item(1), at: 'soon' }] },
    { items: [{ ...item(1), key: '' }] }, { items: [{ ...item(1), itemId: 5 }] }, { items: [{ ...item(1), itemId: 'a/b' }] }, { items: [{ ...item(1), itemId: '' }] }, { items: [{ ...item(1), itemId: '..' }] }, { items: [{ ...item(1), itemId: '__x__' }] },
    { items: [{ ...item(1), stamp: '' }] }, { items: [{ ...item(1), stamp: 'x'.repeat(201) }] }, { items: [{ ...item(1), stamp: undefined }] },
    { items: Array.from({ length: MAX_ITEMS + 1 }, (_, i) => item(i + 1)) }, { items: [null] }];
  for (const b of bad) assert.equal((await call(s, 'schedule', b)).status, 400, JSON.stringify(b).slice(0, 80));
  assert.equal((await call(s, 'schedule', { items: Array.from({ length: MAX_ITEMS }, (_, i) => item(i + 1)) })).status, 200);
  assert.equal((await s.queueOf('u1')).length, MAX_ITEMS);
  assert.deepEqual(cleanItems([item(1, { at: NOW - 3600000 }), item(2, { at: NOW + 9 * 86400000 }), item(3), item(4, { at: NOW + 20000 }), item(5, { at: NOW + 31000 })], NOW).map(i => i.itemId), ['t5', 't3']);
  const big = await handlePush(new Request('https://app.test/api/push/schedule', { method: 'POST', headers: { Authorization: 'Bearer u1' }, body: 'x'.repeat(300_001) }), { store: s, verify, now: () => NOW });
  assert.equal(big.status, 413);
});

async function setup(devices = 1) {
  const s = memory();
  for (let n = 1; n <= devices; n++) await call(s, 'subscribe', { subscription: sub(n) });
  return s;
}
const vapid = { publicKey: 'k', privateKey: 'p', subject: 'https://app.test' };
const sender = (status = 201, log = []) => async o => { log.push(o); return new Response(null, { status: typeof status === 'function' ? status(o) : status }); };
/** a due notification with its item, straight in the queue (schedule refuses what is about to be sent) */
const queue = (s, n, over = {}, doc = {}) => {
  const it = item(n, { at: NOW - 1000, key: `k${n}`, ...over });
  s.docs.set(`pushQueue/u1_${n}`, { uid: 'u1', ...it });
  if (doc !== null) seedItem(s, it, doc);
  return it;
};
const ids = async s => (await s.queueOf('u1')).map(d => d.id).sort();
const run = (s, o = {}) => runDue({ store: s, vapid, now: NOW, send: sender(), ...o });

test('the job sends what is due to each device; a sent item stays as a tombstone, later ones wait', async () => {
  const s = await setup(2);
  queue(s, 1); queue(s, 2, { at: NOW + 20000 }); queue(s, 3, { at: NOW + 120000 });
  const log = [];
  const r = await run(s, { send: sender(201, log) });
  assert.deepEqual(r, { sent: 4, dropped: 0, gone: 0, retry: 0, deferred: 0 });
  assert.deepEqual(log[0].payload, { title: 'Task 1', body: 'Due at 14:00', itemId: 't1', tag: 'k1' });
  assert.equal(log[0].subscription.keys.auth, AUTH);
  const q = Object.fromEntries((await s.queueOf('u1')).map(d => [d.data.key, d.data]));
  assert.equal(q.k1.sentAt, NOW); assert.equal(q.k2.sentAt, NOW); assert.equal(q.k3.sentAt, undefined);
  assert.deepEqual(await run(s), { sent: 0, dropped: 0, gone: 0, retry: 0, deferred: 0 }, 'sent ones are not sent again');
});

test('a sent notification cannot be queued again by a later schedule, and goes once too late to matter', async () => {
  const s = await setup();
  const it = queue(s, 1);
  await run(s);
  await call(s, 'schedule', { items: [{ ...it, at: NOW + 40000 }, item(2)] });   // (its key and id as before; at must clear the early window)
  assert.equal(s.docs.get('pushQueue/u1_1').sentAt, NOW, 'the tombstone is kept as it was');
  await call(s, 'schedule', { items: [] });
  assert.ok((await ids(s)).includes('u1_1'), 'kept while a late send could still happen');
  const later = NOW + 16 * 60000;
  await run(s, { now: later });
  assert.ok(!(await ids(s)).includes('u1_1'), 'the job forgets it');
});

test('the job drops a notification more than 15 minutes late, unsent', async () => {
  const s = await setup();
  queue(s, 1, { at: NOW - 16 * 60000 }); queue(s, 2, { at: NOW - 14 * 60000 });
  const log = [];
  assert.deepEqual(await run(s, { send: sender(201, log) }), { sent: 1, dropped: 1, gone: 0, retry: 0, deferred: 0 });
  assert.deepEqual(log.map(l => l.payload.title), ['Task 2']);
  assert.ok(!(await ids(s)).includes('u1_1'));
});

test('the job removes a device the push service says is gone (404, 410), keeps the others', async () => {
  const s = await setup(3);
  queue(s, 1);
  const end = o => o.subscription.endpoint.split('/').pop();
  const r = await run(s, { send: sender(o => ({ 1: 410, 2: 404, 3: 400 })[end(o)]) });
  assert.deepEqual(r, { sent: 0, dropped: 0, gone: 2, retry: 0, deferred: 0 });
  assert.deepEqual((await s.devices('u1')).map(d => d.data.endpoint.split('/').pop()), ['3']);
  assert.equal(s.docs.get('pushQueue/u1_1').sentAt, NOW, 'another refusal (400) is final: not tried again');
});

test('a busy push service (429, 5xx) or a network error keeps the item for a later run, not past 15 minutes late', async () => {
  for (const fail of [429, 500, 503, 'throw']) {
    const s = await setup(2);
    queue(s, 1);
    const calls = [];
    const send = async o => { calls.push(o); if (fail === 'throw') throw new Error('network'); return new Response(null, { status: fail }); };
    const r = await run(s, { send });
    assert.equal(r.retry, 1, String(fail));
    assert.equal(calls.length, 2, 'every device is tried');
    assert.equal(s.docs.get('pushQueue/u1_1').sentAt, undefined, `${fail}: kept`);
    assert.equal((await run(s, { now: NOW + 60000 })).sent, 0, 'leased: not retried at once');
    const again = await run(s, { now: NOW + LEASE_MS + 1000 });
    assert.equal(again.sent, 2, `${fail}: sent on the retry`);
    assert.equal(s.docs.get('pushQueue/u1_1').sentAt, NOW + LEASE_MS + 1000);
  }
  const s = await setup();
  queue(s, 1);
  await run(s, { send: sender(500) });
  assert.equal((await run(s, { now: NOW + 16 * 60000, send: sender(500) })).dropped, 1);
  assert.deepEqual(await ids(s), []);
});

test('a run in progress holds its items: a second run does not send them too', async () => {
  const s = await setup();
  queue(s, 1);
  const log = [];
  let second;
  await run(s, { send: async o => { log.push(o); second ??= await run(s, { send: sender(201, log) }); return new Response(null, { status: 201 }); } });
  assert.equal(log.length, 1);
  assert.equal(second.sent, 0);
});

test('the job drops the notifications of a removed person, and of an item that is done, deleted, gone or moved', async () => {
  const s = await setup();
  queue(s, 1, {}, { done: true });
  queue(s, 2, {}, null);                                  // the item is gone
  queue(s, 3, {}, { _deleted: true });
  queue(s, 4, {}, { due: '2026-11-06' });                 // moved a day
  queue(s, 5, {}, { dueTime: '15:00' });                  // moved an hour
  queue(s, 6, {}, { dueTime: null });                     // its time taken off
  queue(s, 7);                                            // still right
  queue(s, 8, {}, { text: 'Renamed' });                   // a new text does not stop it (the stamp is the due time)
  const log = [];
  assert.deepEqual(await run(s, { send: sender(201, log) }), { sent: 2, dropped: 6, gone: 0, retry: 0, deferred: 0 });
  assert.deepEqual(log.map(l => l.payload.itemId).sort(), ['t7', 't8']);
  assert.deepEqual(await ids(s), ['u1_7', 'u1_8']);
  // a removed person
  const r = await setup();
  queue(r, 1);
  r.docs.set('revoked/u1', { at: 1 });
  const none = [];
  assert.equal((await run(r, { send: sender(201, none) })).dropped, 1);
  assert.equal(none.length, 0);
  assert.deepEqual(await ids(r), []);
  assert.equal(stillDue({ stamp: '2026-11-05 14:00' }, { due: '2026-11-05', dueTime: '14:00' }), true);
  assert.equal(stillDue({ stamp: '' }, { due: '2026-11-05' }), false, 'an empty stamp never matches');
});

test('the job counts its outgoing requests and stops short of the budget; what did not fit is freed for the next minute', async () => {
  const s = await setup(2);
  for (let n = 1; n <= PER_RUN; n++) queue(s, n, { at: NOW - 1000 - n });
  const counted = [], real = globalThis.fetch;
  // count what the store and the sender do (each store call is one request)
  const store = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === 'function' ? (...a) => { counted.push(k); return v(...a); } : v]));
  const r = await runDue({ store, vapid, now: NOW, budget: 20, send: async () => { counted.push('send'); return new Response(null, { status: 201 }); } });
  globalThis.fetch = real;
  assert.ok(counted.length + 1 <= 20, `${counted.length + 1} requests with the token`);
  assert.ok(r.deferred > 0 && r.sent > 0 && r.sent < PER_RUN * 2);
  assert.equal(r.sent / 2 + r.deferred, PER_RUN);
  // those not done carry no lease, so the next run takes them
  const next = await runDue({ store: s, vapid, now: NOW + 1000, send: sender(), budget: 45 });
  assert.equal(next.deferred, 0);
  assert.equal(next.sent / 2, PER_RUN - r.sent / 2);
});

test('a busy minute: unsent items behind a page of sent ones (tombstones) are still found and sent, not left to go late', async () => {
  const s = await setup(1);
  // more sent ones than a page, all due before the unsent ones
  for (let n = 1; n <= PAGE + 5; n++) { queue(s, n, { at: NOW - 60000 + n }); }
  for (const [p, d] of [...s.docs]) if (p.startsWith('pushQueue/')) s.docs.set(p, { ...d, sentAt: NOW - 30000 });
  for (let n = 100; n < 103; n++) queue(s, n, { at: NOW - 1000 + n });
  const r = await run(s, { send: sender(201) });
  assert.deepEqual(r, { sent: 3, dropped: 0, gone: 0, retry: 0, deferred: 0 });
});

test('a failing device lookup leaves the item for later; the run goes on', async () => {
  const s = await setup();
  queue(s, 1);
  const store = { ...s, devices: async () => { throw new Error('firestore'); } };
  const r = await runDue({ store, vapid, now: NOW, send: sender() });
  assert.equal(r.retry, 1);
  assert.equal(s.docs.get('pushQueue/u1_1').sentAt, undefined);
});

test('firestoreStore talks REST: queries by uid and by time, one commit for many writes', async () => {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push([url, JSON.parse(init.body)]);
    if (url.endsWith(':batchGet')) return new Response(JSON.stringify([{ found: { name: 'projects/p/databases/(default)/documents/revoked/u1', fields: { uid: { stringValue: 'u1' } } } }, { missing: 'x' }]), { status: 200 });
    return new Response(JSON.stringify([{ readTime: 'x' }, { document: { name: 'projects/p/databases/(default)/documents/pushQueue/u1_a', fields: { at: { integerValue: '5' }, uid: { stringValue: 'u1' } } } }]), { status: 200 });
  };
  try {
    const st = firestoreStore({ project: 'p', accessToken: async () => 'tok' });
    assert.deepEqual(await st.queueOf('u1'), [{ id: 'u1_a', data: { at: 5, uid: 'u1' } }]);
    await st.dueItems(99, 10);
    await st.devices('u1');
    assert.deepEqual([...(await st.batchGet(['revoked/u1', 'x/y'])).entries()], [['revoked/u1', { uid: 'u1' }], ['x/y', null]]);
    await st.write({ set: [['pushQueue/u1_a', { uid: 'u1', at: 7 }]], del: ['pushQueue/u1_b'] });
  } finally { globalThis.fetch = real; }
  assert.equal(calls[0][0], 'https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents:runQuery');
  assert.deepEqual(calls[0][1].structuredQuery.where.fieldFilter, { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: 'u1' } });
  assert.equal(calls[1][1].structuredQuery.where.fieldFilter.op, 'LESS_THAN_OR_EQUAL');
  assert.equal(calls[2][0], 'https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents/pushSubs/u1:runQuery');
  assert.equal(calls[3][0], 'https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents:batchGet');
  assert.equal(calls[4][0], 'https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents:commit');
  assert.deepEqual(calls[4][1].writes, [{ update: { name: 'projects/p/databases/(default)/documents/pushQueue/u1_a', fields: { uid: { stringValue: 'u1' }, at: { integerValue: '7' } } } },
    { delete: 'projects/p/databases/(default)/documents/pushQueue/u1_b' }]);
});
