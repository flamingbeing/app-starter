// The layout parts' pure step (ui/layout.js) and the extra-dense floor (ui/layout.css). node --test app/test/layout.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stepValue } from '../public/ui/layout.js';

test('a step stays in min/max and keeps the step\'s decimals', () => {
  assert.equal(stepValue('36.6', 1, { step: 0.1 }), '36.7');
  assert.equal(stepValue('0.2', 1, { step: 0.1 }), '0.3');
  assert.equal(stepValue('41.95', 1, { step: 0.1, max: 42 }), '42.0');
  assert.equal(stepValue('220', 1, { step: 1, min: 20, max: 220 }), '220');
  assert.equal(stepValue('20', -1, { step: 1, min: 20, max: 220 }), '20');
  assert.equal(stepValue('21', 1, { step: 0.5 }), '21.5');
});

test('an empty or unreadable box starts at its start value, else at 0 kept in range', () => {
  assert.equal(stepValue('', 1, { step: 0.5, start: 21 }), '21.0');
  assert.equal(stepValue('', -1, { step: 0.1, start: 36.5 }), '36.5');
  assert.equal(stepValue('', 1, { min: 20, max: 220 }), '20');
  assert.equal(stepValue('abc', -1, {}), '0');
});

test('extra-dense never takes a target under 24 px', () => {
  const css = fs.readFileSync(new URL('../public/ui/layout.css', import.meta.url), 'utf8');
  const sizes = [...css.matchAll(/--(?:tap|tap-s|row):\s*(\d+)px/g)].map(m => Number(m[1]));
  assert.ok(sizes.length >= 6, 'extra-dense sets its sizes in px');
  for (const px of sizes) assert.ok(px >= 24, `${px}px is under the 24 px floor`);
});
