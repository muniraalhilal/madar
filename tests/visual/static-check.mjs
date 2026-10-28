import { chromium } from 'playwright';
const b = await chromium.launch();
for (const vp of [{width:1440,height:900},{width:390,height:844}]) {
  const p = await b.newPage({ viewport: vp });
  const errs = []; const bad = [];
  p.on('console', m => m.type()==='error' && errs.push(m.text()));
  p.on('pageerror', e => errs.push(String(e)));
  p.on('response', r => r.status() >= 400 && bad.push(r.status()+' '+r.url()));
  await p.goto(process.env.SITE_URL ?? 'http://localhost:8090/madar/', { waitUntil: 'networkidle' });
  await p.mouse.wheel(0, 3000); await p.waitForTimeout(1500);
  for (let y=0; y<30000; y+=900) { await p.evaluate(y=>scrollTo(0,y), y); await p.waitForTimeout(120); }
  await p.waitForTimeout(3000);
  const live = await p.evaluate(() => document.body.innerText.match(/vehicles?[^\n]{0,40}/i)?.[0]);
  console.log(vp.width, 'errors', errs, 'bad', bad.slice(0,10), 'live', live);
  await p.close();
}
await b.close();
