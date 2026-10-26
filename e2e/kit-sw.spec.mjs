// With the service worker in charge (any earlier visit to the app), /kit, /kit/ and /kit/shell/ still show the
// gallery, not the app's own page: sw-core answers a navigation it has no folder entry for with the app page.
import { test, expect } from './fixtures.mjs';

test('after the app has been opened, the gallery pages are still the gallery', async ({ phone }) => {
  const page = await phone();
  await page.goto('/app/?emulator&sw');
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
  for (const [path, title] of [['/app/kit', 'Kit gallery'], ['/app/kit/', 'Kit gallery'], ['/app/kit/shell/', 'Shell gallery']]) {
    await page.goto(path);
    await expect(page, path).toHaveTitle(title);
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller), `${path} still under the worker`).toBe(true);
  }
});
