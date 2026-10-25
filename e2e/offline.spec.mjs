// The service worker installs the whole app (the generated SHELL in public/sw.js: the page, its files, vendored
// Firebase and the pinned core files), so a phone that has opened the app once starts it with no network at all.
import { test, expect, uniq, signIn, add, synced } from './fixtures.mjs';

test('with no network, the app starts from the service worker and shows the saved list', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member', { path: '/app/?emulator&sw' });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
  // every SHELL file is in the cache once the worker is in charge (vendored Firebase among them)
  const cached = await page.evaluate(async () => {
    const urls = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) urls.push(r.url);
    return urls;
  });
  expect(cached.some(u => /\/vendor\/firebase\/[^/]+\/firebase-firestore\.js$/.test(u)), 'vendored Firebase precached').toBe(true);
  expect(cached.some(u => /core\.anawj\.com\/sync\/[^/]+\/src\/runner\.js$/.test(u)), 'core files precached').toBe(true);
  const t = uniq('kept');
  await add(page, t);
  await synced(page);
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator('#list-view')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#items')).toContainText(t);
  await page.context().setOffline(false);
});
