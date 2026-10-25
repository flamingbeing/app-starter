// Security headers for every answer the Worker gives (sites.js). Pure functions, tested in worker/test/headers.test.mjs.
//
// The Content-Security-Policy starts as Report-Only (docs/decisions/0003-csp-report-only-first.md): the browser reports
// what it would have blocked but blocks nothing. Set CSP_ENFORCE to true once a live sign-in, sync and update show no
// reports (the e2e tests fail on any report already).

// The design kit's origin. tools/fill.mjs sets it from --kit (homedesign or nuhs).
export const KIT = 'https://design.flamingbeing.com';
export const CSP_ENFORCE = false;

// Shared modules (app-sync, app-update) are served at exact versions from here.
const CORE = 'https://core.anawj.com';
// Firebase: the SDK (gstatic, versioned), Google sign-in, Firestore and Auth APIs.
const SDK = 'https://www.gstatic.com';
const GOOGLE_API = 'https://apis.google.com';
const FONTS_CSS = 'https://fonts.googleapis.com';
const FONTS = 'https://fonts.gstatic.com';

// local: the page is served from localhost (tests), which talks to the Firebase emulators over http.
export function csp({ kit = KIT, project = '', local = false } = {}) {
  const emulators = local ? ['http://127.0.0.1:*', 'http://localhost:*', 'ws://127.0.0.1:*'] : [];
  const frames = ["'self'", 'https://accounts.google.com', ...(project ? [`https://${project}.firebaseapp.com`] : [])];
  const d = {
    'default-src': ["'self'"],
    'script-src': ["'self'", CORE, SDK, GOOGLE_API, kit],
    'style-src': ["'self'", kit, FONTS_CSS],
    'font-src': ["'self'", kit, FONTS],
    'img-src': ["'self'", 'data:', 'blob:', kit, 'https://lh3.googleusercontent.com', 'https://www.google.com'],   // (the SDK's connectivity ping)
    'connect-src': ["'self'", CORE, SDK, kit, FONTS_CSS, FONTS, 'https://*.googleapis.com', GOOGLE_API, ...emulators],
    'frame-src': frames,
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(d).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');
}

// -> [name, value] pairs to set on an answer
export function securityHeaders({ kit = KIT, project = '', local = false, enforce = CSP_ENFORCE } = {}) {
  return [
    [enforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', csp({ kit, project, local })],
    ...(local ? [] : [['Strict-Transport-Security', 'max-age=31536000; includeSubDomains']]),
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['X-Frame-Options', 'DENY'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'],
    // the Google sign-in popup must be able to hand back to this page
    ['Cross-Origin-Opener-Policy', 'same-origin-allow-popups'],
  ];
}
