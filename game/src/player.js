// MARISOL HEAT — player.js
// One job: Riko Vale on foot — walk/run, enter & steal cars (E), carjacking
// pulls the driver out onto the street, and a scripted autopilot that drives
// mission 1 for the playtest tool.
import * as THREE from "three";
import { CONFIG } from "./config.js";
import { clamp, dist } from "./util.js";
import { collideBuildings } from "./city.js";

export function buildPersonMesh(scene, shirt, pants, skin, scale = 1) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.24), mat(pants));
  legL.position.set(-0.14, 0.4, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.14; g.add(legR);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), mat(shirt));
  torso.position.y = 1.18; torso.castShadow = true; g.add(torso);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), mat(shirt));
  armL.position.set(-0.42, 1.15, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), mat(skin));
  head.position.y = 1.78; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.34), mat(0x1a1210));
  hair.position.y = 1.98; g.add(hair);
  // blob shadow comes from the shared system (render.js), not a plane here
  g.scale.setScalar(scale);
  g.userData = { legL, legR, armL, armR };
  scene.add(g);
  return g;
}

// Tia Sol: the visible contact for mission 1 — red jacket, dark hair bun,
// standing by the Cafe Alba tables. She exists as a person, not a marker.
export function buildTia(scene, x, z) {
  const g = buildPersonMesh(scene, 0xd81a2a, 0x1a1a22, 0xc98a5a);
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ color: 0x1a1210 }));
  bun.position.set(0, 2.02, -0.16); g.add(bun);
  g.position.set(x, 0, z);
  g.rotation.y = Math.PI;
  return g;
}

export function createPlayer(scene, city) {
  const mesh = buildPersonMesh(scene, 0x2a6ad8, 0x222226, 0xc98a5a);
  const HALF = (CONFIG.GRID * CONFIG.PITCH) / 2;
  const state = {
    mesh, x: 28, z: -8, angle: Math.PI, speed: 0,
    inCar: null, health: 100, armor: 0, walkPhase: 0, autopilot: null,
  };
  mesh.position.set(state.x, 0, state.z);

  return {
    state,
    buildPersonMesh,
    reset(x, z) {
      state.x = x; state.z = z; state.inCar = null; state.health = 100;
      mesh.position.set(x, 0, z);
    },
    update(input, dt, vehicles, onEnterCar, onExitCar, ePressed) {
      if (state.inCar) return;
      const ax = input.axis();
      const run = input.down("ShiftLeft") || input.down("ShiftRight");
      const sp = run ? CONFIG.RUN_SPEED : CONFIG.WALK_SPEED;
      const moving = ax.x !== 0 || ax.z !== 0;
      if (moving) {
        const len = Math.hypot(ax.x, ax.z);
        const dx = ax.x / len, dz = ax.z / len;
        // camera-relative: forward is -z of camera yaw (chase cam behind player)
        state.angle = Math.atan2(dx, dz);
        const nx = state.x + dx * sp * dt, nz = state.z + dz * sp * dt;
        const [cx, cz] = collideBuildings(city.buildings, nx, nz, 0.5);
        state.x = clamp(cx, -HALF - 20, HALF + 140);
        state.z = clamp(cz, -HALF - 20, HALF + 165);
        state.walkPhase += dt * sp * 1.6;
        const swing = Math.sin(state.walkPhase) * 0.55;
        mesh.userData.legL.rotation.x = swing;
        mesh.userData.legR.rotation.x = -swing;
        mesh.userData.armL.rotation.x = -swing * 0.7;
        mesh.userData.armR.rotation.x = swing * 0.7;
      } else {
        mesh.userData.legL.rotation.x *= 0.8;
        mesh.userData.legR.rotation.x *= 0.8;
        mesh.userData.armL.rotation.x *= 0.8;
        mesh.userData.armR.rotation.x *= 0.8;
      }
      mesh.position.set(state.x, 0, state.z);
      mesh.rotation.y = state.angle;
      // Enter / steal the nearest car
      if (ePressed) {
        const car = vehicles.nearestCar(state.x, state.z, 4.5);
        if (car) {
          state.inCar = car;
          car.isPlayer = true;
          mesh.visible = false;
          onEnterCar(car);
        }
      }
    },
    exitCar(vehicles) {
      if (!state.inCar) return;
      const car = state.inCar;
      state.inCar = null;
      state.x = car.x + Math.sin(car.angle + Math.PI / 2) * 2.5;
      state.z = car.z + Math.cos(car.angle + Math.PI / 2) * 2.5;
      mesh.visible = true;
      mesh.position.set(state.x, 0, state.z);
      return car;
    },
    // Autopilot: steer the player (on foot or in car) toward a target point.
    // Used by the playtest tool to finish mission 1 hands-free.
    autopilotTo(tx, tz, dt, vehicles, input) {
      const p = state;
      const target = p.inCar ? p.inCar : p;
      const d = dist(target.x, target.z, tx, tz);
      if (d < 3) return true;
      const want = Math.atan2(tx - target.x, tz - target.z);
      if (p.inCar) {
        const car = p.inCar;
        const diff = ((want - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        car.angle += clamp(diff, -1.4 * dt, 1.4 * dt);
        car.speed = Math.min(car.speed + 14 * dt, 24);
        car.x += Math.sin(car.angle) * car.speed * dt;
        car.z += Math.cos(car.angle) * car.speed * dt;
        const [cx, cz] = collideBuildings(city.buildings, car.x, car.z, 1.6);
        car.x = cx; car.z = cz;
        vehicles.placeCar(car, car.x, car.z, car.angle, car.speed);
      } else {
        const dx = (tx - p.x) / d, dz = (tz - p.z) / d;
        p.x += dx * CONFIG.RUN_SPEED * dt; p.z += dz * CONFIG.RUN_SPEED * dt;
        p.angle = Math.atan2(dx, dz);
        p.walkPhase += dt * 14;
        mesh.position.set(p.x, 0, p.z);
        mesh.rotation.y = p.angle;
      }
      return false;
    },
  };
}
