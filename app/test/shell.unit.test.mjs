// @core/ui's shell: the size classes and the search match (the pure parts). node --test app/test/shell.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { sizeClass, matchesSearch, TABLET_MIN, LAPTOP_MIN } from '../public/ui/shell/shell.js';

test('size classes change at 600 and 840 px', () => {
  assert.equal(sizeClass(390), 'phone');
  assert.equal(sizeClass(TABLET_MIN - 1), 'phone');
  assert.equal(sizeClass(TABLET_MIN), 'tablet');
  assert.equal(sizeClass(LAPTOP_MIN - 1), 'tablet');
  assert.equal(sizeClass(LAPTOP_MIN), 'laptop');
  assert.equal(sizeClass(1920), 'laptop');
});

test('search matches every word, in any case and order', () => {
  assert.equal(matchesSearch('Lavender Balcony · full sun', 'balcony'), true);
  assert.equal(matchesSearch('Lavender Balcony · full sun', 'SUN lav'), true);
  assert.equal(matchesSearch('Lavender Balcony · full sun', 'balcony shade'), false);
  assert.equal(matchesSearch('anything', '   '), true);
});
