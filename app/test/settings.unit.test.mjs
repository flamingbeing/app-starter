// @core/settings: the option list and which value wins (schema.js), the settings file (file.js), and the module on a
// fake engine (module.js). node --test app/test/settings.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, valueOf, isCustom } from '../public/settings/schema.js';
import { readFile, writeFile, KIND } from '../public/settings/file.js';
import { settings } from '../public/settings/module.js';

const OPTIONS = {
  big: { scope: 'device' },
  gap: { scope: 'device', default: 2 },
  count: { scope: 'account' },
  title: { scope: 'account', default: 'Home' },
  tags: { scope: 'account', default: [], clean: v => (Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 5) : undefined) },
  seen: { scope: 'account', portable: false },
};
const PROFILES = {
  calm: { label: 'Calm', defaults: { big: true, count: true } },
  plain: { label: 'Plain', defaults: { big: false } },
};

test('a new option is off; a bad list fails at start, not on a phone', () => {
  const cfg = compile({ options: OPTIONS });
  assert.equal(cfg.specs.get('big').default, false);
  assert.equal(cfg.specs.get('count').default, false);
  assert.throws(() => compile({}), /needs options/);
  assert.throws(() => compile({ options: { 'Bad Key': {} } }), /bad option name/);
  assert.throws(() => compile({ options: { id: {} } }), /bad option name/);
  assert.throws(() => compile({ options: { a: { scope: 'cloud' } } }), /device or account/);
  assert.throws(() => compile({ options: { a: { default: [] } } }), /needs clean/);
  assert.throws(() => compile({ options: { a: { default: 3, clean: () => undefined } } }), /own clean/);
  assert.throws(() => compile({ options: OPTIONS, profiles: { x: { defaults: { nope: 1 } } } }), /not an option/);
  assert.throws(() => compile({ options: OPTIONS, profiles: { x: { defaults: { gap: 'wide' } } } }), /fails its clean/);
  assert.throws(() => compile({ options: OPTIONS, profiles: { 'Bad': {} } }), /bad profile id/);
});

test('saved value, else the profile’s default, else the option’s', () => {
  const cfg = compile({ options: OPTIONS, profiles: PROFILES });
  assert.equal(valueOf(cfg, 'big', undefined, null), false);
  assert.equal(valueOf(cfg, 'big', undefined, 'calm'), true);
  assert.equal(valueOf(cfg, 'big', false, 'calm'), false, 'a saved off beats the profile');
  assert.equal(valueOf(cfg, 'gap', undefined, 'calm'), 2, 'the profile does not govern it');
  assert.equal(valueOf(cfg, 'title', undefined, 'plain'), 'Home');
});

test('custom: a governed option set by hand to something else than the profile gives', () => {
  const cfg = compile({ options: OPTIONS, profiles: PROFILES });
  const saved = o => k => o[k];
  assert.equal(isCustom(cfg, null, saved({ big: true })), false, 'no profile, nothing to be custom of');
  assert.equal(isCustom(cfg, 'calm', saved({})), false);
  assert.equal(isCustom(cfg, 'calm', saved({ big: true })), false, 'the same as the profile gives');
  assert.equal(isCustom(cfg, 'calm', saved({ big: false })), true);
  assert.equal(isCustom(cfg, 'calm', saved({ gap: 9 })), false, 'not governed');
});

test('settings file: account options only; device and portable:false stay behind', () => {
  const cfg = compile({ options: OPTIONS, profiles: PROFILES });
  const f = writeFile(cfg, { big: true, count: true, title: 'Mine', tags: ['a'], seen: ['x'], other: 1 }, 'calm', () => new Date('2026-10-26T00:00:00Z'));
  assert.equal(f.kind, KIND);
  assert.deepEqual(f.settings, { count: true, title: 'Mine', tags: ['a'] });
  assert.equal(f.profile, 'calm');
  assert.equal(f.exportedAt, '2026-10-26T00:00:00.000Z');
  const back = readFile(cfg, JSON.stringify(f));
  assert.deepEqual(back.settings, f.settings);
  assert.equal(back.profile, 'calm');
  assert.deepEqual(back.dropped, []);
});

test('settings file: unknown keys, wrong shapes and device/skipped keys are dropped; junk files throw', () => {
  const cfg = compile({ options: OPTIONS, profiles: PROFILES });
  const text = JSON.stringify({ kind: KIND, version: 1, profile: 'ghost', settings: { count: 'yes', title: 'ok', big: true, seen: [1], nope: 1, tags: ['a', 3], __proto__: 1 } });
  const r = readFile(cfg, text);
  assert.deepEqual(r.settings, { title: 'ok', tags: ['a'] });
  assert.deepEqual(r.dropped.sort(), ['big', 'count', 'nope', 'seen']);
  assert.equal(r.profile, null, 'a profile the app lacks');
  assert.throws(() => readFile(cfg, 'nope'), /not JSON/);
  assert.throws(() => readFile(cfg, '{"kind":"other"}'), /isn’t a settings file/);
  assert.throws(() => readFile(cfg, `{"kind":"${KIND}","version":2,"settings":{}}`), /different version/);
  assert.throws(() => readFile(cfg, `{"kind":"${KIND}","version":1}`), /no settings/);
  assert.throws(() => readFile(cfg, `{"kind":"${KIND}","version":1,"settings":[]}`), /no settings/);
  assert.throws(() => readFile(cfg, ' '.repeat(200_000)), /too big/);
});

// a stand-in for the engine: ctx (user, storage, on, report) and the sync module (save, copyOf, watch)
function engine({ uid = 'u1', storage = new Map() } = {}) {
  let user = uid ? { uid } : null;
  const handlers = {};
  const saves = [];
  const watches = new Set();
  const ctx = {
    user: () => user,
    storage: ns => ({
      get: k => (storage.has(`${ns}/${k}`) ? JSON.parse(storage.get(`${ns}/${k}`)) : undefined),
      set: (k, v) => storage.set(`${ns}/${k}`, JSON.stringify(v)),
      remove: k => storage.delete(`${ns}/${k}`),
    }),
    on: (name, fn) => { (handlers[name] ??= []).push(fn); return () => {}; },
    report: () => {},
  };
  const sync = {
    save: async (coll, scope, record, base) => { saves.push({ coll, scope, record: JSON.parse(JSON.stringify(record)), base }); return record; },
    copyOf: () => null,
    watch: (scope, coll, fn) => { const w = { scope, coll, fn }; watches.add(w); return () => watches.delete(w); },
  };
  return {
    ctx, sync, saves, watches, storage,
    emit: async name => { for (const fn of handlers[name] || []) await fn(); },
    as: next => { user = next ? { uid: next } : null; },
  };
}
const start = async (opts = {}, e = engine()) => {
  const m = settings({ options: OPTIONS, profiles: PROFILES, ...opts });
  return { e, m, api: await m.start(e.ctx, { sync: e.sync }) };
};

test('module: device values stay on the device; account values go through sync.save', async () => {
  const { e, api } = await start();
  assert.equal(api.get('big'), false);
  await api.set('big', true);
  assert.equal(api.get('big'), true);
  assert.equal(e.saves.length, 0, 'a device value is not a sync save');
  assert.deepEqual(JSON.parse(e.storage.get('settings/device')), { v: 1, values: { big: true } });
  await api.set('count', true);
  assert.equal(e.saves.length, 1);
  assert.deepEqual(e.saves[0], { coll: 'settings', scope: '_', record: { id: 'u1', count: true }, base: null });
  await api.set('title', 'Mine');
  assert.deepEqual(e.saves[1].record, { id: 'u1', count: true, title: 'Mine' });
  await api.set('count', null);
  assert.deepEqual(e.saves[2].record, { id: 'u1', count: null, title: 'Mine' }, 'null is sent so the server forgets it');
  assert.equal(api.get('count'), false);
});

test('module: unknown keys and refused values throw; signed out, an account value needs sign-in', async () => {
  const { e, api } = await start();
  await assert.rejects(() => api.set('nope', true), /not an option/);
  assert.throws(() => api.get('nope'), /not an option/);
  await assert.rejects(() => api.set('count', 'yes'), /refuses/);
  await assert.rejects(() => api.set('tags', 'x'), /refuses/);
  e.as(null);
  await assert.rejects(() => api.set('count', true), /sign in first/);
  await api.set('big', true);
  assert.equal(api.get('big'), true, 'a device value needs no account');
});

test('module: a failed account save is undone', async () => {
  const { e, api } = await start();
  e.sync.save = async () => { throw new Error('storage full'); };
  await assert.rejects(() => api.set('count', true), /storage full/);
  assert.equal(api.get('count'), false);
});

test('module: watchers hear changes here, from the server and from a profile — once each', async () => {
  const { e, api } = await start();
  const heard = [];
  const off = api.watch('count', (v, k) => heard.push([k, v]));
  const any = [];
  api.watch(null, (v, k) => any.push(k));
  api.follow();
  const [w] = [...e.watches];
  assert.equal(w.scope, '_');
  assert.equal(w.coll, 'settings');
  w.fn([{ id: 'u1', count: true }, { id: 'other', count: false }]);
  assert.equal(api.get('count'), true);
  w.fn([{ id: 'u1', count: true }]);
  assert.deepEqual(heard, [['count', true]], 'no change, no call');
  await api.set('big', true);
  assert.deepEqual(any, ['count', 'big']);
  off();
  w.fn([{ id: 'u1', count: false }]);
  assert.deepEqual(heard, [['count', true]], 'watch() returned its off');
  w.fn([]);   // the record is gone: back to the defaults
  assert.equal(api.get('count'), false);
});

test('module: a profile clears what it governs and the device follows it; custom after a hand change', async () => {
  const { e, api } = await start();
  await api.set('big', false);
  await api.set('count', false);
  await api.profile('calm');
  assert.equal(api.activeProfile(), 'calm');
  assert.equal(api.get('big'), true);
  assert.equal(api.get('count'), true);
  assert.equal(api.isCustom(), false);
  assert.equal(e.saves.at(-1).record.profile, 'calm');
  assert.equal(e.saves.at(-1).record.count, null, 'the account value it governs is cleared');
  assert.equal(e.storage.has('settings/device'), false, 'and the device value');
  await api.set('big', false);
  assert.equal(api.isCustom(), true);
  await api.profile('plain');
  assert.equal(api.isCustom(), false);
  assert.equal(api.get('big'), false);
  assert.equal(api.get('count'), false, 'plain does not govern it: the option default');
  await assert.rejects(() => api.profile('ghost'), /not a profile/);
  await api.profile(null);
  assert.equal(api.activeProfile(), null);
  assert.deepEqual(api.profiles(), [{ id: 'calm', label: 'Calm' }, { id: 'plain', label: 'Plain' }]);
});

test('module: export then import; bad keys dropped, what changed returned, nothing applied on a bad file', async () => {
  const { api } = await start();
  await api.set('title', 'Mine');
  await api.set('big', true);
  const file = JSON.parse(api.exportFile());
  assert.deepEqual(file.settings, { title: 'Mine' }, 'the device value stays behind');
  const other = await start({}, engine({ uid: 'u2' }));
  const r = await other.api.importFile(JSON.stringify({ ...file, settings: { ...file.settings, count: 'junk', big: true, nope: 1 } }));
  assert.deepEqual(r.changed, ['title']);
  assert.deepEqual(r.dropped.sort(), ['big', 'count', 'nope']);
  assert.equal(other.api.get('title'), 'Mine');
  assert.equal(other.api.get('big'), false);
  assert.equal(other.e.saves.length, 1, 'one account write for the whole file');
  await assert.rejects(() => other.api.importFile('nope'), /not JSON/);
  assert.equal(other.e.saves.length, 1);
  assert.deepEqual((await other.api.importFile(JSON.stringify(file))).changed, [], 'the same again changes nothing');
});

test('module: sign-out keeps both; another account wipes both; the same account carries on after a restart', async () => {
  const { e, api } = await start();
  await api.set('big', true);
  await api.set('count', true);
  e.as(null); await e.emit('signout');
  assert.equal(api.get('big'), true);
  assert.equal(api.get('count'), true);
  const again = await start({}, engine({ storage: e.storage }));   // a reload
  assert.equal(again.api.get('big'), true);
  assert.equal(again.api.get('count'), true, 'the account copy is back for the same account');
  const other = await start({}, engine({ uid: 'u2', storage: e.storage }));
  assert.equal(other.api.get('big'), true, 'device values are the device’s');
  assert.equal(other.api.get('count'), false, 'but not another account’s');
  await e.emit('switch');
  assert.equal(api.get('big'), false);
  assert.equal(api.get('count'), false);
  assert.equal([...e.storage.keys()].length, 0);
});

test('module: junk in storage or from the server is cleaned, not trusted', async () => {
  const storage = new Map([['settings/device', JSON.stringify({ v: 1, values: { big: 'yes', gap: 5, nope: 1 } })], ['settings/account', JSON.stringify({ uid: 'u1', rec: { id: 'u1', count: 3, title: 'T', profile: 'ghost' } })]]);
  const { api } = await start({}, engine({ storage }));
  assert.equal(api.get('big'), false);
  assert.equal(api.get('gap'), 5);
  assert.equal(api.get('count'), false);
  assert.equal(api.get('title'), 'T');
  assert.equal(api.activeProfile(), null);
});

test('module: options are checked when the module is made', () => {
  assert.throws(() => settings({ options: {} }), /needs options/);
});

test('module: the stored formats are the ones NOTES.md lists', async () => {
  const { e, api } = await start();
  await api.set('big', true);
  await api.set('count', true);
  assert.deepEqual(JSON.parse(e.storage.get('settings/device')), { v: 1, values: { big: true } });
  assert.deepEqual(JSON.parse(e.storage.get('settings/account')), { uid: 'u1', rec: { id: 'u1', count: true } });
});

test('module: a save that fails after forget does not bring the account copy back', async () => {
  const e = engine();
  let fail;
  e.sync.save = () => new Promise((_, rej) => { fail = rej; });
  const { api } = await start({}, e);
  const p = api.set('count', true).catch(err => err);
  await e.emit('forget');
  fail(new Error('refused'));
  assert.match((await p).message, /refused/);
  assert.equal(api.get('count'), false);
  assert.equal(e.storage.has('settings/account'), false);
});
