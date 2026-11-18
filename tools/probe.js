// MARISOL HEAT — tools/probe.js
// Quick state dump: load, start, print __game.debug() + state() as JSON.
// Usage: node tools/probe.js [shotName]
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/tmp/gta6-tools/node_modules/playwright-core/index.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const gameDir = join(repoRoot, "game");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer(async (req, res) => {
  const p = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  try { const d = await readFile(join(gameDir, decodeURIComponent(p))); res.writeHead(200, { "Content-Type": MIME[extname(p)] ?? "application/octet-stream" }); res.end(d); }
  catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const exe = process.env.HOME + "/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome";
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForTimeout(2000);
await page.evaluate(() => window.__game.start());
await page.waitForTimeout(2000);
const shot = process.argv[2];
if (shot) {
  await page.evaluate((s) => window.__game.shot(s), shot);
  await page.waitForTimeout(2000);
}
console.log(JSON.stringify(await page.evaluate(() => ({ debug: window.__game.debug(), state: window.__game.state() })), null, 2));
console.log("errors:", JSON.stringify(errors));
await browser.close();
server.close();
