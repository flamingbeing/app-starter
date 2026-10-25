// Sign-in, roles and sync for the app, on the shared engine's modules: createApp({ config, modules: [auth(), sync(),
// update()] }) from app-sync (an exact version from core.anawj.com, named once in index.html's import map).
//
// Firestore layout (rules in firestore.app.rules):
//   members/{uid}              { role: admin | member | viewer, v }   the role doc (source of truth; admins write it)
//   spaces/_/items/{id}        { text, updatedAt, serverAt, _edits }  the list (_edits: who changed each field, and when) ('_' is the single group)
//   spaces/_/bin/{coll:id}     { id, kind, data, deletedAt, … }       a deleted item's last version (delete to bin)
//
// Roles reach the rules as custom claims ({ g: { _: role }, v }), a cache of the role doc: the Worker's /api/claims
// writes them. The auth module reads the role doc live (claims.watch) and asks for new claims whenever its v is ahead
// of the token's; the page then shows what the token says.
//
// Every save goes to a durable outbox first (the sync module's write queue), then to the server in a transaction; a
// save that meets a change made elsewhere is kept as a conflict until the person chooses, and one the server refuses
// waits in a list until it is retried or discarded. Sign-out keeps this device's copy and its unsent saves (they send
// when the same account signs in again); another account signing in wipes them first (refused while any are unsent),
// and "Forget this device" wipes them on purpose.
import { createApp } from '@core/app';
import { auth } from '@core/auth';
import { sync, leaveEntry } from '@core/sync';
import { update } from '@core/update';
import * as register from 'app-update/register.js';
import { firebaseConfig, APP } from './config.js';
import { emulator, configured, roleOf, needsClaims } from './roles.js';

export { explain, usingEmulator } from './roles.js';
const SPACE = '_';
const COLL = 'items';

/** @typedef {{ id: string, text: string, updatedAt?: unknown, _deleted?: boolean } & Record<string, unknown>} Item */
/** @typedef {{ uid: string, email: string, name: string }} User */
/** @typedef {'not-set-up' | 'signed-out' | 'no-access' | 'ready'} Phase */

/** @type {Promise<{ A: typeof import('firebase/auth'), F: typeof import('firebase/firestore'), auth: any, db: any, emulator: boolean }> | null} */
let fb = null;
// The Firebase SDK, loaded once for every module (the import map names its version).
export function sdk() {
  if (fb) return fb;
  fb = (async () => {
    const [app, A, F] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
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
    return { A, F, auth, db, emulator: !!emulator };
  })();
  fb.catch(() => { fb = null; });
  return fb;
}

// Tests only (?emulator): sign in as a made-up Google account.
/** @param {string} email */
export async function emulatorSignIn(email) {
  if (!emulator) throw new Error('Only with ?emulator');
  const { A, auth } = await sdk();
  await A.signInWithCredential(auth, A.GoogleAuthProvider.credential(JSON.stringify({ sub: email.replace(/\W/g, ''), email, email_verified: true })));
}

// This phone's name for the popup ('Phone', 'Tablet', 'Computer'), from the browser; the app may let people set one.
function deviceName() {
  try {
    const ua = navigator.userAgent || '';
    return /iPad|Tablet/.test(ua) ? 'Tablet' : /iPhone|Android.*Mobile|Mobile/.test(ua) ? 'Phone' : 'Computer';
  } catch { return ''; }
}

/** @param {Record<string, unknown>} rec */
const binCopy = ({ serverAt, ...rest }) => JSON.parse(JSON.stringify(rest));
/**
 * @typedef {object} Hooks
 * @property {(s: { phase: Phase, user?: User, role?: string }) => void} onState
 * @property {(items: Item[], changed: Set<string>) => void} onList  the list as this device has it, with its unsent saves
 *   laid over; changed: the ids whose copy changed since the last call (none the first time)
 * @property {(st: { state: string, count: number }) => void} onStatus  the sync status (app-sync syncStatus)
 * @property {(list: any[]) => void} onConflicts  only this phone's held saves (app-sync describe: each side is
 *   { value, when (SGT), by, device })
 * @property {(list: { key: string, text: string, why: string }[]) => void} onRefused  saves the server refused
 * @property {(() => boolean | Promise<boolean>) | null} [canReload]  with a service worker: the app's own "nothing open"
 *   answer for the update's reload (it also waits for unsent saves); none: no update module
 */

// start(hooks) -> the app's actions, or null when the app isn't set up.
/** @param {Hooks} hooks */
export async function start({ onState, onList, onStatus, onConflicts, onRefused, canReload = null }) {
  if (!configured) { onState({ phase: 'not-set-up' }); return null; }
  let claimsStatus = 0, unsent = 0;
  /** @type {() => Promise<void>} */
  let show = async () => {};
  const modules = [
    auth({
      // roles: the role doc, read live, against the token's claims; /api/claims writes new ones
      claims: {
        url: '/api/claims', watch: true, doc: (/** @type {User} */ u) => ['members', u.uid],
        behind: (/** @type {any} */ doc, /** @type {any} */ claims) => needsClaims(claims, doc),
        onClaims: (/** @type {{ status: number }} */ { status }) => { if (status) claimsStatus = status; void show(); },
      },
    }),
    sync({
      colls: [COLL], path: (/** @type {string} */ space, /** @type {string} */ coll) => ['spaces', space, coll],
      scope: () => SPACE, device: deviceName(), wake: true,
      // a delete writes the item's last version to the bin in the same transaction ({ id, kind, data, deletedAt }:
      // the other devices drop the item from it, and data keeps the deleted version)
      // held: a same-field clash is kept on the phone that made the save until its person chooses (never overwritten);
      // edits: each write records who changed each field and when, for the popup
      backend: { stampMode: 'server', writeId: false, held: true, edits: '_edits',
        onCommit: (/** @type {any} */ { scope, coll, before, after, at, fields }) => !after && before
          ? [{ path: ['spaces', scope, 'bin', `${coll}:${before.id}`], data: { ...leaveEntry(coll, before, at), data: binCopy(before), ...fields } }] : [] },
      hub: { bin: 'bin' }, stores: { metaOnly: ['bin'] },
      // a save the server refused is set aside (kept, with its code) until the person retries or discards it
      onRefused: () => 'archive',
    }),
    ...(canReload ? [update({ register, app: 'app', sw: 'sw.js', canReload })] : []),
  ];
  const app = createApp({ config: { name: APP.name, sdk }, modules });
  await app.ready;
  const { auth: fa } = await sdk();

  app.status$((/** @type {{ unsent: number }} */ st) => { unsent = st.unsent; });
  app.sync.status$(onStatus);
  const tellQueue = () => {
    onConflicts(app.sync.conflicts().map((/** @type {any} */ c) => app.sync.describe(c.key)).filter(Boolean));
    onRefused(app.sync.queue.refused(COLL).map((/** @type {any} */ j) => ({ key: j.key, text: String(j.record?.text ?? ''), why: j.code || j.error || '' })));
  };
  app.sync.queue.onChange(tellQueue);
  tellQueue();

  /** @type {(() => void) | null} */
  let offList = null;
  let seq = 0;
  const stopList = () => { offList?.(); offList = null; };
  // the token as it is now decides what the page shows (after sign-in, and after every claims ask); the newest call wins
  show = async () => {
    const n = ++seq, u = fa.currentUser, me = app.auth.user();
    if (!u || !me || me.uid !== u.uid) { stopList(); onState({ phase: 'signed-out' }); return; }
    if (claimsStatus === 503) { onState({ phase: 'not-set-up' }); return; }
    const role = roleOf((await u.getIdTokenResult()).claims);
    if (n !== seq) return;
    const user = { uid: me.uid, email: me.email, name: me.name };
    if (!role) { stopList(); onState({ phase: 'no-access', user, role: '' }); return; }
    onState({ phase: 'ready', user, role });
    let first = true;
    offList ??= app.sync.watch(SPACE, COLL, (/** @type {Item[]} */ list, /** @type {{ changed?: string[] }} */ meta) => {
      onList(list.filter(x => !x._deleted), new Set(first ? [] : meta?.changed || []));
      first = false;
    });
  };
  app.auth.onUser(() => { claimsStatus = 0; void show(); });

  const id = () => (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2)).replace(/-/g, '');
  return {
    // -> '' (signed in, or the page is leaving to sign in), or why another account's sign-in was refused, in plain words
    async signIn() {
      const r = await app.auth.signIn();
      if (r.reason === 'unsent') return `This phone still has changes from ${r.from?.email || 'the last account'} that haven’t been sent. Sign in as that account to send them, or forget this device.`;
      if (r.reason === 'wipe') return `This phone couldn’t clear ${r.from?.email || 'the last account'}’s copy, so it stays. Try again.`;
      return '';
    },
    emulatorSignIn,
    /** @param {string} text */
    add: text => app.sync.save(COLL, SPACE, { id: id(), text }, null),
    // base: the copy the edit started from
    /** @param {Item} item @param {string} text */
    edit: (item, text) => app.sync.save(COLL, SPACE, { ...item, text }, item),
    /** @param {Item} item */
    remove: item => { void app.sync.hub.drop(SPACE, COLL, [item.id]); return app.sync.save(COLL, SPACE, { id: item.id, _deleted: true }, item); },
    // choice: 'mine' | 'theirs' | { [field]: 'mine' | 'theirs' }; changes that don't clash are kept either way
    /** @param {{ key: string }} c @param {any} choice */
    resolve: (c, choice) => app.sync.resolve(c.key, choice),
    /** @param {string} key */
    retry: key => app.sync.queue.retry(key),
    /** @param {string} key */
    discard: key => app.sync.queue.discard(key),
    // one item, live from the server: cb(item) when its copy changes, cb(null) once the server says it is gone -> stop()
    /** @param {string} itemId @param {(item: Item | null) => void} cb @returns {() => void} */
    watchItem: (itemId, cb) => app.sync.watchDoc(['spaces', SPACE, COLL, itemId], cb),
    // Sign-out keeps this device's copy and unsent saves. -> how many are still unsent (they send at the next sign-in)
    async signOut() { await app.auth.signOut(); return unsent; },
    // Forget this device: wipes the copy and the outbox. Refused ('unsent') while anything is unsent, unless force.
    /** @param {{ force?: boolean }} [o] @returns {Promise<{ ok: boolean, reason: string, failed: string[] }>} */
    async forget({ force = false } = {}) { const r = await app.auth.forget({ force }); return { ok: r.ok, reason: r.reason, failed: r.failed || [] }; },
    // the update module's api (with a service worker only), else null
    update: app.update || null,
  };
}
