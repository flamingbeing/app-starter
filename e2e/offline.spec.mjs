// The service worker installs the whole app (the generated SHELL in public/sw.js: the page, its files, vendored
// Firebase and the pinned core files), so a phone that has opened the app once starts it with no network at all.
import { test, expect, setOffline, uniq, signIn, add, synced, serverHas } from './fixtures.mjs';

test('with no network, the app starts from the service worker and shows the saved list', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member', { path: '/app/?emulator&sw' });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
  // every SHELL file is in the cache once the worker is in charge (vendored Firebase among them; WebKit's worker takes
  // charge before it has finished filling the cache, so poll)
  const cachedUrls = () => page.evaluate(async () => {
    const urls = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) urls.push(r.url);
    return urls;
  });
  await expect.poll(async () => (await cachedUrls()).some(u => /\/vendor\/firebase\/[^/]+\/firebase-firestore\.js$/.test(u)), { message: 'vendored Firebase precached', timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await cachedUrls()).some(u => /core\.anawj\.com\/sync\/[^/]+\/src\/runner\.js$/.test(u)), { message: 'core files precached', timeout: 30_000 }).toBe(true);
  const t = uniq('kept');
  await add(page, t);
  await synced(page);
  await setOffline(page.context(), true);
  await page.goto(page.url(), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#list-view')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#items')).toContainText(t);
  await setOffline(page.context(), false);
});

test('with no network and an expired sign-in token, the app still starts and shows the saved list', async ({ phone, browserName }) => {
  const page = await phone();
  await signIn(page, 'member', { path: '/app/?emulator&sw' });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
  const t = uniq('kept');
  await add(page, t);
  await synced(page);
  const errors = [];
  // (WebKit reports a Firestore channel request that the route aborted as an uncaught error whose message is just its URL)
  page.on('pageerror', e => { if (!(browserName === 'webkit' && /^\/?127\.0\.0\.1:8080\/google\.firestore\.v1\.Firestore\//.test(e.message))) errors.push(e.message); });
  await setOffline(page.context(), true);
  // the ID token lasts an hour: two hours on, Firebase can't refresh it with no network
  await page.clock.install({ time: Date.now() + 2 * 3600_000 });
  await page.clock.resume();
  await page.goto(page.url(), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#list-view')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#items')).toContainText(t);
  expect(errors, 'uncaught errors').toEqual([]);
  // back online, it gets a new token and saves reach the server again
  await setOffline(page.context(), false);
  const t2 = uniq('after');
  await add(page, t2);
  await serverHas(t2);
});
