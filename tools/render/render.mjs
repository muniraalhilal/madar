// Offline renderer: bundles the scene, renders a preset in headless Chromium
// (SwiftShader WebGL2), supersamples, and writes a lossless PNG at the exact
// target resolution. Usage: node render.mjs <preset> <width> <height> [supersample]
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const [preset = 'hero-desktop', w = '1280', h = '720', ss = '1'] = process.argv.slice(2);
const out = join(here, 'out');
mkdirSync(out, { recursive: true });

const bundle = await build({ entryPoints: [join(here, 'src/scene.js')], bundle: true, format: 'iife', write: false, minify: false });
const code = bundle.outputFiles[0].text;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=6144'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text().slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.setContent('<html><body style="margin:0;background:#000"></body></html>');
await page.addScriptTag({ content: code });
const t0 = Date.now();
const info = await page.evaluate(async ([p, W, H, S]) => {
  const r = await window.madarRender(p, W, H, S);
  const c = document.querySelector('canvas');
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { ...r, png: btoa(bin) };
}, [preset, Number(w), Number(h), Number(ss)]);
const raw = Buffer.from(info.png, 'base64');
const file = join(out, `${preset}-${w}x${h}.png`);
await sharp(raw).resize(Number(w), Number(h), { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(file);
console.log(JSON.stringify({ file, ms: Date.now() - t0, stats: info.stats, calls: info.info }));
await browser.close();
