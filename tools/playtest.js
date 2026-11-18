// Playtest: load the playtest shot (autopilot walks to the pier) and watch mission 1
// complete on its own. Verifies the mission flow end to end in a real browser.
// (The old ?shot=walk scene is now the beach vista; the autopilot staging
// lives on as ?shot=playtest so this tool keeps working.)
// Usage: node tools/playtest.js
const puppeteer = require('/home/hatch/workspace/makefun/threejs-fps-02/harness/node_modules/puppeteer-core');
const CHROME = '/home/hatch/.cache/puppeteer/chrome/linux-157.0.8103.50/chrome-linux64/chrome';
(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=960,540'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 540 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 300)));
  await page.goto('http://localhost:8091/?shot=playtest&seed=7', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const t0 = Date.now();
  let done = false;
  while (Date.now() - t0 < 200000) {
    await new Promise((r) => setTimeout(r, 10000));
    const s = await page.evaluate(() => {
      const W = window.__world;
      if (!W) return null;
      return {
        time: +W.time.toFixed(1),
        missionIndex: W.missionIndex,
        missionsDone: W.missionsDone,
        cash: W.cash,
        px: +W.player.x.toFixed(0), pz: +W.player.z.toFixed(0),
        objective: document.getElementById('hud-objective')?.textContent,
        save: !!localStorage.getItem('solmarbay-save-v1'),
      };
    });
    console.log(`t=${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(s));
    if (s && s.missionsDone >= 1) { done = true; break; }
  }
  console.log(done ? 'PLAYTEST OK: mission 1 completed, reward paid' : 'PLAYTEST: mission 1 did NOT complete in time');
  await browser.close();
  process.exit(done ? 0 : 1);
})().catch((e) => { console.error('PLAYTEST FAIL', e); process.exit(1); });
