// @core/settings on the sample Settings sheet: a device value stays on this device, an account value reaches the
// account's other devices, the settings file drops what it should not carry, and the open sheet passes axe.
import { test, expect, clickOpens, signIn, signInAgain, synced } from './fixtures.mjs';
import AxeBuilder from './axe.mjs';

const open = page => clickOpens(page.locator('#open-settings'), page.locator('#settings'));

test('a device value stays on this device; an account value reaches the other one', async ({ phone }) => {
  const a = await phone();
  const { email } = await signIn(a, 'member');
  await synced(a);
  await open(a);
  await a.check('#opt-bigRows');
  await a.check('#opt-itemCount');
  await a.click('#settings-close');
  await expect(a.locator('#items')).toHaveClass(/big/);
  await expect(a.locator('#count')).toBeVisible();
  await synced(a);

  const b = await phone();
  await signInAgain(b, email);
  await expect(b.locator('#count')).toBeVisible();                 // the account's option arrived
  await expect(b.locator('#items')).not.toHaveClass(/big/);        // this device's did not
  await open(b);
  await expect(b.locator('#opt-bigRows')).not.toBeChecked();
  await expect(b.locator('#opt-itemCount')).toBeChecked();

  // and a change on b comes back to a without a reload
  await b.uncheck('#opt-itemCount');
  await expect(a.locator('#count')).toBeHidden({ timeout: 15_000 });
  await expect(a.locator('#items')).toHaveClass(/big/);
});

test('the device value survives sign-out and a reload', async ({ phone }) => {
  const a = await phone();
  const { email } = await signIn(a, 'member');
  await open(a);
  await a.check('#opt-bigRows');
  await a.click('#settings-close');
  await a.click('#sign-out');
  await expect(a.locator('#signed-out')).toBeVisible();
  await a.reload({ waitUntil: 'domcontentloaded' });
  await expect(a.locator('#signed-out')).toBeVisible();
  await a.evaluate(e => window.starter.signInAs(e), email);
  await expect(a.locator('#list-view')).toBeVisible();
  await expect(a.locator('#items')).toHaveClass(/big/);
});

test('a settings file: exported, imported on another account, bad keys dropped', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  await synced(a);
  await open(a);
  await a.check('#opt-itemCount');
  const [download] = await Promise.all([a.waitForEvent('download'), a.click('#settings-export')]);
  const file = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));
  expect(file.kind).toBe('core-settings');
  expect(file.settings).toEqual({ itemCount: true });             // the device option stays behind

  const b = await phone();
  await signIn(b, 'member');
  await synced(b);
  await open(b);
  const bad = { ...file, settings: { ...file.settings, bigRows: true, nope: 1 } };
  await b.setInputFiles('#settings-import', { name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(b.locator('#settings-msg')).toContainText('Imported: 1 changed, 2 skipped');
  await expect(b.locator('#opt-itemCount')).toBeChecked();
  await expect(b.locator('#opt-bigRows')).not.toBeChecked();
  await b.setInputFiles('#settings-import', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
  await expect(b.locator('#settings-msg')).toContainText('not JSON');
  await expect(b.locator('#opt-itemCount')).toBeChecked();
});

test('the Settings sheet passes axe', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  await open(a);
  expect(await AxeBuilder(a)).toEqual([]);
});

test('a direct switch from one account to another follows the new account\'s settings', async ({ phone }) => {
  const b = await phone();
  const { email } = await signIn(b, 'member');   // account B, on its own phone
  const a = await phone();
  await signIn(a, 'member');                      // account A
  await synced(a);
  // straight from A to B, no sign-out in between
  await a.evaluate(e => window.starter.signInAs(e), email);
  await expect.poll(() => a.locator('#uid').textContent()).not.toBe('');
  await expect(a.locator('#list-view')).toBeVisible();
  await expect.poll(() => a.evaluate(() => window.starter.ready)).toBe(true);
  await expect(a.locator('#count')).toBeHidden();
  // B's change on its other phone reaches a without a reload
  await open(b);
  await b.check('#opt-itemCount');
  await b.click('#settings-close');
  await synced(b);
  await expect(a.locator('#count')).toBeVisible({ timeout: 15_000 });
});
