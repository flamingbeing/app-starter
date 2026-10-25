// @core/ui's modal focus trap (the pure part) and the default words. node --test app/test/ui-parts.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapIndex } from '../public/ui/modal.js';
import { LABELS } from '../public/ui/labels.js';

test('Tab moves on and wraps at the last control', () => {
  assert.equal(wrapIndex(3, 0, false), 1);
  assert.equal(wrapIndex(3, 2, false), 0);
});

test('Shift+Tab moves back and wraps at the first control', () => {
  assert.equal(wrapIndex(3, 2, true), 1);
  assert.equal(wrapIndex(3, 0, true), 2);
});

test('focus outside the dialog comes in at the first control; nothing focusable gives -1', () => {
  assert.equal(wrapIndex(3, -1, false), 0);
  assert.equal(wrapIndex(3, -1, true), 2);
  assert.equal(wrapIndex(0, -1, false), -1);
});

test('the modal and toast words have defaults', () => {
  for (const k of ['ok', 'cancel', 'dismiss']) assert.ok(LABELS[k]);
});
