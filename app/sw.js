// Offline support, on the shared update module (app-update 0.2.0: sw-core.js does the work; its README has the rules).
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
  'boot.js',
  'app.js',
  'cloud.js',
  'config.js',
  'app.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'https://core.anawj.com/update/0.2.0/register.js',
  'https://core.anawj.com/sync/0.6.0/index.js',
  'https://core.anawj.com/sync/0.6.0/src/app.js',
  'https://core.anawj.com/sync/0.6.0/src/conflict.js',
  'https://core.anawj.com/sync/0.6.0/src/firestore.js',
  'https://core.anawj.com/sync/0.6.0/src/forget.js',
  'https://core.anawj.com/sync/0.6.0/src/outbox.js',
  'https://core.anawj.com/sync/0.6.0/src/persist.js',
  'https://core.anawj.com/sync/0.6.0/src/registry.js',
  'https://core.anawj.com/sync/0.6.0/src/report.js',
  'https://core.anawj.com/sync/0.6.0/src/status.js',
  'https://core.anawj.com/sync/0.6.0/src/store.js',
  'https://core.anawj.com/sync/0.6.0/src/sync.js',
  'https://core.anawj.com/sync/0.6.0/src/watchdog.js',
  'https://core.anawj.com/sync/0.6.0/src/writes.js',
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
