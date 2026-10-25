# 0008: The UI kit (`@core/ui`) and theme (`@core/theme`) grow in the starter; screens one file each

Status: accepted (2026-10-26)

Decision: the parts every app draws the same way (sync chip with default state words `LABELS`, sign-in sheet,
conflict "pick one" sheet, update prompt, refused-saves list) are `@core/ui`, and the custom properties plus the
per-device theme (Auto, Light, Dark) and layout (Comfortable, Compact) switch are `@core/theme`. Both are v0,
incubating here: each is its own entry in `app/index.html`'s import map (`./ui/index.js`, `./theme/index.js`), each part
its own file, nothing runs on import, CSS comes with `<link>`, and every part reads only a module's public API handed to
it. They live in `app/public/` (not `app/src/`) so the Vite check and `tools/sw-files.mjs` treat them like the core
entries: external, loaded by their import map URL. They move into app-sync (a file move) once a third app uses them.

The sample screen is rebuilt on the kit: one file per screen in `app/src/screens/` (signed out, no access, not set up,
list, item sheet), each `{ show, hide }` and side-effect-free on import, picked by `app/src/screen-switch.js`.
`app/src/cloud.js` starts the modules and hands their APIs to `app.js`. A new app keeps the wiring, `cloud.js` and the
kit, and replaces only its screens.

New options are off until picked: no stored choice, an unknown value or no storage gives Auto and Comfortable.
