// A cheap Android phone, as far as a desktop browser can stand in for one: Chromium with the memory figure a cheap
// phone reports (2 GB), and, with no memory figure, a main thread that is slow on every frame. Either way the glass
// guard must turn bars and sheets Solid on its own; then scrolling with Solid is timed and the median frame is
// attached to the report. A real phone is still the proof (docs/ui-kit-progress.md, "Cheap-Android check").
import { test, expect } from './fixtures.mjs';

const KIT = '/app/kit/?edge=always';
const VERDICT = page => page.evaluate(() => JSON.parse(localStorage.getItem('core-glass-guard') || 'null'));

/** @param {import('@playwright/test').Page} page  scroll the gallery by touch-sized wheel steps, return the gaps (ms) between frames */
async function scrollGaps(page) {
  await page.evaluate(() => {
    window.__gaps = [];
    let last = 0;
    const tick = t => { if (last) window.__gaps.push(t - last); last = t; window.__raf = requestAnimationFrame(tick); };
    window.__raf = requestAnimationFrame(tick);
  });
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(40); }
  return page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__gaps; });
}
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };

test('cheap Android: 2 GB turns glass down at once; slow frames turn it down on the first scroll; both stay Solid and scroll', async ({ browser }, info) => {
  // (their own contexts: the fixtures' seed says the device is fast)
  const make = async init => {
    const context = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
    await context.addInitScript(init);
    return { context, page: await context.newPage() };
  };

  const mem = await make(() => Object.defineProperty(Navigator.prototype, 'deviceMemory', { configurable: true, get: () => 2 }));
  await mem.page.goto(KIT);
  await expect(mem.page.locator('html')).not.toHaveClass(/\bglass\b/);
  expect(await VERDICT(mem.page)).toEqual({ solid: true, why: 'memory' });
  const solidGaps = await scrollGaps(mem.page);
  info.annotations.push({ type: 'solid scroll median frame (ms)', description: String(median(solidGaps).toFixed(1)) });
  expect(solidGaps.length, 'frames seen while scrolling').toBeGreaterThan(10);
  await expect(mem.page.locator('html')).not.toHaveClass(/\bglass\b/);
  await mem.context.close();

  // no memory figure (Firefox, Safari, or Chromium hiding it): 30 ms of work per frame, as an old GPU-bound phone shows
  const slow = await make(() => {
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { configurable: true, get: () => undefined });
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(t => { const end = performance.now() + 30; while (performance.now() < end); cb(t); });
  });
  await slow.page.goto(KIT);
  await expect(slow.page.locator('html')).toHaveClass(/\bglass\b/);
  expect(await VERDICT(slow.page)).toBeNull();
  for (let i = 0; i < 30; i++) { await slow.page.mouse.wheel(0, 100); await slow.page.waitForTimeout(40); }
  await expect.poll(() => VERDICT(slow.page)).toEqual({ solid: true, why: 'frames' });
  await expect(slow.page.locator('html')).not.toHaveClass(/\bglass\b/);
  await slow.page.reload();
  await expect(slow.page.locator('html')).not.toHaveClass(/\bglass\b/);   // kept on this device
  await slow.context.close();
});
