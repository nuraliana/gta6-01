// MARISOL HEAT — tools/carjack-swat.js
// Playtest for the round-3 fixes: (1) carjacking a driven traffic car pulls
// the driver out (they appear and run away); parked cars have no driver.
// (2) At wanted 5* a SWAT interceptor spawns — a black armored truck, not a
// cruiser — alongside 3 cruisers. (3) The helicopter still goes down on the
// 3rd hit. Prints the numbers; exits non-zero on any failed assert.
// Usage: node tools/carjack-swat.js
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
await page.waitForTimeout(1000);

let pass = true;
function check(label, ok, extra = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label} ${extra}`);
  if (!ok) pass = false;
}

// --- 0. Car census: only driven traffic cars have drivers ---
const census = await page.evaluate(() => {
  const cars = window.__game.world.vehicles.cars;
  return {
    total: cars.length,
    withDriver: cars.filter((c) => c.hasDriver).length,
    parked: cars.filter((c) => !c.hasDriver && !c.isPolice && !c.isPlayer).length,
    hero: cars.filter((c) => c.isPlayer).length,
  };
});
console.log("census:", JSON.stringify(census));
check("16 driven traffic cars have drivers", census.withDriver === 16, JSON.stringify(census));
check("10 parked + hero have no driver", census.parked === 10);

// --- 1. Carjack: E next to a driven car -> driver appears and runs away ---
const setup = await page.evaluate(() => window.__game.jackSetup());
console.log("jackSetup:", JSON.stringify(setup));
check("jackSetup found a driven car", !!setup && setup.hasDriver);
await page.keyboard.press("KeyE");
// Headless SwiftShader runs ~1 fps and dt is clamped to 0.05/frame, so poll
// for the entry instead of trusting a fixed short wait.
let afterJack = null;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(500);
  afterJack = await page.evaluate(() => ({
    inCar: window.__game.state().inCar,
    drivers: window.__game.debug().drivers,
  }));
  if (afterJack.inCar && afterJack.drivers.length === 1) break;
}
console.log("afterJack:", JSON.stringify(afterJack));
check("Riko is in the stolen car", afterJack.inCar === true);
check("exactly 1 driver pulled out", afterJack.drivers.length === 1, JSON.stringify(afterJack.drivers));
const d0 = afterJack.drivers[0];
check("driver is fleeing", d0 && d0.state === "flee");
await page.screenshot({ path: "/tmp/gta6-shots/carjack.png" });
// Flee runs on game time (dt clamped 0.05/frame at ~1 fps), so poll until the
// driver has covered real ground.
let afterFlee = null, fled = 0;
for (let i = 0; i < 90; i++) {
  await page.waitForTimeout(500);
  afterFlee = await page.evaluate(() => window.__game.debug().drivers[0]);
  if (!afterFlee) break;
  fled = d0 ? Math.hypot(afterFlee.x - d0.x, afterFlee.z - d0.z) : 0;
  if (fled > 5) break;
}
console.log("driver after flee:", JSON.stringify(afterFlee), "moved:", fled.toFixed(1), "m");
check("driver moved away (>5 m in 2.5 s)", fled > 5, `moved=${fled.toFixed(1)}m`);
// Photo evidence: frame the fleeing driver next to the stolen car.
if (afterFlee) {
  await page.evaluate(([x, z]) => {
    // Camera 7 m south-east of the driver, looking north-west at them:
    // forward (-sin yaw, -cos yaw) must equal (-0.707, -0.707), so yaw = PI/4.
    window.__game.photoPos(x + 7, 5, z + 7, Math.PI / 4, -0.15);
  }, [afterFlee.x, afterFlee.z]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/gta6-shots/carjack-driver.png" });
}

// --- 2. Wanted 5*: SWAT interceptor, distinct from cruisers ---
await page.evaluate(() => window.__game.setWanted(5));
await page.waitForTimeout(1500);
const five = await page.evaluate(() => {
  const w = window.__game.world;
  const swat = w.police.state.swat[0];
  const cruiser = w.police.state.cruisers[0];
  return {
    wanted: w.police.state.wanted,
    cruisers: w.police.state.cruisers.length,
    swat: w.police.state.swat.length,
    heli: !!w.police.state.heli,
    swatInfo: swat ? { isSwat: swat.isSwat, type: swat.type.name, color: swat.color.toString(16), top: 38 } : null,
    cruiserInfo: cruiser ? { isSwat: cruiser.isSwat, type: cruiser.type.name, color: cruiser.color.toString(16) } : null,
  };
});
console.log("wanted5:", JSON.stringify(five));
check("wanted is 5", five.wanted === 5);
check("3 cruisers at 5*", five.cruisers === 3);
check("1 SWAT unit at 5*", five.swat === 1);
check("SWAT is a black armored Truck, not a cruiser",
  five.swatInfo && five.swatInfo.isSwat && five.swatInfo.type === "Truck" && five.swatInfo.color === "d0d10"
  && five.cruiserInfo && five.cruiserInfo.type === "Sedan" && five.cruiserInfo.color !== "d0d10",
  JSON.stringify({ swat: five.swatInfo, cruiser: five.cruiserInfo }));
check("heli up at 5*", five.heli === true);

// --- 3. Heli shot down on the 3rd hit (regression) ---
const hits = await page.evaluate(() => {
  const p = window.__game.world.police;
  return [p.damageHeli(), p.damageHeli(), p.damageHeli()];
});
console.log("heli hits (3rd must be true):", JSON.stringify(hits));
check("heli goes down on 3rd hit", hits[0] === false && hits[1] === false && hits[2] === true);
// The fall runs on game time and headless SwiftShader is ~1 fps, so drive
// the sim forward directly: 80 ticks x 0.05 s = 4 game-seconds, far more
// than the ~1.9 s a heli needs to fall 42 m at 22 m/s.
await page.evaluate(() => { for (let i = 0; i < 80; i++) window.__game.world.update(0.05); });
const heliGone = await page.evaluate(() => window.__game.debug().heli);
check("heli removed after crashing", heliGone === false);

console.log("page errors:", JSON.stringify(errors));
if (errors.length) pass = false;
console.log(pass ? "CARJACK-SWAT PASS" : "CARJACK-SWAT FAIL");
if (!pass) process.exitCode = 1;
await browser.close();
server.close();
