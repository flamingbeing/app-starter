// Back with tabs: switching tabs adds at most one Back step; Back on another tab goes to the first tab, Back there leaves the app.
import { test, expect, signIn, openTab, openToday } from './fixtures.mjs';

test('tabs A -> B -> C add at most one Back step; Back goes to the first tab, then out of the app', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await expect(page.locator('#today-page')).toBeVisible();
  const start = await page.evaluate(() => history.length);
  const appUrl = page.url();

  await openTab(page, 'upcoming');
  await openTab(page, 'done');
  await openTab(page, 'settings');
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(start + 1);

  await page.goBack();
  await expect(page.locator('#today-page')).toBeVisible();
  expect(page.url()).toBe(appUrl);

  await page.goBack();
  await expect.poll(() => page.url()).not.toBe(appUrl);

});
