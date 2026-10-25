// Turns a copy of this template into one app: its name, address, design kit and Firebase project.
//
//   node tools/fill.mjs --name <name> --host <host> --kit homedesign|nuhs --project <firebase-project-id>
//                       [--title "<Title>"] [--accent '#rrggbb'] [--web-config <file.json>] [--commit <template sha>] [--dir <repo>] [--check]
//
// The values in use now are in .starter.json ("app"); each is replaced by the new one in every text file (the emulator
// project demo-<name>, the kit's address, the host, the name, the title), app/src/config.js is written afresh (with the
// default look's colour from --accent, else kept, and the web app's apiKey and appId from --web-config: the JSON
// `firebase apps:sdkconfig WEB` prints), and wrangler.jsonc's FIREBASE_PROJECT is set. Running it again with the same
// values changes nothing. --check changes nothing and exits 1 when a run would. Prints the files it changed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KITS = { homedesign: 'https://design.flamingbeing.com', nuhs: 'https://design.anawj.com' };
const SKIP_DIRS = new Set(['.git', 'node_modules', '.devkit', 'test-results', 'playwright-report']);
// never changed: these two name the placeholders on purpose; the other two are app-devkit's files (CI compares them)
const KEEP = ['tools/fill.mjs', 'tools/test/fill.test.mjs', 'worker/claims.js', 'worker/custom-token.js'];
const TEXT = /\.(m?js|json|jsonc|html|css|md|webmanifest|rules|ya?ml|svg|txt)$|^\.[a-z]+ignore$/;

const RULES = {
  name: [/^[a-z][a-z0-9-]{1,28}[a-z0-9]$/, 'lowercase letters, digits and hyphens, 3-30 characters'],
  host: [/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, 'a host name like app.example.com'],
  project: [/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, 'a Firebase project id (6-30 lowercase letters, digits, hyphens)'],
  kit: [new RegExp(`^(${Object.keys(KITS).join('|')})$`), Object.keys(KITS).join(' or ')],
};
const titleOf = name => name.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// the name as a whole word: not inside a longer name (my-starter-app) or the demo- project (handled first)
const wordRe = s => new RegExp(`(?<![A-Za-z0-9-])${esc(s)}(?![A-Za-z0-9])`, 'g');

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') out.check = true;
    else if (/^--(name|host|kit|project|title|accent|web-config|commit|dir)$/.test(a)) out[a.slice(2)] = argv[++i];
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
    [new RegExp(`(?<![A-Za-z0-9-])demo-${esc(old.name)}(?![A-Za-z0-9])`, 'g'), `demo-${app.name}`],
    [new RegExp(esc(KITS[old.kit]), 'g'), KITS[app.kit]],
    [new RegExp(`(?<![A-Za-z0-9.-])${esc(old.host)}(?![A-Za-z0-9-])`, 'g'), app.host],
    [wordRe(old.name), app.name],
    [new RegExp(`(?<![A-Za-z0-9])${esc(old.title)}(?![A-Za-z0-9])`, 'g'), app.title],
  ];
}
export const KEEP_FILES = KEEP;
// per-file settings that are not a plain swap (also used by the drift report)
export const fixup = (rel, text, app) => rel === 'wrangler.jsonc' ? text.replace(/("FIREBASE_PROJECT":\s*")[^"]*(")/, `$1${app.project}$2`) : text;

// the default look's colour (@core/theme) when --accent names none and config.js has none yet
export const ACCENT = '#3a6390';
const configJs = (app, web, accent) => `// The app's settings. tools/fill.mjs writes the name, host, kit and Firebase project here; --web-config adds the web
// app's apiKey and appId (\`firebase apps:sdkconfig WEB\`). A public client config, not a secret: the Firestore rules
// decide who sees what. Until apiKey is set the app runs only against the local emulators (?emulator on localhost).
// accent: the default look's colour (@core/theme; boot.js), set with --accent.
export const APP = ${JSON.stringify({ name: app.name, title: app.title, host: app.host, accent })};
export const KIT = '${KITS[app.kit]}/v1/';
export const firebaseConfig = ${JSON.stringify(web, null, 2)};
`;

// -> { changed: [files], app } ; throws on bad input
export function fill({ dir = '.', check = false, ...opts } = {}) {
  const metaPath = path.join(dir, '.starter.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const old = meta.app;
  const app = { name: opts.name ?? old.name, host: opts.host ?? old.host, kit: opts.kit ?? old.kit, project: opts.project ?? old.project };
  for (const [k, [re, what]] of Object.entries(RULES)) if (!re.test(app[k])) throw new Error(`--${k} '${app[k]}': ${what}`);
  app.title = opts.title ?? (opts.name && opts.name !== old.name ? titleOf(app.name) : old.title);
  if (/["\\<>\n]/.test(app.title) || !app.title.trim()) throw new Error('--title: plain text, no quotes or angle brackets');

  // the web config: kept from config.js unless --web-config gives a new one (or the project changed)
  const cfgPath = path.join(dir, 'app/src/config.js');
  const before = fs.readFileSync(cfgPath, 'utf8');
  const kept = JSON.parse(before.match(/export const firebaseConfig = (\{[\s\S]*?\});/)?.[1] || '{}');
  const accent = (opts.accent ?? JSON.parse(before.match(/export const APP = (\{.*\});/)?.[1] || '{}').accent ?? ACCENT).toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(accent)) throw new Error(`--accent '${accent}': a colour like #3a6390`);
  let web = { projectId: app.project, authDomain: app.host, apiKey: '', appId: '' };
  if (opts['web-config']) {
    const w = JSON.parse(fs.readFileSync(opts['web-config'], 'utf8'));
    const sdk = w.sdkConfig || w.result?.sdkConfig || w;
    if (sdk.projectId && sdk.projectId !== app.project) throw new Error(`--web-config is for project ${sdk.projectId}, not ${app.project}`);
    web = { ...web, ...pick(sdk, ['apiKey', 'appId', 'storageBucket', 'messagingSenderId']) };
  } else if (kept.projectId === app.project) web = { ...web, ...pick(kept, ['apiKey', 'appId', 'storageBucket', 'messagingSenderId']) };

  const swaps = swapsFor(old, app);
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
    write(rel, text);
  }
  write('app/src/config.js', configJs(app, web, accent));
  const commit = opts.commit ?? meta.commit;   // the template commit this app started from (the new-app job passes it)
  write('.starter.json', JSON.stringify({ ...meta, commit, app }, null, 2) + '\n');
  return { changed, app };
}

const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k]).map(k => [k, String(o[k])]));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const { changed, app } = fill(args);
    console.log(changed.length ? `${args.check ? 'would change' : 'changed'}:\n  ${changed.join('\n  ')}` : 'nothing to change');
    console.log(`app: ${JSON.stringify(app)}`);
    if (args.check && changed.length) process.exit(1);
  } catch (e) {
    console.error(`fill: ${e.message}`);
    process.exit(2);
  }
}
