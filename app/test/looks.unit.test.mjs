// @core/theme's looks (looks.js: token sets + variants, data only) and the glass guard's verdict (guard.js).
// node --test app/test/looks.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOKS, LOOK_IDS, VARIANTS, DEFAULT_LOOK, lookOf } from '../public/theme/looks.js';
import { verdict, median, MEMORY_FLOOR, SLOW_FRAME_MS, PROBE_FRAMES } from '../public/theme/guard.js';
import { placeSheetMenu } from '../public/ui/hold-menu.js';

test('every look: a unique id, a name, every variant picked from VARIANTS, the same token keys', () => {
  assert.deepEqual(LOOK_IDS, ['a', 'b', 'c']);
  assert.equal(new Set(LOOK_IDS).size, LOOKS.length);
  const keys = Object.keys(LOOKS[0].tokens).sort();
  for (const look of LOOKS) {
    assert.ok(look.name && look.desc, look.id);
    assert.deepEqual(Object.keys(look.variants).sort(), Object.keys(VARIANTS).sort(), `${look.id}: every variant named`);
    for (const [k, v] of Object.entries(look.variants)) assert.ok(/** @type {Record<string, string[]>} */ (VARIANTS)[k].includes(v), `${look.id} ${k}=${v}`);
    assert.deepEqual(Object.keys(look.tokens).sort(), keys, `${look.id}: the same tokens as ${LOOKS[0].id}`);
    for (const [k, v] of Object.entries(look.tokens)) assert.match(`${k}: ${v}`, /^[a-z-]+: [^;{}<>]+$/, `${look.id} ${k}: one plain value`);
  }
});

test('the look shown: the picked one, else the app\'s, else A', () => {
  assert.equal(DEFAULT_LOOK, 'a');
  assert.equal(lookOf('b').id, 'b');
  assert.equal(lookOf('', 'c').id, 'c');
  assert.equal(lookOf('b', 'c').id, 'b');
  assert.equal(lookOf('zz', 'yy').id, 'a');
  assert.equal(lookOf().id, 'a');
});

test('the looks differ where the canvas does: A glass + floating tab bar, B a band + sheets, C glass on pills only', () => {
  const [a, b, c] = LOOKS;
  assert.deepEqual([a.variants.glass, b.variants.glass, c.variants.glass], ['bars', 'none', 'pill']);
  assert.equal(b.variants.header, 'band');
  assert.equal(b.variants.menu, 'sheet');
  assert.equal(b.variants.tick, 'square');
  assert.equal(a.variants.tabbar, 'float');
  assert.equal(c.tokens['card-r'], '0', 'C: flush lists');
});

test('glass guard: little memory turns glass down at once; slow frames on the first scroll do; fast ones keep it', () => {
  assert.equal(MEMORY_FLOOR, 4);
  assert.deepEqual(verdict({ memory: 2 }), { solid: true, why: 'memory' });
  assert.deepEqual(verdict({ memory: 4 }), { solid: true, why: 'memory' });
  assert.equal(verdict({ memory: 8 }), null, 'plenty of memory proves nothing: wait for the probe');
  assert.equal(verdict({}), null);
  assert.equal(verdict({ frames: [30, 30] }), null, 'too few frames: no verdict');
  const slow = Array(PROBE_FRAMES).fill(SLOW_FRAME_MS + 8), fast = Array(PROBE_FRAMES).fill(16.7);
  assert.deepEqual(verdict({ memory: 8, frames: slow }), { solid: true, why: 'frames' });
  assert.deepEqual(verdict({ memory: 8, frames: fast }), { solid: false, why: '' });
  // one long frame (a scroll that started a decode) does not decide it: the median does
  assert.deepEqual(verdict({ frames: [...fast.slice(1), 400] }), { solid: false, why: '' });
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), 0);
});

test('a sheet menu sits on the bottom edge; the preview moves up only when the sheet would cover it', () => {
  const view = { h: 800 }, menu = { h: 300 };
  assert.deepEqual(placeSheetMenu({ top: 100, height: 60 }, menu, view), { top: 492, previewTop: 100 });
  assert.deepEqual(placeSheetMenu({ top: 600, height: 60 }, menu, view), { top: 492, previewTop: 422 });
  assert.equal(placeSheetMenu({ top: 600, height: 60 }, { h: 760 }, view).previewTop, 8, 'never above the screen');
});
