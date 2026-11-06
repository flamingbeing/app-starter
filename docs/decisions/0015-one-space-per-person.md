# 0015: One space per person, as an option for personal apps

Status: accepted (2026-11-06). Builds on [0004](0004-roles-as-claims.md).

Decision: a cloud app picks whose a space is, once, with `node tools/fill.mjs --space shared|person` (`APP.space` in
`app/src/config.js`; shared is the default and is not written). Shared: one space `spaces/_/...` for everyone with a
role in the single group `_`, as before. Person: each person's own, `spaces/<uid>/...`.

- The sync scope, the account options and the files recipe take `spaceOf(user)` (`app/src/roles.js`): `'_'`, or the
  signed-in uid. In a personal app a save goes only to the space the page listens to, so a save started on one account
  never lands in the next one's; signed out, it is refused.
- Rules: every space rule asks `inSpace(g, roles)`. Its one line is written by `tools/modules.mjs` (and `fill.mjs`) from
  `APP.space`: `can(g, roles)` when shared, `mine(g, roles)` when personal. `mine` is the owner with that role in `_`
  (`request.auth.uid == g && g != '_' && can('_', roles)`): admins can't read anyone else's space, and nobody can use
  `_`. The recipes' rules use `inSpace` too.
- Tests: `app/test/rules.test.mjs` tests the app's own mode, or every mode in `RULES_SPACES` (the template's Checks:
  `shared,person`). Personal mode turns every collection row into owner-only cases: the owner reads (and writes, with a
  writer role), anyone else, admins included, is refused, and so are no role, signed out, ended access, a revoked
  account, an unstamped write and the shared space.

Why: the todo app gave each person their own list after a second member could see and edit the first one's tasks; a
personal app made from the starter should start that way rather than find out later.

What follows: switching an app that already has data leaves the old space's data in place, unreadable (personal) or
unseen (shared): the app copies it over first. The browser tests run the shared space only. The files Worker route keeps
its own rule (your uid, or a shared scope your role allows), so in a personal app a member could still store bytes
under `_`; no record points at them and the rules refuse their records.
