// @core/ui gestures' pure parts: where a hold menu goes, where a sheet settles, when the tab bar shrinks, what a drag
// down the ticks selects, when an edge swipe goes back, and when the swipe is on at all.
// node --test app/test/gestures.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { HOLD_MS, SLOP, velocity, still, haptic } from '../public/ui/gesture.js';
import { placeMenu } from '../public/ui/hold-menu.js';
import { settle, topDetent } from '../public/ui/detent-sheet.js';
import { tabBarStep } from '../public/ui/tab-bar.js';
import { dragRange, needs, TICKS } from '../public/ui/select-mode.js';
import { swipeGoesBack, edgeBackOn, EDGE } from '../public/ui/screens.js';

test('the port rules: hold 500 ms within 10 px; ticks and screen edge are finger-sized', () => {
  assert.equal(HOLD_MS, 500);
  assert.equal(SLOP, 10);
  assert.ok(TICKS >= 44);
  assert.ok(EDGE >= 16 && EDGE <= 32);
});

test('velocity: px per ms from first to last sample; one sample is still', () => {
  assert.equal(velocity([[0, 0], [100, 50]]), 0.5);
  assert.equal(velocity([[0, 10]]), 0);
  assert.equal(velocity([[5, 0], [5, 20]]), 20, 'same timestamp: no divide by zero');
});

test('no DOM (node): still() is false and haptic() does nothing', () => {
  assert.equal(still(), false);
  assert.doesNotThrow(() => haptic());
});

const view = { w: 390, h: 844 };
const menu = { w: 220, h: 200 };
const rect = (top, height = 60, left = 16, width = 358) => ({ top, bottom: top + height, left, width, height, right: left + width });

test('hold menu: below the row when it fits', () => {
  const p = placeMenu(rect(100), menu, view);
  assert.equal(p.top, 170);
  assert.equal(p.previewTop, 100);
  assert.equal(p.below, true);
  assert.equal(p.left, 16);
});

test('hold menu: above the row near the bottom', () => {
  const p = placeMenu(rect(700), menu, view);
  assert.equal(p.top, 700 - 10 - 200);
  assert.equal(p.previewTop, 700);
  assert.equal(p.below, false);
});

test('hold menu: no room either side moves the preview up so both fit', () => {
  const tall = { w: 220, h: 700 };
  const p = placeMenu(rect(100), tall, view);
  assert.ok(p.previewTop >= 16);
  assert.ok(p.top + tall.h <= view.h - 16 + 0.01);
  assert.equal(p.below, true);
});

test('hold menu: centred on a right-click, kept 16 px inside the screen', () => {
  assert.equal(placeMenu(rect(100), menu, view, { x: 200, y: 120 }).left, 90);
  assert.equal(placeMenu(rect(100), menu, view, { x: 380, y: 120 }).left, 390 - 16 - 220);
  assert.equal(placeMenu(rect(100), menu, view, { x: 10, y: 120 }).left, 16);
});

test('sheet: the top detent is large when there is one', () => {
  assert.equal(topDetent(['medium', 'large']), 'large');
  assert.equal(topDetent(['medium']), 'medium');
});

test('sheet: small moves stay; up goes to the top; down steps down, then closes', () => {
  const ds = ['medium', 'large'];
  assert.equal(settle(ds, 'medium', 30, 0), 'medium');
  assert.equal(settle(ds, 'medium', -100, 0), 'large');
  assert.equal(settle(ds, 'large', 200, 0), 'medium');
  assert.equal(settle(ds, 'medium', 200, 0), 'close');
  assert.equal(settle(['medium'], 'medium', 200, 0), 'close');
});

test('sheet: a flick counts as where it would carry the sheet', () => {
  const ds = ['medium', 'large'];
  assert.equal(settle(ds, 'medium', -20, -0.5), 'large');
  assert.equal(settle(ds, 'large', 40, 0.6), 'medium');
  assert.equal(settle(ds, 'medium', 10, 0.1), 'medium');
});

test('tab bar: shrinks after 40 px down, grows after 24 px up or near the top', () => {
  let s = { acc: 0, small: false };
  s = tabBarStep(s, 200, 30); assert.equal(s.small, false);
  s = tabBarStep(s, 230, 20); assert.equal(s.small, true);
  s = tabBarStep(s, 220, -10); assert.equal(s.small, true, 'a small wobble up keeps it small');
  s = tabBarStep(s, 190, -30); assert.equal(s.small, false);
  assert.equal(tabBarStep({ acc: 100, small: true }, 20, 5).small, false, 'near the top it is always full');
});

test('select drag: the range takes the new tick, rows outside go back to how they were', () => {
  const snap = [false, true, false, false, true];
  assert.deepEqual(dragRange(snap, 1, 3, true), [false, true, true, true, true]);
  assert.deepEqual(dragRange(snap, 3, 0, false), [false, false, false, false, true]);
  assert.deepEqual(dragRange(snap, 2, 2, true), [false, true, true, false, true]);
});

test('action bar: data-needs ranges', () => {
  assert.deepEqual(needs('1'), [1, 99]);
  assert.deepEqual(needs('2-4'), [2, 4]);
  assert.deepEqual(needs('2-2'), [2, 2]);
});

test('edge swipe: past a third of the width, or a flick past 40 px', () => {
  assert.equal(swipeGoesBack(140, 0, 390), true);
  assert.equal(swipeGoesBack(100, 0.2, 390), false);
  assert.equal(swipeGoesBack(50, 0.8, 390), true);
  assert.equal(swipeGoesBack(30, 2, 390), false);
});

test('edge swipe is on only in the iPhone home-screen app (or when forced for tests)', () => {
  const iphone = /** @type {any} */ ({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 });
  const ipad = /** @type {any} */ ({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 });
  const android = /** @type {any} */ ({ userAgent: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux', maxTouchPoints: 5 });
  const standalone = () => true, browser = () => false;
  assert.equal(edgeBackOn(iphone, standalone, null), true);
  assert.equal(edgeBackOn(ipad, standalone, null), true);
  assert.equal(edgeBackOn(iphone, browser, null), false, 'Safari has its own swipe');
  assert.equal(edgeBackOn(android, standalone, null), false, 'Android has a system Back');
  assert.equal(edgeBackOn(android, browser, 'always'), true);
  assert.equal(edgeBackOn(iphone, standalone, 'off'), false);
});
