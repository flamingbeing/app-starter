// The link preview: app/index.html's og tags point at the app's own address and the picture is there at 1200x630.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ogPage } from '../og-image.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { app } = JSON.parse(fs.readFileSync(path.join(ROOT, '.starter.json'), 'utf8'));
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

test('ogPage escapes the name', () => {
  assert.match(ogPage({ icon: '<svg/>', title: 'A & <b>', host: 'x.example', bg: '#000' }), /A &amp; &lt;b&gt;/);
});
