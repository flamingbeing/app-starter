// Web Push (the push recipe, recipes/push.json) as the Worker's route and once-a-minute job, both listed in
// worker/modules.js: the same ID token check and revoked gate as the files route (worker/push.js has the rules).
// Secrets (wrangler secret put; tools/push-keys.mjs makes the pair and puts the private half): VAPID_PRIVATE_KEY. The
// public half is the page's (app/src/push/vapid.js). VAPID_SUBJECT (a var or secret, an https: or mailto: address the push
// services may contact) defaults to the app's own address.
import { verifyIdToken } from './claims.js';
import { adminFor } from './admin.js';
import { handlePush, runDue, firestoreStore } from './push.js';
import { VAPID_PUBLIC_KEY } from '../app/src/push/vapid.js';
import { APP } from '../app/src/config.js';

export const pushRoute = {
  /** @param {URL} url */
  match: url => url.pathname.startsWith('/api/push/'),
  /** @param {Request} request @param {any} env @param {{ url: URL, local: boolean, project: string }} ctx */
  handle(request, env, { url, local, project }) {
    const emulator = !!(local && env.EMULATOR);
    const adm = project ? adminFor(env, local, project) : null;
    const verify = project ? (/** @type {string} */ idToken) => verifyIdToken(idToken, { project, emulator }) : null;
    const store = adm ? firestoreStore(adm, emulator ? `http://${env.FIRESTORE_EMULATOR}` : undefined) : null;
    const revoked = adm ? async (/** @type {string} */ uid) => !!(await adm.getDoc(`revoked/${uid}`)) : null;
    return handlePush(request, { store, verify, revoked, origin: url.origin });
  },
};

/** the cron tick (wrangler.jsonc "triggers"): send what is due. Does nothing until the keys are set. @param {any} env */
export async function pushJob(env) {
  const adm = env.FIREBASE_PROJECT && env.VAPID_PRIVATE_KEY && VAPID_PUBLIC_KEY ? adminFor(env, false, env.FIREBASE_PROJECT) : null;
  if (!adm) return;
  const vapid = { publicKey: VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || `https://${APP.host}` };
  const r = await runDue({ store: firestoreStore(adm), vapid });
  if (r.sent || r.dropped || r.gone || r.retry || r.deferred) console.log('push', JSON.stringify(r));
}
