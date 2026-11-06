// Turns a copy of this template into one app: its name, address, design kit and Firebase project.
//
//   node tools/fill.mjs --name <name> --host <host> --kit homedesign|nuhs|ntf --project <firebase-project-id>
//                       [--title "<Title>"] [--accent '#rrggbb'] [--space shared|person] [--web-config <file.json>]
//                       [--commit <template sha>] [--dir <repo>] [--check]
//   node tools/fill.mjs --local-only --name <name> --host <host> --kit homedesign|nuhs|ntf [...]   a local-only app: no
//                       sign-in, no Firebase project (tools/flavour.mjs renders it first; README, "Pick a starter");
//                       --static and --on-device are its old names and do the same
//
// The values in use now are in .starter.json ("app"); each is replaced by the new one in every text file (the emulator
// project demo-<name>, the kit's address, the host, the name, the title), app/src/config.js is written afresh (with the
// default look's colour from --accent, else kept (a kit's own default follows the kit: ntf's wine), and the web app's apiKey and appId from --web-config: the JSON
// `firebase apps:sdkconfig WEB` prints), and wrangler.jsonc's FIREBASE_PROJECT is set. Running it again with the same
// values changes nothing. --check changes nothing and exits 1 when a run would. Prints the files it changed. A local-only
// app (.starter.json "flavour") keeps its project as it is (unused until `node tools/add.mjs sync --project <id>`) and
// has no web config.
// --space: whose a space is (APP.space in config.js; kept when not given): shared, the default, is one space for every
// member; person gives each person their own (spaces/{uid}/..., for a personal app). The rules' inSpace line follows it
// (tools/modules.mjs writes it too). Choose it before the app has data: a switch leaves the old space's data where it is.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flavourId, renderDir } from './flavour.mjs';
import { after } from './update-from-starter.mjs';
import { SPACES, spaceRules } from './modules.mjs';

export const KITS = { homedesign: 'https://design.flamingbeing.com', nuhs: 'https://design.anawj.com', ntf: 'https://design.anantf.com' };
// a kit's own default look colour; a kit with none takes ACCENT
export const KIT_ACCENT = { ntf: '#633d3c' };
const SKIP_DIRS = new Set(['.git', 'node_modules', '.devkit', 'test-results', 'playwright-report']);
// never changed: these three name the placeholders on purpose; the other two are app-devkit's files (CI compares them)
const KEEP = ['tools/fill.mjs', 'tools/test/fill.test.mjs', 'tools/test/update-from-starter.test.mjs', 'worker/claims.js', 'worker/custom-token.js'];
const TEXT = /\.(m?js|json|jsonc|html|css|md|webmanifest|rules|ya?ml|svg|txt)$|^\.[a-z]+ignore$/;

export const RULES = {
  name: [/^[a-z][a-z0-9-]{1,28}[a-z0-9]$/, 'lowercase letters, digits and hyphens, 3-30 characters'],
  host: [/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, 'a host name like app.example.com'],
  project: [/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, 'a Firebase project id (6-30 lowercase letters, digits, hyphens)'],
  kit: [new RegExp(`^(${Object.keys(KITS).join('|')})$`), Object.keys(KITS).join(' or ')],
};
// the name as a secret-name prefix: pantry -> PANTRY, my-app -> MY_APP
const keyOf = name => name.toUpperCase().replace(/-/g, '_');
const titleOf = name => name.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// the name as a whole word: not inside a longer name (my-starter-app) or the demo- project (handled first)
const wordRe = s => new RegExp(`(?<![A-Za-z0-9-])${esc(s)}(?![A-Za-z0-9])`, 'g');

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') out.check = true;
    else if (a === '--local-only') out.localOnly = true;
    else if (a === '--static' || a === '--on-device') { out.localOnly = true; out.renamed = `${a} is now --local-only`; }
    else if (/^--(name|host|kit|project|title|accent|space|web-config|commit|dir)$/.test(a)) out[a.slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

export function files(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) out.push(...files(dir, r)); }
    else if (TEXT.test(e.name) && !KEEP.includes(r)) out.push(r);
  }
  return out;
}

// The replacements that turn one app's values into another's, in order (the demo- project first, so the bare name
// never splits it). Also used by app-devkit's starter-drift report, so the two never disagree.
export function swapsFor(old, app) {
  return [
    // the live smoke test's repo secrets: STARTER_APP_TEST_EMAIL -> <NAME>_TEST_EMAIL
    [new RegExp(`(?<![A-Za-z0-9_])${keyOf(old.name)}_TEST_`, 'g'), `${keyOf(app.name)}_TEST_`],
    [new RegExp(`(?<![A-Za-z0-9-])demo-${esc(old.name)}(?![A-Za-z0-9])`, 'g'), `demo-${app.name}`],
    [new RegExp(esc(KITS[old.kit]), 'g'), KITS[app.kit]],
    [new RegExp(`(?<![A-Za-z0-9.-])${esc(old.host)}(?![A-Za-z0-9-])`, 'g'), app.host],
    [wordRe(old.name), app.name],
    [new RegExp(`(?<![A-Za-z0-9])${esc(old.title)}(?![A-Za-z0-9])`, 'g'), app.title],
  ];
}
export const KEEP_FILES = KEEP;
// whether fill (and the update path) treats a file as text it swaps the values in
export const isText = rel => TEXT.test(rel.split('/').pop()) && !KEEP.includes(rel);
// per-file settings that are not a plain swap (also used by the drift report)
export const fixup = (rel, text, app) => rel === 'wrangler.jsonc' ? text.replace(/("FIREBASE_PROJECT":\s*")[^"]*(")/, `$1${app.project}$2`) : text;

// the default look's colour (@core/theme) when --accent names none and config.js has none yet
export const ACCENT = '#3a6390';
const configJs = (app, web, accent, extra = {}) => `// The app's settings. tools/fill.mjs writes the name, host, kit and Firebase project here; --web-config adds the web
// app's apiKey and appId (\`firebase apps:sdkconfig WEB\`). A public client config, not a secret: the Firestore rules
// decide who sees what. Until apiKey is set the app runs only against the local emulators (?emulator on localhost).
// accent: the default look's colour (@core/theme; boot.js), set with --accent.
export const APP = ${JSON.stringify({ name: app.name, title: app.title, host: app.host, accent, ...extra })};
export const KIT = '${KITS[app.kit]}/v1/';
export const firebaseConfig = ${JSON.stringify(web, null, 2)};
`;
const localOnlyConfigJs = (app, accent, extra = {}) => `// The app's settings. tools/fill.mjs writes the name, title, host and kit here. A local-only app has no Firebase
// project: its data stays on the device (local.js); \`node tools/add.mjs sync --project <id>\` adds one.
// accent: the default look's colour (@core/theme; boot.js), set with --accent.
export const APP = ${JSON.stringify({ name: app.name, title: app.title, host: app.host, accent, ...extra })};
export const KIT = '${KITS[app.kit]}/v1/';
`;

// -> { changed: [files], app } ; throws on bad input (static: localOnly's old name)
export function fill({ dir = '.', check = false, localOnly = false, static: oldName = false, renamed: _, log = () => {}, exec = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' }), ...opts } = {}) {
  const metaPath = path.join(dir, '.starter.json');
  let meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const flat = localOnly || oldName;
  const render = flat && !meta.flavour;
  if (render && check) throw new Error('--check with --local-only: the app is not local-only yet, so a run would change it');
  if ((meta.flavour || flat) && opts.space) throw new Error(`a ${flavourId(meta.flavour) ?? 'local-only'} app keeps its data on the device: it has no spaces`);
  if ((meta.flavour || flat) && opts['web-config']) throw new Error(`a ${flavourId(meta.flavour) ?? 'local-only'} app has no web config (node tools/add.mjs sync --project <id> first)`);
  if (render) {
    // the checks below throw before anything changes; the render comes after them
    validate(meta, opts, true);
    // sw.js's list is read from the app-sync and app-ui packages, so a fresh clone (new-app: no node_modules) installs them
    // first; without them sw.js would keep the offline-first app's list, naming files the local-only app no longer has (the
    // worker
    // install fails: no offline start). Before the render, so a failed install leaves the app as it was and a re-run retries.
    if (!['app-sync', 'app-ui'].every(p => fs.existsSync(path.join(dir, 'node_modules', p, 'package.json')))) {
      log('npm ci (app-sync and app-ui, for sw.js\'s list)');
      exec('npm', ['ci', '--no-audit', '--no-fund', '--ignore-scripts'], dir);
    }
    renderDir({ dir, flavour: 'local-only', log });
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  }
  const old = meta.app;
  const app = validate(meta, opts, render);

  // the web config: kept from config.js unless --web-config gives a new one (or the project changed)
  const cfgPath = path.join(dir, 'app/src/config.js');
  const before = fs.readFileSync(cfgPath, 'utf8');
  const kept = JSON.parse(before.match(/export const firebaseConfig = (\{[\s\S]*?\});/)?.[1] || '{}');
  // a kept colour that is the old kit's default follows a new kit to its own
  const keptApp = JSON.parse(before.match(/export const APP = (\{.*\});/)?.[1] || '{}');
  const keptAccent = keptApp.accent?.toLowerCase();
  // the app's own APP keys (a look, a surface) stay as they are
  const extra = Object.fromEntries(Object.entries(keptApp).filter(([k]) => !['name', 'title', 'host', 'accent'].includes(k)));
  // whose a space is: given, else kept; 'shared' is the default, so config.js names only 'person'
  const space = opts.space ?? extra.space ?? 'shared';
  if (!SPACES.includes(space)) throw new Error(`--space '${space}': ${SPACES.join(' or ')}`);
  delete extra.space;
  if (space !== 'shared' && !meta.flavour) extra.space = space;
  const kitDefault = kit => KIT_ACCENT[kit] ?? ACCENT;
  const accent = (opts.accent ?? (keptAccent && keptAccent !== kitDefault(old.kit) ? keptAccent : kitDefault(app.kit))).toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(accent)) throw new Error(`--accent '${accent}': a colour like #3a6390`);
  let web = { projectId: app.project, authDomain: app.host, apiKey: '', appId: '' };
  if (opts['web-config']) {
    const w = JSON.parse(fs.readFileSync(opts['web-config'], 'utf8'));
    const sdk = w.sdkConfig || w.result?.sdkConfig || w;
    if (sdk.projectId && sdk.projectId !== app.project) throw new Error(`--web-config is for project ${sdk.projectId}, not ${app.project}`);
    web = { ...web, ...pick(sdk, ['apiKey', 'appId', 'storageBucket', 'messagingSenderId']) };
  } else if (kept.projectId === app.project) web = { ...web, ...pick(kept, ['apiKey', 'appId', 'storageBucket', 'messagingSenderId']) };

  const swaps = swapsFor(old, app);
  // a rename swaps the old name and title as words in every file: fine for the template's placeholders, but an app
  // named after a word its code uses (items, notes, list) would have that word changed too (its collection, rules,
  // imports). So refuse while the old name or title appears in the code; rename those places by hand first.
  // (the app's code and rules carry no name of their own: config.js does, and the worker's routes name the app on purpose)
  const inCode = rel => (rel.startsWith('app/src/') && rel !== 'app/src/config.js') || rel.endsWith('.rules');
  for (const [key, re] of [['name', wordRe(old.name)], ['title', new RegExp(`(?<![A-Za-z0-9])${esc(old.title)}(?![A-Za-z0-9])`)]]) {
    if (old[key] === app[key]) continue;
    const hits = files(dir).filter(rel => inCode(rel) && new RegExp(re.source).test(fs.readFileSync(path.join(dir, rel), 'utf8')));
    if (hits.length) throw new Error(`--${key}: the current ${key} '${old[key]}' is also a word in the code (${hits.slice(0, 5).join(', ')}${hits.length > 5 ? ', ...' : ''}), which a rename would change too; rename it there by hand first`);
  }
  const changed = [];
  const write = (rel, text) => {
    const p = path.join(dir, rel);
    if (fs.readFileSync(p, 'utf8') === text) return;
    changed.push(rel);
    if (!check) fs.writeFileSync(p, text);
  };
  for (const rel of files(dir)) {
    if (rel === 'app/src/config.js' || rel === '.starter.json') continue;
    let text = fs.readFileSync(path.join(dir, rel), 'utf8');
    for (const [re, to] of swaps) text = text.replace(re, to);
    text = fixup(rel, text, app);
    if (rel === 'app/firestore.app.rules' || rel === 'app/firestore.rules') text = spaceRules(text, space);
    write(rel, text);
  }
  write('app/src/config.js', meta.flavour ? localOnlyConfigJs(app, accent, extra) : configJs(app, web, accent, extra));
  const commit = opts.commit ?? meta.commit;   // the template commit this app started from (the new-app job passes it)
  // the template's own module recipes become the template's at that commit, so add.mjs has a pristine copy to compare
  const modules = meta.modules && commit ? Object.fromEntries(Object.entries(meta.modules).map(([m, s]) =>
    [m, /^recipes\/[\w.-]+\.json$/.test(s) ? `${meta.template}@${commit}:${s}` : s])) : meta.modules;
  // an old flavour id ("static") is written as it is now ("local-only")
  write('.starter.json', JSON.stringify({ ...meta, ...(meta.flavour ? { flavour: flavourId(meta.flavour) } : {}), commit, app, ...(modules ? { modules } : {}) }, null, 2) + '\n');
  // the render changed the import map: sw.js's list and the import-map hash follow (the packages are installed above)
  if (render) {
    after(dir, { install: false, log });
  }
  return { changed, app };
}

// the new values' checks, on their own: --local-only runs them before it renders
// -> { name, host, kit, project, title } (a local-only app's project is '' until it is given one)
// fresh: the app is being made local-only now (its template project goes)
function validate(meta, opts, fresh = false) {
  const old = meta.app;
  const app = { name: opts.name ?? old.name, host: opts.host ?? old.host, kit: opts.kit ?? old.kit,
    project: opts.project ?? (fresh ? '' : old.project), title: '' };
  app.title = opts.title ?? (opts.name && opts.name !== old.name ? titleOf(app.name) : old.title);
  const none = (fresh || meta.flavour) && app.project === '';
  for (const [k, [re, what]] of Object.entries(RULES)) if (!(k === 'project' && none) && !re.test(app[k])) throw new Error(`--${k} '${app[k]}': ${what}`);
  if (/["\\<>\n]/.test(app.title) || !app.title.trim()) throw new Error('--title: plain text, no quotes or angle brackets');
  if (opts.accent && !/^#[0-9a-f]{6}$/i.test(opts.accent)) throw new Error(`--accent '${opts.accent}': a colour like #3a6390`);
  return app;
}

const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k]).map(k => [k, String(o[k])]));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.renamed) console.log(args.renamed);
    const { changed, app } = fill({ ...args, log: console.log });
    console.log(changed.length ? `${args.check ? 'would change' : 'changed'}:\n  ${changed.join('\n  ')}` : 'nothing to change');
    console.log(`app: ${JSON.stringify(app)}`);
    if (args.check && changed.length) process.exit(1);
  } catch (e) {
    console.error(`fill: ${e.message}`);
    process.exit(2);
  }
}
