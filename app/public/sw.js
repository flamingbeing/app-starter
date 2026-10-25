// Offline support, on the shared update module (app-update 0.2.0: sw-core.js does the work; its README has the rules).
// SHELL: the page, its own files (src/, and public/ as served at the folder's root) and every app-sync file the import
// map's @core/* entries load (the entries and what they import).
// The deploy stamps VERSION and MANIFEST (tools/stamp-versions.mjs app): never change them by hand. Change the v<N>
// only when this file's own logic changes.
//
// - Install: every SHELL file or nothing, only changed files fetched; the take-over reload waits while someone types,
//   a sheet is open or saves are sending (app.js, canReload).
// - Fetch: SHELL files and pages cache-first; the design kit refreshed in the background; the Firebase SDK and the
//   pinned shared modules once fetched. Sign-in pages (/__/), /api/ and sw.js always go to the network.
const VERSION = 'app-v1';
const SHELL = [
  './',
  'src/boot.js',
  'src/app.js',
  'src/cloud.js',
  'src/roles.js',
  'src/config.js',
  'app.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'https://core.anawj.com/update/0.2.0/register.js',
  'https://core.anawj.com/sync/0.9.3/app.js',
  'https://core.anawj.com/sync/0.9.3/auth.js',
  'https://core.anawj.com/sync/0.9.3/sync.js',
  'https://core.anawj.com/sync/0.9.3/update.js',
  'https://core.anawj.com/sync/0.9.3/src/auth.js',
  'https://core.anawj.com/sync/0.9.3/src/conflict.js',
  'https://core.anawj.com/sync/0.9.3/src/core.js',
  'https://core.anawj.com/sync/0.9.3/src/firestore.js',
  'https://core.anawj.com/sync/0.9.3/src/forget.js',
  'https://core.anawj.com/sync/0.9.3/src/module-sync.js',
  'https://core.anawj.com/sync/0.9.3/src/module-update.js',
  'https://core.anawj.com/sync/0.9.3/src/outbox.js',
  'https://core.anawj.com/sync/0.9.3/src/persist.js',
  'https://core.anawj.com/sync/0.9.3/src/registry.js',
  'https://core.anawj.com/sync/0.9.3/src/runner.js',
  'https://core.anawj.com/sync/0.9.3/src/status.js',
  'https://core.anawj.com/sync/0.9.3/src/store.js',
  'https://core.anawj.com/sync/0.9.3/src/sync.js',
  'https://core.anawj.com/sync/0.9.3/src/user.js',
  'https://core.anawj.com/sync/0.9.3/src/watchdog.js',
  'https://core.anawj.com/sync/0.9.3/src/writes.js',
];
const MANIFEST = {};

importScripts('https://core.anawj.com/update/0.2.0/sw-core.js');
AppUpdate.init({
  app: 'app', version: VERSION, shell: SHELL, manifest: MANIFEST,
  never: ['/api/', /\/sw\.js$/],
  runtime: [
    { name: 'kit', match: 'https://design.flamingbeing.com/v1/', strategy: 'stale-while-revalidate', max: 40 },
    { name: 'pinned', match: /^https:\/\/core\.anawj\.com\/(sync|update)\/\d+\.\d+\.\d+\//, strategy: 'cache-first', max: 40 },
  ],
});
