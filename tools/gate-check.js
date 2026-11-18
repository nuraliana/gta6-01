// MARISOL HEAT — tools/gate-check.js
// Gate: load the game headless, start it, and verify 0 console errors,
// 0 pageerrors, 0 failed requests, 0 external requests, non-blank canvas,
// and report the real draw-call count in the full city scene.
// Usage: node tools/gate-check.js [url]   (defaults to a local static server)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/tmp/gta6-tools/node_modules/playwright-core/index.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const gameDir = join(repoRoot, "game");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg" };

const server = http.createServer(async (req, res) => {
  const p = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  try {
    const data = await readFile(join(gameDir, decodeURIComponent(p)));
    res.writeHead(200, { "Content-Type": MIME[extname(p)] ?? "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const exe = process.env.HOME + "/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome";
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [], pageErrors = [], failed = [], external = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("requestfailed", (r) => failed.push(r.url() + " :: " + (r.failure()?.errorText ?? "")));
page.on("request", (r) => {
  const u = r.url();
  if (!u.startsWith("http://127.0.0.1") && !u.startsWith("data:") && !u.startsWith("blob:")) external.push(u);
});

await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForTimeout(2500);
const hasGame = await page.evaluate(() => !!window.__game);
if (!hasGame) { console.log("FAIL: window.__game missing"); process.exitCode = 1; }
await page.evaluate(() => window.__game.start());
await page.waitForTimeout(5000);
// drive a little so traffic/peds/police tick
await page.keyboard.down("KeyW");
await page.waitForTimeout(2500);
await page.keyboard.up("KeyW");
const debug = await page.evaluate(() => window.__game.debug());
await page.screenshot({ path: "/tmp/gta6-shots/gate.png" });
const pixels = await page.evaluate(() => {
  const c = document.getElementById("game");
  const g = document.createElement("canvas"); g.width = 96; g.height = 54;
  const ctx = g.getContext("2d"); ctx.drawImage(c, 0, 0, 96, 54);
  const d = ctx.getImageData(0, 0, 96, 54).data;
  let sum = 0, distinct = new Set();
  for (let i = 0; i < d.length; i += 4) { sum += d[i] + d[i + 1] + d[i + 2]; distinct.add((d[i] >> 4) + "," + (d[i + 1] >> 4) + "," + (d[i + 2] >> 4)); }
  return { mean: sum / (96 * 54 * 3), distinct: distinct.size };
});
console.log(JSON.stringify({ errors, pageErrors, failed, external, debug, pixels }, null, 2));
const ok = errors.length === 0 && pageErrors.length === 0 && failed.length === 0 && external.length === 0
  && pixels.mean > 8 && pixels.distinct > 40;
console.log(ok ? "GATE PASS" : "GATE FAIL");
if (!ok) process.exitCode = 1;
await browser.close();
server.close();
