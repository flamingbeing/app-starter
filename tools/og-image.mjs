// Dev tool: the app's link-preview picture. Renders app/public/icons/og.png (1200x630, the size chat apps and social
// sites show as a large card) from the app's own icon (app/public/icons/icon.svg), its name and its address
// (.starter.json "app": title, host) on the manifest's background colour. app/index.html's og:image and twitter:image
// point at it by its full address (WhatsApp and others ignore a relative one). Run it again after a change of icon or
// name; nothing loads it at startup, so it is not in sw.js's list. The picture carries the name and address it was
// drawn for (a PNG text chunk, `og-for`), so a test can tell an app still showing another app's card
// (tools/test/og-image.test.mjs), e.g. the template's, brought in by tools/update-from-starter.mjs.
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

// PNG chunks are checksummed with CRC-32 (zlib's polynomial)
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (/** @type {Buffer} */ b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const KEY = 'og-for';
/** What a picture is for: its title and host, one line (the stamp). @param {{ title: string, host: string }} o */
export const ogFor = ({ title, host }) => `${title} | ${host}`;

/** The PNG with a text chunk (KEY: text) after its header, any earlier one of that key dropped.
 * @param {Buffer} png @param {string} text */
export function stamp(png, text) {
  const out = [png.subarray(0, 33)];   // signature (8) and IHDR (25)
  for (let at = 33; at < png.length;) {
    const len = png.readUInt32BE(at), end = at + 12 + len;
    const isOurs = png.toString('latin1', at + 4, at + 8) === 'tEXt' && png.toString('latin1', at + 8, at + 8 + KEY.length + 1) === `${KEY}\0`;
    if (!isOurs) out.push(png.subarray(at, end));
    at = end;
  }
  const body = Buffer.concat([Buffer.from('tEXt', 'latin1'), Buffer.from(`${KEY}\0`, 'latin1'), Buffer.from(text, 'utf8')]);
  const chunk = Buffer.alloc(body.length + 8);
  chunk.writeUInt32BE(body.length - 4, 0); body.copy(chunk, 4); chunk.writeUInt32BE(crc32(body), body.length + 4);
  return Buffer.concat([out[0], chunk, ...out.slice(1)]);
}

/** The stamp of a PNG ('' when it has none). @param {Buffer} png */
export function stampOf(png) {
  for (let at = 33; at + 12 <= png.length;) {
    const len = png.readUInt32BE(at);
    if (png.toString('latin1', at + 4, at + 8) === 'tEXt') {
      const data = png.subarray(at + 8, at + 8 + len), zero = data.indexOf(0);
      if (data.toString('latin1', 0, zero) === KEY) return data.subarray(zero + 1).toString('utf8');
    }
    at += 12 + len;
  }
  return '';
}

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
    const title = manifest.name || app.title;
    await page.setContent(ogPage({ icon, title, host: app.host, bg: manifest.background_color || '#1c1c1e' }));
    fs.writeFileSync(path.join(ICONS, 'og.png'), stamp(await page.screenshot(), ogFor({ title, host: app.host })));
    console.log('og-image: app/public/icons/og.png');
  } finally { await browser.close(); }
}
