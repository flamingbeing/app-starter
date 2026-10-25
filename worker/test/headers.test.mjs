import test from 'node:test';
import assert from 'node:assert/strict';
import { csp, securityHeaders, KIT } from '../headers.js';

const parse = s => Object.fromEntries(s.split('; ').map(d => { const [k, ...v] = d.split(' '); return [k, v]; }));

test('CSP: self by default, no inline script, kit and core allowed, no framing', () => {
  const d = parse(csp({ project: 'p1' }));
  assert.deepEqual(d['default-src'], ["'self'"]);
  assert.ok(!d['script-src'].includes("'unsafe-inline'") && !d['script-src'].includes("'unsafe-eval'"));
  assert.ok(d['script-src'].includes(KIT) && d['script-src'].includes('https://core.anawj.com'));
  assert.ok(d['frame-src'].includes('https://p1.firebaseapp.com'));
  assert.deepEqual(d['frame-ancestors'], ["'none'"]);
  assert.deepEqual(d['object-src'], ["'none'"]);
  assert.ok(!d['connect-src'].some(s => s.startsWith('http://')));
});

test('CSP: the emulators only for local pages', () => {
  assert.ok(parse(csp({ local: true }))['connect-src'].includes('http://127.0.0.1:*'));
});

test('report-only until enforced; HSTS off on localhost', () => {
  const names = h => h.map(([k]) => k);
  assert.ok(names(securityHeaders({ enforce: false })).includes('Content-Security-Policy-Report-Only'));
  assert.ok(names(securityHeaders({ enforce: true })).includes('Content-Security-Policy'));
  assert.ok(!names(securityHeaders({ local: true })).includes('Strict-Transport-Security'));
});
