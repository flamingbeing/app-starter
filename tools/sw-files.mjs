// The service worker's file list (SHELL in sw.js), generated: never edit it by hand. It holds
//   - the page ('./') and every file of the app folder the page can load: src/ (or a build's assets/), and public/ as
//     served at the folder's root (vendored Firebase included); never tests, rules, types or sw.js itself
//   - every file each @core/* entry in the page's import map loads: the entry and its static imports, read from the
//     app-sync package at the same version (node_modules/app-sync, the devDependency; the version must match)
//   - any other https:// address in the import map, as it is (app-update's register.js)
// The same command lists a Vite build (dist/): the port to Vite changes only the folder this runs on.
//   node tools/sw-files.mjs <dir> [--sw sw.js] [--sync <app-sync dir>]   write SHELL into <dir>'s sw.js
//   node tools/sw-files.mjs <dir> --check                                fail if SHELL is out of date (CI)
// Then the deploy stamps VERSION and MANIFEST (tools/stamp-versions.mjs), as before.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SYNC = /^https:\/\/core\.anawj\.com\/sync\/(\d+\.\d+\.\d+[^/]*)\/(.+)$/;
// files in the app folder that are never served to the page (the Worker's .assetsignore leaves them out too)
const SKIP = [/(^|\/)\./, /^test\//, /\.rules$/, /^firebase\.json$/, /\.d\.ts$/, /(^|\/)sw\.js$/, /\.(map|log)$/];

const posix = p => p.split(path.sep).join('/');
function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(dir, r)); else out.push(r);
  }
  return out;
}

// the page's import map -> { name: address }
export function importMap(html) {
  const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]).imports || {} : {};
}

// relative static imports of one file (comments dropped, so JSDoc `import('./types.js')` never counts)
function importsOf(src, file) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
  const out = [];
  for (const m of code.matchAll(/(?:^|[;\s}])(?:import|export)\s*(?:[\w*{}\s,$]*?\sfrom\s*)?['"]([^'"]+)['"]/g)) {
    if (!m[1].startsWith('.')) throw new Error(`${file} imports '${m[1]}': only relative imports can be listed`);
    out.push(m[1]);
  }
  return out;
}

// the entry and everything it imports, depth first, each once -> paths inside the app-sync package
function graph(sync, entry, seen) {
  if (seen.has(entry)) return [];
  seen.add(entry);
  const file = path.join(sync, entry);
  if (!fs.existsSync(file)) throw new Error(`app-sync has no ${entry} (in ${sync})`);
  const out = [entry];
  for (const imp of importsOf(fs.readFileSync(file, 'utf8'), entry)) out.push(...graph(sync, path.posix.join(path.posix.dirname(entry), imp), seen));
  return out;
}

// -> the SHELL list for app folder <dir> (sync: the app-sync package; defaults to the devDependency)
export function shellFiles({ dir, sync = path.join(ROOT, 'node_modules/app-sync') }) {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const own = walk(dir).filter(f => f !== 'index.html' && !SKIP.some(re => re.test(f))).map(f => f.replace(/^public\//, '')).sort();
  const map = Object.values(importMap(html));
  for (const u of map) {
    if (/^(\.\/|\/|[^:]+$)/.test(u) && !own.includes(u.replace(/^\.?\//, ''))) throw new Error(`the import map names ${u}, but ${dir} has no such file`);
  }
  const other = map.filter(u => /^https?:\/\//.test(u) && !SYNC.test(u)).sort();
  const core = [], seen = new Set();
  const entries = map.filter(u => SYNC.test(u));
  if (entries.length) {
    const have = JSON.parse(fs.readFileSync(path.join(sync, 'package.json'), 'utf8')).version;
    for (const u of entries) {
      const [, v, entry] = u.match(SYNC);
      if (v !== have) throw new Error(`the import map pins app-sync ${v}, but ${sync} is ${have} (bump the devDependency with the import map)`);
      for (const f of graph(sync, entry, seen)) core.push(`https://core.anawj.com/sync/${v}/${f}`);
    }
  }
  return ['./', ...own, ...other, ...core];
}

const block = list => `const SHELL = [\n${list.map(u => `  '${u}',\n`).join('')}];`;
const swOf = (dir, sw) => { const f = path.join(dir, sw); return fs.existsSync(f) ? f : path.join(dir, 'public', sw); };

// writes SHELL into sw.js; check: only say whether it is up to date (throws if not)
export function writeShell({ dir, sw = 'sw.js', sync, check = false }) {
  const file = swOf(dir, sw);
  const src = fs.readFileSync(file, 'utf8');
  if (!/const SHELL = \[[\s\S]*?\];/.test(src)) throw new Error(`${sw}: no SHELL list`);
  const list = shellFiles({ dir, sync });
  const next = src.replace(/const SHELL = \[[\s\S]*?\];/, () => block(list));
  if (check) {
    if (next !== src) throw new Error(`${sw}: SHELL is out of date; run node tools/sw-files.mjs ${posix(path.relative(ROOT, dir)) || '.'}`);
  } else fs.writeFileSync(file, next);
  return list;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = n => (a.includes(n) ? a[a.indexOf(n) + 1] : undefined);
  const dir = a.find((x, i) => !x.startsWith('--') && !['--sw', '--sync'].includes(a[i - 1])) || 'app';
  try {
    const list = writeShell({ dir: path.resolve(dir), sw: opt('--sw'), sync: opt('--sync') && path.resolve(opt('--sync')), check: a.includes('--check') });
    console.log(`sw-files: ${a.includes('--check') ? 'up to date' : 'written'} (${list.length} files)`);
  } catch (e) { console.error('sw-files: ' + e.message); process.exit(1); }
}
