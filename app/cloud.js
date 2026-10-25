// Sign-in, roles and sync for the app, on the shared sync engine (app-sync's createApp, an exact version from
// core.anawj.com).
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
export const SYNC = 'https://core.anawj.com/sync/0.6.0/index.js';
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

const binCopy = ({ serverAt, ...rest }) => JSON.parse(JSON.stringify(rest));

// One engine a page: app-sync's createApp wires the device copy, the outbox, the queue, the watchdog, the status and
// the sign-out gate. The app keeps its paths, the bin entry, the role doc and the screens.
let engine = null, claimsStatus = 0;
async function sync(roleDoc) {
  if (engine) return engine;
  const S = await import(SYNC);
  engine = S.createApp({
    name: APP.name, colls: [COLL], path: (space, coll) => ['spaces', space, coll],
    sdk: async () => ({ ...(await sdk()), emulator: !!emulator }),
    scope: () => SPACE,
    // a delete writes the item's last version to the bin in the same transaction ({ id, kind, data, deletedAt }:
    // the other devices drop the item from it, and data keeps the deleted version)
    backend: { stampMode: 'server', writeId: false,
      onCommit: ({ scope, coll, before, after, at, fields }) => !after && before
        ? [{ path: ['spaces', scope, 'bin', `${coll}:${before.id}`], data: { ...S.leaveEntry(coll, before, at), data: binCopy(before), ...fields } }] : [] },
    hub: { bin: 'bin' }, stores: { metaOnly: ['bin'] },
    // roles: the role doc (read live below) against the token's claims; /api/claims writes new ones
    claims: { url: '/api/claims', entry: () => roleDoc(), behind: (doc, claims) => needsClaims(claims, doc) },
    fetch: async (...a) => { const r = await fetch(...a); claimsStatus = r.status; return r; },
  });
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
  let doc;   // the signed-in account's role doc as last read (undefined: not read yet)
  const roleDoc = async () => {
    if (doc === undefined) { const u = auth.currentUser; const s = u && await F.getDoc(F.doc(db, 'members', u.uid)).catch(() => null); doc = s?.exists() ? s.data() : null; }
    return doc;
  };
  const E = await sync(roleDoc);
  E.status$(onStatus);
  E.queue.onChange(() => onConflicts(E.queue.entries().filter(x => x.state === 'conflict').map(x => ({ key: x.key, mine: x.record, theirs: x.remote ?? null }))));
  let session = null;
  A.onAuthStateChanged(auth, async user => {
    session?.close(); session = null; doc = undefined;
    if (!user) { onState({ phase: 'signed-out' }); return; }
    session = open(user);
  });

  function open(user) {
    let closed = false, offList = null;
    const state = role => ({ user: { uid: user.uid, email: user.email || '', name: user.displayName || user.email || '' }, role });
    // after any claims ask: the token as it is now decides what the page shows
    const show = async () => {
      if (closed) return;
      if (claimsStatus === 503) { onState({ phase: 'not-set-up' }); return; }
      const role = roleOf((await user.getIdTokenResult()).claims);
      if (closed) return;
      if (!role) { offList?.(); offList = null; onState({ phase: 'no-access', ...state('') }); return; }
      onState({ phase: 'ready', ...state(role) });
      offList ??= E.watch(SPACE, COLL, list => onList(list.filter(x => !x._deleted)));
    };
    // the role doc, read live: an admin's change bumps v, and this page asks for new claims
    const offRole = F.onSnapshot(F.doc(db, 'members', user.uid), s => { doc = s.exists() ? s.data() : null; E.refreshClaims().then(show); }, e => console.warn('role doc', e?.code));
    E.refreshClaims().then(show);
    return { close() { closed = true; offRole(); offList?.(); offList = null; } };
  }

  const id = () => (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2)).replace(/-/g, '');
  return {
    signIn: E.signIn, emulatorSignIn,
    // base: the copy the edit started from (null for a new item)
    add: text => E.save(COLL, SPACE, { id: id(), text }, null),
    edit: (item, text) => E.save(COLL, SPACE, { ...item, text }, item),
    remove: item => { void E.hub.drop(SPACE, COLL, [item.id]); return E.save(COLL, SPACE, { id: item.id, _deleted: true }, item); },
    keepMine: c => E.queue.restore(COLL, SPACE, c.mine),
    keepTheirs: c => E.queue.archive(c.key),
    // true while saves are still being sent (the update reload waits for it)
    sending: () => E.queue.pending() > 0,
    // Sign-out: refuses (false) while anything is unsent; otherwise wipes this device and signs out.
    async signOut() {
      const r = await E.signOut();
      if (r.ok && r.reload) location.reload();   // the SDK was terminated with its cache
      return r.ok;
    },
  };
}
