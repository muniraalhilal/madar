// Screenshots authenticated app pages. Usage: node app-shoot.mjs <outDir> [width] [height]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const [out = 'qa-app', w = '1440', h = '900'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const base = 'http://localhost:3000';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`${page.url()} ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`${page.url()} ${m.text().slice(0, 200)}`));
await page.goto(`${base}/login`);
await page.fill('input[name=email]', 'planner@madar.dev');
await page.fill('input[name=password]', process.env.DEMO_PASSWORD ?? 'madar-demo-2026');
await page.click('button[type=submit]');
await page.waitForURL('**/app', { timeout: 30000 });
const pages = (process.env.PAGES ?? '/app,/app/explorer,/app/traffic,/app/energy,/app/incidents,/app/scenarios,/app/results,/app/reports,/app/saved,/app/settings').split(',');
for (const p of pages) {
  await page.goto(base + p, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => undefined);
  await page.waitForTimeout(p.includes('explorer') ? 6000 : 1500);
  await page.screenshot({ path: `${out}/${w}${p.replaceAll('/', '_')}.png`, fullPage: !p.includes('explorer') });
}
console.log('errors', JSON.stringify(errors.slice(0, 10), null, 1));
await browser.close();
