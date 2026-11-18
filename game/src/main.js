// MARISOL HEAT — main.js
// One job: boot the game, run the frame loop, wire the menus, and expose the
// test hooks (window.__game) the tools use for gate / playtest / screenshots.
// No library here besides three.js, vendored under game/vendor/three/.
import { createWorld } from "./world.js";
import { createShots } from "./shots.js";

const canvas = document.getElementById("game");
const world = createWorld(canvas);
const shots = createShots(world);

const menuStart = document.getElementById("menu-start");
const menuPause = document.getElementById("menu-pause");
const menuOver = document.getElementById("menu-over");
const menuComplete = document.getElementById("menu-complete");

function showOnly(el) {
  for (const m of [menuStart, menuPause, menuOver, menuComplete]) m.style.display = "none";
  if (el) el.style.display = "flex";
}

document.getElementById("btn-new").addEventListener("click", () => {
  showOnly(null);
  world.start();
});
document.getElementById("btn-continue").addEventListener("click", () => {
  if (world.load()) {
    showOnly(null);
    world.start();
  }
});
document.getElementById("btn-resume").addEventListener("click", () => {
  showOnly(null);
  world.pause(false);
});
document.getElementById("btn-restart").addEventListener("click", () => {
  showOnly(null);
  location.reload();
});
document.getElementById("btn-quality").addEventListener("click", (e) => {
  const q = world.render.quality === "high" ? "low" : "high";
  world.render.quality = q;
  e.target.textContent = "Quality: " + q.toUpperCase();
});
document.getElementById("btn-save").addEventListener("click", () => {
  world.save();
  world.pause(false);
  showOnly(null);
});

// Continue button only makes sense when a save exists.
try {
  if (!localStorage.getItem("marisol-heat-save-v1")) {
    document.getElementById("btn-continue").style.display = "none";
  }
} catch (e) { /* private mode */ }

// ---- frame loop (fixed clamp so SwiftShader headless stays stable) ----
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  world.update(dt);
  world.render.render(now / 1000);
  if (world.missions.state.allDone) {
    showOnly(menuComplete);
    world.pause(true);
  }
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = w; canvas.height = h;
  world.render.resize(w, h);
}
window.addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);

// ---- test hooks: gate / playtest / shots tools drive these, players never see them ----
window.__game = {
  world, shots,
  version: "marisol-heat-r2",
  start() { showOnly(null); world.start(); },
  shot(name) {
    const ok = shots.stage(name);
    // snap the camera: at headless frame rates the chase-cam lerp would
    // otherwise still be mid-flight when the screenshot lands.
    world.updateCamera(10);
    return ok;
  },
  debug() { return world.debugInfo(); },
  state() {
    return {
      cash: world.state.cash, mission: world.missions.state.index,
      wanted: world.police.state.wanted, searching: world.police.state.searching,
      health: world.player.state.health,
      x: world.player.state.inCar ? world.player.state.inCar.x : world.player.state.x,
      z: world.player.state.inCar ? world.player.state.inCar.z : world.player.state.z,
      inCar: !!world.player.state.inCar,
    };
  },
  // Autopilot for the playtest: drive/walk to a point, return true on arrival.
  autopilotTo(x, z, dt) {
    return world.player.autopilotTo(x, z, dt || 0.05, world.vehicles, world.input);
  },
  setWanted(n) { world.police.setWanted(n, { x: 0, z: 0 }); },
  setTime(name) { world.setTimePreset(name); },
  setPhoto(on) { world.state.photo = on; },
  hideHud(on) {
    world.state.hudHidden = on;
    document.getElementById("hud").style.display = on ? "none" : "block";
  },
  photoPos(x, y, z, yaw, pitch) {
    world.state.photo = true;
    world.state.photoPos.set(x, y, z);
    world.state.photoYaw = yaw; world.state.photoPitch = pitch;
  },
  cam(yaw, pitch, dist) {
    world.state.photo = false;
    world.state.camYaw = yaw; world.state.camPitch = pitch; world.state.camDist = dist;
  },
  // Frame the player's car from behind-side in photo mode, computed from
  // the car's live position (it keeps driving while the shot is staged).
  frameCar(angOff = 0.6, dist = 16, height = 6) {
    const p = world.player.state, c = p.inCar;
    if (!c) return false;
    const px = c.x - Math.sin(c.angle + angOff) * dist;
    const pz = c.z - Math.cos(c.angle + angOff) * dist;
    const dx = c.x - px, dz = c.z - pz;
    world.state.photo = true;
    world.state.photoPos.set(px, height, pz);
    world.state.photoYaw = Math.atan2(-dx, -dz);
    world.state.photoPitch = -0.12;
    return true;
  },
};
