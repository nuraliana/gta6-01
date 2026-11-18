// MARISOL HEAT — tools/shots.js
// Screenshot session: stages each of the 4 scenes (plus camera variants for
// the cover and the vista), waits for the world to settle, and saves 1280x720
// PNG candidates to /tmp/gta6-shots/. The maker then picks the best 4 and
// converts them to JPEGs in screenshots/ (see README). 1280x720 is the kit's
// ceiling (RULES.txt: long side at most 1280, short side at least 480).
// Usage: node tools/shots.js
import http from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/tmp/gta6-tools/node_modules/playwright-core/index.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const gameDir = join(repoRoot, "game");
const outDir = "/tmp/gta6-shots";
await mkdir(outDir, { recursive: true });
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForTimeout(2000);
await page.evaluate(() => window.__game.start());
await page.waitForTimeout(1500);

const takes = [
  // Cover is staged by the scene itself (wide shot down road x=28, camera
  // south looking north) — no frameCar reframe, which would lose the heli.
  { scene: "cover", tag: "a" },
  { scene: "cover", tag: "b", photo: [40, 7, 66, 0.35, 0.14] },
  { scene: "cover", tag: "c", photo: [24, 4, 58, -0.15, 0.2] },
  { scene: "city", tag: "a" },
  { scene: "city", tag: "b", photo: [90, 30, 110, 0.9, -0.22] },
  { scene: "mission", tag: "a" },
  { scene: "mission", tag: "b", cam: [2.6, 0.2, 6.5] },
  { scene: "vista", tag: "a" },
  { scene: "vista", tag: "b", photo: [2, 4, 300, 2.9, 0.08] },
  { scene: "vista", tag: "c", photo: [44, 7, 288, 2.3, 0.0] },
];
for (const t of takes) {
  await page.evaluate((s) => window.__game.shot(s), t.scene);
  if (t.photo) await page.evaluate(([x, y, z, yaw, pitch]) => window.__game.photoPos(x, y, z, yaw, pitch), t.photo);
  if (t.cam) await page.evaluate(([yaw, pitch, dist]) => window.__game.cam(yaw, pitch, dist), t.cam);
  await page.waitForTimeout(1800);
  if (t.frameCar) {
    await page.evaluate(([a, d, h]) => window.__game.frameCar(a, d, h), t.frameCar);
    await page.waitForTimeout(400);
  }
  const buf = await page.screenshot({ path: join(outDir, `${t.scene}-${t.tag}.png`) });
  const dbg = await page.evaluate(() => window.__game.debug());
  console.log(`${t.scene}-${t.tag}.png bytes=${buf.length} wanted=${dbg.wanted} cruisers=${dbg.cruisers} swat=${dbg.swat} heli=${dbg.heli} drawCalls=${dbg.drawCalls}`);
}
console.log("errors:", JSON.stringify(errors));
await browser.close();
server.close();
