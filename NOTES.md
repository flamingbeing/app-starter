# Notes

Lasting decisions and how to test. Shaping decisions have their own records in [docs/decisions/](docs/decisions/).

## How to test

See README, "Tests". The browser tests use one shared list (`spaces/_/items`), so each test uses its own made-up
accounts and item texts and checks only those; they run side by side.

## Later

- Restore from the bin (the bin entries keep the deleted version in `data`).
- Multi-group, email-link and passcode sign-in (app-devkit `custom-token.js`).
- Enforce the Content-Security-Policy (decision 0003).

## Held conflicts (app-sync 0.6.3)

`cloud.js` sets `backend.held` and `edits: '_edits'`: a same-field clash is held on the phone that made the save and
shown there as a side-by-side sheet (both versions, when in SGT, who and device); other phones see nothing to answer.
Choices are `app.resolve(c, 'mine' | 'theirs' | { field: … })`. Rules allow the `_edits` map on items.

## Files formats (`@core/files` v0, decision 0009)

Kept on the device, so a change needs a new version and a test that the old one reads as empty (`files.unit.test.mjs`).

- Upload queue, `ctx.storage()` key `<name>:files/queue`: `{ v: 1, uid, jobs: Job[] }`, Job `{ id, scope, op: 'put' |
  'delete', parts: ['file', 'thumb'?], tries, at, stuck?, rec? }` (`app/public/files/queue.js`). Another `v` reads as
  empty; an empty queue removes the key.
- Device cache, IndexedDB database `<name>-files`, store `blobs`: one Blob per key `<scope>/<id>` and
  `<scope>/<id>.thumb` (`app/public/files/cache.js`). Sign-out keeps both; a switch to another account wipes both.
- Worker: R2 bucket `<name>-files` bound as `FILES`, object key `<scope>/<id>[.thumb]` (`worker/files.js`).

## Settings (`@core/settings`)

`app/src/options.js` lists every option the app allows (scope `device` or `account`; new ones are off); nothing else can
be saved. Where values live (change these only with a migration; `settings.unit.test.mjs` checks the shapes):

- Device values: `ctx.storage('settings')` key `device` = `{ v: 1, values: { <key>: value } }` (stored as
  `settings:settings/device` in localStorage). Kept at sign-out, wiped on an account switch or forget.
- Account values: one sync record per person in the `settings` collection (`spaces/_/settings/<uid>`): one field per
  account option plus `profile`; `null` forgets a value. The local copy is `settings/account` = `{ uid, rec }`, used
  only while `uid` is the signed-in account.
- Rules: only the person writes their own doc (field list in `firestore.app.rules`: add each new account option there
  and in `options.js`); the group can read it, because a list listen cannot be proven to ask for one doc. Keep secrets
  out of options.
- The settings file (`kind: core-settings`, `version`) carries account options only.
- Decision: `@core/theme`'s per-device choice can later move onto settings (device scope, same storage shape); today it
  keeps its own storage, so adopting settings changes no theme file.

## Search (`@core/search`)

`createSearch({ fields, boost, store, operators, newest })` (`app/public/search/`) is an in-memory index over vendored
MiniSearch 7.2.0 (`app/public/vendor/minisearch/7.2.0/`, ESM build, types and LICENSE; its `package.json` only says
`"sideEffects": false` so a page that imports `parseQuery` alone carries none of MiniSearch). It holds no storage and
no module: build it at start, `feed` the list, and keep it current from the list watch (the sample list feeds only records whose
text changed). Nothing is saved, so there is no format to migrate.

- Query syntax (`query.js`, ported from a working parser): words (all must match, prefix + fuzzy 0.2), `field:value`,
  `"phrase"`, `-word` / `-field:value`, `a OR b` / `a | b`. Operators the app names (`is:`, `has:`, `after:`) are
  callbacks on the record and run as filters; a near miss of a field or operator name is searched as text and returned
  in `unknown` for a "did you mean" line. A query with no words (only filters, phrases or leave-outs) lists matches
  newest first (`newest(record)`, default `updatedAt`).
- Later: a `toJSON`/`loadJSON` cache of the index (rebuild at start is cheap below ~10k records).
