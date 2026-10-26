// @core/theme's looks (A tinted glass, B colour band, C dense and quiet) on the /kit/ gallery at phone, tablet and
// laptop widths: axe, the variants each look names, screenshots kept for the PR; the densities' row heights; the look
// and density switchers; the glass guard on a device with little memory. The list is docs/kit-tests.md.
import AxeBuilder from './axe.mjs';
import { test, expect } from './fixtures.mjs';

const KIT = '/app/kit/?edge=always';
const settled = page => page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
/** @param {import('@playwright/test').Page} page @param {string} sel @param {string} prop */
const style = (page, sel, prop) => page.locator(sel).first().evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop);

// what each look shows (looks/*.js): the <html> marks, and a computed style or two that only that look has
const LOOKS = {
  a: { header: 'plain', menu: 'popover', glass: 'bars', tick: 'round', tabbar: 'float', glassClass: true },
  b: { header: 'band', menu: 'sheet', glass: 'none', tick: 'square', tabbar: 'edge', glassClass: false },
  c: { header: 'plain', menu: 'popover', glass: 'pill', tick: 'round', tabbar: 'edge', glassClass: true },
};

for (const width of [390, 820, 1280]) {
  test.describe(`at ${width} px`, () => {
    for (const [id, want] of Object.entries(LOOKS)) {
      test(`look ${id.toUpperCase()}: its variants, clean (axe), select mode and the hold menu; screenshots kept`, async ({ sized }, info) => {
        const page = await sized(width);
        await page.goto(`${KIT}&look=${id}`);
        const root = page.locator('html');
        await expect(root).toHaveAttribute('data-look', id);
        for (const k of ['header', 'menu', 'glass', 'tick', 'tabbar']) await expect(root).toHaveAttribute(`data-${k}`, want[k]);
        if (want.glassClass) await expect(root).toHaveClass(/\bglass\b/); else await expect(root).not.toHaveClass(/\bglass\b/);
        await expect(page.locator('#look-pick')).toHaveValue(id);

        const title = page.locator('#home-title');
        if (want.header === 'band') expect(await style(page, '#home-title', 'background-color')).not.toBe('rgba(0, 0, 0, 0)');
        else expect(await style(page, '#home-title', 'background-color')).toBe('rgba(0, 0, 0, 0)');
        const tabbar = await page.locator('.ui-tabbar').boundingBox();
        if (want.tabbar === 'edge') expect(tabbar.width).toBe(width);
        else expect(tabbar.width).toBeLessThan(width);
        expect(await style(page, '.ui-list', 'border-top-left-radius')).toMatch(id === 'c' ? /^0px$/ : /^[1-9]/);   // flush, or a card
        if (id === 'c') expect(await style(page, '.ui-action-bar', 'backdrop-filter')).toContain('blur');
        if (id === 'c') expect(await style(page, '.ui-bar', 'backdrop-filter')).toBe('none');
        await expect(title).toBeVisible();
        await settled(page);
        expect(await AxeBuilder(page), `look ${id} at ${width}`).toEqual([]);
        await page.screenshot({ path: info.outputPath(`look-${id}-${width}.png`) });

        await page.locator('#select').click();
        await page.locator('#plants .ui-row').nth(1).click();
        await page.locator('#plants .ui-row').nth(2).click();
        const tickR = await page.locator('#plants .ui-row').nth(1).evaluate(e => getComputedStyle(e, '::before').borderTopLeftRadius);
        if (want.tick === 'square') expect(tickR).not.toBe('50%'); else expect(tickR).toBe('50%');
        await settled(page);
        expect(await AxeBuilder(page), `look ${id} at ${width}: select mode`).toEqual([]);
        await page.screenshot({ path: info.outputPath(`look-${id}-${width}-select.png`) });
        await page.locator('#select').click();

        await page.locator('#plants .ui-row').nth(2).focus();
        await page.keyboard.press('Shift+F10');
        const menu = page.locator('.ui-menu');
        await expect(menu).toBeVisible();
        if (want.menu === 'sheet' && width < 840) {
          await expect(menu).toHaveClass(/\bis-sheet\b/);
          await settled(page);
          const b = await menu.boundingBox();
          expect(Math.round(b.y + b.height)).toBe(page.viewportSize().height - 8);   // on the bottom edge
        } else await expect(menu).not.toHaveClass(/\bis-sheet\b/);
        await settled(page);
        expect(await AxeBuilder(page), `look ${id} at ${width}: hold menu`).toEqual([]);
        await page.screenshot({ path: info.outputPath(`look-${id}-${width}-menu.png`) });
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
      });
    }
  });
}

test('densities: rows 60, 50 and 44 px; taps never under 44; the switcher keeps a pick and drops the link\'s preview', async ({ sized }) => {
  const page = await sized(390);   // (the gallery loads no app bundle: not the phone fixture's APP_DIR check)
  const row = () => page.locator('#plants .ui-row').first().evaluate(e => e.getBoundingClientRect().height);
  for (const [density, h] of [['comfortable', 60], ['regular', 50], ['compact', 44]]) {
    await page.goto(`${KIT}&density=${density}`);
    expect(await row(), density).toBeGreaterThanOrEqual(h);
    expect(await row(), density).toBeLessThan(h + 12);   // (two lines of text can make it taller, never much)
    const tap = await page.locator('#open-sheet').evaluate(e => e.getBoundingClientRect().height);
    expect(tap, `${density}: tap height`).toBeGreaterThanOrEqual(44);
  }
  await page.goto(KIT);
  await expect(page.locator('html')).not.toHaveAttribute('data-density');
  await page.goto(`${KIT}&look=b`);
  await page.locator('#density-pick').selectOption('compact');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  expect(new URL(page.url()).searchParams.get('look')).toBeNull();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expect(page.locator('html')).toHaveAttribute('data-look', 'a', '(the link\'s look B was a preview, not kept)');
  await page.locator('#look-pick').selectOption('c');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-look', 'c');
});

test('glass guard: little memory turns glass down, kept on this device; Solid and "Glass, even here" still win', async ({ browser }) => {
  // (its own context: the fixtures' seed says the device is fast)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'deviceMemory', { configurable: true, get: () => 2 }));
  const page = await context.newPage();
  await page.goto('/app/?emulator');
  const root = page.locator('html');
  await expect(root).not.toHaveClass(/\bglass\b/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('core-glass-guard') || 'null'))).toEqual({ solid: true, why: 'memory' });
  await expect(page.getByLabel('Bars and sheets')).toHaveValue('glass');
  await expect(page.locator('.guard-note')).toContainText('little memory');
  await page.reload();
  await expect(root).not.toHaveClass(/\bglass\b/);

  await page.getByLabel('Bars and sheets').selectOption('always');
  await expect(root).toHaveClass(/\bglass\b/);
  await expect(page.locator('.guard-note')).toBeHidden();
  await page.getByLabel('Bars and sheets').selectOption('solid');
  await expect(root).not.toHaveClass(/\bglass\b/);
  expect(await AxeBuilder(page)).toEqual([]);
  await context.close();
});
