# W2B Playwright soak results

- Status: BLOCKED before installation or execution; no suite results available.
- Recorded: 2026-10-27 02:44:12 SGT.
- Revision: `be22016ea5801bea1d0bda0e930f2fcaaf288e25` (main; includes `0d866ad`).
- Requested: `npx playwright test --repeat-each=20 --reporter=line,json`.
- Total executed runs: 0; passes: 0; failures: 0; per-test repetitions: 0/20.
- Failing tests ranked by count: none observed; tests were not executed.
- First error / code stack frame: unavailable; no Playwright process started.
- Failure clustering by repeat, worker, or preceding test: unavailable.

## Blocker

The job permits listening ports 8100–8109 only. The repository's
`playwright.config.mjs:7` hardcodes app port 4173 and passes it explicitly
to the web server. `app/firebase.json` configures Firestore on 8080 and
Auth on 9099. These ports are outside the permitted range.
The inherited `PORT=8100` does not override the config's constant.

The job requires stopping when a rule would be broken, and prohibits
source/test changes. No services were started and no configuration was changed.
`npm ci`, Chromium installation, and the soak command were not run.
`soak/results.json` was not produced; there is no Playwright JSON result to preserve.
Firebase CLI 15.33.0 is pinned by the repo but was not installed or launched.

Remaining: rerun in a job allowing the repo's configured service ports,
or authorize a separate port-compatible configuration before the soak.
