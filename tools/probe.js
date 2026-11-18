// Quick probe: load one shot URL, dump console/page errors and __shotReady.
const puppeteer = require('/home/hatch/workspace/makefun/threejs-fps-02/harness/node_modules/puppeteer-core');
const CHROME = '/home/hatch/.cache/puppeteer/chrome/linux-157.0.8103.50/chrome-linux64/chrome';
(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 500)));
  page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 300)));
  page.on('requestfailed', (r) => console.log('REQFAIL:', r.url(), r.failure()?.errorText));
  const url = process.argv[2] || 'http://localhost:8091/?shot=cover&seed=7';
  console.log('goto', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('loaded, waiting 45s...');
  for (let i = 0; i < 9; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await page.evaluate(() => ({
      ready: window.__shotReady,
      errors: window.__gameErrors,
      hasWorld: !!window.__world,
      state: window.__world?.state,
      time: window.__world?.time,
    })).catch((e) => ({ evalFail: String(e).slice(0, 200) }));
    console.log(`t=${(i + 1) * 5}s`, JSON.stringify(s));
    if (s.ready) break;
  }
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('PROBE FAIL', e); process.exit(1); });
