// Dev tool: the app's link-preview picture. Renders app/public/icons/og.png (1200x630, the size chat apps and social
// sites show as a large card) from the app's own icon (app/public/icons/icon.svg), its name and its address
// (.starter.json "app": title, host) on the manifest's background colour. app/index.html's og:image and twitter:image
// point at it by its full address (WhatsApp and others ignore a relative one). Run it again after a change of icon or
// name; nothing loads it at startup, so it is not in sw.js's list.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tools/og-image.mjs [--dir <app>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const at = args.indexOf('--dir');
const ROOT = at >= 0 ? path.resolve(args[at + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = path.join(ROOT, 'app/public/icons');

const esc = (/** @type {string} */ s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** The page the picture is a screenshot of. @param {{ icon: string, title: string, host: string, bg: string }} o */
export const ogPage = ({ icon, title, host, bg }) => `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{background:${bg};color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
display:flex;align-items:center;gap:72px;padding:0 110px;box-sizing:border-box}
.mark{flex:none;width:300px;height:300px;filter:drop-shadow(0 18px 40px rgba(0,0,0,.35))}
.mark svg{display:block;width:100%;height:100%}
h1{margin:0;font-size:104px;font-weight:700;line-height:1.05;letter-spacing:-.02em;overflow-wrap:anywhere}
p{margin:22px 0 0;font-size:40px;opacity:.7}
</style><div class="mark">${icon}</div><div><h1>${esc(title)}</h1><p>${esc(host)}</p></div>`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const { app } = JSON.parse(fs.readFileSync(path.join(ROOT, '.starter.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/public/manifest.webmanifest'), 'utf8'));
  const icon = fs.readFileSync(path.join(ICONS, 'icon.svg'), 'utf8');
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.setContent(ogPage({ icon, title: manifest.name || app.title, host: app.host, bg: manifest.background_color || '#1c1c1e' }));
    await page.screenshot({ path: path.join(ICONS, 'og.png') });
    console.log('og-image: app/public/icons/og.png');
  } finally { await browser.close(); }
}
