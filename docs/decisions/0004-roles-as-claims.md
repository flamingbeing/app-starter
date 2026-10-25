# 0004: Roles from role docs, cached as claims

Status: accepted (2026-10-25)

Context: rules that read a role document cost a lookup per request; claims cost none but can go stale.

Decision: `members/{uid}` = `{ role, v }` is the source of truth (admins write it). The Worker's `/api/claims`
(app-devkit `claims.js`) writes `{ g: { _: role }, v, m }` on the account; the page refreshes its token at sign-in and
whenever the doc's `v` is ahead, or the doc is gone. Rules use the rules kit's `can('_', roles)` (claim, expiry and
`revoked/{uid}`). One group, `_`, by default.

Consequences: a role change reaches an open page within seconds; a removed member is cut off at once by `revoked/`
(the server writes it) and otherwise at the next token refresh (at most an hour).
