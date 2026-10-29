// Captures the landing page at fixed scroll offsets for before/after comparison.
// Usage: node tests/visual/landing-snap.mjs <outDir> [url]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2]; const url = process.argv[3] ?? 'http://localhost:8090/madar/';
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  const total = await p.evaluate(() => document.documentElement.scrollHeight);
  let i = 0;
  for (let y = 0; y < total; y += Math.round(h * 0.9)) {
    await p.evaluate((y) => window.scrollTo(0, y), y);
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/${w}-${String(i++).padStart(2, '0')}.png` });
  }
  console.log(w, 'height', total, 'shots', i);
  await p.close();
}
await b.close();
