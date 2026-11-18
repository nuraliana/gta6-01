// Retake the 4 dossier screenshots headlessly: ?shot=<name>&seed=N, wait for
// __shotReady, capture 1280x720 JPEG, and count console errors, failed requests
// and requests to hosts other than localhost.
// Usage: node tools/shots.js   (writes screenshots/1-cover.jpg ... 4-mission.jpg)
const puppeteer = require('/home/hatch/workspace/makefun/threejs-fps-02/harness/node_modules/puppeteer-core');
const { spawn } = require('child_process');
const fs = require('fs');

const SHELL = '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell';
const CHROME = '/home/hatch/.cache/puppeteer/chrome/linux-157.0.8103.50/chrome-linux64/chrome';
const REPO = '/home/hatch/workspace/makefun/gta6-01/repo';
const PORT = 8091;
const OUT = `${REPO}/screenshots`;
const shots = [
  { name: 'cover', file: '1-cover.jpg', seed: 7 },
  { name: 'beach', file: '2-beach.jpg', seed: 7 },
  { name: 'chase', file: '3-chase.jpg', seed: 7 },
  { name: 'mission', file: '4-mission.jpg', seed: 7 },
].filter((s) => !process.env.SHOT || s.name === process.env.SHOT);

function startServer() {
  return new Promise((resolve) => {
    const p = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
    setTimeout(() => resolve(p), 1500);
    p.on('error', () => resolve(p));
  });
}

(async () => {
  const server = await startServer();
  const exe = fs.existsSync(SHELL) ? SHELL : CHROME;
  console.log('browser:', exe);
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=960,540'],
  });
  let failed = 0;
  for (const shot of shots) {
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 540 });
    const errors = [];
    const failedReqs = [];
    const external = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('requestfailed', (r) => failedReqs.push(r.url()));
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') external.push(r.url());
    });
    try {
      await page.goto(`http://localhost:${PORT}/?shot=${shot.name}&seed=${shot.seed}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => window.__shotReady === true, { timeout: 180000 });
      await new Promise((r) => setTimeout(r, 400));
      await page.screenshot({ path: `${OUT}/${shot.file}`, type: 'jpeg', quality: 82 });
      const state = await page.evaluate(() => ({
        errors: window.__gameErrors || [],
        state: window.__world ? window.__world.state : 'no-world',
        wanted: window.__world ? window.__world.wanted : null,
        cash: window.__world ? window.__world.cash : null,
        cars: window.__world ? window.__world.cars.length : null,
        peds: window.__world ? window.__world.peds.length : null,
      }));
      console.log(JSON.stringify({ shot: shot.name, file: shot.file, errors: errors.slice(0, 3), failedReqs, external, state }));
      if (errors.length > 0 || failedReqs.length > 0 || external.length > 0) failed++;
    } catch (err) {
      failed++;
      console.log(JSON.stringify({ shot: shot.name, FAIL: String(err).slice(0, 300) }));
    }
    await page.close();
  }
  await browser.close();
  server.kill();
  console.log(failed === 0 ? 'SHOTS OK' : `SHOTS FAILED: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => { console.error('HARNESS FAIL', err); process.exit(1); });
