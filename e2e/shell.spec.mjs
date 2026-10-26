// The /kit/shell/ gallery: the adaptive shell at phone (390), tablet (820) and laptop (1280) widths, signed out, made-up
// plants. Keyboard and pointer (mouse) behaviour at each size; the list of what is covered is docs/kit-tests.md.
import AxeBuilder from './axe.mjs';
import { test, expect } from './fixtures.mjs';

const SHELL = '/app/kit/shell/?edge=always';
const SIZE = { 390: 'phone', 820: 'tablet', 1280: 'laptop' };
const depth = page => page.evaluate(() => window.kit.screens.depth());
const settled = page => page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
const row = (page, name) => page.locator('.ui-row', { hasText: name });
const ticked = page => page.locator('.ui-row[aria-selected="true"]').evaluateAll(els => els.map(e => e.dataset.name));
async function load(sized, width) {
  const page = await sized(width);
  await page.goto(SHELL);
  await expect.poll(() => page.evaluate(() => !!window.shell)).toBe(true);
  return page;
}

for (const width of [390, 820, 1280]) {
  const wide = width >= 600;
  test.describe(`shell at ${width} px (${SIZE[width]})`, () => {
    test('layout follows the width class; axe clean', async ({ sized }) => {
      const page = await load(sized, width);
      await expect(page.locator('.ui-shell')).toHaveAttribute('data-size', SIZE[width]);
      await expect(page.locator('nav.ui-sidebar')).toBeVisible({ visible: wide });
      // the page's one main heading is there for screen readers at every size (the pane head shows instead from 600 px)
      await expect(page.getByRole('heading', { level: 1, name: 'Plants' })).toHaveCount(1);
      await expect(page.locator('nav.ui-tabbar')).toBeVisible({ visible: !wide });
      await expect(page.locator('.ui-pane-list')).toBeVisible();
      await expect(page.locator('.ui-pane-detail')).toBeVisible({ visible: wide });
      if (wide) {   // list and detail side by side, the side bar on the left, nothing overlapping or off screen
        const [side, list, detail] = await Promise.all(['.ui-sidebar', '.ui-pane-list', '.ui-pane-detail'].map(s => page.locator(s).boundingBox()));
        expect(side.x + side.width).toBeLessThanOrEqual(list.x + 1);
        expect(list.x + list.width).toBeLessThanOrEqual(detail.x + 1);
        expect(detail.x + detail.width).toBeLessThanOrEqual(width + 1);
        expect(detail.width).toBeGreaterThan(300);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
      expect(await AxeBuilder(page)).toEqual([]);
    });

    test('opening a row: wide shows it beside the list, a phone pushes it; Back and Esc return', async ({ sized }) => {
      const page = await load(sized, width);
      await row(page, 'Fern').click();
      await expect(page.locator('#detail-title')).toHaveText('Fern');
      await expect(row(page, 'Fern')).toHaveAttribute('aria-current', 'true');
      expect(await depth(page)).toBe(wide ? 0 : 1);
      await expect(page.locator('.ui-pane-list')).toBeVisible({ visible: true });
      if (wide) {
        await expect(page.locator('.ui-pane-list')).toBeVisible();
        await row(page, 'Mint').click();
        await expect(page.locator('#detail-title')).toHaveText('Mint');
        await expect(row(page, 'Fern')).not.toHaveAttribute('aria-current', 'true');
      } else {
        await settled(page);
        await expect(page.locator('.ui-pane-list')).toBeHidden();
        expect(await AxeBuilder(page)).toEqual([]);
        await page.keyboard.press('Escape');   // Esc on a pushed detail goes back
        await expect.poll(() => depth(page)).toBe(0);
        await row(page, 'Fern').click();
        await settled(page);
        await page.goBack();                   // so does the browser's Back
        await expect.poll(() => depth(page)).toBe(0);
        await expect(page.locator('.ui-pane-list')).toBeVisible();
      }
    });

    test('keyboard: Ctrl/Cmd+K finds the search, typing filters, Esc clears then leaves; Enter and arrows work the list', async ({ sized }) => {
      const page = await load(sized, width);
      const field = page.locator('[data-shell-search]:visible');
      for (const key of ['Control+k', 'Meta+k']) {
        await page.locator('body').click({ position: { x: 2, y: 2 } });
        await page.keyboard.press(key);
        await expect(field).toBeFocused();
        await page.keyboard.press('Escape');   // empty: leaves the field
        await expect(field).not.toBeFocused();
      }
      await page.keyboard.press('Control+k');
      await page.keyboard.type('balcony');
      await expect(page.locator('.ui-row:visible')).toHaveCount(2);   // Lavender and Rosemary
      await page.keyboard.press('Escape');   // clears
      await expect(field).toHaveValue('');
      await expect(page.locator('.ui-row:visible')).toHaveCount(12);
      await expect(field).toBeFocused();
      await page.keyboard.type('zzz');
      await expect(page.locator('[data-shell-empty]')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(field).not.toBeFocused();

      await row(page, 'Basil').focus();
      await page.keyboard.press('ArrowDown');
      await expect(row(page, 'Fern')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#detail-title')).toHaveText('Fern');
      expect(await depth(page)).toBe(wide ? 0 : 1);
    });

    test('pointer: right-click is the hold menu; Esc closes it and keeps the row', async ({ sized }) => {
      const page = await load(sized, width);
      await row(page, 'Jade').click({ button: 'right' });
      await expect(page.locator('.ui-menu[role=menu]')).toBeVisible();
      expect(await AxeBuilder(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.locator('.ui-menu')).toHaveCount(0);
      await expect(row(page, 'Jade')).toBeFocused();
      await row(page, 'Jade').click({ button: 'right' });
      await page.locator('.ui-menu-item', { hasText: 'Open' }).click();
      await expect(page.locator('#detail-title')).toHaveText('Jade');
    });

    test('pointer: Ctrl/Cmd-click adds, Shift-click takes a range, Esc leaves select mode', async ({ sized }) => {
      const page = await load(sized, width);
      await row(page, 'Basil').click();   // opens (the anchor for a range)
      if (!wide) { await settled(page); await page.keyboard.press('Escape'); await expect.poll(() => depth(page)).toBe(0); }
      await row(page, 'Fig').click({ modifiers: ['Control'] });   // starts select mode with the open row and this one
      await expect(page.locator('#plants')).toHaveClass(/is-editing/);
      expect(await ticked(page)).toEqual(['Basil', 'Fig']);
      await row(page, 'Mint').click({ modifiers: ['Meta'] });
      expect(await ticked(page)).toEqual(['Basil', 'Fig', 'Mint']);
      await row(page, 'Fig').click({ modifiers: ['Control'] });   // adds toggles in select mode
      expect(await ticked(page)).toEqual(['Basil', 'Mint']);
      await row(page, 'Orchid').click({ modifiers: ['Shift'] });  // from the last clicked (Fig) to here
      expect(await ticked(page)).toEqual(['Fig', 'Jade', 'Lavender', 'Mint', 'Monstera', 'Orchid']);
      if (wide) {   // the detail says what they share
        await expect(page.locator('.ui-detail-multi')).toBeVisible();
        await expect(page.locator('[data-multi-count]')).toHaveText('6 selected');
      }
      await page.keyboard.press('Escape');
      await expect(page.locator('#plants')).not.toHaveClass(/is-editing/);
      // the open row (Basil) stays the anchor: Shift-click ranges from it
      await row(page, 'Thyme').click({ modifiers: ['Shift'] });
      const range = await ticked(page);
      expect(range[0]).toBe('Basil');
      expect(range.at(-1)).toBe('Thyme');
      expect(range.length).toBe(12);
    });

    test(`sheets: ${wide && width >= 840 ? 'a side panel' : width >= 600 ? 'a bottom sheet' : 'a bottom sheet'}; Back closes`, async ({ sized }) => {
      const page = await load(sized, width);
      await page.locator('button:visible', { hasText: 'New' }).click();
      const sheet = page.locator('#sheet');
      await expect(sheet).toBeVisible();
      await settled(page);
      const b = await sheet.boundingBox();
      if (width >= 840) {   // docked to the right edge, full height, not a centred box
        expect(Math.round(b.x + b.width)).toBe(width);
        expect(Math.round(b.height)).toBe(800);
        await expect(sheet.locator('.ui-sheet-grabber')).toBeHidden();
      } else {   // rises from the bottom edge
        expect(Math.round(b.y + b.height)).toBe(await page.evaluate(() => innerHeight));
      }
      expect(await AxeBuilder(page)).toEqual([]);
      await page.goBack();
      await expect(sheet).toBeHidden();
      await page.locator('button:visible', { hasText: 'New' }).click();
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
    });

    test('delete with Undo from the detail', async ({ sized }) => {
      const page = await load(sized, width);
      await row(page, 'Thyme').click();
      await settled(page);
      await page.locator('#delete-one').click();
      await expect(row(page, 'Thyme')).toHaveCount(0);
      await page.locator('.toast-action').click();
      await expect(row(page, 'Thyme')).toHaveCount(1);
    });
  });
}

test('the shell follows a window resize across the classes, keeping the open row', async ({ sized }) => {
  const page = await load(sized, 1280);
  await row(page, 'Fig').click();
  await expect(page.locator('.ui-shell')).toHaveAttribute('data-size', 'laptop');
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.locator('.ui-shell')).toHaveAttribute('data-size', 'tablet');
  await expect(page.locator('nav.ui-sidebar')).toBeVisible();
  await expect(page.locator('#detail-title')).toHaveText('Fig');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.ui-shell')).toHaveAttribute('data-size', 'phone');
  await expect(page.locator('nav.ui-tabbar')).toBeVisible();
  await expect(page.locator('nav.ui-sidebar')).toBeHidden();
  await expect(row(page, 'Fig')).toHaveAttribute('aria-current', 'true');
});

test('startGestures and the shell on a page without the markup start nothing', async ({ sized }) => {
  const page = await sized(1280);
  await page.goto('/app/kit/?edge=always');
  await expect.poll(() => page.evaluate(() => !!window.kit)).toBe(true);
  expect(await page.evaluate(() => document.querySelector('.ui-shell'))).toBeNull();
  expect(await page.evaluate(() => document.documentElement.dataset.size)).toBeUndefined();
});

// the bars mark the picked section (?tab=), so the shrunk tab bar keeps it: visible, and Tab from the list reaches it
test('at 390 px the shrunk tab bar keeps the current tab, and Tab reaches it', async ({ sized }) => {
  const page = await load(sized, 390);
  await expect(page.locator('nav.ui-tabbar a[aria-current="page"]')).toHaveText('Plants');
  await page.evaluate(() => scrollTo(0, document.scrollingElement.scrollHeight));
  await expect(page.locator('nav.ui-tabbar')).toHaveClass(/is-minimised/);
  await expect(page.locator('nav.ui-tabbar a[aria-current="page"]')).toBeVisible();
  await page.locator('.ui-pane-list .ui-row').last().focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('nav.ui-tabbar a[aria-current="page"]')).toBeFocused();
  // another section: both bars mark it, and the page's other settings stay in the link
  await page.goto(`${SHELL}&tab=jobs`);
  await expect(page.locator('a.ui-tab[aria-current="page"], a.ui-side-link[aria-current="page"]')).toHaveText(['Jobs', 'Jobs']);
  expect(new URL(await page.locator('a.ui-tab', { hasText: 'Rooms' }).evaluate(a => a.href)).search).toContain('tab=rooms');
});
