// MARISOL HEAT — drivers.js
// One job: the driver a carjack pulls out of a stolen car. A driver is a
// real pedestrian, not a vanishing prop: they step out of the driver's side,
// run a few metres away from the car, then keep walking as a normal walker.
// Parked cars and the hero coupe have no driver; only driven traffic does.
import { buildPersonMesh } from "./player.js";
import { clamp } from "./util.js";
import { collideBuildings } from "./city.js";
import { CONFIG } from "./config.js";

const MAX_DRIVERS = 6;
const BLOB_BASE = 92; // blob slots 92-97 (0 player, 1 Tia, 2-41 cars, 42-89 peds, 90-91 officers)
const SHIRTS = [0x8a5a2a, 0x3a6a8a, 0x6a3a5a, 0x4a4a4a, 0x7a7a2a, 0x2a5a3a];

export function createDrivers(scene, city, blobs) {
  const drivers = [];

  function spawnDriver(carX, carZ, carAngle, playerX, playerZ) {
    // Oldest driver leaves the scene when the cap is hit.
    if (drivers.length >= MAX_DRIVERS) removeDriver(drivers[0]);
    // Step out of the driver's side: 1.6 m perpendicular to the car.
    const sideX = Math.cos(carAngle), sideZ = -Math.sin(carAngle);
    const x = carX + sideX * 1.6, z = carZ + sideZ * 1.6;
    const shirt = SHIRTS[drivers.length % SHIRTS.length];
    const mesh = buildPersonMesh(scene, shirt, 0x222226, 0xc98a5a);
    mesh.position.set(x, 0, z);
    // Flee away from the car and the thief, then walk on.
    const away = Math.atan2(x - playerX, z - playerZ);
    const d = {
      mesh, x, z, angle: away, state: "flee", timer: 2.4,
      speed: 6.5, tx: x, tz: z, phase: 0,
    };
    mesh.rotation.y = away;
    drivers.push(d);
    blobs.set(BLOB_BASE + drivers.indexOf(d), x, z, 1.4, 1.4);
    return d;
  }

  function removeDriver(d) {
    const i = drivers.indexOf(d);
    if (i < 0) return;
    scene.remove(d.mesh);
    blobs.hide(BLOB_BASE + i);
    drivers.splice(i, 1);
    // Re-index blob slots after the splice so every driver keeps its shadow.
    drivers.forEach((o, k) => blobs.set(BLOB_BASE + k, o.x, o.z, 1.4, 1.4));
  }

  function update(dt) {
    const HALF = (CONFIG.GRID * CONFIG.PITCH) / 2;
    for (const d of [...drivers]) {
      d.timer -= dt;
      if (d.state === "flee") {
        d.x += Math.sin(d.angle) * d.speed * dt;
        d.z += Math.cos(d.angle) * d.speed * dt;
        d.phase += dt * 16;
        if (d.timer <= 0) {
          d.state = "walk";
          d.timer = 5 + Math.random() * 5;
          // Keep walking away: pick a target further out in the flee direction.
          d.tx = clamp(d.x + Math.sin(d.angle) * 40, -HALF, HALF);
          d.tz = clamp(d.z + Math.cos(d.angle) * 40, -HALF, HALF + 130);
        }
      } else {
        const dx = d.tx - d.x, dz = d.tz - d.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1) {
          d.angle = Math.atan2(dx, dz);
          d.x += Math.sin(d.angle) * 1.7 * dt;
          d.z += Math.cos(d.angle) * 1.7 * dt;
          d.phase += dt * 6;
        } else if (d.timer <= 0) {
          d.timer = 5 + Math.random() * 5;
          d.tx = clamp(d.x + (Math.random() - 0.5) * 60, -HALF, HALF);
          d.tz = clamp(d.z + (Math.random() - 0.5) * 60, -HALF, HALF + 130);
        }
      }
      const [cx, cz] = collideBuildings(city.buildings, d.x, d.z, 0.5);
      d.x = cx; d.z = cz;
      const swing = Math.sin(d.phase) * 0.55;
      d.mesh.userData.legL.rotation.x = swing;
      d.mesh.userData.legR.rotation.x = -swing;
      d.mesh.userData.armL.rotation.x = -swing * 0.7;
      d.mesh.userData.armR.rotation.x = swing * 0.7;
      d.mesh.position.set(d.x, 0, d.z);
      d.mesh.rotation.y = d.angle;
      blobs.set(BLOB_BASE + drivers.indexOf(d), d.x, d.z, 1.4, 1.4);
    }
  }

  return {
    drivers,
    spawnDriver,
    update,
    // Test hook: where every pulled-out driver is, and what they are doing.
    info() {
      return drivers.map((d) => ({
        x: +d.x.toFixed(1), z: +d.z.toFixed(1), state: d.state,
        timer: +d.timer.toFixed(2),
      }));
    },
  };
}
