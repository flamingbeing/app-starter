// The /kit/ gallery: every @core/ui gesture part with a real (emulated) finger, at phone, tablet and laptop widths,
// signed out, made-up plants. The list of what is covered is docs/kit-tests.md.
import AxeBuilder from './axe.mjs';
import { test, expect } from './fixtures.mjs';

const KIT = '/app/kit/?edge=always';

// a finger, through the DevTools protocol (Playwright's own touchscreen only taps)
async function finger(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  return {
    down: (x, y) => send('touchStart', x, y),
    move: (x, y) => send('touchMove', x, y),
    up: () => send('touchEnd', 0, 0),
    /** a drag in steps, `ms` apart */
    async drag(x0, y0, x1, y1, { steps = 10, ms = 16 } = {}) {
      await send('touchStart', x0, y0);
      for (let i = 1; i <= steps; i++) {
        await send('touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps);
        await page.waitForTimeout(ms);
      }
      await send('touchEnd', 0, 0);
    },
  };
}
const centre = async loc => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
const depth = page => page.evaluate(() => window.kit.screens.depth());
const settled = page => page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));

for (const width of [390, 820, 1280]) {
  test.describe(`at ${width} px`, () => {
    test('loads clean (axe), every part started', async ({ sized }) => {
      const page = await sized(width);
      await page.goto(KIT);
      await expect.poll(() => page.evaluate(() => !!window.kit)).toBe(true);
      expect(await page.evaluate(() => ({ menus: !!kit.menus, title: !!kit.title, screens: !!kit.screens, sheets: kit.sheets.size, selects: kit.selects.size })))
        .toEqual({ menus: true, title: true, screens: true, sheets: 1, selects: 1 });
      expect(await AxeBuilder(page)).toEqual([]);
    });

    test('hold: 500 ms opens the menu, lifting does not open the row; a tap does; moving cancels', async ({ sized }) => {
      const page = await sized(width);
      await page.goto(KIT);
      const f = await finger(page);
      const row = page.locator('.ui-row', { hasText: 'Fern' });
      const { x, y } = await centre(row);
      await f.down(x, y);
      await page.waitForTimeout(250);
      await expect(page.locator('.ui-menu')).toHaveCount(0);   // not yet
      await page.waitForTimeout(400);
      await expect(page.locator('.ui-menu[role=menu]')).toBeVisible();
      await f.up();
      await page.waitForTimeout(200);
      expect(await depth(page)).toBe(0);   // the lift's click was swallowed
      await expect(page.locator('.ui-menu')).toBeFocused();
      expect(await AxeBuilder(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.locator('.ui-menu')).toHaveCount(0);

      await f.down(x, y);
      await f.move(x, y + 30);   // a scroll, not a hold
      await page.waitForTimeout(650);
      await f.up();
      await expect(page.locator('.ui-menu')).toHaveCount(0);

      await row.tap();
      await expect.poll(() => depth(page)).toBe(1);
      await expect(page.locator('#detail-title')).toHaveText('Fern');
    });

    test('right-click, the context-menu key and Shift+F10 open the same menu; keys move; Esc gives focus back', async ({ sized }) => {
      const page = await sized(width);
      await page.goto(KIT);
      const row = page.locator('.ui-row', { hasText: 'Jade' });
      await row.click({ button: 'right' });
      await expect(page.getByRole('menuitem', { name: 'Open' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.ui-menu')).toHaveCount(0);

      await row.focus();
      await page.keyboard.press('Shift+F10');
      await expect(page.getByRole('menuitem', { name: 'Open' })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('menuitem', { name: 'Select' })).toBeFocused();
      await page.keyboard.press('End');
      await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('menuitem', { name: 'Open' })).toBeFocused();   // wraps
      await page.keyboard.press('Escape');
      await expect(row).toBeFocused();

      await page.keyboard.press('ContextMenu');
      await expect(page.locator('.ui-menu')).toBeVisible();
      await page.keyboard.press('Escape');
    });

    test('a menu for a row near the bottom of the screen stays on screen', async ({ sized }) => {
      const page = await sized(width);
      await page.goto(KIT);
      const h = page.viewportSize().height;
      // a row scrolled to just above the bottom: a menu opened under it would run off the screen
      const row = page.locator('.ui-row').nth(11);
      await row.evaluate((e, h) => scrollBy(0, e.getBoundingClientRect().top - (h - 130)), h);
      expect((await row.boundingBox()).y).toBeGreaterThan(h - 300);
      await row.click({ button: 'right' });
      await settled(page);
      const m = await page.locator('.ui-menu').boundingBox();
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.y + m.height).toBeLessThanOrEqual(h);
      await page.keyboard.press('Escape');
    });

    test('Delete from the menu: gone, with a toast that puts it back (no "are you sure")', async ({ sized }) => {
      const page = await sized(width);
      await page.goto(KIT);
      await page.locator('.ui-row', { hasText: 'Mint' }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await expect(page.locator('#plants')).not.toContainText('Mint');
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
      await expect(page.locator('.ui-row').nth(5)).toContainText('Mint');   // back in its place
    });

    test('select mode: tap ticks, a drag down the ticks takes a range, the action bar replaces the tab bar', async ({ sized }) => {
      const page = await sized(width);
      await page.goto(KIT);
      await page.click('#select');
      await expect(page.locator('#plants')).toHaveAttribute('role', 'listbox');
      await expect(page.locator('.ui-action-bar')).toBeVisible();
      await expect(page.locator('.ui-tabbar')).toBeHidden();
      await expect(page.locator('#select')).toHaveText('Done');
      const rows = page.locator('.ui-row');
      await rows.nth(0).tap();
      await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('[data-select-count]')).toHaveText('1 selected');
      expect(await depth(page)).toBe(0);   // a tap ticks, it doesn't open

      // (rows 1–4 clear of the bottom edge, where a drag scrolls on: the look's title and list sizes move them)
      await rows.nth(1).evaluate(e => scrollBy(0, e.getBoundingClientRect().top - 160));
      const f = await finger(page);
      const list = await page.locator('#plants').boundingBox();
      const a = await centre(rows.nth(1)), b = await centre(rows.nth(4));
      await f.drag(list.x + 20, a.y, list.x + 20, b.y);
      for (const i of [1, 2, 3, 4]) await expect(rows.nth(i)).toHaveAttribute('aria-selected', 'true');
      await expect(rows.nth(5)).toHaveAttribute('aria-selected', 'false');
      await expect(page.locator('[data-select-count]')).toHaveText('5 selected');
      await expect(page.locator('#compare')).toBeDisabled();   // needs exactly 2
      await expect(page.locator('#delete-selected')).toBeEnabled();
      expect(await AxeBuilder(page)).toEqual([]);

      await page.keyboard.press('Escape');
      await expect(page.locator('#plants')).toHaveAttribute('role', 'list');
      await expect(page.locator('.ui-tabbar')).toBeVisible();
      await expect(page.locator('.ui-action-bar')).toBeHidden();
    });

    test('the hold menu\'s Select starts select mode with that row ticked; no hold menu while selecting', async ({ sized }) => {
      const page = await sized(width);
      await page.goto(KIT);
      const row = page.locator('.ui-row', { hasText: 'Orchid' });
      await row.click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Select' }).click();
      await expect(row).toHaveAttribute('aria-selected', 'true');
      const f = await finger(page);
      const { x, y } = await centre(row);
      await f.down(x, y);
      await page.waitForTimeout(650);
      await f.up();
      await expect(page.locator('.ui-menu')).toHaveCount(0);
    });

    test('sheet: opens at medium; dragged up to large, down to medium, down again to close; Back closes it', async ({ sized }) => {
      const page = await sized(width);
      await page.goto(KIT);
      const sheet = page.locator('#sheet');
      await page.click('#open-sheet');
      await expect(sheet).toHaveAttribute('data-detent', 'medium');
      await settled(page);
      expect(await AxeBuilder(page)).toEqual([]);
      const f = await finger(page);
      const g = await centre(page.locator('.ui-sheet-grabber'));
      await f.drag(g.x, g.y, g.x, g.y - 250);
      await expect(sheet).toHaveAttribute('data-detent', 'large');
      await settled(page);
      const g2 = await centre(page.locator('.ui-sheet-grabber'));
      await f.drag(g2.x, g2.y, g2.x, g2.y + 250);
      await expect(sheet).toHaveAttribute('data-detent', 'medium');
      await settled(page);
      if (width >= 840) {   // a centred dialog
        const b = await sheet.boundingBox();
        expect(Math.abs(b.x + b.width / 2 - width / 2)).toBeLessThan(2);
        expect(b.y).toBeGreaterThan(8);
      } else {
        const b = await sheet.boundingBox();
        expect(Math.round(b.y + b.height)).toBe(page.viewportSize().height);   // on the bottom edge
      }
      // the grabber from the keyboard
      await page.locator('.ui-sheet-grabber').focus();
      await page.keyboard.press('Enter');
      await expect(sheet).toHaveAttribute('data-detent', 'large');
      await page.keyboard.press('Enter');
      await expect(sheet).toHaveAttribute('data-detent', 'medium');
      // down to close (only the narrow sheet closes by dragging: the centred one changes height)
      if (width < 840) {
        await settled(page);
        const g3 = await centre(page.locator('.ui-sheet-grabber'));
        await f.drag(g3.x, g3.y, g3.x, g3.y + 300);
        await expect(sheet).toBeHidden();
        await expect(page.locator('#open-sheet')).toBeFocused();
        await page.click('#open-sheet');
      }
      await page.goBack();
      await expect(sheet).toBeHidden();
      await expect(page).toHaveURL(/\/app\/kit\//);
    });

    test('a field and a sideways scroller in the sheet keep the finger', async ({ sized }) => {
      const page = await sized(width);
      await page.goto(KIT);
      await page.click('#open-sheet');
      const sheet = page.locator('#sheet');
      await settled(page);
      const f = await finger(page);
      // the same drags from the body would take the sheet up (or close it)
      for (const from of ['.kit-chips button', '#sheet-name']) {
        const p = await centre(page.locator(from).first());
        await f.drag(p.x, p.y, p.x, p.y - 200);
        await expect(sheet).toHaveAttribute('data-detent', 'medium');
        expect(await centre(page.locator(from).first())).toEqual(p);   // nothing moved, the body didn't scroll
        await f.drag(p.x, p.y, p.x, p.y + 250);
        await expect(sheet).toBeVisible();
        await expect(sheet).toHaveAttribute('data-detent', 'medium');
      }
      // and from the body it does
      const body = await centre(page.locator('.ui-sheet-body p').first());
      await f.drag(body.x, body.y, body.x, body.y - 200);
      await expect(sheet).toHaveAttribute('data-detent', 'large');
    });

    test('screens: push, Back pops with focus back on the pusher; the edge swipe goes back; the tab bar stays put', async ({ sized }) => {
      const page = await sized(width);
      await page.goto(KIT);
      await page.click('#push');
      await expect.poll(() => depth(page)).toBe(1);
      await expect(page.locator('.ui-bar-title')).toHaveText('Details');
      await expect(page.locator('#select')).toBeHidden();
      await page.click('#push-more');
      await expect.poll(() => depth(page)).toBe(2);
      await page.goBack();
      await expect.poll(() => depth(page)).toBe(1);
      await expect(page.locator('#push-more')).toBeFocused();
      await settled(page);
      expect(await AxeBuilder(page)).toEqual([]);

      const tabs = await page.locator('.ui-tabbar').boundingBox();
      const f = await finger(page);
      const h = page.viewportSize().height;
      await f.down(4, h / 2);
      for (let x = 20; x <= 120; x += 20) { await f.move(x, h / 2 + 2); await page.waitForTimeout(16); }
      expect(await page.locator('#detail').evaluate(n => n.style.transform)).toMatch(/translateX\(1\d\dpx\)/);
      expect(await page.locator('.ui-tabbar').boundingBox()).toEqual(tabs);
      for (let x = 140; x <= width * 0.6; x += 40) { await f.move(x, h / 2 + 2); await page.waitForTimeout(16); }
      await f.up();
      await expect.poll(() => depth(page)).toBe(0);
      await expect(page.locator('#home')).toBeVisible();
      await expect(page.locator('#detail')).toBeHidden();
      await expect(page.locator('#push')).toBeFocused();

      // a short swipe springs back
      await page.click('#push');
      await expect.poll(() => depth(page)).toBe(1);
      await settled(page);
      await f.drag(4, h / 2, 60, h / 2 + 2, { steps: 4, ms: 60 });
      await settled(page);
      expect(await depth(page)).toBe(1);
      await expect(page.locator('#detail')).toBeVisible();
      await expect(page.locator('#home')).toBeHidden();
    });

    test('no edge swipe of its own where the phone has its own Back (Android, browsers)', async ({ sized }) => {
      const page = await sized(width);
      await page.goto('/app/kit/');
      await page.click('#push');
      await expect.poll(() => depth(page)).toBe(1);
      await settled(page);
      const f = await finger(page);
      const h = page.viewportSize().height;
      await f.down(4, h / 2);
      for (let x = 20; x <= 160; x += 20) { await f.move(x, h / 2 + 2); await page.waitForTimeout(16); }
      expect(await page.locator('#detail').evaluate(n => n.style.transform)).toBe('');   // the screen doesn't follow
      await expect(page.locator('.ui-swipe-shade')).toHaveCount(0);
      await f.up();
    });

    test('scrolling: the tab bar shrinks going down and comes back going up; the large title moves into the bar', async ({ sized }) => {
      const page = await sized(width);
      await page.goto(KIT);
      const bar = page.locator('.ui-bar'), tabs = page.locator('.ui-tabbar');
      await expect(bar).not.toHaveClass(/is-collapsed/);
      const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      expect(max).toBeGreaterThan(120);
      for (let y = 25; y <= max; y += 25) { await page.evaluate(v => scrollTo(0, v), y); await page.waitForTimeout(20); }
      await expect(tabs).toHaveClass(/is-minimised/);
      await expect(bar).toHaveClass(/is-collapsed/);
      await expect(tabs.getByRole('link', { name: 'Rooms' })).toBeHidden();
      for (let y = max; y >= max - 80; y -= 20) { await page.evaluate(v => scrollTo(0, v), y); await page.waitForTimeout(20); }
      await expect(tabs).not.toHaveClass(/is-minimised/);
      await page.evaluate(() => scrollTo(0, 0));
      await expect(bar).not.toHaveClass(/is-collapsed/);
    });

    test('Still (this device): no lift, no slide; the switch is off until picked and kept', async ({ sized }) => {
      const page = await sized(width);
      await page.goto(KIT);
      await expect(page.locator('#still')).not.toBeChecked();
      await page.check('#still');
      await expect(page.locator('html')).toHaveAttribute('data-motion', 'still');
      await page.locator('.ui-row').first().click({ button: 'right' });
      await page.waitForTimeout(100);
      await expect(page.locator('.ui-menu-preview')).not.toHaveClass(/is-lifted/);
      await page.keyboard.press('Escape');
      await page.click('#push');
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      await page.reload();
      await expect(page.locator('#still')).toBeChecked();
      await expect(page.locator('html')).toHaveAttribute('data-motion', 'still');
    });
  });
}

test('the phone\'s own Reduce Motion counts as Still', async ({ sized }) => {
  const page = await sized(390);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(KIT);
  await page.click('#push');
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test('a page without the markup is left alone', async ({ phone }) => {
  const page = await phone();
  await page.goto('/app/?emulator');
  await expect(page.locator('#signed-out')).toBeVisible();
  const r = await page.evaluate(async () => { const { startGestures } = await import('@core/ui'); const g = startGestures(); const out = { menus: g.menus, screens: g.screens, sheets: g.sheets.size }; g.stop(); return out; });
  expect(r).toEqual({ menus: null, screens: null, sheets: 0 });
  await expect(page.locator('.ui-menu-layer')).toHaveCount(0);
});

// an open sheet or hold menu holds the page still: a wheel (or finger) on the backdrop doesn't scroll what is behind it
for (const width of [390, 1280]) {
  test(`at ${width} px an open sheet or hold menu keeps the page behind it still`, async ({ sized }) => {
    const page = await sized(width);
    await page.goto(KIT);
    await expect.poll(() => page.evaluate(() => !!window.kit)).toBe(true);
    const wheel = async () => { await page.mouse.move(width / 2, 40); await page.mouse.wheel(0, 600); await page.waitForTimeout(300); return page.evaluate(() => scrollY); };
    await page.click('#open-sheet');
    await expect(page.locator('#sheet')).toHaveJSProperty('open', true);
    expect(await wheel()).toBe(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#sheet')).toHaveJSProperty('open', false);
    // the menu's lifted preview stays on its row
    const row = page.locator('#plants .ui-row').first();
    await row.click({ button: 'right' });
    await expect(page.locator('.ui-menu')).toBeVisible();
    await settled(page);
    expect(await wheel()).toBe(0);
    const [p, r] = await page.evaluate(() => ['.ui-menu-preview', '#plants .ui-row'].map(s => document.querySelector(s).getBoundingClientRect().top));
    expect(Math.abs(p - r)).toBeLessThan(2);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ui-menu')).toHaveCount(0);
    expect(await wheel()).toBeGreaterThan(0);   // closed: the page scrolls again
  });
}

// a phone with a home indicator (Chromium's safe-area override): sheets, the sheet menu and toasts clear it
test('at 390 px the sheet and the sheet menu clear the home indicator', async ({ sized }) => {
  const page = await sized(390);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34 } });
  await page.goto(`${KIT}&look=b`);   // look B: menus come up as a sheet
  await expect.poll(() => page.evaluate(() => !!window.kit)).toBe(true);
  await page.click('#open-sheet');
  await page.locator('#sheet .ui-sheet-grabber').click();   // full height: the body's end is on screen
  await settled(page);
  const bodyEnd = await page.evaluate(() => { const b = document.querySelector('#sheet .ui-sheet-body'); b.scrollTop = b.scrollHeight;
    const last = b.lastElementChild.getBoundingClientRect().bottom; return innerHeight - last; });
  expect(bodyEnd).toBeGreaterThanOrEqual(34);
  await page.keyboard.press('Escape');
  await page.locator('#plants .ui-row').first().click({ button: 'right' });
  await expect(page.locator('.ui-menu.is-sheet')).toBeVisible();
  await settled(page);
  expect(await page.evaluate(() => innerHeight - document.querySelector('.ui-menu').getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(34);
});

test('at 390 px a toast clears the home indicator on a page without a tab bar', async ({ sized }) => {
  const page = await sized(390);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34 } });
  await page.goto('/app/?emulator');
  await expect(page.locator('#signed-out')).toBeVisible();
  await page.evaluate(async () => { const { toaster } = await import('@core/ui'); toaster(document.body).show('Saved'); });
  const toast = page.locator('.toast', { hasText: 'Saved' });
  await expect(toast).toBeVisible();
  await settled(page);
  const box = await toast.boundingBox();
  expect(844 - (box.y + box.height)).toBeGreaterThanOrEqual(34 + 16);
});
