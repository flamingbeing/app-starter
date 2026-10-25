# Starter app

Instructions for every AI assistant working here (Claude Code reads this through `CLAUDE.md`).
Replace the placeholders in angle brackets once the app is filled, then delete this line.

<One or two lines: what this app is and who uses it.>

## Public here, private elsewhere

Anything merged here is public. Keep only code, docs, general rules and **made-up** sample data. Never commit
secrets, tokens, personal data, real names or patient details. Private notes belong in the owner's private notes
repo; never copy anything from there into this repo, a PR or an issue (neutral pointers like "ask the owner" are fine).

## Rules that bite

- Every save goes through the write queue (`app/src/cloud.js`); never write to Firestore around it, or sign-out can't
  tell what is unsent.
- Roles come from claims, cached from `members/{uid}`. Bump the doc's `v` on every role change. No email in rules.
- Edit `app/firestore.app.rules`, then rebuild `app/firestore.rules` (`node .devkit/tools/build-rules.mjs
  app/firestore.app.rules`); add a case to `app/test/rules.test.mjs` for every new rule.
- `worker/claims.js` and `worker/custom-token.js` are app-devkit's: never edit them here (CI compares them).
- Shared modules (app-sync, app-update) and app-devkit blocks are pinned to exact versions; bump on purpose, after the
  tests pass. No moving `@v1` pins.
- app-sync's version is named twice, bumped together: `app/index.html`'s import map and the `app-sync` devDependency
  tag in `package.json` (its `.d.ts` are what `npm run typecheck` checks `app/src` against, under `strict`).
- `app/public/sw.js`'s SHELL list is generated: after adding or removing a file the page loads, or bumping app-sync,
  run `node tools/sw-files.mjs app`. Firebase is vendored: bump it with `node tools/vendor-firebase.mjs <version>`
  (never edit `app/public/vendor/`). Both have a `--check` in CI ([decision 0007](docs/decisions/0007-vendored-firebase-generated-sw-list.md)).
- Installable, never prompted: keep `app/src/boot.js` (cancels `beforeinstallprompt`). No install buttons.
- The Content-Security-Policy is Report-Only until a live sign-in, sync and update show no reports
  ([decision 0003](docs/decisions/0003-csp-report-only-first.md)); the browser tests already fail on any report.

## Checks before merging

```
node .devkit/tools/check.mjs
node --test 'worker/test/*.test.mjs' 'app/test/*.unit.test.mjs' 'tools/test/*.test.mjs'
npm run rules && npm run e2e
npm run vite && APP_DIR=dist npm run e2e
```

## Working with the owner

- Instructions mostly come from a phone. Work through a request to the end; ask only when a decision is genuinely
  the owner's. When asked to plan, plan and wait.
- Keep each PR small and finished on its own. Start PR titles with the app: "<App>: …".
- Merge your own PRs once the checks pass, then report with the PR link and call `unsubscribe_pr_activity`.
- Keep `NOTES.md` (lasting decisions, how to test) and `STATUS.md` (now, waiting on the owner, next, dated
  decisions) current; a decision that shapes the code gets a record in `docs/decisions/`. Cheap end of session:
  `quick-save`.
- Plain words, short; explain technical terms briefly the first time.
