// @core/theme: the switch sets this device's theme and layout, and the choice survives a reload.
import AxeBuilder from './axe.mjs';
import { test, expect, APP } from './fixtures.mjs';

test('theme and layout switch: kept on this device, accessible in dark', async ({ phone }) => {
  const page = await phone();
  await page.goto(APP);
  const root = page.locator('html');
  await expect(root).not.toHaveAttribute('data-theme');
  await expect(root).not.toHaveAttribute('data-layout');

  await page.getByLabel('Theme').selectOption('dark');
  await page.getByLabel('Layout').selectOption('compact');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(root).toHaveAttribute('data-layout', 'compact');
  expect(await AxeBuilder(page)).toEqual([]);

  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByLabel('Layout')).toHaveValue('compact');

  await page.getByLabel('Theme').selectOption('auto');
  await expect(root).not.toHaveAttribute('data-theme');
});
