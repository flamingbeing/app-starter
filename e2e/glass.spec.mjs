// @core/theme glass + motion: glass bars, toasts and sheets by default, Solid per device (kept, and put back before
// the modules run), solid where the device asks for less transparency or more contrast, axe on glass, the screen
// switch as a view transition. Screenshots of the sample in light, dark, OLED and Solid go to test-results/ for the PR.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, add, APP } from './fixtures.mjs';

/** @param {import('@playwright/test').Page} page @param {string} sel @param {string} prop */
const style = (page, sel, prop) => page.locator(sel).first().evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop);
// the card colour as the browser draws it (the bar's solid background compares against it)
const surface = page => page.evaluate(() => {
  const probe = document.createElement('div');
  probe.style.color = 'var(--surface)';
  document.body.append(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
});

test('glass by default; Solid in the switch takes it off, kept on reload and before the modules run', async ({ phone }) => {
  const page = await phone();
  await page.goto(APP);
  const root = page.locator('html');
  await expect(root).toHaveClass(/\bglass\b/);
  expect(await style(page, '.bar', 'backdrop-filter')).toContain('blur');
  expect(await style(page, '.bar', 'background-color')).toMatch(/color\(srgb .* \/ 0\.\d+\)|rgba\(/);   // see-through

  await page.getByLabel('Bars and sheets').selectOption('solid');
  await expect(root).not.toHaveClass(/\bglass\b/);
  expect(await style(page, '.bar', 'backdrop-filter')).toBe('none');
  await page.reload();
  await expect(root).not.toHaveClass(/\bglass\b/);
  await expect(page.getByLabel('Bars and sheets')).toHaveValue('solid');

  // (early.js takes the class off before any module runs: shown with the theme modules kept from loading)
  await page.route('**/theme/index.js', route => route.abort());
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await expect(root).not.toHaveClass(/\bglass\b/);
  await page.unroute('**/theme/index.js');
  await page.goto(APP);

  await page.getByLabel('Bars and sheets').selectOption('glass');
  await expect(root).toHaveClass(/\bglass\b/);
});

// (Playwright can't emulate prefers-reduced-transparency; glass.css turns glass down for it in the same query)
test('asked for more contrast: solid card colour, no blur', async ({ phone }) => {
  const page = await phone();
  await page.emulateMedia({ contrast: 'more' });
  await page.goto(APP);
  await expect(page.locator('html')).toHaveClass(/\bglass\b/);
  expect(await style(page, '.bar', 'backdrop-filter')).toBe('none');
  expect(await style(page, '.bar', 'background-color')).toBe(await surface(page));
});

// (the springs finished, so axe and the screenshots see the parts at rest, not mid fade-in)
const settled = page => page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished)));

const MODES = [
  ['light', { theme: 'light', dark: 'dark', material: 'glass' }],
  ['dark', { theme: 'dark', dark: 'dark', material: 'glass' }],
  ['oled', { theme: 'dark', dark: 'oled', material: 'glass' }],
  ['solid', { theme: 'light', dark: 'dark', material: 'solid' }],
];

test('the sample in light, dark, OLED and Solid: axe on the bar, a toast and a sheet; screenshots kept', async ({ phone }, info) => {
  const page = await phone();
  await signIn(page, 'member');
  // (the list is shared and kept between runs: a run tag keeps this run's names unique under --repeat-each)
  const run = Math.random().toString(36).slice(2, 6);
  for (let i = 1; i <= 14; i++) await page.evaluate(t => window.starter.add(t), `Sample item ${i} ${run}`);
  // (other tests add to the same list in parallel: wait for this test's last item, not a total)
  await expect(page.getByRole('button', { name: `Sample item 14 ${run}`, exact: true })).toBeVisible();
  for (const [name, pick] of MODES) {
    await page.getByLabel('Theme').selectOption(pick.theme);
    await page.getByLabel('Dark style').selectOption(pick.dark);
    await page.getByLabel('Bars and sheets').selectOption(pick.material);
    // (dismiss the last mode's toast first: its 4 s timer would otherwise end mid-check and move this one under axe)
    await page.evaluate(() => document.querySelectorAll('.toast button').forEach(b => /** @type {HTMLElement} */ (b).click()));
    await expect(page.locator('.toast')).toHaveCount(0);
    await add(page, `Toast for ${name} ${run}`);
    await expect(page.locator('.toast').last()).toBeVisible();
    await page.evaluate(() => scrollTo(0, 260));   // (content under the bar, so the scroll edge and the glass show)
    await settled(page);
    expect(await AxeBuilder(page), `${name}: page with a toast`).toEqual([]);
    await page.screenshot({ path: info.outputPath(`glass-${name}.png`) });

    await page.getByRole('button', { name: `Sample item 3 ${run}`, exact: true }).click();
    await expect(page.locator('#edit')).toBeVisible();
    await settled(page);
    expect(await AxeBuilder(page), `${name}: the item sheet`).toEqual([]);
    await page.screenshot({ path: info.outputPath(`glass-${name}-sheet.png`) });
    await page.locator('#edit').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#edit')).toBeHidden();
  }
});

test('a change of screen is a view transition, unless motion is reduced', async ({ phone }) => {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const page = await phone();
    await page.emulateMedia({ reducedMotion });
    await page.addInitScript(() => {
      window.__vt = 0;
      const start = document.startViewTransition?.bind(document);
      if (start) document.startViewTransition = cb => { window.__vt++; return start(cb); };
    });
    await signIn(page, null);   // signed out -> no access: one change of screen
    const n = await page.evaluate(() => window.__vt);
    if (reducedMotion === 'reduce') expect(n).toBe(0);
    else expect(n).toBeGreaterThan(0);
  }
});
