// The push recipe's page side: what is queued (push-items.js) and the subscribe and schedule loop (push-wire.js wirePush),
// with a fake browser and Worker. Run: node --test 'app/test/*.unit.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopeFor, spaceOf } from '../src/roles.js';
import { pushItems, stampOf, itemPath, MIN_AHEAD_MS, AHEAD_MS, MAX_ITEMS } from '../src/push/push-items.js';
import { wirePush } from '../src/push/push-wire.js';

const local = (/** @type {string} */ s) => new Date(s).getTime();   // (local time, as the page reads a due time)
const NOW = local('2026-11-05T09:00');
const task = (id, over = {}) => ({ id, text: `Task ${id}`, due: '2026-11-05', dueTime: '14:00', done: false, ...over });

test('stampOf: a due day and time while open; nothing when done, deleted or without a time', () => {
  assert.equal(stampOf(task('a')), '2026-11-05 14:00');
  for (const over of [{ done: true }, { _deleted: true }, { dueTime: null }, { due: null }, { dueTime: '' }]) assert.equal(stampOf(task('a', over)), '', JSON.stringify(over));
  assert.equal(stampOf(null), '');
  assert.equal(itemPath('a', 'u1', scopeFor(false)), 'spaces/_/tasks/a', 'shared: the one space');
  assert.equal(itemPath('a', 'u1'), `spaces/${spaceOf({ uid: 'u1' })}/tasks/a`, 'the app\'s own mode (APP.space)');
  assert.equal(itemPath('a', 'u1', scopeFor(true)), 'spaces/u1/tasks/a', 'personal (APP.space person): the person\'s own');
});

test('pushItems: open items due later than a minute from now and within a week, soonest first, at their local due time', () => {
  const out = pushItems([
    task('late', { dueTime: '15:00' }), task('soon', { dueTime: '10:00' }), task('done', { done: true }), task('no-time', { dueTime: null }),
    task('past', { dueTime: '08:00' }), task('now', { dueTime: '09:00' }), task('far', { due: '2026-11-13' }), task('a/b'),
  ], NOW);
  assert.deepEqual(out.map(i => i.itemId), ['soon', 'late']);
  assert.deepEqual(out[0], { key: 'soon|2026-11-05 10:00', at: local('2026-11-05T10:00'), title: 'Task soon', body: 'Due at 10:00', itemId: 'soon', stamp: '2026-11-05 10:00' });
  assert.equal(pushItems([task('x', { dueTime: '09:01' })], NOW).length, 0, 'a minute ahead is too close: the Worker would not queue it');
  assert.ok(MIN_AHEAD_MS < AHEAD_MS);
  assert.equal(pushItems(Array.from({ length: MAX_ITEMS + 5 }, (_, i) => task(`t${i}`)), NOW).length, MAX_ITEMS);
  assert.equal(pushItems([task('x', { text: 'y'.repeat(300) })], NOW)[0].title.length, 200);
});

/** a fake Worker and browser: what was posted, a subscription the browser holds */
function fakes({ ok = true, token = 'tok' } = {}) {
  const posts = /** @type {[string, any][]} */ ([]);
  let held = /** @type {string | null} */ (null);
  const hooks = new Set();
  const o = {
    now: () => NOW, debounce: 5, key: 'pub',
    subscribe: async (/** @type {string} */ key) => { if (!key) return null; held = 'https://web.push.apple.com/1'; return { endpoint: held, keys: { p256dh: 'p', auth: 'a' } }; },
    unsubscribe: async () => { const e = held; held = null; return e; },
    fetch: async (/** @type {string} */ url, /** @type {any} */ init) => { posts.push([url.replace('/api/push/', ''), JSON.parse(init.body)]); return new Response('{}', { status: (typeof ok === 'function' ? ok() : ok) ? 200 : 503 }); },
  };
  const app = { idToken: async () => token || undefined, onSignOut: (/** @type {() => Promise<unknown>} */ f) => { hooks.add(f); return () => hooks.delete(f); } };
  return { o, app, posts, held: () => held, signOut: () => Promise.all([...hooks].map(f => f())) };
}
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));
/** wait until cond() holds (a loaded machine runs the timers late), at most 2 s @param {() => boolean} cond */
const until = async cond => { for (const end = Date.now() + 2000; !cond() && Date.now() < end;) await tick(5); };

test('wirePush: on subscribes and schedules; a change re-sends only when the queue differs; off unsubscribes at the Worker too', async () => {
  const f = fakes();
  const w = wirePush(f.app, f.o);
  w.update([task('a', { dueTime: '10:00' })]);
  assert.equal(f.posts.length, 0, 'nothing before the option is on');
  w.on();
  await until(() => f.posts.length >= 2);
  assert.deepEqual(f.posts.map(p => p[0]), ['subscribe', 'schedule']);
  assert.equal(f.posts[0][1].subscription.endpoint, 'https://web.push.apple.com/1');
  assert.deepEqual(f.posts[1][1].items.map((/** @type {any} */ i) => i.itemId), ['a']);
  w.update([task('a', { dueTime: '10:00' })]);
  await tick();
  assert.equal(f.posts.length, 2, 'the same queue is not sent again');
  w.update([task('a', { dueTime: '11:00' }), task('b')]);
  await until(() => f.posts.length >= 3);
  assert.deepEqual(f.posts[2][1].items.map((/** @type {any} */ i) => i.stamp), ['2026-11-05 11:00', '2026-11-05 14:00']);
  await w.off();
  assert.deepEqual(f.posts.at(-1), ['unsubscribe', { endpoint: 'https://web.push.apple.com/1' }]);
  assert.equal(f.held(), null);
  w.update([task('c')]);
  await tick();
  assert.equal(f.posts.at(-1)?.[0], 'unsubscribe', 'off: changes send nothing');
});

test('wirePush: signing out unsubscribes; no key, no token or a refused subscribe sends no queue and tries again later', async () => {
  const f = fakes();
  const w = wirePush(f.app, f.o);
  w.on();
  await until(() => f.posts.length >= 2);
  await f.signOut();
  assert.deepEqual(f.posts.at(-1), ['unsubscribe', { endpoint: 'https://web.push.apple.com/1' }]);

  const n = fakes();
  wirePush(n.app, { ...n.o, key: '' }).on();
  await tick();
  assert.equal(n.posts.length, 0, 'no public key: push stays off');

  const t = fakes({ token: '' });
  wirePush(t.app, t.o).on();
  await tick();
  assert.equal(t.posts.length, 0, 'signed out: nothing posted');

  let refuse = true;
  const r = fakes({ ok: () => !refuse });
  let clock = NOW;
  const rw = wirePush(r.app, { ...r.o, now: () => clock });
  rw.on();
  await until(() => r.posts.length >= 1);
  await tick();
  assert.deepEqual(r.posts.map(p => p[0]), ['subscribe']);
  refuse = false;
  rw.update([task('a')]);
  await tick();
  assert.equal(r.posts.length, 1, 'waits out the retry time');
  clock += 31_000;
  rw.update([task('a')]);
  await until(() => r.posts.length >= 3);
  assert.deepEqual(r.posts.map(p => p[0]), ['subscribe', 'subscribe', 'schedule']);
  await rw.off();
});

test('wirePush: the option going off while a subscribe is under way undoes it', async () => {
  const f = fakes();
  let release = () => {};
  const slow = { ...f.o, subscribe: async (/** @type {string} */ k) => { await new Promise(r => { release = () => r(undefined); }); return f.o.subscribe(k); } };
  const w = wirePush(f.app, slow);
  w.on();
  await tick();
  const off = w.off();
  release();
  await off;
  await tick();
  assert.equal(f.held(), null, 'the browser subscription is dropped');
  assert.ok(!f.posts.some(p => p[0] === 'schedule'), 'no queue sent');
});
