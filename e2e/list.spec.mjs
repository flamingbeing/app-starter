// Sign-in, roles from the role doc, and the list: add, edit, delete to the bin.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, add, synced, serverHas, db, uniq, APP } from './fixtures.mjs';

test('signed out: the sign-in screen, accessible', async ({ phone }) => {
  const page = await phone();
  await page.goto(APP);
  await expect(page.locator('#signed-out')).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);
});

test('an account with no role sees no list until an admin adds it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, null);
  await expect(page.locator('#list-view')).toBeHidden();
  await expect(page.locator('#uid')).not.toBeEmpty();
});

test('a member adds, edits and deletes; the delete lands in the bin', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('item');
  await add(page, t);
  await synced(page);
  await serverHas(t);
  expect(await AxeBuilder(page)).toEqual([]);

  await page.getByRole('button', { name: t }).click();
  await page.fill('#edit-text', t + ' edited');
  await page.click('#edit-save');
  await expect(page.locator('#items')).toContainText(t + ' edited');
  await serverHas(t + ' edited');

  await page.getByRole('button', { name: t + ' edited' }).click();
  await page.click('#edit-delete');
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();   // the confirm
  await expect(page.locator('#items')).not.toContainText(t);
  await expect.poll(async () => (await db.list('spaces/_/bin')).some(b => b.data?.text === t + ' edited'), { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => (await db.list('spaces/_/items')).some(d => d.text === t + ' edited')).toBe(false);
});

test('a viewer reads but cannot add or edit', async ({ phone }) => {
  const t = uniq('seen');
  await db.put(`spaces/_/items/${t}`, { text: t, updatedAt: Date.now() });
  const page = await phone();
  await signIn(page, 'viewer');
  await expect(page.locator('#items')).toContainText(t);
  await expect(page.locator('#add')).toBeHidden();
  await expect(page.getByRole('button', { name: t })).toBeDisabled();
});

test('a role change reaches the page by itself (role doc v ahead of the token)', async ({ phone }) => {
  const page = await phone();
  const { uid } = await signIn(page, 'viewer');
  await expect(page.locator('#add')).toBeHidden();
  await db.put(`members/${uid}`, { role: 'member', v: 2 });
  await expect(page.locator('#add')).toBeVisible();
  await db.del(`members/${uid}`);
  await expect(page.locator('#no-access')).toBeVisible({ timeout: 15_000 });
});

// A token refresh restarts Firestore's Listen stream; a role change written just then must still reach the page (the
// Firestore emulator before v1.22 lost such changes: firebase-tools is pinned past it, package.json "rules")
test('a role change during a token refresh still reaches the page', async ({ phone }) => {
  const page = await phone();
  const { uid } = await signIn(page, 'viewer');
  const refresh = () => page.evaluate(async () => { const { getAuth } = await import('firebase/auth'); void getAuth().currentUser?.getIdToken(true); });
  for (let v = 2; v < 10; v += 2) {
    await refresh();
    await db.put(`members/${uid}`, { role: 'member', v });
    await expect(page.locator('#add')).toBeVisible();
    await refresh();
    await db.put(`members/${uid}`, { role: 'viewer', v: v + 1 });
    await expect(page.locator('#add')).toBeHidden();
  }
});
