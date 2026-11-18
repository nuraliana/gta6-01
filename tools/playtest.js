// MARISOL HEAT — tools/playtest.js
// Autopilot playtest: start the game, walk to Cafe Alba, talk to Tia (E),
// and verify mission 1 completes with the right cash delta. Prints the
// numbers; exits non-zero if mission 1 does not complete.
// Usage: node tools/playtest.js
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
const before = await page.evaluate(() => window.__game.state());
console.log("before:", JSON.stringify(before));

async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(300);
  }
  console.log("TIMEOUT waiting for", label);
  return false;
}

// Mission 1: walk to the Cafe Alba front (56,-70) to trigger step 0,
// then to Tia (48,-70) and press E to talk.
const targets = [[56, -70], [48, -70]];
for (const [tx, tz] of targets) {
  let arrived = false;
  for (let i = 0; i < 120 && !arrived; i++) {
    arrived = await page.evaluate(([x, z]) => window.__game.autopilotTo(x, z, 0.3), [tx, tz]);
    await page.waitForTimeout(120);
  }
  console.log(`autopilot to (${tx},${tz}): arrived=${arrived}`);
  // Let the game loop run several frames at the target: the mission step
  // triggers in world.update, which runs on animation frames — at headless
  // ~2 fps the player would otherwise leave before a frame ever saw it.
  await page.waitForTimeout(900);
}
// Wait for the step-0 trigger to actually fire (frame-rate dependent).
await waitFor(() => window.__game.debug().objective.startsWith("Talk to Tia"), 15000, "step 1 (Talk to Tia)");
await page.waitForTimeout(800);
await page.keyboard.press("KeyE");
await waitFor(() => window.__game.state().mission === 1, 10000, "mission 1 complete");
await page.waitForTimeout(1200);
const after = await page.evaluate(() => window.__game.state());
const debug = await page.evaluate(() => window.__game.debug());
console.log("after:", JSON.stringify(after));
console.log("debug:", JSON.stringify(debug));
console.log("page errors:", JSON.stringify(errors));
const pass = after.mission === 1 && after.cash === before.cash + 300;
console.log(pass ? "PLAYTEST PASS: mission 1 complete, cash +$300" : "PLAYTEST FAIL");
if (!pass) process.exitCode = 1;
await browser.close();
server.close();
