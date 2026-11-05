// The link preview: app/index.html's og tags point at the app's own address and the picture is there at 1200x630.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ogPage, ogFor, stamp, stampOf } from '../og-image.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { app } = JSON.parse(fs.readFileSync(path.join(ROOT, '.starter.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/public/manifest.webmanifest'), 'utf8'));
const html = fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf8');
const meta = (/** @type {string} */ name) => html.match(new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)"`))?.[1];

test('og tags: full addresses on the app host, a large card', () => {
  assert.equal(meta('og:image'), `https://${app.host}/icons/og.png`);
  assert.equal(meta('og:url'), `https://${app.host}/`);
  assert.equal(meta('og:title'), app.title);
  assert.ok(meta('og:description'));
  assert.equal(meta('twitter:card'), 'summary_large_image');
});

test('og.png is a 1200x630 PNG', () => {
  const png = fs.readFileSync(path.join(ROOT, 'app/public/icons/og.png'));
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
});

// a picture drawn for another app (the template's, brought in by an update) would show that app's card for every link
test('og.png is this app\'s own: drawn for its name and address', () => {
  const png = fs.readFileSync(path.join(ROOT, 'app/public/icons/og.png'));
  assert.equal(stampOf(png), ogFor({ title: manifest.name || app.title, host: app.host }),
    'app/public/icons/og.png was drawn for another name or address: run PW_CHROMIUM=/opt/pw-browsers/chromium node tools/og-image.mjs');
});

test('stamp: one text chunk, replaced on a second stamp, the picture kept', () => {
  const png = fs.readFileSync(path.join(ROOT, 'app/public/icons/og.png'));
  const twice = stamp(stamp(png, 'A | a.example'), 'B | b.example');
  assert.equal(stampOf(twice), 'B | b.example');
  assert.equal(twice.length, stamp(png, 'B | b.example').length);
  assert.equal(stampOf(Buffer.concat([png.subarray(0, 33), png.subarray(png.length - 12)])), '');   // header and IEND only
});

test('ogPage escapes the name', () => {
  assert.match(ogPage({ icon: '<svg/>', title: 'A & <b>', host: 'x.example', bg: '#000' }), /A &amp; &lt;b&gt;/);
});
