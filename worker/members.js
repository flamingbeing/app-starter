// Where the app's roles live: one role doc per person, members/{uid} = { role, v }. The doc is the source of truth;
// the claims on the account (rules kit shape, single group '_') are a cache of it, written by /api/claims.
// v goes up whenever an admin changes the doc, so a page whose token carries an older v asks for new claims.
export const ROLES = ['admin', 'member', 'viewer'];

export async function loadClaims({ uid, admin }) {
  const d = await admin.getDoc(`members/${uid}`);
  if (!d || !ROLES.includes(d.role)) return null;   // not (or no longer) a member: claims cleared
  return { g: { _: d.role }, v: Number.isInteger(d.v) ? d.v : 0 };
}
