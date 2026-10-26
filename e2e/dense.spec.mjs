// The layout parts and the extra-dense level on the /kit/dense/ gallery (a timed readings screen and a case-entry
// screen, made-up data) in every look at phone, tablet and laptop widths: axe, no target under 24 px, nothing wider
// than the screen, screenshots kept for the PR; then the parts' keyboard and pointer behaviour. The list is
// docs/kit-tests.md.
import AxeBuilder from './axe.mjs';
import { test, expect } from './fixtures.mjs';

const DENSE = '/app/kit/dense/';
const settled = page => page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));

// every target on the shown screen, measured where the finger lands (a radio or checkbox: its label); links inside
// running text are exempt (WCAG 2.5.8's inline exception), as are the hidden ones
const targets = page => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('main button, main a[href], main input, main select, main textarea, .ui-tabbar a, .ui-bar a')) {
    const hit = el.matches('input[type=radio], input[type=checkbox]') ? el.closest('label') || el : el;
    const r = hit.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    out.push({ what: el.id || el.getAttribute('aria-label') || hit.textContent.trim().slice(0, 30), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });
  }
  return out;
});

for (const width of [390, 820, 1280]) {
  test.describe(`at ${width} px`, () => {
    for (const look of ['a', 'b', 'c']) {
      for (const screen of ['readings', 'log']) {
        test(`look ${look.toUpperCase()}, ${screen}: clean (axe), targets 24 px or more, fits; screenshot kept`, async ({ sized }, info) => {
          const page = await sized(width);
          await page.goto(`${DENSE}?screen=${screen}&look=${look}`);
          await expect(page.locator('html')).toHaveAttribute('data-look', look);
          await expect(page.locator(`#${screen}`)).toBeVisible();
          await expect(page.locator(`#${screen}`)).toHaveAttribute('data-dense', 'extra');
          await settled(page);
          const small = (await targets(page)).filter(t => t.w < 24 || t.h < 24);
          expect(small, `targets under 24 px, look ${look} at ${width}`).toEqual([]);
          expect(await page.evaluate(() => document.documentElement.scrollWidth), 'nothing wider than the screen').toBeLessThanOrEqual(width);
          expect(await AxeBuilder(page), `${screen}, look ${look} at ${width}`).toEqual([]);
          await page.screenshot({ path: info.outputPath(`dense-${screen}-${look}-${width}.png`), fullPage: true });
        });
      }
    }
  });
}

test('extra-dense sizes: 32 px main targets, 24 px small ones; Comfortable gets Compact-like sizes; off is Regular', async ({ sized }) => {
  const page = await sized(390);
  const tap = () => page.locator('#readings').evaluate(e => [getComputedStyle(e).getPropertyValue('--tap').trim(), getComputedStyle(e).getPropertyValue('--tap-s').trim()]);
  await page.goto(`${DENSE}?look=a&density=regular`);
  expect(await tap()).toEqual(['32px', '24px']);
  await page.locator('#dense-on').uncheck();
  await expect(page.locator('#readings')).not.toHaveAttribute('data-dense', 'extra');
  const [off] = await tap();
  expect(parseFloat(off)).toBeGreaterThanOrEqual(44);
  await page.goto(`${DENSE}?look=a&density=comfortable`);
  expect(await tap()).toEqual(['44px', '36px']);
});

test('segmented: one Tab stop, arrow keys pick; a second tap clears a clearable one, a key never does', async ({ sized }) => {
  const page = await sized(390);
  await page.goto(`${DENSE}?look=b`);
  const comfort = page.locator('input[name=comfort]');
  await comfort.nth(3).focus();
  await page.keyboard.press('ArrowRight');
  await expect(comfort.nth(4)).toBeChecked();
  await expect(comfort.nth(4)).toBeFocused();
  await expect(page.locator('#scale tr.is-on')).toHaveAttribute('data-score', '1');
  await page.keyboard.press('Space');
  await expect(comfort.nth(4)).toBeChecked();
  await page.locator('#board label', { hasText: /^1$/ }).first().click();
  await expect(page.locator('input[name=comfort]:checked')).toHaveCount(0);
  await expect(page.locator('#scale tr.is-on')).toHaveCount(0);
  await page.locator('#board label', { hasText: /^2$/ }).first().click();
  await expect(comfort.nth(5)).toBeChecked();
  // not clearable: a second tap keeps it
  await page.locator('#where label').first().click();
  await expect(page.locator('input[name=where]').first()).toBeChecked();
});

test('stepper: − and + step in the step and stay in min/max, an empty box starts at its start value; the field is the Tab stop', async ({ sized }) => {
  const page = await sized(390);
  await page.goto(`${DENSE}?look=c`);
  const core = page.getByRole('spinbutton', { name: /Core/ });
  await page.getByRole('button', { name: 'Core up' }).click();
  await expect(core).toHaveValue('36.7');
  await page.getByRole('button', { name: 'Core down' }).click();
  await page.getByRole('button', { name: 'Core down' }).click();
  await expect(core).toHaveValue('36.5');
  await expect(page.getByRole('button', { name: 'Core up' })).toHaveAttribute('tabindex', '-1');
  const room = page.getByRole('spinbutton', { name: /Room/ });
  await page.getByRole('button', { name: 'Room up' }).click();
  await expect(room).toHaveValue('21.0');
  const heart = page.getByRole('spinbutton', { name: /Heart/ });
  await heart.fill('219');
  await page.getByRole('button', { name: 'Heart rate up' }).click();
  await page.getByRole('button', { name: 'Heart rate up' }).click();
  await expect(heart).toHaveValue('220');
  await heart.focus();
  await page.keyboard.press('ArrowDown');
  await expect(heart).toHaveValue('219');
});

test('toolbar: one Tab stop, arrows, Home and End move between its buttons', async ({ sized }) => {
  const page = await sized(390);
  await page.goto(`${DENSE}?screen=log&look=a`);
  const bar = page.getByRole('toolbar', { name: 'Date' });
  const buttons = bar.getByRole('button');
  await expect(buttons.nth(0)).toHaveAttribute('tabindex', '0');
  await expect(buttons.nth(1)).toHaveAttribute('tabindex', '-1');
  await buttons.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(buttons.nth(1)).toBeFocused();
  await expect(buttons.nth(1)).toHaveAttribute('tabindex', '0');
  await expect(buttons.nth(0)).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('End');
  await expect(page.locator('#today')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(buttons.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#today')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(buttons.nth(0)).toBeFocused();
  // Tab leaves the toolbar for the next control
  await page.keyboard.press('Tab');
  await expect(page.locator('input[name=mode]:checked')).toBeFocused();
});

test('clearing the boxes and setting a key time offer Undo, not a question', async ({ sized }) => {
  const page = await sized(390);
  await page.goto(`${DENSE}?look=a`);
  page.on('dialog', d => { throw new Error(`unexpected dialog: ${d.message()}`); });
  await page.locator('#clear-reading').click();
  await expect(page.getByRole('spinbutton', { name: /Core/ })).toHaveValue('');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('spinbutton', { name: /Core/ })).toHaveValue('36.6');
  const tile = page.locator('#times .kit-time').nth(5);
  await tile.click();
  await expect(tile).toHaveClass(/\bis-set\b/);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(tile).not.toHaveClass(/\bis-set\b/);
});

test('look B: the colour band stays one colour as the title scrolls under the bar', async ({ sized }) => {
  const page = await sized(390);
  await page.goto(`${DENSE}?look=b`);
  const bg = sel => page.locator(sel).evaluate(e => getComputedStyle(e).backgroundColor);
  const band = await bg('#page-title');
  expect(await bg('.ui-bar')).toBe(band);
  await page.mouse.wheel(0, 400);
  await expect(page.locator('.ui-bar')).toHaveClass(/\bis-collapsed\b/);
  expect(await bg('.ui-bar')).toBe(band);
});
