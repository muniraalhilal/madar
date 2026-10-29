// Screenshots every demo page at phone and desktop widths, and checks for horizontal overflow and console errors.
// Usage: node tests/visual/demo-pages.mjs <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2];
const base = process.env.SITE_URL ?? 'http://localhost:8090/madar/';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 160)));
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await p.goto(base + 'app/', { waitUntil: 'load' });
  await p.getByRole('button', { name: 'Explore demo' }).click({ timeout: 60000 });
  await p.getByText('Recent runs').waitFor({ timeout: 60000 });
  const ids = await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('madar.demo.v1'));
    const r = s.runs.filter((x) => x.status === 'completed');
    return { scenario: s.scenarios[0].id, variant: s.scenarios[1].id, run: r[0].id, b: r.find((x) => x.scenarioId === s.scenarios[0].id).id, v: r[0].id };
  });
  const pages = ['app/', 'app/explorer/', 'app/traffic/', 'app/scenarios/', `app/scenarios/view/?id=${ids.variant}`, 'app/results/', `app/results/view/?id=${ids.run}`, 'app/compare/', `app/compare/?baseline=${ids.b}&variant=${ids.v}`, 'app/energy/', 'app/incidents/', 'app/reports/', 'app/saved/', 'app/help/', 'app/settings/'];
  for (const [i, path] of pages.entries()) {
    await p.goto(base + path, { waitUntil: 'load' });
    await p.waitForTimeout(path.includes('explorer') ? 5000 : 2500);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await p.screenshot({ path: `${out}/${w}-${String(i).padStart(2, '0')}.png`, fullPage: !path.includes('explorer') });
    console.log(w, path.split('?')[0], 'overflow', overflow);
  }
  console.log(w, 'errors', errs);
  await ctx.close();
}
await b.close();
