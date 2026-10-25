// axe-core in the page: serious and critical problems only, as "rule: target" lines (empty = none).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const src = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
export default async function axe(page) {
  // (evaluated, not a script tag; axe's own inline style is the tool's, not the page's, so its CSP reports are dropped)
  const before = await page.evaluate(() => (window.__csp || []).length);
  await page.evaluate(src);
  const r = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }));
  await new Promise(res => setTimeout(res, 100));   // (violation events arrive asynchronously)
  await page.evaluate(n => { if (window.__csp) window.__csp.length = n; }, before);
  return r.violations.filter(v => ['serious', 'critical'].includes(v.impact)).flatMap(v => v.nodes.map(n => `${v.id}: ${n.target.join(' ')}`));
}
