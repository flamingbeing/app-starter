// The files route (@core/files), listed in worker/modules.js: the same ID token check as /api/claims (the emulators'
// unsigned tokens only on localhost with EMULATOR set), and the rules' revoked/{uid} gate, read as the service account
// (without one, no roles are ever issued). A personal app (APP.space 'person') takes only each person's own scope.
import { verifyIdToken } from './claims.js';
import { adminFor } from './admin.js';
import { handleFiles, defaultAccess, personAccess } from './files.js';
import { APP } from '../app/src/config.js';

export const filesRoute = {
  /** @param {URL} url */
  match: url => url.pathname.startsWith('/api/files/'),
  /** @param {Request} request @param {any} env @param {{ url: URL, local: boolean, project: string }} ctx */
  handle(request, env, { url, local, project }) {
    const emulator = !!(local && env.EMULATOR);
    const verify = project ? (/** @type {string} */ idToken) => verifyIdToken(idToken, { project, emulator }) : null;
    const adm = project ? adminFor(env, local, project) : null;
    const revoked = adm ? async (/** @type {string} */ uid) => !!(await adm.getDoc(`revoked/${uid}`)) : null;
    const access = /** @type {{ space?: string }} */ (APP).space === 'person' ? personAccess : defaultAccess;
    return handleFiles(request, { bucket: env.FILES, verify, revoked, access, origin: url.origin });
  },
};
