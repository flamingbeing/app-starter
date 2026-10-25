# Starter app

Instructions for every AI assistant working here (Claude Code reads this through `CLAUDE.md`).
Replace the placeholders in angle brackets once the app is filled, then delete this line.

<One or two lines: what this app is and who uses it.>

## Public here, private elsewhere

Anything merged here is public. Keep only code, docs, general rules and **made-up** sample data. Never commit
secrets, tokens, personal data, real names or patient details. Private notes belong in the owner's private notes
repo; never copy anything from there into this repo, a PR or an issue (neutral pointers like "ask the owner" are fine).

## Rules that bite

- Every save goes through the write queue (`app/cloud.js`); never write to Firestore around it, or sign-out can't
  tell what is unsent.
- Roles come from claims, cached from `members/{uid}`. Bump the doc's `v` on every role change. No email in rules.
- Edit `app/firestore.app.rules`, then rebuild `app/firestore.rules` (`node .devkit/tools/build-rules.mjs
  app/firestore.app.rules`); add a case to `app/test/rules.test.mjs` for every new rule.
- `worker/claims.js` and `worker/custom-token.js` are app-devkit's: never edit them here (CI compares them).
- Shared modules (app-sync, app-update) and app-devkit blocks are pinned to exact versions; bump on purpose, after the
  tests pass. No moving `@v1` pins.
- Installable, never prompted: keep `boot.js` (cancels `beforeinstallprompt`). No install buttons.
- The Content-Security-Policy is Report-Only until a live sign-in, sync and update show no reports
  ([decision 0003](docs/decisions/0003-csp-report-only-first.md)); the browser tests already fail on any report.

## Checks before merging

```
node .devkit/tools/check.mjs
node --test 'worker/test/*.test.mjs' 'app/test/*.unit.test.mjs' 'tools/test/*.test.mjs'
npm run rules && npm run e2e
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
