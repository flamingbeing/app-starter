// Shared steps for the specs. Every test uses its own made-up accounts and its own item texts, so tests run side by
// side on the one shared list. A page that reports a Content-Security-Policy violation fails its test.
import { test as base, expect, webkit } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fsAdmin } from '../.devkit/playwright/helpers.mjs';

export const db = fsAdmin('demo-starter-app');
export const APP = '/app/?emulator';
export const uniq = (p = 't') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// SYNC_DIR: a local app-sync build (its entry files and src/) served in place of core.anawj.com/sync/<version>/, so
// app-sync's CI can run these tests against a candidate before it is released (its consumer-test job).
const SYNC_DIR = process.env.SYNC_DIR ? path.resolve(process.env.SYNC_DIR) : '';
async function routeSync(context, served) {
  await context.route(/^https:\/\/core\.anawj\.com\/sync\/[^/]+\/(.+)$/, route => {
    const rel = new URL(route.request().url()).pathname.split('/').slice(3).join('/');
    const file = path.join(SYNC_DIR, rel);
    if (!file.startsWith(SYNC_DIR + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not in SYNC_DIR' });
    served.n++;
    return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) });
  });
}

// every new context: collect CSP reports; and the glass guard has already found this device fast (theme/guard.js),
// so a slow CI runner's frames can't turn glass down mid-test (looks.spec runs the guard itself, on its own context)
const seed = () => {
  window.__csp = [];
  addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  try {
    if (!localStorage.getItem('core-glass-guard')) localStorage.setItem('core-glass-guard', JSON.stringify({ solid: false, why: '' }));
  } catch { /* an opaque origin: nothing to keep */ }
};

// Firefox has no mobile emulation (isMobile throws); touch and the viewport work everywhere
const touch = (browserName, mobile = true) => ({ hasTouch: true, ...(mobile && browserName !== 'firefox' ? { isMobile: true } : {}) });

// A fresh context. WebKit's ephemeral contexts cannot keep a Blob in IndexedDB (the write fails with a null error, so the
// files module's add() throws), a persistent profile can (`blobs`: each context is then its own browser on a new temp
// profile). But a persistent profile's Cache API stays empty for the service worker, so only the files tests ask for it.
async function newContext(browser, browserName, options, blobs = false) {
  if (browserName !== 'webkit' || !blobs) return browser.newContext(options);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-webkit-'));
  const context = await webkit.launchPersistentContext(dir, options);
  context.once('close', () => fs.rmSync(dir, { recursive: true, force: true }));
  return context;
}

// Offline for a context. In WebKit, setOffline also fails the reload that the service worker should answer ("WebKit
// encountered an internal error") and blob: images; in Firefox that reload can hang. A route that aborts the page's other
// requests does neither. (Chromium keeps setOffline.)
const routed = new WeakMap(), NETWORK = /^https?:/;
export async function setOffline(context, offline) {
  const engine = context.browser()?.browserType().name() ?? 'webkit';   // (no browser: a persistent profile, WebKit only)
  if (engine === 'chromium') return context.setOffline(offline);
  const handler = route => route.request().resourceType() === 'document' ? route.continue() : route.abort('internetdisconnected');   // (a navigation is the worker's to answer; the route sees it first)
  if (offline && !routed.has(context)) { routed.set(context, handler); await context.route(NETWORK, handler); }
  else if (!offline && routed.has(context)) { await context.unroute(NETWORK, routed.get(context)); routed.delete(context); }
}

export const test = base.extend({
  // a new phone: its own browser context; CSP reports collected for the check after the test
  phone: async ({ browser, browserName }, use) => {
    const made = [];
    await use(async ({ blobs = false } = {}) => {
      const context = await newContext(browser, browserName, { viewport: { width: 390, height: 844 }, ...touch(browserName) }, blobs);
      await context.addInitScript(seed);
      const served = { n: 0, built: 0 };
      if (SYNC_DIR) await routeSync(context, served);
      // APP_DIR (a Vite build, e2e/serve.mjs): count the built bundle's loads, so the run proves it tested dist/
      if (process.env.APP_DIR) context.on('request', r => { if (/\/app\/assets\/[^/]+\.js$/.test(r.url())) served.built++; });
      const page = await context.newPage();
      made.push({ context, page, served });
      return page;
    });
    await check(made);
  },
  // a touch screen of this width (390 phone, 820 tablet, 1280 laptop with touch): the same CSP check after the test
  sized: async ({ browser, browserName }, use) => {
    const made = [];
    await use(async (/** @type {number} */ width) => {
      const height = width < 600 ? 844 : width < 1000 ? 1180 : 800;
      const context = await newContext(browser, browserName, { viewport: { width, height }, ...touch(browserName, width < 1000) });
      await context.addInitScript(seed);
      const page = await context.newPage();
      made.push({ context, page, served: null });
      return page;
    });
    await check(made);
  },
});
export { expect };

// close each context and fail the test on any CSP report (and, for the phone, on what SYNC_DIR / APP_DIR must have served)
async function check(made) {
  for (const { context, page, served } of made) {
    const v = await page.evaluate(() => window.__csp || []).catch(() => []);
    await context.close();
    expect(v, 'CSP violations').toEqual([]);
    if (!served) continue;
    if (SYNC_DIR) expect(served.n, 'app-sync files served from SYNC_DIR').toBeGreaterThan(0);
    if (process.env.APP_DIR) expect(served.built, 'the built bundle (APP_DIR) loaded').toBeGreaterThan(0);
  }
}

// Sign in as a new made-up Google account; with a role, an admin "adds" it (the role doc) and the page picks the
// new claims up by itself. -> { uid, email }
export async function signIn(page, role = 'member', { path = APP } = {}) {
  const email = `${uniq('u')}@example.com`;
  // (not 'load': that waits on the design kit and core files over the internet, which can stall for a minute; the next line waits for the page itself)
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#signed-out')).toBeVisible();
  await page.evaluate(e => window.starter.signInAs(e), email);
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
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#signed-out')).toBeVisible();
  await page.evaluate(e => window.starter.signInAs(e), email);
  await expect(page.locator('#list-view')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.starter.ready)).toBe(true);
}

export async function add(page, text) {
  await page.fill('#new-text', text);
  await page.click('#add button[type=submit]');
  await expect(page.locator('#items')).toContainText(text);
}
// Click a button that opens a dialog, and wait for the dialog. The list redraws its buttons whenever a snapshot lands (the
// files snapshot follows the first list one), and a click whose button is swapped out between press and release is
// dropped (Firefox), so the dialog stays hidden: click again only while it is not open, never after it opened.
export const clickOpens = (button, dialog) => expect(async () => {
  if (!await dialog.isVisible()) await button.click({ timeout: 3_000 });
  await expect(dialog).toBeVisible({ timeout: 2_000 });
}).toPass({ timeout: 20_000 });
export const synced = page => expect.poll(() => page.evaluate(() => window.starter.status), { timeout: 15_000 }).toBe('synced');
export const serverHas = text => expect.poll(async () => (await db.list('spaces/_/items')).some(d => d.text === text), { timeout: 15_000 }).toBe(true);
// The id of the shared item with this text (db.list leaves document ids out).
export async function itemIdOf(text) {
  const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const r = await fetch(`http://${host}/v1/projects/demo-starter-app/databases/(default)/documents/spaces/_/items?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  const d = ((await r.json()).documents || []).find(x => x.fields?.text?.stringValue === text);
  return d?.name.split('/').pop();
}
