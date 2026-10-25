// The 1.0 engine features the starter shows: sign-out keeps this device's data, forget wipes it, refused saves wait
// in a list, the edit sheet follows its item live (watchDoc), the list marks what changed, and "Check for updates".
import { test, expect, signIn, signInAgain, add, synced, serverHas, uniq, db, APP } from './fixtures.mjs';

const kept = page => page.evaluate(async () => {
  let n = 0;
  for (const { name } of await indexedDB.databases()) {
    if (!/starter-app/.test(name || '')) continue;
    n += await new Promise(res => {
      const r = indexedDB.open(name);
      r.onsuccess = async () => {
        const d = r.result; let c = 0;
        for (const s of d.objectStoreNames) c += await new Promise(ok => { const q = d.transaction(s).objectStore(s).count(); q.onsuccess = () => ok(q.result); q.onerror = () => ok(0); });
        d.close(); res(c);
      };
      r.onerror = () => res(0);
    });
  }
  return n;
});

test('sign-out keeps the phone’s data and unsent saves; the same account carries on', async ({ phone }) => {
  const page = await phone();
  const { email } = await signIn(page, 'member');
  await synced(page);
  const t = uniq('kept');
  await page.context().setOffline(true);
  await add(page, t);
  await page.click('#sign-out');
  await expect(page.locator('#signed-out')).toBeVisible();
  await expect(page.locator('#sign-out-msg')).toContainText('kept on this device');
  expect(await kept(page)).toBeGreaterThan(0);
  await page.context().setOffline(false);
  await page.evaluate(e => import('./src/cloud.js').then(m => m.emulatorSignIn(e)), email);
  await expect(page.locator('#list-view')).toBeVisible();
  await expect(page.locator('#items')).toContainText(t);
  await serverHas(t);
});

test('forget this device: refused while unsent, then wipes the phone', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await page.context().setOffline(true);
  await add(page, uniq('unsent'));
  await page.click('#sign-out');
  await page.click('#forget');
  await expect(page.locator('#forget-msg')).toContainText('not sent yet');
  await expect(page.locator('#forget-force')).toBeVisible();
  await page.click('#forget-force');
  await expect(page.locator('#forget-msg')).toContainText('Forgotten');
  expect(await kept(page)).toBe(0);
});

test('a save the server refuses waits in a list until retried or discarded', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await page.evaluate(() => window.starter.add('x'.repeat(501)));   // the rules refuse text over 500
  await expect(page.locator('#refused li')).toHaveCount(1, { timeout: 15_000 });
  await page.click('#refused li button.discard');
  await expect(page.locator('#refused li')).toHaveCount(0);
  await synced(page);
});

test('the edit sheet follows its item: a change elsewhere shows, a delete elsewhere closes it', async ({ phone }) => {
  const a = await phone(), b = await phone();
  const { email } = await signIn(a, 'member');
  await signInAgain(b, email);
  const t = uniq('live');
  await add(a, t);
  await expect(b.locator('#items')).toContainText(t);
  await expect(b.locator('#items li.changed')).toContainText(t);   // the watch says what changed
  await b.getByRole('button', { name: t }).click();
  const [doc] = (await db.list('spaces/_/items')).filter(d => d.text === t);
  const noNulls = JSON.parse(JSON.stringify(doc, (k, v) => v === null ? undefined : v));   // (the admin helper can't write null)
  await db.put(`spaces/_/items/${doc.id}`, { ...noNulls, text: t + '-2', updatedAt: Date.now() });
  await expect(b.locator('#edit-live')).toContainText(t + '-2');
  await db.del(`spaces/_/items/${doc.id}`);
  await expect(b.locator('#edit')).not.toBeVisible();
  await expect(b.locator('#edit-msg')).toContainText('deleted on another device');
});

test('check for updates: a new version takes over at once', async ({ phone }) => {
  const page = await phone();
  await page.goto(APP + '&sw');
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
  await page.evaluate(() => { window.__same = true; });
  await page.request.get('/__test/bump');
  await page.click('#check-update');
  await expect.poll(() => page.evaluate(() => window.__same).catch(() => undefined), { timeout: 30_000 }).toBeUndefined();
});
