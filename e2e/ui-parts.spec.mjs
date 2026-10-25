// @core/ui parts on the sample screens: the delete confirm (keyboard, Esc, focus return), toasts, the empty state.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, add, uniq, APP } from './fixtures.mjs';

test('delete asks first: Esc keeps the item and gives focus back; confirming deletes with a toast', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('del');
  await add(page, t);
  await expect(page.locator('.toast', { hasText: 'Added' })).toBeVisible();

  await page.getByRole('button', { name: t }).click();
  await page.click('#edit-delete');
  const modal = page.locator('dialog.modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Cancel' })).toBeFocused();   // the safe answer first
  expect(await AxeBuilder(page)).toEqual([]);

  await page.keyboard.press('Tab');
  await expect(modal.getByRole('button', { name: 'Delete' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(modal.getByRole('button', { name: 'Cancel' })).toBeFocused();   // trapped: wraps round

  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(page.locator('#edit')).toBeVisible();
  await expect(page.locator('#edit-delete')).toBeFocused();
  await expect(page.locator('#items')).toContainText(t);

  await page.click('#edit-delete');
  await page.locator('dialog.modal').getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#items')).not.toContainText(t);
  await expect(page.locator('.toast', { hasText: 'Deleted' })).toBeVisible();
});

test('a toast can be dismissed', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await add(page, uniq('note'));
  const toast = page.locator('.toast', { hasText: 'Added' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Dismiss' }).click();
  await expect(toast).toHaveCount(0);
});
