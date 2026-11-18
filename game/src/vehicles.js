// MARISOL HEAT — vehicles.js
// One job: cars. Arcade driving (accel / brake / handbrake drift), damage
// (smoke -> fire -> explosion), traffic AI that follows lanes, stops at red
// lights and yields, parked cars, and carjacking (driver pulled out).
// PERFORMANCE: every car part is ONE InstancedMesh for all cars (body /
// cabin / wheels / lights), so 27 cars cost 5 draw calls, not ~300.
// Police extras (white doors, strobing light bar) are 4 more instanced
// meshes. Blob shadows live in the shared system from render.js.
// Traffic uses staggered updates: only a slice of cars re-plans each frame.
import * as THREE from "three";
import { CONFIG, HERO_CAR_COLOR, POLICE_COLOR } from "./config.js";
import { clamp, dist, wrapAngle } from "./util.js";
import { collideBuildings } from "./city.js";

const CAR_COLORS = [0xc23a2e, 0x2e6ac2, 0xd8c95a, 0x3a8a4a, 0x8a8a8a, 0x5a2a6a, 0xd8d8d8, 0x2a2a2a];
const CAR_TYPES = [
  { name: "Sedan", len: 4.4, wid: 1.9, top: 26, accel: 1.0 },
  { name: "Coupe", len: 4.2, wid: 1.8, top: 32, accel: 1.15 },
  { name: "Taxi", len: 4.4, wid: 1.9, top: 24, accel: 0.95 },
  { name: "Truck", len: 5.6, wid: 2.2, top: 20, accel: 0.8 },
];
const MAX_CARS = 40;
const MAX_POLICE = 8;
const MAX_SWAT = 4;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _col = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

function composePart(im, idx, x, y, z, angle, sx, sy, sz, offX = 0, offZ = 0) {
  _q.setFromAxisAngle(_up, angle);
  const ox = Math.cos(angle) * offX + Math.sin(angle) * offZ;
  const oz = -Math.sin(angle) * offX + Math.cos(angle) * offZ;
  _v.set(x + ox, y, z + oz);
  _s.set(sx, sy, sz);
  _m.compose(_v, _q, _s);
  im.setMatrixAt(idx, _m);
  im.instanceMatrix.needsUpdate = true;
}

export function createVehicles(scene, city, rng, blobs, particles) {
  const HALF = (CONFIG.GRID * CONFIG.PITCH) / 2;
  const cars = [];
  const roads = [];
  for (let i = 0; i <= CONFIG.GRID; i++) roads.push(-HALF + i * CONFIG.PITCH);

  // ---- instanced car parts (one draw call each, all cars) ----
  const bodyIM = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.75, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.55 }), MAX_CARS);
  const cabinIM = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.65, 1),
    new THREE.MeshStandardMaterial({ color: 0x18222e, roughness: 0.15, metalness: 0.7 }), MAX_CARS);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelIM = new THREE.InstancedMesh(wheelGeo,
    new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }), MAX_CARS * 4);
  const frontIM = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.2, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff2c0, emissiveIntensity: 1.6 }), MAX_CARS);
  const rearIM = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.18, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff1a1a, emissiveIntensity: 1.2 }), MAX_CARS);
  const doorIM = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.5, 1),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }), MAX_POLICE);
  const redIM = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.5, 0.18, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xff1a1a }), MAX_POLICE);
  const blueIM = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.5, 0.18, 0.3),
    new THREE.MeshBasicMaterial({ color: 0x1a5aff }), MAX_POLICE);
  const plateIM = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1.6, 0.4),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), MAX_POLICE);
  // SWAT extras: black armored roof box + amber light bar. A SWAT interceptor
  // is a Truck body in near-black armor, not a navy cruiser with white doors.
  const swatRoofIM = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.4, 0.5, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.55, metalness: 0.5 }), MAX_SWAT);
  const swatBarIM = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.9, 0.18, 0.35),
    new THREE.MeshBasicMaterial({ color: 0xffb020 }), MAX_SWAT);
  for (const im of [bodyIM, cabinIM, wheelIM, frontIM, rearIM, doorIM, redIM, blueIM, plateIM, swatRoofIM, swatBarIM]) {
    im.castShadow = true;
    im.frustumCulled = false;
    scene.add(im);
    for (let i = 0; i < im.count; i++) im.setMatrixAt(i, HIDDEN);
  }
  bodyIM.castShadow = true;

  const freeIdx = Array.from({ length: MAX_CARS }, (_, i) => i).reverse();
  const freePolice = Array.from({ length: MAX_POLICE }, (_, i) => i).reverse();
  const freeSwat = Array.from({ length: MAX_SWAT }, (_, i) => i).reverse();

  function syncCar(car) {
    const i = car.idx, t = car.type;
    composePart(bodyIM, i, car.x, 0.65, car.z, car.angle, t.wid, 1, t.len);
    composePart(cabinIM, i, car.x, 1.3, car.z, car.angle, t.wid - 0.3, 1, t.len * 0.5, 0, -t.len * 0.05);
    composePart(frontIM, i, car.x, 0.7, car.z, car.angle, t.wid * 0.7, 1, 1, 0, t.len / 2 + 0.02);
    composePart(rearIM, i, car.x, 0.7, car.z, car.angle, t.wid * 0.7, 1, 1, 0, -t.len / 2 - 0.02);
    for (let k = 0; k < 4; k++) {
      const sx = (k % 2 === 0 ? -1 : 1) * (t.wid / 2 - 0.05);
      const sz = (k < 2 ? 1 : -1) * (t.len / 2 - 0.9);
      composePart(wheelIM, i * 4 + k, car.x, 0.38, car.z, car.angle, 1, 1, 1, sx, sz);
    }
    blobs.set(2 + i, car.x, car.z, t.wid + 1, t.len + 1, car.angle);
    if (car.isSwat && car.sIdx !== undefined) {
      // armored roof box + amber bar, instead of the cruiser's white doors
      const s = car.sIdx;
      composePart(swatRoofIM, s, car.x, 1.55, car.z, car.angle, 1, 1, 1, 0, -t.len * 0.05);
      composePart(swatBarIM, s, car.x, 1.9, car.z, car.angle, 1, 1, 1, 0, 0);
    } else if (car.isPolice && car.pIdx !== undefined) {
      const p = car.pIdx;
      composePart(doorIM, p, car.x, 0.7, car.z, car.angle, t.wid + 0.02, 1, t.len * 0.55);
      composePart(redIM, p, car.x, 1.75, car.z, car.angle, 1, 1, 1, -0.35, 0);
      composePart(blueIM, p, car.x, 1.75, car.z, car.angle, 1, 1, 1, 0.35, 0);
      composePart(plateIM, p, car.x, 0.9, car.z, car.angle + Math.PI / 2, 1, 1, 1, t.wid / 2 + 0.02, 0);
    }
  }
  function hideCar(car) {
    const i = car.idx;
    for (const im of [bodyIM, cabinIM, frontIM, rearIM]) im.setMatrixAt(i, HIDDEN);
    for (let k = 0; k < 4; k++) wheelIM.setMatrixAt(i * 4 + k, HIDDEN);
    blobs.hide(2 + i);
    if (car.pIdx !== undefined) {
      for (const im of [doorIM, redIM, blueIM, plateIM]) im.setMatrixAt(car.pIdx, HIDDEN);
    }
    if (car.sIdx !== undefined) {
      for (const im of [swatRoofIM, swatBarIM]) im.setMatrixAt(car.sIdx, HIDDEN);
    }
    for (const im of [bodyIM, cabinIM, wheelIM, frontIM, rearIM, doorIM, redIM, blueIM, plateIM, swatRoofIM, swatBarIM]) im.instanceMatrix.needsUpdate = true;
  }

  function spawnCar(x, z, angle, type, color, opts = {}) {
    const idx = freeIdx.pop();
    if (idx === undefined) return null;
    const car = {
      idx, x, z, angle, speed: 0, type, color, station: rng.int(0, 2),
      isPolice: !!opts.police, isSwat: !!opts.swat, isPlayer: !!opts.player, damage: 0,
      targetSpeed: 0, ai: !!opts.ai, dead: false,
      // A driven traffic car has a driver to pull out; parked cars, the hero
      // coupe and police units do not.
      hasDriver: !!opts.ai && !opts.police,
      pIdx: opts.police && !opts.swat ? freePolice.pop() : undefined,
      sIdx: opts.swat ? freeSwat.pop() : undefined,
    };
    bodyIM.setColorAt(idx, _col.setHex(color));
    if (bodyIM.instanceColor) bodyIM.instanceColor.needsUpdate = true;
    cars.push(car);
    syncCar(car);
    return car;
  }

  // Hero coupe (amber) for the player, parked on road x=28 just south of spawn.
  const hero = spawnCar(28, 4, Math.PI, CAR_TYPES[1], HERO_CAR_COLOR, { player: true });
  // Traffic
  for (let i = 0; i < CONFIG.TRAFFIC_COUNT; i++) {
    const alongX = rng.chance(0.5);
    const road = roads[1 + rng.int(0, roads.length - 3)];
    const t = rng.int(0, CAR_TYPES.length - 1);
    const c = spawnCar(
      alongX ? rng.range(-HALF + 20, HALF - 20) : road + (rng.chance(0.5) ? 3.5 : -3.5),
      alongX ? road + (rng.chance(0.5) ? 3.5 : -3.5) : rng.range(-HALF + 20, HALF - 20),
      alongX ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2),
      CAR_TYPES[t], CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)], { ai: true });
    if (c) c.speed = rng.range(6, 10);
  }
  // Parked cars along curbs
  for (let i = 0; i < CONFIG.PARKED_COUNT; i++) {
    const road = roads[1 + rng.int(0, roads.length - 3)];
    const alongX = rng.chance(0.5);
    const t = rng.int(0, CAR_TYPES.length - 1);
    spawnCar(
      alongX ? rng.range(-HALF + 20, HALF - 20) : road + 5.6,
      alongX ? road + 5.6 : rng.range(-HALF + 20, HALF - 20),
      alongX ? 0 : Math.PI / 2,
      CAR_TYPES[t], CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)], {});
  }

  let stagger = 0;
  return {
    cars, hero,
    spawnPoliceCar(x, z) {
      return spawnCar(x, z, 0, CAR_TYPES[0], POLICE_COLOR, { police: true, ai: true });
    },
    // SWAT interceptor: a Truck body in near-black armor with an amber bar —
    // longer, heavier and faster than a cruiser, spawned only at 5 stars.
    spawnSwatCar(x, z) {
      return spawnCar(x, z, 0, CAR_TYPES[3], 0x0d0d10, { police: true, swat: true, ai: true });
    },
    removeCar(car) {
      hideCar(car);
      freeIdx.push(car.idx);
      if (car.pIdx !== undefined) freePolice.push(car.pIdx);
      if (car.sIdx !== undefined) freeSwat.push(car.sIdx);
      const i = cars.indexOf(car); if (i >= 0) cars.splice(i, 1);
    },
    setCarColor(car, color) {
      car.color = color;
      bodyIM.setColorAt(car.idx, _col.setHex(color));
      if (bodyIM.instanceColor) bodyIM.instanceColor.needsUpdate = true;
    },
    setPoliceStrobe(car, redOn) {
      if (car.pIdx === undefined) return;
      redIM.setColorAt(car.pIdx, _col.setHex(redOn ? 0xff1a1a : 0x550000));
      blueIM.setColorAt(car.pIdx, _col.setHex(redOn ? 0x000055 : 0x1a5aff));
      if (redIM.instanceColor) redIM.instanceColor.needsUpdate = true;
      if (blueIM.instanceColor) blueIM.instanceColor.needsUpdate = true;
    },
    setSwatStrobe(car, on) {
      if (car.sIdx === undefined) return;
      swatBarIM.setColorAt(car.sIdx, _col.setHex(on ? 0xffb020 : 0x4a2c00));
      if (swatBarIM.instanceColor) swatBarIM.instanceColor.needsUpdate = true;
    },
    placeCar(car, x, z, angle, speed) {
      car.x = x; car.z = z; car.angle = angle; car.speed = speed;
      syncCar(car);
    },
    nearestCar(x, z, maxD) {
      let best = null, bd = maxD * maxD;
      for (const c of cars) {
        if (c.isPlayer) continue;
        const d = (c.x - x) ** 2 + (c.z - z) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    },
    drivePlayer(car, input, dt, audio) {
      const ax = input.axis();
      const handbrake = input.down("Space");
      car.speed += ax.z * CONFIG.CAR_ACCEL * car.type.accel * dt;
      if (handbrake) car.speed *= Math.pow(0.25, dt);
      car.speed *= Math.pow(0.4, dt * 0.35); // drag
      if (Math.abs(car.speed) < 0.15 && ax.z === 0) car.speed = 0;
      car.speed = clamp(car.speed, -10, 38);
      const steer = ax.x * (car.speed >= 0 ? 1 : -1) * (handbrake ? 1.7 : 1.1);
      car.angle += steer * dt * clamp(Math.abs(car.speed) / 8, 0, 1) * 1.5;
      const nx = car.x + Math.sin(car.angle) * car.speed * dt;
      const nz = car.z + Math.cos(car.angle) * car.speed * dt;
      const [cx, cz] = collideBuildings(city.buildings, nx, nz, 1.6);
      if (cx !== nx || cz !== nz) {
        if (Math.abs(car.speed) > 8) { particles.burst(car.x, 1, car.z, 8, [1, 0.8, 0.3], 4, 0.6, 2); audio.crash(); car.damage += 6; }
        car.speed *= 0.4;
      }
      car.x = clamp(cx, -HALF - 30, HALF + 130);
      car.z = clamp(cz, -HALF - 30, HALF + 170);
      if (handbrake && Math.abs(car.speed) > 10 && Math.random() < 0.6) {
        particles.smoke(car.x - Math.sin(car.angle) * 1.5, 0.4, car.z - Math.cos(car.angle) * 1.5);
      }
      if (car.damage > 55 && Math.random() < 0.3) particles.smoke(car.x, 1.2, car.z);
      if (car.damage > 80) {
        particles.burst(car.x, 1, car.z, 2, [1, 0.5, 0.1], 3, 0.5, 3);
        car.damage += dt * 4;
        if (car.damage >= 100) {
          particles.burst(car.x, 1, car.z, 40, [1, 0.6, 0.1], 9, 1.2, 5);
          particles.burst(car.x, 1, car.z, 20, [0.2, 0.2, 0.2], 6, 1.6, 5);
          audio.crash();
          car.dead = true;
        }
      }
      syncCar(car);
      audio.setEngine(Math.abs(car.speed) / 38, true);
      return car.speed;
    },
    updateTraffic(dt, trafficLights) {
      stagger = (stagger + 1) % 4;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (!c.ai || c.isPolice) continue;
        if (i % 4 === stagger) {
          const alongX = Math.abs(Math.sin(c.angle)) > 0.7;
          let target = 9;
          for (const tl of trafficLights) {
            const d = dist(c.x, c.z, tl.x, tl.z);
            if (d < 26) {
              const approaching = alongX ? Math.abs(c.z - tl.z) < 8 : Math.abs(c.x - tl.x) < 8;
              if (approaching && tl.state === "r" && ((tl.axis === "x") === alongX)) target = 0;
            }
          }
          for (const o of cars) {
            if (o === c) continue;
            const d = dist(c.x, c.z, o.x, o.z);
            if (d < 9) {
              const ahead = Math.sin(c.angle) * (o.x - c.x) + Math.cos(c.angle) * (o.z - c.z);
              if (ahead > 0) target = 0;
            }
          }
          c.targetSpeed = target;
        }
        c.speed += (c.targetSpeed - c.speed) * Math.min(1, dt * 2);
        const nx = c.x + Math.sin(c.angle) * c.speed * dt;
        const nz = c.z + Math.cos(c.angle) * c.speed * dt;
        // turn around at the city edge instead of teleporting (round-1 bug fix)
        if (nx < -HALF - 10 || nx > HALF + 10 || nz < -HALF - 10 || nz > HALF + 150) {
          c.angle = wrapAngle(c.angle + Math.PI);
          c.x = clamp(c.x, -HALF, HALF); c.z = clamp(c.z, -HALF, HALF + 130);
        } else { c.x = nx; c.z = nz; }
        syncCar(c);
      }
    },
    updateTrafficLights(dt) {
      const TL_COLORS = { r: 0xff2a1a, y: 0xffc21a, g: 0x2aff5a };
      const DIM = 0x2a0d0d;
      for (const tl of city.trafficLights) {
        tl.timer -= dt;
        if (tl.timer <= 0) {
          tl.state = tl.state === "g" ? "y" : tl.state === "y" ? "r" : "g";
          tl.timer = tl.state === "y" ? 2 : 7;
          const order = ["r", "y", "g"];
          for (let k = 0; k < 3; k++) {
            const on = order[k] === tl.state;
            city.tlLampIM.setColorAt(tl.lampBase + k, _col.setHex(on ? TL_COLORS[order[k]] : DIM));
          }
          if (city.tlLampIM.instanceColor) city.tlLampIM.instanceColor.needsUpdate = true;
        }
      }
    },
  };
}
