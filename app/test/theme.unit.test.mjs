// @core/theme's pure part (theme/choice.js): what a stored choice means. node --test app/test/theme.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChoice, chooseTheme, themeChoice, THEMES, LAYOUTS } from '../public/theme/choice.js';

test('nothing stored: the defaults, so new options stay off until picked', () => {
  assert.deepEqual(parseChoice(null), { theme: 'auto', layout: 'comfortable' });
  assert.equal(THEMES[0], 'auto');
  assert.equal(LAYOUTS[0], 'comfortable');
});

test('a stored choice is kept', () => {
  assert.deepEqual(parseChoice('{"theme":"dark","layout":"compact"}'), { theme: 'dark', layout: 'compact' });
  assert.deepEqual(parseChoice('{"theme":"light"}'), { theme: 'light', layout: 'comfortable' });
});

test('unknown values or unreadable storage: the defaults', () => {
  assert.deepEqual(parseChoice('{"theme":"neon","layout":7}'), { theme: 'auto', layout: 'comfortable' });
  assert.deepEqual(parseChoice('not json'), { theme: 'auto', layout: 'comfortable' });
  assert.deepEqual(parseChoice('null'), { theme: 'auto', layout: 'comfortable' });
});

test('storage refused: picks on this page still build on each other', () => {
  const refuse = () => { throw new Error('storage refused'); };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: refuse, setItem: refuse } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { dataset: {} } } });
  chooseTheme({ theme: 'dark' });
  chooseTheme({ layout: 'compact' });
  assert.deepEqual(themeChoice(), { theme: 'dark', layout: 'compact' });
  assert.deepEqual(document.documentElement.dataset, { theme: 'dark', layout: 'compact' });
});
