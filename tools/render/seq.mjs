// Renders a scroll-scrubbed camera flight as a numbered WebP frame sequence.
// Usage: node seq.mjs <preset> <width> <height> <frames> <outDir> [supersample]
import { build } from 'esbuild';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { FLIGHTS } from './src/flights.js';

const here = dirname(fileURLToPath(import.meta.url));
const [preset, w, h, n, outDir, ss = '1'] = process.argv.slice(2);
const W = Number(w), H = Number(h), N = Number(n), S = Number(ss);
const flight = FLIGHTS[preset];
if (!flight) throw new Error(`No flight for ${preset}`);
mkdirSync(outDir, { recursive: true });

const bundle = await build({ entryPoints: [join(here, 'src/scene.js')], bundle: true, format: 'iife', write: false });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=6144'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.setContent('<html><body style="margin:0"></body></html>');
await page.addScriptTag({ content: bundle.outputFiles[0].text });
await page.evaluate(([p, W, H, S]) => window.madarRender(p, W, H, S), [preset, W, H, S]);

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
for (let i = 0; i < N; i++) {
  if (process.env.RESUME && existsSync(join(outDir, `${String(i).padStart(3, '0')}.webp`))) continue;
  const u = N === 1 ? 1 : i / (N - 1);
  const e = ease(u);
  const opts = {
    camera: lerp(flight.from.camera, flight.to.camera, e),
    target: lerp(flight.from.target, flight.to.target, e),
    orb: flight.orb[0] + (flight.orb[1] - flight.orb[0]) * u,
    time: u * flight.time,
  };
  const t0 = Date.now();
  const b64 = await page.evaluate(async (o) => {
    window.madarFrame(o);
    const c = document.querySelector('canvas');
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let k = 0; k < buf.length; k += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(k, k + 0x8000));
    return btoa(bin);
  }, opts);
  const file = join(outDir, `${String(i).padStart(3, '0')}.webp`);
  await sharp(Buffer.from(b64, 'base64')).resize(W, H, { kernel: 'lanczos3' }).webp({ quality: 80, effort: 5 }).toFile(file);
  console.log(`frame ${i + 1}/${N} ${Date.now() - t0}ms`);
}
await browser.close();
