// Where the app's roles live: one role doc per person, members/{uid} = { role, v }. The doc is the source of truth;
// the claims on the account (rules kit shape, single group '_') are a cache of it, written by /api/claims.
// v goes up whenever an admin changes the doc, so a page whose token carries an older v asks for new claims.
export const ROLES = ['admin', 'member', 'viewer'];
// The owner is an admin of every app made from this template, with no role doc needed. A role doc still wins (so an
// admin can demote or remove them); only a verified email counts.
export const DEFAULT_ADMINS = ['kohwenjun@gmail.com'];

export async function loadClaims({ uid, token, admin }) {
  const d = await admin.getDoc(`members/${uid}`);
  if (!d && token?.email_verified === true && DEFAULT_ADMINS.includes(String(token.email).toLowerCase())) return { g: { _: 'admin' }, v: 0 };
  if (!d || !ROLES.includes(d.role)) return null;   // not (or no longer) a member: claims cleared
  return { g: { _: d.role }, v: Number.isInteger(d.v) ? d.v : 0 };
}
