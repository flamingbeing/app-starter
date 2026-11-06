# 0016: The two templates are the offline-first app and the local-only app

Status: accepted (2026-11-06). Renames the names in [0013](0013-static-flavour.md); what it decided stands.

Decision: the names follow standard web development terms. The template as it is (Google sign-in, roles, and the
sync engine, app-sync, keeping Firestore in step between devices) is the **offline-first** app; the template with no
sign-in, whose data stays on the device in IndexedDB, is the **local-only** app. In the docs an optional module is
installed by a **recipe** (in `recipes/`, run with `tools/add.mjs`), the two starters are **templates** (the local-only one is
rendered by `tools/flavour.mjs` from `flavours/`, names kept), and `tools/update-from-starter.mjs` is the **template
update**. Everything that named the two templates follows:

| | now | before (still works) |
|---|---|---|
| flavour id (`.starter.json` `"flavour"`, `tools/flavour.mjs <id>`) | `local-only` | `static` |
| spec and own files | `flavours/local-only.json`, `flavours/local-only/` | `flavours/static.json`, `flavours/static/` |
| make a local-only app | `node tools/fill.mjs --local-only ...` | `--static` |
| make it the offline-first app | `node tools/add.mjs sync --project <id>` (`toOfflineFirst`) | `add.mjs cloud` (`toCloud`) |
| lines only the offline-first app has | `sync{` ... `}sync` | `cloud{` ... `}cloud` |
| blocks only the local-only app has | `local-only{` ... `}local-only` | `static{` ... `}static` |
| Full checks jobs, soak | `local-only`, `local-only-vite`; `soak/local-only-soak.mjs` | `static`, `static-vite`; `soak/static-soak.mjs` |

The old names are aliases, not a second spelling to keep writing: `--static` and `add.mjs cloud` print their new name
and do the same thing (so do `--on-device`, `on-device` and `add.mjs synced`, names briefly proposed before these); an
app whose `.starter.json` says `"static"` is a local-only app everywhere (fill, add, the template update) and is
written back as `"local-only"`; `tools/flavour.mjs` reads the old marks as the new ones and finds a template commit's
spec under either name, so the template update renders commits from before and after the rename the same way and an
app made before it updates across it.

Why: "static" read as a plain website with no app behind it, and "cloud" did not tell syncing the data apart from
hosting the app. Both templates run on Cloudflare (the same Worker, PWA and CI); what differs is where the data lives:
kept in step by the sync engine, or on the device only. Standard terms (offline-first, local-only, sync engine, recipe,
template update) say that to anyone who knows web apps, without a glossary.

What follows: an offline-first app made before the rename takes the new marks at its next template update as an
ordinary diff of the mark lines (an app's own line right beside a mark can conflict, as in any three-way merge). A
local-only app made before it runs the template's copy of `update-from-starter.mjs` once (its own `tools/flavour.mjs`
reads only the old marks); after that its own copy is the new one. `app/src/cloud.js`, `tools/flavour.mjs`, the
`flavours/` and `recipes/` folders and the recipe JSON fields keep their names: renaming them would only move files in
every app.
