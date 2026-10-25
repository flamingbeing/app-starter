// tools/fill.mjs on a scratch copy of this repo. node --test tools/test/fill.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fill, parseArgs } from '../fill.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP = new Set(['.git', 'node_modules', '.devkit', 'test-results', 'playwright-report']);
function copy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fill-'));
  fs.cpSync(ROOT, dir, { recursive: true, filter: src => !SKIP.has(path.basename(src)) });
  return dir;
}
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
const ARGS = { name: 'pet-log', host: 'pets.example.org', kit: 'nuhs', project: 'pet-log-app' };

test('fills name, host, kit and project everywhere', () => {
  const dir = copy();
  const { changed } = fill({ dir, ...ARGS });
  assert.ok(changed.includes('app/config.js') && changed.includes('wrangler.jsonc') && changed.includes('worker/routes.js'));
  assert.match(read(dir, 'worker/routes.js'), /'pets\.example\.org': \{ root: 'app\/' \}/);
  const w = read(dir, 'wrangler.jsonc');
  assert.match(w, /"name": "pet-log"/);
  assert.match(w, /"FIREBASE_PROJECT": "pet-log-app"/);
  assert.match(w, /"pattern": "pets\.example\.org"/);
  const cfg = read(dir, 'app/config.js');
  assert.match(cfg, /"projectId": "pet-log-app"/);
  assert.match(cfg, /"authDomain": "pets\.example\.org"/);
  assert.match(cfg, /KIT = 'https:\/\/design\.anawj\.com\/v1\/'/);
  assert.match(read(dir, 'app/index.html'), /<title>Pet log<\/title>[\s\S]*https:\/\/design\.anawj\.com\/v1\/tokens\.css/);
  assert.match(read(dir, 'worker/headers.js'), /KIT = 'https:\/\/design\.anawj\.com'/);
  // the emulator project follows the name, and stays a demo- one
  assert.match(read(dir, 'playwright.config.mjs'), /demo-pet-log/);
  assert.match(read(dir, 'app/test/rules.test.mjs'), /project: 'demo-pet-log'/);
  for (const f of ['app/index.html', 'app/sw.js', 'worker/routes.js', 'wrangler.jsonc', 'package.json'])
    assert.doesNotMatch(read(dir, f), /starter-app|app\.example\.com|design\.flamingbeing\.com/, f);
  assert.deepEqual(JSON.parse(read(dir, '.starter.json')).app, { ...ARGS, title: 'Pet log' });
  for (const f of ['worker/claims.js', 'worker/custom-token.js']) assert.equal(read(dir, f), read(ROOT, f), `${f} is app-devkit's`);
});

test('running it again changes nothing; --check says so', () => {
  const dir = copy();
  fill({ dir, ...ARGS });
  assert.deepEqual(fill({ dir, ...ARGS, check: true }).changed, []);
  assert.deepEqual(fill({ dir, ...ARGS }).changed, []);
});

test('the web config adds apiKey and appId, and is kept on a re-run', () => {
  const dir = copy();
  const web = path.join(dir, 'web.json');
  fs.writeFileSync(web, JSON.stringify({ sdkConfig: { projectId: 'pet-log-app', apiKey: 'AIzaFAKE', appId: '1:2:web:3', authDomain: 'pet-log-app.firebaseapp.com' } }));
  fill({ dir, ...ARGS, 'web-config': web });
  const cfg = read(dir, 'app/config.js');
  assert.match(cfg, /"apiKey": "AIzaFAKE"/);
  assert.match(cfg, /"authDomain": "pets\.example\.org"/, 'sign-in stays on the app address');
  fill({ dir, ...ARGS, title: 'Pets' });
  assert.match(read(dir, 'app/config.js'), /"apiKey": "AIzaFAKE"/);
  assert.match(read(dir, 'app/index.html'), /<title>Pets<\/title>/);
});

test('a web config for another project is refused', () => {
  const dir = copy();
  const web = path.join(dir, 'web.json');
  fs.writeFileSync(web, JSON.stringify({ projectId: 'other-project', apiKey: 'x', appId: 'y' }));
  assert.throws(() => fill({ dir, ...ARGS, 'web-config': web }), /for project other-project/);
});

test('bad values are refused before anything changes', () => {
  const dir = copy();
  assert.throws(() => fill({ dir, ...ARGS, name: 'Bad Name' }), /--name/);
  assert.throws(() => fill({ dir, ...ARGS, host: 'not a host' }), /--host/);
  assert.throws(() => fill({ dir, ...ARGS, kit: 'other' }), /--kit/);
  assert.throws(() => fill({ dir, ...ARGS, title: '<b>' }), /--title/);
  assert.equal(read(dir, 'app/config.js'), read(ROOT, 'app/config.js'));
});

test('arguments', () => {
  assert.deepEqual(parseArgs(['--name', 'a', '--check']), { name: 'a', check: true });
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
});
