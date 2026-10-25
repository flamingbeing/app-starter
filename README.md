# Starter app

Made from [app-starter](https://github.com/flamingbeing/app-starter), a template for small offline-first web apps that
are safe from day one. Replace this first paragraph with what the app is once it is filled.

## What you get

- **Worker** (`worker/`): serves `app/` on the app's address, adds security headers (`headers.js`: HSTS, nosniff,
  Referrer-Policy, frame-ancestors, Permissions-Policy, and a Content-Security-Policy that starts as Report-Only),
  answers `/api/claims` (app-devkit `claims.js`, roles from `members.js`) and passes Firebase's sign-in helper pages
  (`/__/auth/`, `/__/firebase/`) on to the project, so sign-in stays on the app's address.
- **Sample app** (`app/`): a list with add, edit, delete (to the bin), a conflict sheet, a status chip, Google sign-in,
  sign-out that wipes the device, and the version line. Sync is [app-sync](https://github.com/flamingbeing/app-sync)
  (exact version from `core.anawj.com/sync/`, wired with its `createApp` in `app/cloud.js`); updates are app-update with
  `canReload` (no reload while someone types, a sheet is open or saves are sending). Installable, never prompted
  (`boot.js` cancels `beforeinstallprompt`).
- **Roles**: one role doc per person (`members/{uid}` = `{ role, v }`, roles admin, member, viewer), cached as custom
  claims in the app-devkit rules kit shape, single group `_`. The page asks for new claims at sign-in and whenever
  the role doc's `v` is ahead of its token.
- **Rules** (`app/firestore.app.rules`, built into `app/firestore.rules` with the rules kit's helpers) and their
  emulator tests (`app/test/rules.test.mjs`: the kit's shared cases plus the app's own).
- **Tests**: Worker, app and tool unit tests; rules in the Firestore emulator; Playwright browser tests (offline save,
  two phones, conflict, sign-out wipe, update reload guard, axe, no CSP reports) against the real Worker in Node
  (`e2e/serve.mjs`) and the emulators (`demo-` project, made-up accounts).
- **CI**: Checks (parallel jobs), deploy (Worker) and deploy-rules on app-devkit blocks pinned to an exact version,
  other actions pinned by SHA, `permissions: contents: read` by default, gitleaks, grouped Dependabot, `ubuntu-24.04`.
- **Decisions** in [docs/decisions/](docs/decisions/), numbered; a reversed one is marked superseded, never deleted.

## Fill (make it a new app)

```bash
node tools/fill.mjs --name <name> --host <app.example.org> --kit homedesign|nuhs --project <firebase-project-id> \
  [--title "<Title>"] [--web-config sdkconfig.json] [--commit <template sha>]
```

It replaces the template's values (kept in `.starter.json`) in every text file, writes `app/config.js` (with the web
app's `apiKey` and `appId` from `firebase apps:sdkconfig WEB` output) and sets `wrangler.jsonc`'s `FIREBASE_PROJECT`.
Running it again changes nothing; `--check` exits 1 when a run would change something. The emulator project becomes
`demo-<name>`; tests never touch the live project.

Then: the Worker secrets `SA_EMAIL` and `SA_KEY` (a service account that may manage Auth users and write Firestore),
the repo secrets for the deploy (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`), the repo variables for the rules
deploy (`FIREBASE_PROJECT`, `WIF_PROVIDER`, `RULES_DEPLOYER`), Google sign-in switched on in the Firebase console, the
app's host as an authorised domain, and a first `members/{uid}` doc with role `admin`.

`.starter.json` records the template version and commit the app started from; app-devkit's drift report compares an
app with the template and never changes it.

## Tests

```bash
npm ci
node --test 'worker/test/*.test.mjs' 'app/test/*.unit.test.mjs' 'tools/test/*.test.mjs'   # no network
npm run rules     # rules in the Firestore emulator (needs Java and .devkit/)
npm run e2e       # browser tests (emulators and the e2e server start by themselves)
```

`.devkit/` holds app-devkit's `playwright/`, `rules/`, `tools/` and `worker/` at the pinned version (CI's setup
blocks put it there; locally, copy those folders from an app-devkit checkout at the same tag).

`SYNC_DIR=<app-sync checkout> npm run e2e` serves that app-sync build in place of `core.anawj.com/sync/<version>/`:
app-sync's CI runs these tests that way against each candidate (its consumer test) before a release.

## Layout

```text
app/        the app (served at the root of its address); config.js, cloud.js (wiring), app.js (screen), sw.js
worker/     the Worker: sites.js, routes.js, headers.js, members.js, claims.js + custom-token.js (app-devkit copies)
e2e/        browser tests and their server
tools/      fill.mjs, stamp-versions.mjs (deploy stamp for sw.js)
docs/       decisions
```
