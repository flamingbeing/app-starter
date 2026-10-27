// Soak runner: lean app-starter + `add` recipes in every order (made-up data, no Firebase project, no secrets).
//
//   node soak/run.mjs [--loops N] [--seed S] [--recipes files,search,...] [--steps unit,tsc,rules,e2e] [--browser chromium|firefox|webkit]
//                     [--browsers chromium,firefox,webkit] [--static] [--combo files>search] [--pw <spec file>] [--repeat N] [--vite] [--box <pw-box.sh>] [--docker] [--keep] [--out DIR]
//
// Each loop takes the next combo of recipes (none, then every subset in every order; a recipe with no recipes/<name>.json
// is skipped, once, with a note), copies this checkout to a scratch dir, fills it as a throwaway app (seed -> name),
// runs `tools/add.mjs` for the combo in that order, rebuilds the rules, and runs: sw-files --check, unit, tsc, rules
// test on the Firestore emulator, e2e. One summary line per loop; the end is `PASS n/N` or `FAIL <seed> <log>` for the
// first failure (the loop goes on, so the PASS count is exact). Needs `. tools/dev-setup.sh` first (.devkit/, node_modules/,
// java, PW_CHROMIUM). --box <app-devkit>/tools/pw-box.sh runs e2e in its container (Firefox/WebKit too, own network
// namespace so several runners can share a host); the rules step is skipped on a host with no java. Seed S + loop i is the whole input: `--seed S --loops 1 --start i` repeats a loop.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.env.METADATA_SERVER_DETECTION ??= 'none';
if (!process.env.PW_CHROMIUM && fs.existsSync('/opt/pw-browsers/chromium')) process.env.PW_CHROMIUM = '/opt/pw-browsers/chromium';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map(a => {
  const [k, ...v] = a.trim().split(/\s+/); return [k, v.length ? v.join(' ') : true];
}));
const LOOPS = Number(args.loops ?? 12), SEED = Number(args.seed ?? 1), START = Number(args.start ?? 0);
const RECIPES = String(args.recipes ?? 'files,search').split(',').filter(Boolean);
const STEPS = String(args.steps ?? 'unit,tsc,rules,e2e').split(',');
const OUT = path.resolve(String(args.out ?? path.join(os.tmpdir(), `starter-soak-${process.pid}`)));
fs.mkdirSync(OUT, { recursive: true });

const have = RECIPES.filter(r => fs.existsSync(path.join(ROOT, 'recipes', `${r}.json`)));
const missing = RECIPES.filter(r => !have.includes(r));
if (missing.length) console.log(`note: no recipes/<name>.json for ${missing.join(', ')}; not soaked`);

const perms = list => list.length ? list.flatMap((x, i) => perms([...list.slice(0, i), ...list.slice(i + 1)]).map(p => [x, ...p])) : [[]];
const subsets = list => list.reduce((acc, x) => [...acc, ...acc.map(s => [...s, x])], [[]]);
let COMBOS = subsets(have).flatMap(perms).filter((c, i, all) => all.findIndex(d => d.join() === c.join()) === i)
  .sort((a, b) => a.length - b.length);
if (args.static) COMBOS = [[], ...COMBOS.map(c => ['cloud', ...c])];   // a static base: alone, or made the cloud app first
if (args.combo) COMBOS = [String(args.combo) === 'none' ? [] : String(args.combo).split('>')];
const HAS_JAVA = spawnSync('java', ['-version']).status === 0;
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

const run = (cmd, cwd, log, env = {}) => {
  fs.appendFileSync(log, `\n$ ${cmd}\n`);
  const r = spawnSync('bash', ['-c', `${cmd} >> "${log}" 2>&1`], { cwd, env: { ...process.env, ...env } });
  return r.status === 0;
};

let pass = 0, firstFail = null;
const total = LOOPS;
for (let n = START; n < START + LOOPS; n++) {
  const combo = COMBOS[n % COMBOS.length];
  const seed = SEED * 1000 + n;
  const name = `soak${seed}`;
  const dir = path.join(OUT, name);
  const log = path.join(OUT, `${name}.log`);
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(log, { force: true });
  const t0 = Date.now();
  let failed = null;
  const step = (label, cmd, cwd = dir, env = {}) => { if (!failed && !run(cmd, cwd, log, env)) failed = label; };

  step('copy', `mkdir -p "${dir}" && tar --exclude=.git --exclude=node_modules --exclude=.devkit --exclude=test-results --exclude=soak -cf - . | tar -xf - -C "${dir}" && ${args.box ? 'cp -a' : 'ln -s'} "${ROOT}/node_modules" "${dir}/node_modules" && cp -a "${ROOT}/.devkit" "${dir}/.devkit"`, ROOT);
  step('fill', `node tools/fill.mjs --name ${name} --host ${name}.example.org --kit homedesign ${args.static ? '--static' : `--project ${name}-demo`}`);
  for (const m of combo) step(`add ${m}`, m === 'cloud' ? `node tools/add.mjs cloud --project ${name}-demo` : `node tools/add.mjs recipes/${m}.json`);
  const cloud = !args.static || combo.includes('cloud');
  if (cloud) step('rules-build', `node .devkit/tools/build-rules.mjs app/firestore.app.rules`);
  step('sw', `node tools/sw-files.mjs app --check`);
  const fire = args.vite ? 'npm run vite && ' : '';
  const e2eEnv = args.vite ? { APP_DIR: 'dist' } : {};
  if (STEPS.includes('unit')) step('unit', `node --test 'worker/test/*.test.mjs' 'app/test/*.unit.test.mjs'`);
  if (STEPS.includes('tsc')) step('tsc', `npm run typecheck`);
  if (cloud && STEPS.includes('rules') && (!args.box || HAS_JAVA)) step('rules', `npx -y firebase-tools@15.33.0 emulators:exec --only firestore --project demo-${name} "node --test test/rules.test.mjs"`, path.join(dir, 'app'));
  const pwArgs = `${args.pw ? ' ' + args.pw : ''}${args.repeat ? ' --repeat-each ' + args.repeat : ''}`;
  const e2e = (args.box ? `bash "${args.box}" ${args.docker ? '--docker ' : ''}-b ${args.browsers ?? 'chromium'}${pwArgs ? ' --' : ''}` : 'npx playwright test') + pwArgs;
  if (STEPS.includes('e2e')) step('e2e', `${fire}${e2e}`, dir, e2eEnv);

  const s = Math.round((Date.now() - t0) / 1000);
  const label = `${name} [${combo.join('>') || 'none'}]`;
  if (failed) {
    console.log(`loop ${n} FAIL at ${failed} ${label} ${s}s log ${log}`);
    firstFail ??= `FAIL seed=${SEED} loop=${n} step=${failed} log=${log}`;
  } else {
    pass++;
    console.log(`loop ${n} ok ${label} ${s}s`);
    if (!args.keep) { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(log, { force: true }); }
  }
}
console.log(`PASS ${pass}/${total}${firstFail ? `  first ${firstFail}` : ''}`);
process.exit(pass === total ? 0 : 1);
