// Visual QA: screenshots the landing page at several viewports and scroll depths.
// Usage: node tests/visual/shoot.mjs <outDir> [baseUrl] [widths...]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const [out = 'qa', base = 'http://localhost:3000', ...ws] = process.argv.slice(2);
const VIEWPORTS = { 360: 800, 390: 844, 430: 932, 768: 1024, 1280: 800, 1440: 900, 1920: 1080 };
const widths = ws.length ? ws.map(Number) : Object.keys(VIEWPORTS).map(Number);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const w of widths) {
  const h = VIEWPORTS[w] ?? 900;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 800 ? 2 : 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1500);
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const stops = await page.evaluate(() => {
    const ids = ['connected', 'movement', 'scenario-lab', 'engineering'];
    return ids.map((id) => ({ id, y: (document.getElementById(id)?.getBoundingClientRect().top ?? 0) + window.scrollY }));
  });
  const shots = [['hero-0', 0], ['hero-mid', h * 0.9], ['hero-end', h * 1.6]];
  for (const s of stops) shots.push([s.id, s.y]);
  // pinned sections between movement and scenario lab
  const mv = stops.find((s) => s.id === 'movement').y;
  const lab = stops.find((s) => s.id === 'scenario-lab').y;
  shots.push(['movement-live', mv + h * 0.75]);
  for (let k = 1; k <= 5; k++) shots.push([`pinned-${k}`, mv + (lab - mv) * (0.25 + k * 0.13)]);
  shots.push(['enter', total - h * 1.6], ['footer', total]);
  for (const [name, y] of shots) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${w}-${name}.png` });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(w, 'height', total, 'h-overflow', overflow, 'errors', errors.slice(0, 3));
  await page.close();
}
await browser.close();
