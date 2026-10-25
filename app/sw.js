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
  'https://core.anawj.com/sync/0.6.3/index.js',
  'https://core.anawj.com/sync/0.6.3/src/app.js',
  'https://core.anawj.com/sync/0.6.3/src/conflict.js',
  'https://core.anawj.com/sync/0.6.3/src/firestore.js',
  'https://core.anawj.com/sync/0.6.3/src/forget.js',
  'https://core.anawj.com/sync/0.6.3/src/outbox.js',
  'https://core.anawj.com/sync/0.6.3/src/persist.js',
  'https://core.anawj.com/sync/0.6.3/src/registry.js',
  'https://core.anawj.com/sync/0.6.3/src/report.js',
  'https://core.anawj.com/sync/0.6.3/src/status.js',
  'https://core.anawj.com/sync/0.6.3/src/store.js',
  'https://core.anawj.com/sync/0.6.3/src/sync.js',
  'https://core.anawj.com/sync/0.6.3/src/watchdog.js',
  'https://core.anawj.com/sync/0.6.3/src/writes.js',
];
const MANIFEST = {"./":"a5ad1f9b07c5","boot.js":"70938813723d","app.js":"29418b2e2d37","cloud.js":"0927df4d710c","config.js":"f7867272b28a","app.css":"52007f9ef543","manifest.webmanifest":"7c9dea3772c2","icons/icon.svg":"4d4741fb5d81","https://core.anawj.com/update/0.2.0/register.js":"pinned","https://core.anawj.com/sync/0.6.3/index.js":"pinned","https://core.anawj.com/sync/0.6.3/src/app.js":"pinned","https://core.anawj.com/sync/0.6.3/src/conflict.js":"pinned","https://core.anawj.com/sync/0.6.3/src/firestore.js":"pinned","https://core.anawj.com/sync/0.6.3/src/forget.js":"pinned","https://core.anawj.com/sync/0.6.3/src/outbox.js":"pinned","https://core.anawj.com/sync/0.6.3/src/persist.js":"pinned","https://core.anawj.com/sync/0.6.3/src/registry.js":"pinned","https://core.anawj.com/sync/0.6.3/src/report.js":"pinned","https://core.anawj.com/sync/0.6.3/src/status.js":"pinned","https://core.anawj.com/sync/0.6.3/src/store.js":"pinned","https://core.anawj.com/sync/0.6.3/src/sync.js":"pinned","https://core.anawj.com/sync/0.6.3/src/watchdog.js":"pinned","https://core.anawj.com/sync/0.6.3/src/writes.js":"pinned"};

importScripts('https://core.anawj.com/update/0.2.0/sw-core.js');
AppUpdate.init({
  app: 'app', version: VERSION, shell: SHELL, manifest: MANIFEST,
  never: ['/api/', /\/sw\.js$/],
  runtime: [
    { name: 'kit', match: 'https://design.flamingbeing.com/v1/', strategy: 'stale-while-revalidate', max: 40 },
    { name: 'pinned', match: /^https:\/\/core\.anawj\.com\/(sync|update)\/\d+\.\d+\.\d+\//, strategy: 'cache-first', max: 40 },
  ],
});
