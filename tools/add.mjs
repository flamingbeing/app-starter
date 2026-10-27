// Adds an optional module to an app from its recipe, or takes it out again (README, "Modules").
//
//   node tools/add.mjs <source> [--dir <app>] [--dry-run]
//   node tools/add.mjs --remove <module> [--dir <app>] [--dry-run]
//
// <source> is a recipe: a local path (`recipes/search.json`), `<owner/repo>@<tag|sha>:recipes/<module>.json`, or a
// bare module name, which means the template's recipe at the commit the app was made from (.starter.json "template"
// and "commit"; the local recipes/<module>.json when there is no commit, as in the template itself).
//
// A recipe (recipes/search.json is the first) is JSON with these fields, every one optional but "module":
//   module          the name .starter.json "modules" records it under
//   importMap       { name: url } added to app/index.html's import map (literal URLs)
//   root            the folder of the recipe's repo that mirrors the app (recipes/search): `vendor` and `files` paths are
//                   the app's, read from under it (default: the repo's top)
//   vendor          folders of outside packages, copied like files; each must hold its LICENSE
//   files           [{ from, to? }] files or folders copied from the recipe's repo (the folder above recipes/) to the
//                   app (`to` defaults to `from`), with the app's own values swapped in as fill.mjs does;
//                   [{ to, after, line }] one line put after the line holding `after` (the glue: app/src/modules.js);
//                   [{ to, after, block }] the lines of `block` (a file in the recipe's repo, usually recipes/<module>/...)
//                   put after the line holding `after`; both get the app's own values swapped in
//   tsconfigPaths   { name: [path] } added to tsconfig.json's "paths"
//   tsconfigInclude [glob] added to tsconfig.json's "include"
//   viteAlias       { name: path } added to vite.config.mjs SOURCE_ALIAS (builds that bundle core from source)
//   cssVars         { --name: value } added to app/public/app.css's :root block
//   needs           owner-only steps, printed as NEEDS-YOU lines
//   docs            lines printed after the add
//
// Every edit is idempotent: a second run changes nothing. A copied file the app has changed is merged three-way with
// the copy from the source .starter.json recorded before (git merge-file, as update-from-starter.mjs does), else kept.
// --remove undoes each edit; a file the app changed is kept and listed. Afterwards sw.js's list and the import map's
// CSP hash are regenerated (update-from-starter.mjs --refresh) and .starter.json "modules" records { module: source }.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { swapsFor, fixup, isText } from './fill.mjs';
import { after, merge3, templateRepo, show } from './update-from-starter.mjs';

const REMOTE = /^([\w.-]+\/[\w.-]+)@([\w./-]+):(.+\.json)$/;
const MAP_RE = /(<script type="importmap">\n)([\s\S]*?)(\n\s*<\/script>)/;
const INCLUDE_RE = /("include":\s*)(\[.*\])/;
const CSS_MARK = '/* add: cssVars */';

/** a source's files: { recipe, read(rel) -> Buffer | null, list(rel) -> [rel], app, done() }; `clones` shares one
 * clone per repo between sources (their done() is then the caller's: closeClones) */
export function openSource(source, dir, github = 'https://github.com', clones = null) {
  const remote = source.match(REMOTE);
  if (remote) {
    const [, repo, ref, rel] = remote;
    const url = `${github}/${repo}`;
    const r = clones ? clones.get(url) ?? clones.set(url, templateRepo(url)).get(url) : templateRepo(url);
    const read = file => show(r.dir, ref, file);
    const list = file => execFileSync('git', ['-C', r.dir, 'ls-tree', '-r', '--name-only', ref, '--', file], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    return withRecipe({ read, list, done: clones ? () => {} : r.done }, rel, source);
  }
  const file = path.resolve(dir, source);
  const root = path.dirname(path.dirname(file));
  const read = rel => { try { return fs.readFileSync(path.join(root, rel)); } catch { return null; } };
  const walk = rel => {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) return [];
    if (!fs.statSync(p).isDirectory()) return [rel];
    return fs.readdirSync(p).sort().flatMap(n => walk(`${rel}/${n}`));
  };
  return withRecipe({ read, list: walk, done() {} }, path.relative(root, file), source);
}
export const closeClones = clones => { for (const r of clones.values()) r.done(); clones.clear(); };
function withRecipe(src, rel, source) {
  const text = src.read(rel);
  if (!text) { src.done(); throw new Error(`no recipe at ${source}`); }
  const recipe = JSON.parse(text.toString('utf8'));
  if (!/^[a-z][a-z0-9-]*$/.test(recipe.module ?? '')) { src.done(); throw new Error(`${source}: "module" must be a name like search`); }
  return { ...src, recipe, app: JSON.parse(src.read('.starter.json')?.toString('utf8') || 'null')?.app };
}

/** a bare module name -> the template's recipe at the app's commit (local recipes/ when there is none) */
export function resolveSource(name, meta) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return name;
  return meta.commit ? `${meta.template}@${meta.commit}:recipes/${name}.json` : `recipes/${name}.json`;
}

/** a recorded source as a pristine copy: a local recipe inside the app itself (the template records
 * recipes/search.json) means the template's recipe at the app's commit; null when there is no commit (the template) */
export function pinned(source, meta, dir) {
  if (REMOTE.test(source)) return source;
  const rel = path.relative(dir, path.resolve(dir, source));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return source;
  return meta.commit ? `${meta.template}@${meta.commit}:${rel.split(path.sep).join('/')}` : null;
}

// lines compared without spaces, quote style or a trailing ; or , (a formatter's changes)
const norm = l => l.replace(/\s+/g, '').replace(/"/g, "'").replace(/[;,]$/, '');
/** the lines of the block an anchor opens: from the line after it to the first blank line or closing brace */
function block(lines, anchor) {
  const at = lines.findIndex(l => l.includes(anchor));
  if (at < 0) return null;
  let end = at + 1;
  while (end < lines.length && lines[end].trim() && !/^[}\]]/.test(lines[end].trim())) end++;
  return { at, end };
}
/** text with `line` after the line holding `anchor`; a line in its block starting with `key` is replaced */
export function putLine(text, anchor, line, key = line) {
  const lines = dropLine(text, key, anchor).split('\n');
  const b = block(lines, anchor);
  if (!b) throw new Error(`no line holding ${anchor}`);
  lines.splice(b.at + 1, 0, line);
  return lines.join('\n');
}
/** text without the lines in `anchor`'s block (the whole text when the anchor is gone) starting with `key` */
export function dropLine(text, key, anchor) {
  const k = norm(key.trim());
  const lines = text.split('\n');
  const b = anchor ? block(lines, anchor) : null;
  return lines.filter((l, i) => (b && (i <= b.at || i >= b.end)) || !norm(l.trim()).startsWith(k)).join('\n');
}

/** the index where `lines` start in `all` (compared as norm does), or -1 */
function find(all, lines) {
  const want = lines.map(norm);
  for (let i = 0; i + want.length <= all.length; i++) if (want.every((w, j) => norm(all[i + j]) === w)) return i;
  return -1;
}
/** text with the lines of `block` after the line holding `anchor` (unchanged when they are there already) */
export function putBlock(text, anchor, block) {
  const lines = text.split('\n'), at = lines.findIndex(l => l.includes(anchor));
  if (at < 0) throw new Error(`no line holding ${anchor}`);
  if (find(lines, block) >= 0) return text;
  lines.splice(at + 1, 0, ...block);
  return lines.join('\n');
}
/** text without the lines of `block` (unchanged when they are not there) */
export function dropBlock(text, block) {
  const lines = text.split('\n'), at = find(lines, block);
  if (at < 0) return text;
  lines.splice(at, block.length);
  return lines.join('\n');
}

/** app/index.html with the import map's entries set (value) or taken out (null) */
export function editImportMap(html, entries) {
  const m = html.match(MAP_RE);
  if (!m) throw new Error('app/index.html has no import map');
  const map = JSON.parse(m[2]);
  for (const [name, url] of Object.entries(entries)) {
    if (url === null) delete map.imports[name];
    else map.imports[name] = url;
  }
  return html.replace(MAP_RE, (_, a, __, c) => a + JSON.stringify(map, null, 2) + c);
}

/** tsconfig.json's one-line "include" with globs added or taken out */
export function editInclude(text, globs, remove = false) {
  const m = text.match(INCLUDE_RE);
  if (!m) throw new Error('tsconfig.json has no one-line "include"');
  const now = JSON.parse(m[2]);
  const next = remove ? now.filter(g => !globs.includes(g)) : [...now, ...globs.filter(g => !now.includes(g))];
  return text.replace(INCLUDE_RE, (_, a) => `${a}[${next.map(g => JSON.stringify(g)).join(', ')}]`);
}

/** the line edits a recipe makes: [{ file, anchor, line, key }], and [{ file, anchor, block }] for a block of lines */
export function lineEdits(recipe) {
  const out = [];
  for (const [name, paths] of Object.entries(recipe.tsconfigPaths ?? {}))
    out.push({ file: 'tsconfig.json', anchor: '"paths": {', line: `      ${JSON.stringify(name)}: ${JSON.stringify(paths)},`, key: `${JSON.stringify(name)}:` });
  for (const [name, to] of Object.entries(recipe.viteAlias ?? {}))
    out.push({ file: 'vite.config.mjs', anchor: '// add: viteAlias', line: `  '${name}': '${to}',`, key: `'${name}':` });
  for (const [name, value] of Object.entries(recipe.cssVars ?? {}))
    out.push({ file: 'app/public/app.css', anchor: CSS_MARK, line: `  ${name}: ${value};`, key: `${name}:` });
  for (const f of recipe.files ?? []) {
    if (f.line) out.push({ file: f.to, anchor: f.after, line: f.line, key: f.line });
    if (f.block) out.push({ file: f.to, anchor: f.after, block: f.block });
  }
  return out;
}

/** the files a recipe copies: [{ from, to }] one per file */
function copies(src, recipe) {
  const root = recipe.root ? recipe.root.replace(/\/?$/, '/') : '';
  const out = [];
  for (const dirRel of recipe.vendor ?? []) {
    const files = src.list(root + dirRel);
    if (!files.some(f => /\/LICEN[CS]E[^/]*$/.test(f))) throw new Error(`vendor ${dirRel}: no LICENSE`);
    out.push(...files.map(f => ({ from: f, to: f.slice(root.length) })));
  }
  for (const f of recipe.files ?? []) {
    if (f.line || f.block) continue;
    const files = src.list(root + f.from);
    if (!files.length) throw new Error(`files: ${f.from} is not in the recipe's repo`);
    const to = f.to ?? f.from;
    out.push(...files.map(rel => ({ from: rel, to: to + rel.slice(root.length + f.from.length) })));
  }
  return out;
}

/** text with the app's values in (the source's .starter.json app -> this app's) */
function swapped(src, rel, text, app) {
  if (!src.app) return text;
  for (const [re, v] of swapsFor(src.app, app)) text = text.replace(re, v);
  return fixup(rel, text, app);
}
/** a source file with the app's values in */
function filled(src, rel, app) {
  const buf = src.read(rel);
  if (buf === null || !isText(rel)) return buf;
  return Buffer.from(swapped(src, rel, buf.toString('utf8'), app));
}

// -> { module, changes: [{ action, path, note? }], conflicts: [paths] }
export function add({ source, dir = '.', dryRun = false, remove = false, log = console.log, refresh = true, github } = {}) {
  dir = path.resolve(dir);
  const metaPath = path.join(dir, '.starter.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const recorded = meta.modules ?? {};
  if (remove && !recorded[source]) throw new Error(`.starter.json records no module ${source}`);
  const clones = new Map();
  const from = remove ? pinned(recorded[source], meta, dir) ?? recorded[source] : resolveSource(source, meta);
  const opened = [];
  try {
    const src = openSource(from, dir, github, clones);
    opened.push(src);
    const result = { module: src.recipe.module, changes: [], conflicts: [] };
    const { recipe } = src;
    const was = !remove && recorded[recipe.module] ? pinned(recorded[recipe.module], meta, dir) : null;
    const prevSource = was && was !== from ? was : null;
    const prev = prevSource ? openSource(prevSource, dir, github, clones) : null;
    if (prev) opened.push(prev);
    log(`${remove ? 'remove' : 'add'} ${recipe.module} (${from})`);
    const note = (action, p, extra) => { result.changes.push({ action, path: p, ...(extra ? { note: extra } : {}) }); log(`  ${action.padEnd(9)} ${p}${extra ? `  (${extra})` : ''}`); };
    const staged = new Map();   // --dry-run: the writes, so later edits see earlier ones
    const read = rel => { if (staged.has(rel)) return staged.get(rel); try { return fs.readFileSync(path.join(dir, rel)); } catch { return null; } };
    const write = (rel, buf) => { if (dryRun) return void staged.set(rel, Buffer.from(buf)); fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), buf); };
    const unlink = rel => {
      if (dryRun) return void staged.set(rel, null);
      fs.rmSync(path.join(dir, rel));
      for (let d = path.dirname(rel); d !== '.' && fs.readdirSync(path.join(dir, d)).length === 0; d = path.dirname(d)) fs.rmdirSync(path.join(dir, d));
    };
    const editText = (rel, fn) => {
      const before = read(rel)?.toString('utf8');
      if (before === undefined) throw new Error(`${rel} is missing`);
      const next = fn(before);
      if (next !== before) { write(rel, next); note('edited', rel); }
    };

    // copied files: added, merged with the copy recorded before, or (remove) deleted when unchanged
    const toCopy = copies(src, recipe);
    // files the previous recipe copied and this one doesn't: deleted when the app left them as copied
    if (prev) for (const c of copies(prev, prev.recipe)) {
      if (toCopy.some(n => n.to === c.to)) continue;
      const ours = read(c.to);
      if (ours === null) continue;
      if (ours.equals(filled(prev, c.from, meta.app))) { unlink(c.to); note('deleted', c.to, 'not in the recipe now'); }
      else note('kept', c.to, 'not in the recipe now; the app changed it');
    }
    for (const c of toCopy) {
      const theirs = filled(src, c.from, meta.app);
      const ours = read(c.to);
      if (remove) {
        if (ours === null) continue;
        if (ours.equals(theirs)) { unlink(c.to); note('deleted', c.to); }
        else note('kept', c.to, 'the app changed it');
        continue;
      }
      if (ours === null) { write(c.to, theirs); note('added', c.to); continue; }
      if (ours.equals(theirs)) continue;
      const base = prev ? filled(prev, c.from, meta.app) : null;
      if (base && ours.equals(base)) { write(c.to, theirs); note('updated', c.to); continue; }
      if (!base || !isText(c.to)) { note('kept', c.to, 'the app\'s copy differs from the recipe\'s'); continue; }
      const m = merge3(ours.toString('utf8'), base.toString('utf8'), theirs.toString('utf8'), ['app', prevSource, from]);
      write(c.to, m.text);
      if (m.conflicts) { result.conflicts.push(c.to); note('conflict', c.to, `${m.conflicts} to resolve`); }
      else note('merged', c.to);
    }

    if (recipe.importMap) editText('app/index.html', html => editImportMap(html, Object.fromEntries(Object.entries(recipe.importMap).map(([k, v]) => [k, remove ? null : v]))));
    if (recipe.tsconfigInclude) editText('tsconfig.json', t => editInclude(t, recipe.tsconfigInclude, remove));
    // glue: lines and blocks put after an anchor; a block the previous recipe put there and this one changed is swapped
    const glue = (r, e) => e.block ? swapped(r, e.file, r.read(e.block).toString('utf8'), meta.app).replace(/\n+$/, '').split('\n') : swapped(r, e.file, e.line, meta.app);
    for (const e of lineEdits(recipe)) {
      const css = e.anchor === CSS_MARK && !remove ? read(e.file)?.toString('utf8') ?? '' : null;
      if (css !== null && !css.includes(CSS_MARK)) { write(e.file, `${css && css.replace(/\n*$/, '\n\n')}:root {\n  ${CSS_MARK}\n}\n`); note('edited', e.file); }
      if (remove && read(e.file) === null) continue;
      if (e.block) {
        const lines = glue(src, e);
        const before = prev ? lineEdits(prev.recipe).find(p => p.file === e.file && p.block === e.block) : null;
        editText(e.file, t => remove ? dropBlock(t, lines) : putBlock(before ? dropBlock(t, glue(prev, before)) : t, e.anchor, lines));
      } else {
        const line = glue(src, e), key = e.line === e.key ? line : e.key;
        editText(e.file, t => remove ? dropLine(t, key, e.anchor) : putLine(t, e.anchor, line, key));
      }
    }

    if (!dryRun) {
      if (refresh) after(dir, { install: false, changedPkg: false, log });
      const modules = { ...recorded };
      if (remove) delete modules[recipe.module]; else modules[recipe.module] = from;
      const { modules: _, ...rest } = meta;
      fs.writeFileSync(metaPath, JSON.stringify(Object.keys(modules).length ? { ...rest, modules } : rest, null, 2) + '\n');
      log(`.starter.json: modules ${Object.keys(modules).join(', ') || 'none'}`);
    }
    if (!remove) {
      for (const n of recipe.needs ?? []) log(`NEEDS-YOU: ${n}`);
      for (const d of recipe.docs ?? []) log(d);
    }
    if (result.conflicts.length) log(`\n${result.conflicts.length} file(s) with conflicts to resolve by hand:\n  ${result.conflicts.join('\n  ')}`);
    return result;
  } finally { for (const s of opened) s.done(); closeClones(clones); }
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--remove') { out.remove = true; out.source = argv[++i]; }
    else if (a === '--dir') out.dir = argv[++i];
    else if (!a.startsWith('--') && !out.source) out.source = a;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!out.source) throw new Error('name a recipe: node tools/add.mjs <source> | --remove <module>');
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = add(parseArgs(process.argv.slice(2)));
    if (r.conflicts.length) process.exit(1);
  } catch (e) {
    console.error(`add: ${e.message}`);
    process.exit(2);
  }
}
