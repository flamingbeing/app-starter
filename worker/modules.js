// The optional modules' Worker routes and jobs (README, "Modules"): one import and one entry per module, which
// `node tools/add.mjs <recipe>` writes after the "add:" marks and `--remove` takes out again. A route is
//   { match(url) -> boolean, handle(request, env, { url, local, project }) -> Promise<Response> }
// and sites.js asks each in turn, after its own /api/ routes; the security headers are added to its answer there.
// SCHEDULED: jobs for the Cloudflare cron trigger (wrangler.jsonc "triggers", which the recipe with a job adds),
// (env, ctx) -> Promise; sites.js runs them all on every tick, each on its own (one failing does not stop the others).
// add: worker imports

/** @type {{ match(url: URL): boolean, handle(request: Request, env: any, ctx: { url: URL, local: boolean, project: string }): Promise<Response> }[]} */
export const ROUTES = [
  // add: worker routes
];

/** @type {((env: any, ctx: { waitUntil(p: Promise<unknown>): void }) => unknown)[]} */
export const SCHEDULED = [
  // add: worker jobs
];
