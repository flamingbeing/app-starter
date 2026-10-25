// Offline saves, two phones, conflicts, and sign-out wiping the phone.
import { test, expect, signIn, signInAgain, add, synced, serverHas, uniq, APP } from './fixtures.mjs';

test('a save made offline is kept on the phone and sent once back online, even after closing the page', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  const t = uniq('offline');
  await page.context().setOffline(true);
  await add(page, t);
  await expect.poll(() => page.evaluate(() => window.starter.status)).not.toBe('synced');
  // the page closes while offline; the outbox (IndexedDB) still holds the save
  const again = await page.context().newPage();
  await page.close();
  await page.context().setOffline(false);
  // still signed in on this phone: the list shows straight away, and the outbox sends what it kept
  await again.goto(APP);
  await expect(again.locator('#list-view')).toBeVisible();
  await serverHas(t);
  await synced(again);
});

test('two phones see each other’s changes', async ({ phone }) => {
  const a = await phone(), b = await phone();
  const { email } = await signIn(a, 'member');
  await signInAgain(b, email);
  const t = uniq('shared');
  await add(a, t);
  await expect(b.locator('#items')).toContainText(t, { timeout: 15_000 });
});

test('an edit that meets a change from another phone waits for a choice; keep mine wins everywhere', async ({ phone }) => {
  const a = await phone(), b = await phone();
  const { email } = await signIn(a, 'member');
  await signInAgain(b, email);
  const t = uniq('both');
  await add(a, t);
  await expect(b.locator('#items')).toContainText(t, { timeout: 15_000 });
  await synced(b);

  await b.context().setOffline(true);
  await b.getByRole('button', { name: t }).click();
  await b.fill('#edit-text', t + ' from b');
  await b.click('#edit-save');
  await a.getByRole('button', { name: t }).click();
  await a.fill('#edit-text', t + ' from a');
  await a.click('#edit-save');
  await serverHas(t + ' from a');
  await b.context().setOffline(false);

  await expect(b.locator('#attention')).toBeVisible({ timeout: 20_000 });
  await b.click('#attention');
  await expect(b.locator('#conflict-list')).toContainText(t + ' from a');
  await b.getByRole('button', { name: 'Keep mine' }).click();
  await serverHas(t + ' from b');
  await expect(a.locator('#items')).toContainText(t + ' from b', { timeout: 15_000 });
});

test('sign-out waits for unsent saves, then wipes the phone', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  const t = uniq('wipe');
  await page.context().setOffline(true);
  await add(page, t);
  await page.click('#sign-out');
  await expect(page.locator('#sign-out-msg')).toContainText('haven’t reached');
  await expect(page.locator('#list-view')).toBeVisible();

  await page.context().setOffline(false);
  await serverHas(t);
  await synced(page);
  await page.click('#sign-out');
  await expect(page.locator('#signed-out')).toBeVisible();
  const left = await page.evaluate(async () => (await indexedDB.databases()).map(d => d.name).filter(n => /starter-app/.test(n || '')));
  for (const name of left) {
    const records = await page.evaluate(n => new Promise(res => {
      const r = indexedDB.open(n);
      r.onsuccess = async () => {
        const db = r.result; let count = 0;
        for (const s of db.objectStoreNames) count += await new Promise(ok => { const q = db.transaction(s).objectStore(s).count(); q.onsuccess = () => ok(q.result); q.onerror = () => ok(0); });
        db.close(); res(count);
      };
      r.onerror = () => res(0);
    }), name);
    expect(records, `${name} still holds records`).toBe(0);
  }
});
