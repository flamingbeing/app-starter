// tools/flavour.mjs: the marks, the render (pure) and the render in place. node --test tools/test/flavour.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { strip, render, renderDir, flavourId, isText } from '../flavour.mjs';
import { fill } from '../fill.mjs';
import { update } from '../update-from-starter.mjs';
import { toOfflineFirst, toCloud, TO_SYNC, add } from '../add.mjs';

const TOOLS = path.resolve(import.meta.dirname, '..');

test('strip: sync regions go, marks included; local-only blocks come in without their marks', () => {
  const js = ['a', '// sync{ why', 'b', '// }sync', '/* local-only{', 'c', '}local-only */', 'd'].join('\n');
  assert.equal(strip(js), 'a\nc\nd');
  const html = ['<p>', '  <!-- sync{ -->', '  <i>', '  <!-- }sync -->', '  <!-- local-only{', '  <b>', '  }local-only -->', '</p>'].join('\n');
  assert.equal(strip(html), '<p>\n  <b>\n</p>');
  assert.equal(strip(['x:', '  # sync{', '  y: 1', '  # }sync', 'z: 2'].join('\n')), 'x:\nz: 2');
  assert.equal(strip('no marks here'), 'no marks here');
});

test('strip: the old marks (cloud{ }cloud, static{ }static) strip the same way, mixed with new ones too', () => {
  const js = ['a', '// cloud{ why', 'b', '// }cloud', '/* static{', 'c', '}static */', 'd'].join('\n');
  assert.equal(strip(js), 'a\nc\nd');
  const html = ['<p>', '  <!-- cloud{ -->', '  <i>', '  <!-- }cloud -->', '  <!-- static{', '  <b>', '  }static -->', '</p>'].join('\n');
  assert.equal(strip(html), '<p>\n  <b>\n</p>');
  assert.equal(strip(['x:', '  # cloud{', '  y: 1', '  # }cloud', 'z: 2'].join('\n')), 'x:\nz: 2');
  assert.equal(strip(['a', '// cloud{', 'b', '// }sync', '/* local-only{', 'c', '}static */'].join('\n')), 'a\nc', 'an old mark pairs with a new one');
  assert.throws(() => strip('// cloud{\nx', 'a.js'), /a\.js:1: sync\{ without \}sync/);
});

test('strip: a mark without its pair, or one inside another, throws with the line', () => {
  assert.throws(() => strip('// sync{\nx', 'a.js'), /a\.js:1: sync\{ without \}sync/);
  assert.throws(() => strip('x\n// }sync', 'a.js'), /a\.js:2: \}sync without sync\{/);
  assert.throws(() => strip('// sync{\n/* local-only{\n}local-only */\n// }sync', 'a.js'), /a\.js:2: local-only\{ inside sync\{/);
});

const SPEC = {
  flavour: 'local-only', remove: ['gone.js', 'dir'], root: 'flavours/local-only',
  importMap: { '@core/sync': null, '@core/store': 'https://x/store.js' },
  tsconfigPaths: { '@core/store': ['./store.d.ts'] },
  json: { 'package.json': ['scripts.rules'] },
};
const PAGE = '<script type="importmap">\n{\n  "imports": {\n    "@core/app": "https://x/app.js",\n    "@core/sync": "https://x/sync.js"\n  }\n}\n</script>\n';
const TREE = () => ({
  'flavours/local-only.json': Buffer.from(JSON.stringify(SPEC)),
  'flavours/local-only/app/own.js': Buffer.from('own\n'),
  'flavours/local-only/kept.js': Buffer.from('replaced\n'),
  'gone.js': Buffer.from('x'), 'dir/a.js': Buffer.from('x'),
  'kept.js': Buffer.from('template\n'),
  'marked.js': Buffer.from('a\n// sync{\nb\n// }sync\n'),
  'icon.png': Buffer.from([0, 1, 2]),
  'app/index.html': Buffer.from(PAGE),
  'tsconfig.json': Buffer.from('{\n  "compilerOptions": {\n    "paths": {\n      "@core/*": ["./t/*"]\n    }\n  }\n}\n'),
  'package.json': Buffer.from(JSON.stringify({ scripts: { test: 't', rules: 'r' } }, null, 2) + '\n'),
});
// the same tree as a template commit from before the rename: flavours/static.json, flavours/static/, the old marks
const OLD_TREE = () => {
  const t = TREE();
  return {
    ...Object.fromEntries(Object.entries(t).filter(([rel]) => !rel.startsWith('flavours/'))),
    'flavours/static.json': Buffer.from(JSON.stringify({ ...SPEC, flavour: 'static', root: 'flavours/static' })),
    'flavours/static/app/own.js': t['flavours/local-only/app/own.js'],
    'flavours/static/kept.js': t['flavours/local-only/kept.js'],
    'marked.js': Buffer.from('a\n// cloud{\nb\n// }cloud\n'),
  };
};
const asText = out => Object.fromEntries(Object.entries(out).map(([rel, buf]) => [rel, buf.toString('base64')]));

test('render: removes, strips, overlays the root, edits the import map, tsconfig and JSON; the input is not changed', () => {
  const files = TREE();
  const out = render(files, 'local-only');
  assert.deepEqual(Object.keys(out).sort(), ['app/index.html', 'app/own.js', 'icon.png', 'kept.js', 'marked.js', 'package.json', 'tsconfig.json']);
  assert.equal(out['kept.js'].toString(), 'replaced\n');
  assert.equal(out['marked.js'].toString(), 'a\n');
  assert.ok(out['icon.png'].equals(files['icon.png']));
  const html = out['app/index.html'].toString();
  assert.doesNotMatch(html, /@core\/sync/);
  assert.match(html, /"@core\/store": "https:\/\/x\/store\.js"/);
  assert.match(out['tsconfig.json'].toString(), /"@core\/store": \["\.\/store\.d\.ts"\]/);
  assert.deepEqual(JSON.parse(out['package.json'].toString()).scripts, { test: 't' });
  assert.equal(files['marked.js'].toString(), 'a\n// sync{\nb\n// }sync\n', 'input unchanged');
  assert.throws(() => render({ 'a.js': Buffer.from('') }, 'local-only'), /no flavours\/local-only\.json/);
  assert.throws(() => render({ 'a.js': Buffer.from('') }, 'static'), /no flavours\/local-only\.json/);
});

test('render: the old flavour id and a template commit from before the rename render the same', () => {
  const now = asText(render(TREE(), 'local-only'));
  assert.deepEqual(asText(render(TREE(), 'static')), now, 'the old id finds flavours/local-only.json');
  assert.deepEqual(asText(render(OLD_TREE(), 'local-only')), now, 'the new id finds flavours/static.json');
  assert.deepEqual(asText(render(OLD_TREE(), 'static')), now);
  assert.equal(flavourId('static'), 'local-only');
  assert.equal(flavourId('on-device'), 'local-only');
  assert.deepEqual(asText(render(TREE(), 'on-device')), now, 'the interim id too');
  assert.equal(flavourId('local-only'), 'local-only');
  assert.equal(flavourId(undefined), undefined);
});

test('renderDir: in place, records the flavour, prunes emptied folders; refuses a second render and the files module', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flavour-'));
  try {
    for (const [rel, buf] of Object.entries(TREE())) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), buf); }
    fs.writeFileSync(path.join(dir, '.starter.json'), JSON.stringify({ app: { name: 'a' } }));
    assert.deepEqual(renderDir({ dir, flavour: 'local-only', dryRun: true }).removed.sort(), ['dir/a.js', 'flavours/local-only.json', 'flavours/local-only/app/own.js', 'flavours/local-only/kept.js', 'gone.js']);
    assert.ok(fs.existsSync(path.join(dir, 'gone.js')), 'a dry run changes nothing');
    renderDir({ dir, flavour: 'local-only' });
    for (const gone of ['gone.js', 'dir', 'flavours']) assert.ok(!fs.existsSync(path.join(dir, gone)), gone);
    assert.equal(fs.readFileSync(path.join(dir, 'app/own.js'), 'utf8'), 'own\n');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.starter.json'), 'utf8')).flavour, 'local-only');
    assert.throws(() => renderDir({ dir, flavour: 'local-only' }), /already local-only/);
    assert.throws(() => renderDir({ dir, flavour: 'other' }), /no flavour other/);
    fs.writeFileSync(path.join(dir, '.starter.json'), JSON.stringify({ flavour: 'static' }));
    assert.throws(() => renderDir({ dir, flavour: 'local-only' }), /already local-only/, 'an app recorded as "static" is local-only');
    fs.writeFileSync(path.join(dir, '.starter.json'), JSON.stringify({ modules: { files: 'recipes/files.json' } }));
    assert.throws(() => renderDir({ dir, flavour: 'local-only' }), /files module needs the offline-first app/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('renderDir and the command line: the old id (static) renders local-only and records "local-only"', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flavour-'));
  try {
    for (const [rel, buf] of Object.entries(OLD_TREE())) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), buf); }
    fs.writeFileSync(path.join(dir, '.starter.json'), JSON.stringify({ app: { name: 'a' } }));
    const cli = spawnSync('node', [path.join(TOOLS, 'flavour.mjs'), 'static', '--dir', dir], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /static is now local-only/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.starter.json'), 'utf8')).flavour, 'local-only');
    assert.equal(fs.readFileSync(path.join(dir, 'marked.js'), 'utf8'), 'a\n');
    assert.ok(!fs.existsSync(path.join(dir, 'flavours')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('add.mjs cloud is add.mjs sync (the old name)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flavour-'));
  try {
    fs.writeFileSync(path.join(dir, '.starter.json'), JSON.stringify({ app: { name: 'a' } }));
    for (const name of ['sync', 'synced', 'cloud']) {
      const r = spawnSync('node', [path.join(TOOLS, 'add.mjs'), name, '--project', 'trial-notes-app', '--dir', dir], { encoding: 'utf8' });
      assert.equal(r.status, 2);
      assert.match(r.stderr, /this app is the offline-first app already/, name);
      if (name !== 'sync') assert.match(r.stdout, new RegExp(`add\\.mjs ${name} is now add\\.mjs sync`));
    }
    assert.equal(toCloud, toOfflineFirst);
    assert.deepEqual(TO_SYNC, ['sync', 'synced', 'cloud']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// sync{ the template's own spec (a local-only app has no flavours/; a filled app skips these: its files are its own)
const TEMPLATE_ONLY = { skip: JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../.starter.json'), 'utf8')).commit ? 'the template\'s own' : false };
test("the template's local-only spec: every path it removes or edits is in the template, and the render keeps no mark", TEMPLATE_ONLY, () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const spec = JSON.parse(fs.readFileSync(path.join(root, 'flavours/local-only.json'), 'utf8'));
  for (const p of spec.remove) assert.ok(fs.existsSync(path.join(root, p)), `remove: ${p}`);
  const tracked = Object.fromEntries(['app', 'e2e', 'worker', 'tools', '.github', 'flavours', 'recipes'].flatMap(d => walk(root, d))
    .concat(['tsconfig.json', 'package.json', 'playwright.config.mjs'].map(f => [f, fs.readFileSync(path.join(root, f))])));
  const out = render(tracked, 'local-only');
  for (const [rel, buf] of Object.entries(out)) if (/\.(m?js|html|ya?ml|css)$/.test(rel))
    assert.doesNotMatch(buf.toString(), /^\s*(\/\/|#|<!--|\/\*)\s*(sync\{|\}sync|local-only\{|cloud\{|\}cloud|static\{)|^\s*\}(local-only|static)\s*(\*\/|-->)/m, rel);
  assert.ok(!Object.keys(out).some(rel => /firebase/i.test(rel)), 'no Firebase file left');
});
function walk(root, rel) {
  const out = [];
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) { if (!['node_modules', 'fixtures'].includes(e.name)) out.push(...walk(root, r)); }
    else out.push([r, fs.readFileSync(path.join(root, r))]);
  }
  return out;
}
// a scratch template repo with the template's own files, and a local-only app made from it
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const commitAll = (dir, msg) => { git(dir, 'add', '-A'); git(dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', msg); return git(dir, 'rev-parse', 'HEAD').trim(); };
function copyTemplate(to) {
  const root = path.resolve(import.meta.dirname, '../..');
  for (const rel of git(root, 'ls-files', '-co', '--exclude-standard').split('\n').filter(Boolean)) {
    if (!fs.existsSync(path.join(root, rel))) continue;
    fs.mkdirSync(path.dirname(path.join(to, rel)), { recursive: true });
    fs.copyFileSync(path.join(root, rel), path.join(to, rel));
  }
}
test('a local-only app takes the template\'s changes to its render only; add.mjs sync makes it the offline-first app', TEMPLATE_ONLY, t => {
  const tpl = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-'));
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'local-only-'));
  t.after(() => { for (const d of [tpl, app]) fs.rmSync(d, { recursive: true, force: true }); });   // a failed run too
  copyTemplate(tpl);
  git(tpl, 'init', '-q', '-b', 'main');
  const base = commitAll(tpl, 'base');
  copyTemplate(app);
  fill({ dir: app, localOnly: true, name: 'trial-notes', host: 'notes.example.org', kit: 'homedesign', commit: base.slice(0, 7) });
  const read = rel => fs.readFileSync(path.join(app, rel), 'utf8');
  const edit = (dir, rel, fn) => fs.writeFileSync(path.join(dir, rel), fn(fs.readFileSync(path.join(dir, rel), 'utf8')));
  // the app's own changes: one to a file both apps have, one to a local-only app's own file
  edit(app, 'app/src/screens/tasks.js', t => `${t}// the app's own line\n`);
  edit(app, 'app/src/local.js', t => `${t}// the app's own local line\n`);
  assert.throws(() => add({ source: path.join(tpl, 'recipes/files.json'), dir: app, log: () => {} }), /needs the offline-first app/);

  // the template changes a sync region, a sync-only file and a local-only file
  edit(tpl, 'app/index.html', t => t.replace(/\n(\s*<!-- \}sync -->)/, '\n    <!-- a sync-only change -->\n$1'));
  edit(tpl, 'worker/members.js', t => `${t}// a sync-only change\n`);
  edit(tpl, 'flavours/local-only/app/src/options.js', t => `${t}// a local-only change\n`);
  const next = commitAll(tpl, 'next');
  const sheet = read('app/index.html');
  const r = update({ dir: app, from: tpl, install: false, checkLatest: false, log: () => {} });
  assert.deepEqual(r.changes.map(c => `${c.action} ${c.path}`), ['updated app/src/options.js']);
  assert.match(read('app/src/options.js'), /a local-only change/);
  assert.equal(read('app/index.html'), sheet, 'the sync region stays out');
  assert.ok(!fs.existsSync(path.join(app, 'worker/members.js')));
  assert.equal(JSON.parse(read('.starter.json')).commit, next.slice(0, 7));

  assert.throws(() => toOfflineFirst({ dir: app, from: tpl, project: 'X', install: false, log: () => {} }), /--project/);
  const c = toOfflineFirst({ dir: app, from: tpl, project: 'trial-notes-app', install: false, log: () => {} });
  const meta = JSON.parse(read('.starter.json'));
  assert.equal(meta.flavour, undefined);
  assert.equal(meta.app.project, 'trial-notes-app');
  assert.deepEqual(c.conflicts, []);
  for (const f of ['app/src/cloud.js', 'worker/members.js', 'app/firestore.rules', 'e2e/sync.spec.mjs', 'app/public/vendor/firebase', 'recipes/files/worker/files.js', 'flavours/local-only.json'])
    assert.ok(fs.existsSync(path.join(app, f)), f);
  assert.match(read('worker/members.js'), /a sync-only change/);
  assert.match(read('app/index.html'), /sync\{[\s\S]*a sync-only change/);
  assert.ok(!fs.existsSync(path.join(app, 'app/src/local-store.js')), 'a local-only file the app never changed goes');
  assert.ok(c.changes.some(x => x.action === 'kept' && x.path === 'app/src/local.js'), 'one it changed stays, listed');
  assert.match(read('app/src/screens/tasks.js'), /the app's own line/);
  assert.match(read('app/src/config.js'), /"projectId": "trial-notes-app"/);
  assert.match(read('wrangler.jsonc'), /"FIREBASE_PROJECT": "trial-notes-app"/);
  assert.match(read('app/index.html'), /"@core\/sync"/);
  assert.doesNotMatch(read('app/index.html'), /"@core\/store"/);
  assert.throws(() => toOfflineFirst({ dir: app, from: tpl, project: 'trial-notes-app', install: false, log: () => {} }), /offline-first app already/);
});

// a template checkout as it was before the rename (docs/decisions/0016-offline-first-and-local-only.md): flavours/static.json and
// flavours/static/, and the old marks cloud{ }cloud, static{ }static
function oldNames(dir) {
  fs.renameSync(path.join(dir, 'flavours/local-only'), path.join(dir, 'flavours/static'));
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'flavours/local-only.json'), 'utf8'));
  fs.rmSync(path.join(dir, 'flavours/local-only.json'));
  fs.writeFileSync(path.join(dir, 'flavours/static.json'), JSON.stringify({ ...spec, flavour: 'static', root: 'flavours/static' }, null, 2) + '\n');
  const marked = [];
  for (const [rel, buf] of walk(dir, '.')) {
    if (!isText(rel) || rel.includes('/vendor/')) continue;
    const text = buf.toString('utf8');
    const old = text.split('\n').map(l => l
      .replace(/^(\s*(?:\/\/|#|<!--)\s*)sync\{/, '$1cloud{').replace(/^(\s*(?:\/\/|#|<!--)\s*)\}sync\b/, '$1}cloud')
      .replace(/^(\s*(?:\/\*|<!--)\s*)local-only\{/, '$1static{').replace(/^(\s*)\}local-only(\s*(?:\*\/|-->))/, '$1}static$2')).join('\n');
    if (old !== text) { fs.writeFileSync(path.join(dir, rel), old); marked.push(rel.replace(/^\.\//, '')); }
  }
  return marked;
}
// a scratch template repo whose first commit has the old names and whose second has the new ones (and one change)
function acrossTheRename(t) {
  const tpl = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-'));
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'app-'));
  t.after(() => { for (const d of [tpl, app]) fs.rmSync(d, { recursive: true, force: true }); });   // a failed run too
  copyTemplate(tpl);
  const marked = oldNames(tpl);
  git(tpl, 'init', '-q', '-b', 'main');
  const base = commitAll(tpl, 'before the rename');
  fs.cpSync(tpl, app, { recursive: true, filter: src => path.basename(src) !== '.git' });
  fs.symlinkSync(path.resolve(import.meta.dirname, '../../node_modules'), path.join(app, 'node_modules'), 'junction');
  return { tpl, app, base, marked, after: () => {
    fs.rmSync(path.join(tpl, 'flavours'), { recursive: true });
    copyTemplate(tpl);
    return commitAll(tpl, 'the rename');
  } };
}
test('a local-only app made before the rename ("static", old marks) updates across it with no conflict', TEMPLATE_ONLY, t => {
  const { tpl, app, base, marked, after } = acrossTheRename(t);
  const read = rel => fs.readFileSync(path.join(app, rel), 'utf8');
  assert.ok(marked.includes('app/index.html') && fs.existsSync(path.join(tpl, 'flavours/static.json')), 'the old tree');
  fill({ dir: app, static: true, name: 'trial-notes', host: 'notes.example.org', kit: 'homedesign', commit: base.slice(0, 7) });
  // as such an app's .starter.json says
  fs.writeFileSync(path.join(app, '.starter.json'), JSON.stringify({ ...JSON.parse(read('.starter.json')), flavour: 'static' }, null, 2) + '\n');
  fs.appendFileSync(path.join(app, 'app/src/local.js'), '// the app\'s own local line\n');
  const sheet = read('app/index.html');
  const next = after();
  const r = update({ dir: app, from: tpl, install: false, checkLatest: false, log: () => {} });
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual(r.changes.filter(c => c.action !== 'ignored'), [], 'the same render on both sides of the rename');
  assert.equal(read('app/index.html'), sheet);
  assert.match(read('app/src/local.js'), /the app's own local line/);
  const meta = JSON.parse(read('.starter.json'));
  assert.equal(meta.flavour, 'local-only', 'the old id is written as the new one');
  assert.equal(meta.commit, next.slice(0, 7));
});
test('an offline-first app made before the rename takes the new marks as small line edits, its own lines kept', TEMPLATE_ONLY, t => {
  const { tpl, app, base, marked, after } = acrossTheRename(t);
  const read = rel => fs.readFileSync(path.join(app, rel), 'utf8');
  fill({ dir: app, name: 'trial-notes', host: 'notes.example.org', kit: 'homedesign', project: 'trial-notes-app', commit: base.slice(0, 7) });
  // the app's own line, away from the marks (one right beside a changed mark is a conflict, as in any three-way merge)
  fs.appendFileSync(path.join(app, 'app/index.html'), '<!-- the app\'s own line -->\n');
  const before = read('worker/sites.js');
  after();
  const r = update({ dir: app, from: tpl, install: false, checkLatest: false, log: () => {} });
  assert.deepEqual(r.conflicts, []);
  const updated = r.changes.filter(c => c.action === 'updated' || c.action === 'merged').map(c => c.path);
  for (const rel of ['app/index.html', 'worker/sites.js', 'e2e/fixtures.mjs', 'AGENTS.md']) assert.ok(updated.includes(rel), rel);
  assert.ok(r.changes.some(c => c.action === 'merged' && c.path === 'app/index.html'), 'merged with the app\'s own line');
  for (const rel of updated) assert.ok(marked.includes(rel), `${rel}: only files with marks change`);
  assert.match(read('app/index.html'), /the app's own line/);
  assert.doesNotMatch(read('worker/sites.js'), /^\s*\/\/\s*(cloud\{|\}cloud)/m, 'no old mark left');
  // only the mark lines changed
  const a = before.split('\n'), b = read('worker/sites.js').split('\n');
  assert.equal(a.length, b.length);
  assert.ok(a.every((l, i) => l === b[i] || l.replace(/cloud/g, 'sync') === b[i]), 'marks only');
  assert.equal(JSON.parse(read('.starter.json')).flavour, undefined);
});
// }sync
