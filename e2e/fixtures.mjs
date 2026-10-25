// Shared steps for the specs. Every test uses its own made-up accounts and its own item texts, so tests run side by
// side on the one shared list. A page that reports a Content-Security-Policy violation fails its test.
import { test as base, expect } from '@playwright/test';
import { fsAdmin } from '../.devkit/playwright/helpers.mjs';

export const db = fsAdmin('demo-starter-app');
export const APP = '/app/?emulator';
export const uniq = (p = 't') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const test = base.extend({
  // a new phone: its own browser context; CSP reports collected for the check after the test
  phone: async ({ browser }, use) => {
    const made = [];
    await use(async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await context.addInitScript(() => {
        window.__csp = [];
        addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
      });
      const page = await context.newPage();
      made.push({ context, page });
      return page;
    });
    for (const { context, page } of made) {
      const v = await page.evaluate(() => window.__csp || []).catch(() => []);
      await context.close();
      expect(v, 'CSP violations').toEqual([]);
    }
  },
});
export { expect };

// Sign in as a new made-up Google account; with a role, an admin "adds" it (the role doc) and the page picks the
// new claims up by itself. -> { uid, email }
export async function signIn(page, role = 'member', { path = APP } = {}) {
  const email = `${uniq('u')}@example.com`;
  await page.goto(path);
  await expect(page.locator('#signed-out')).toBeVisible();
  await page.evaluate(e => import('./cloud.js').then(m => m.emulatorSignIn(e)), email);
  await expect(page.locator('#no-access')).toBeVisible();
  const uid = await page.locator('#uid').textContent();
  if (role) {
    await db.put(`members/${uid}`, { role, v: 1 });
    await expect(page.locator('#list-view')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.starter.ready)).toBe(true);
  }
  return { uid, email };
}

// The same account on a second phone (a new context signs in with the same made-up Google credential)
export async function signInAgain(page, email) {
  await page.goto(APP);
  await expect(page.locator('#signed-out')).toBeVisible();
  await page.evaluate(e => import('./cloud.js').then(m => m.emulatorSignIn(e)), email);
  await expect(page.locator('#list-view')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.starter.ready)).toBe(true);
}

export async function add(page, text) {
  await page.fill('#new-text', text);
  await page.click('#add button[type=submit]');
  await expect(page.locator('#items')).toContainText(text);
}
export const synced = page => expect.poll(() => page.evaluate(() => window.starter.status), { timeout: 15_000 }).toBe('synced');
export const serverHas = text => expect.poll(async () => (await db.list('spaces/_/items')).some(d => d.text === text), { timeout: 15_000 }).toBe(true);
