// Sign-in, roles and sync for the app, on the shared sync engine (app-sync, an exact version from core.anawj.com).
//
// Firestore layout (rules in firestore.app.rules):
//   members/{uid}              { role: admin | member | viewer, v }   the role doc (source of truth; admins write it)
//   spaces/_/items/{id}        { text, updatedAt, serverAt }          the list ('_' is the single group)
//   spaces/_/bin/{coll:id}     { id, kind, data, deletedAt, … }       a deleted item's last version (delete to bin)
//
// Roles reach the rules as custom claims ({ g: { _: role }, v }), a cache of the role doc: the Worker's /api/claims
// writes them, and the page refreshes its token at sign-in and whenever the role doc's v is ahead of the token's.
//
// Every save goes to a durable outbox first (app-sync's write queue), then to the server in a transaction; a save that
// meets a change made elsewhere is kept as a conflict until the person chooses. Sign-out refuses while anything is
// unsent, then wipes this device's copy, the outbox and the SDK's cache.
import { firebaseConfig, APP } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
export const SYNC = 'https://core.anawj.com/sync/0.5.1/index.js';
const SPACE = '_';
const COLL = 'items';

// ?emulator on localhost (tests): the local emulators and a demo- project
const emulator = (() => {
  try {
    if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return null;
    const v = new URLSearchParams(location.search).get('emulator');
    if (v === null) return null;
    const [fs, auth] = v.split(':').map(Number);
    return { fs: fs || 8080, auth: auth || 9099 };
  } catch { return null; }
})();
export const usingEmulator = !!emulator;
export const configured = !!emulator || !!(firebaseConfig.apiKey && firebaseConfig.projectId);

let fb = null;
export function sdk() {
  if (fb) return fb;
  fb = (async () => {
    const [app, A, F] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
    // the emulator project is always demo-<name> (tools/fill.mjs keeps it in step with the tests), never the live one
    const cfg = emulator ? { apiKey: 'demo-key', projectId: 'demo-starter-app', authDomain: 'localhost', appId: 'demo' }
      : { ...firebaseConfig, authDomain: firebaseConfig.authDomain || APP.host };
    const a = app.initializeApp(cfg);
    const auth = A.getAuth(a);
    const db = F.getFirestore(a);   // no SDK offline cache: the engine keeps the device copy and the outbox
    if (emulator) {
      F.connectFirestoreEmulator(db, '127.0.0.1', emulator.fs);
      A.connectAuthEmulator(auth, `http://127.0.0.1:${emulator.auth}`, { disableWarnings: true });
    }
    return { A, F, auth, db };
  })();
  fb.catch(() => { fb = null; });
  return fb;
}

// Plain words for anything that goes wrong (never the raw error text).
export function explain(err, doing = 'That') {
  const code = String(err?.code || '');
  if (/popup-closed-by-user|cancelled-popup-request|user-cancelled/.test(code)) return 'Sign-in was cancelled.';
  if (/network-request-failed|unavailable|deadline-exceeded/.test(code)) return 'No signal, so that didn’t work. Try again when you’re online.';
  if (/unauthorized-domain|operation-not-allowed/.test(code)) return 'Sign-in isn’t switched on for this address yet.';
  if (/permission-denied/.test(code)) return 'This account isn’t allowed to do that.';
  return `${doing} didn’t work. Try again in a moment.`;
}

// Redirect in the installed app (a popup there can't hand back), a popup elsewhere, a redirect if popups are blocked.
const installed = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } };
export async function signIn() {
  const { A, auth } = await sdk();
  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (installed()) return A.signInWithRedirect(auth, provider);
  try { await A.signInWithPopup(auth, provider); }
  catch (e) { if (/popup-blocked|operation-not-supported/.test(e?.code || '')) await A.signInWithRedirect(auth, provider); else throw e; }
}
// Tests only (?emulator): sign in as a made-up Google account.
export async function emulatorSignIn(email) {
  if (!emulator) throw new Error('Only with ?emulator');
  const { A, auth } = await sdk();
  await A.signInWithCredential(auth, A.GoogleAuthProvider.credential(JSON.stringify({ sub: email.replace(/\W/g, ''), email, email_verified: true })));
}

// The role from the token's claims ('' = none); the token's claims version.
export const roleOf = claims => (claims?.g && typeof claims.g._ === 'string') ? claims.g._ : '';
export const versionOf = claims => Number.isInteger(claims?.v) ? claims.v : -1;
// New claims are needed when the token has none yet, the role doc moved on, or it is gone while the token has a role.
export const needsClaims = (claims, doc) => versionOf(claims) < 0
  || (doc ? (Number(doc.v) || 0) > versionOf(claims) || doc.role !== roleOf(claims) : roleOf(claims) !== '');

async function askForClaims(user) {
  const r = await fetch('/api/claims', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
  if (!r.ok) throw Object.assign(new Error('claims ' + r.status), { code: r.status === 503 ? 'not-set-up' : 'claims-' + r.status });
  return (await user.getIdTokenResult(true)).claims;
}

const binCopy = ({ serverAt, ...rest }) => JSON.parse(JSON.stringify(rest));

// One engine a page: the device copy, the outbox and the queue, wired as app-sync's README "Use" shows.
let engine = null;
async function sync() {
  if (engine) return engine;
  const { F, db } = await sdk(), S = await import(SYNC);
  const meta = new Set();
  const fs = S.createFirestoreBackend({
    sdk: async () => ({ F, db }), path: (space, coll) => ['spaces', space, coll], stampMode: 'server', writeId: false,
    // a delete writes the item's last version to the bin in the same transaction ({ id, kind, data, deletedAt }:
    // the other devices drop the item from it, and data keeps the deleted version)
    onCommit: ({ scope, coll, before, after, at, fields }) => !after && before
      ? [{ path: ['spaces', scope, 'bin', `${coll}:${before.id}`], data: { ...S.leaveEntry(coll, before, at), data: binCopy(before), ...fields } }] : [],
    onSnapshotMeta: (coll, m) => { for (const fn of meta) fn(coll, m); },
  });
  const stores = S.createStores({ prefix: `${APP.name}-sync:`, colls: [COLL], metaOnly: ['bin'] });
  const outbox = S.createOutbox({ name: `${APP.name}-outbox` });
  const registry = S.createOutboxRegistry();
  registry.register(outbox);
  const queue = S.createWriteQueue({
    store: outbox, registry, getOwner: () => SPACE, online: () => navigator.onLine !== false,
    backend: (space, kind, record, base, extra) => fs.commit(space, kind, record, base, extra),
  });
  const hub = S.createSyncHub({
    openStore: stores.openStore, listen: fs.listen, fetchOne: fs.fetchOne, stampMode: 'server',
    bin: 'bin', binKinds: { [COLL]: COLL }, unsent: (_s, coll, id) => queue.unsent(coll, id),
    onError: e => console.warn('sync', e?.code || e?.message),
  });
  S.replanOnWake(hub);
  addEventListener('online', () => queue.kick());
  engine = { S, fs, stores, queue, hub, meta, persisted: true };
  return engine;
}

// start({ onState, onList, onStatus, onConflicts }) -> the app's actions.
//   onState({ phase: 'not-set-up' | 'signed-out' | 'no-access' | 'ready', user, role })
//   onList(items)  the list as this device has it, with its unsent saves laid over
//   onStatus({ state, count })  app-sync syncStatus
//   onConflicts([{ key, mine, theirs }])
export async function start({ onState, onList, onStatus, onConflicts }) {
  if (!configured) { onState({ phase: 'not-set-up' }); return null; }
  const { A, F, auth, db } = await sdk();
  A.getRedirectResult(auth).catch(e => console.warn('redirect sign-in', e?.code));
  let session = null;
  A.onAuthStateChanged(auth, async user => {
    session?.close(); session = null;
    if (!user) { onState({ phase: 'signed-out' }); return; }
    session = await open(user);
  });

  async function open(user) {
    let closed = false, offRole = null, offList = null, offQueue = null, timer = 0, heard = false, claims = (await user.getIdTokenResult()).claims;
    const state = () => ({ user: { uid: user.uid, email: user.email || '', name: user.displayName || user.email || '' }, role: roleOf(claims) });
    let asking = null;
    const refresh = async doc => {
      if (!needsClaims(claims, doc)) return;
      if (asking) return asking;   // one request at a time (the first snapshot and the sign-in ask together)
      try { claims = await (asking = askForClaims(user)); }
      catch (e) { console.warn('claims', e.code); if (e.code === 'not-set-up') { onState({ phase: 'not-set-up' }); return; } }
      finally { asking = null; }
      if (!closed) show();
    };
    // the role doc, read live: an admin's change bumps v, and this page asks for new claims
    offRole = F.onSnapshot(F.doc(db, 'members', user.uid), s => refresh(s.exists() ? s.data() : null), e => console.warn('role doc', e?.code));
    if (versionOf(claims) < 0) await refresh(null);
    let E = null;
    async function show() {
      const role = roleOf(claims);
      if (!role) { stopList(); onState({ phase: 'no-access', ...state() }); return; }
      onState({ phase: 'ready', ...state() });
      if (!offList) await startList();
    }
    function tell() {
      if (closed || !E) return;
      const mine = E.queue.entries().filter(x => x.owner === SPACE);
      onStatus(E.S.syncStatus({ online: navigator.onLine !== false, pending: mine.filter(x => x.state === 'pending').length,
        attention: E.S.attentionCount(mine), persisted: E.persisted, stale: dog?.stale(), confirmed: heard, atRiskOnlyOffline: true }));
      onConflicts(mine.filter(x => x.state === 'conflict').map(x => ({ key: x.key, mine: x.record, theirs: x.remote ?? null })));
    }
    let dog = null;
    async function startList() {
      E = await sync();
      if (closed) return;
      await E.queue.activate(SPACE);
      E.S.persistGuard().then(r => { E.persisted = r.persisted || !r.supported; tell(); }, () => {});
      dog = E.S.createWatchdog({ relisten: () => { stopWatch(); E.hub.stopAll().then(watch); }, cycle: () => {}, online: () => navigator.onLine !== false, quiet: () => E.queue.pending() === 0 });
      const onMeta = (_c, m) => { dog.heard(m); if (!m.fromCache && !heard) { heard = true; tell(); } };
      E.meta.add(onMeta);
      let offWatch = null, last = null;
      // the list as the hub has it, with this device's unsent saves laid over (again whenever the queue changes)
      const deliver = () => { if (!closed && last) onList(E.queue.overlay(COLL, SPACE, last).filter(x => !x._deleted)); tell(); };
      const watch = () => { offWatch = E.hub.watch(SPACE, COLL, list => { last = list; deliver(); }); };
      const stopWatch = () => { offWatch?.(); offWatch = null; };
      offQueue = E.queue.onChange(deliver);
      watch(); dog.opened();
      timer = setInterval(() => dog.check(), 3000);
      offList = () => { stopWatch(); E.meta.delete(onMeta); offQueue?.(); clearInterval(timer); };
      api.resume = watch;
    }
    function stopList() { offList?.(); offList = null; }
    await show();
    return { close() { closed = true; offRole?.(); stopList(); } };
  }

  const id = () => (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2)).replace(/-/g, '');
  const api = {
    resume: () => {},
    signIn, emulatorSignIn,
    // base: the copy the edit started from (null for a new item)
    add: text => engine.queue.save(COLL, SPACE, { id: id(), text }, null),
    edit: (item, text) => engine.queue.save(COLL, SPACE, { ...item, text }, item),
    remove: item => { void engine.hub.drop(SPACE, COLL, [item.id]); return engine.queue.save(COLL, SPACE, { id: item.id, _deleted: true }, item); },
    keepMine: c => engine.queue.restore(COLL, SPACE, c.mine),
    keepTheirs: c => engine.queue.archive(c.key),
    // true while saves are still being sent (the update reload waits for it)
    sending: () => !!engine && engine.queue.pending() > 0,
    // Sign-out: refuses (false) while anything is unsent; otherwise wipes this device and signs out.
    async signOut() {
      if (!engine) { await A.signOut(auth); return true; }
      const { S, hub, stores, queue, fs } = engine;
      if (!(await queue.flush(4000))) return false;
      const r = await S.forgetDevice({ hub, stores, queue, proceed: () => queue.flush(1500),
        clearBackendCache: emulator ? null : fs.clearCache, extra: () => A.signOut(auth) });
      if (!r.wiped) { api.resume(); return false; }
      if (r.failed.includes('extra')) await A.signOut(auth);
      engine = null;
      if (!emulator) location.reload();   // the SDK was terminated by clearCache
      return true;
    },
  };
  return api;
}
