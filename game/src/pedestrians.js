// MARISOL HEAT — pedestrians.js
// One job: the crowd. 48 walkers with varied shirts, sidewalk strolling,
// panic flee from gunfire / speeding cars, falling down and getting up, and
// WITNESSES: a ped who sees a crime pulls out a phone and calls the police —
// the wanted star only rises 2-3 s later, so stealing in a quiet alley is
// safer than stealing on a crowded avenue.
// PERFORMANCE: all peds are 4 InstancedMeshes (legs / body / head / phone),
// so 48 pedestrians cost 4 draw calls, and their shadows ride the shared
// blob system from render.js.
import * as THREE from "three";
import { CONFIG } from "./config.js";
import { dist, mergeGeometries } from "./util.js";
import { collideBuildings } from "./city.js";

const SHIRTS = [0xd84a2a, 0x2a8ad8, 0x3a8a4a, 0xd8c95a, 0x8a5ad8, 0xe8e8e8, 0x2a2a2a, 0xff7ab0];
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _col = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export function createPedestrians(scene, city, rng, blobs) {
  const HALF = (CONFIG.GRID * CONFIG.PITCH) / 2;
  const N = CONFIG.PED_COUNT;
  const BLOB_BASE = 42;

  const legGeo = mergeGeometries([
    new THREE.BoxGeometry(0.2, 0.75, 0.22).translate(-0.13, 0.38, 0),
    new THREE.BoxGeometry(0.2, 0.75, 0.22).translate(0.13, 0.38, 0),
  ]);
  const legsIM = new THREE.InstancedMesh(legGeo,
    new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.9 }), N);
  const bodyIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.7, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), N);
  const headIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.34, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xc98a5a, roughness: 0.8 }), N);
  const phoneIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.16, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x88ccff, emissiveIntensity: 1.5 }), N);
  for (const im of [legsIM, bodyIM, headIM, phoneIM]) {
    im.frustumCulled = false;
    scene.add(im);
    for (let i = 0; i < N; i++) im.setMatrixAt(i, HIDDEN);
  }
  phoneIM.castShadow = false;

  const peds = [];
  for (let i = 0; i < N; i++) {
    const x = rng.range(-HALF, HALF), z = rng.range(-HALF, HALF + 120);
    bodyIM.setColorAt(i, _col.setHex(SHIRTS[i % SHIRTS.length]));
    peds.push({
      idx: i, x, z,
      angle: rng.range(0, Math.PI * 2), speed: rng.range(1.2, 2.2),
      tx: x, tz: z, state: "walk", timer: rng.range(0, 8), phase: rng.range(0, 6),
      witness: 0, down: 0, witnessCalled: false,
    });
  }
  if (bodyIM.instanceColor) bodyIM.instanceColor.needsUpdate = true;

  function syncPed(p) {
    const i = p.idx;
    const rotX = p.down > 0 ? Math.PI / 2 - 0.2 : 0;
    _q.setFromEuler(new THREE.Euler(rotX, p.angle, 0));
    const y = p.down > 0 ? 0.4 : 0;
    _v.set(p.x, y, p.z); _s.set(1, 1, 1);
    _m.compose(_v, _q, _s);
    legsIM.setMatrixAt(i, _m);
    _v.set(p.x, y + 1.15, p.z); _m.compose(_v, _q, _s); bodyIM.setMatrixAt(i, _m);
    _v.set(p.x, y + 1.72, p.z); _m.compose(_v, _q, _s); headIM.setMatrixAt(i, _m);
    if (p.state === "calling") {
      _v.set(p.x + 0.32, y + 1.5, p.z + 0.1); _m.compose(_v, _q, _s);
      phoneIM.setMatrixAt(i, _m);
    } else {
      phoneIM.setMatrixAt(i, HIDDEN);
    }
    legsIM.instanceMatrix.needsUpdate = true;
    bodyIM.instanceMatrix.needsUpdate = true;
    headIM.instanceMatrix.needsUpdate = true;
    phoneIM.instanceMatrix.needsUpdate = true;
    blobs.set(BLOB_BASE + i, p.x, p.z, 1.1, 1.1, p.angle);
  }
  for (const p of peds) syncPed(p);

  let stagger = 0;
  return {
    peds,
    countNear(x, z, r) {
      let n = 0;
      for (const p of peds) if (dist(p.x, p.z, x, z) < r) n++;
      return n;
    },
    witnessCrime(x, z) {
      let best = null, bd = 40 * 40;
      for (const p of peds) {
        if (p.state !== "walk") continue;
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      if (best) { best.witness = CONFIG.WITNESS_DELAY_S; best.state = "calling"; syncPed(best); return true; }
      return false;
    },
    scare(x, z, radius) {
      for (const p of peds) {
        if (dist(p.x, p.z, x, z) < radius && p.state === "walk") {
          p.state = "flee"; p.timer = 3 + Math.random() * 2;
          p.angle = Math.atan2(p.x - x, p.z - z);
        }
      }
    },
    knockDown(x, z, radius) {
      for (const p of peds) {
        if (dist(p.x, p.z, x, z) < radius && p.down <= 0) {
          p.down = 2.5;
          syncPed(p);
        }
      }
    },
    update(dt, danger) {
      stagger = (stagger + 1) % 4;
      for (let i = 0; i < peds.length; i++) {
        const p = peds[i];
        if (p.down > 0) {
          p.down -= dt;
          if (p.down <= 0) { p.state = "flee"; p.timer = 2; }
          syncPed(p);
          continue;
        }
        if (i % 4 !== stagger) continue;
        if (p.state === "calling") {
          p.witness -= dt * 4;
          if (p.witness <= 0) { p.state = "flee"; p.timer = 3; p.witnessCalled = true; }
          syncPed(p);
          continue;
        }
        if (p.state === "flee") {
          p.timer -= dt * 4;
          p.x += Math.sin(p.angle) * 5 * dt * 4;
          p.z += Math.cos(p.angle) * 5 * dt * 4;
          p.phase += dt * 16;
          if (p.timer <= 0) p.state = "walk";
        } else {
          p.timer -= dt * 4;
          if (p.timer <= 0 || dist(p.x, p.z, p.tx, p.tz) < 2) {
            p.tx = p.x + (Math.random() - 0.5) * 90;
            p.tz = p.z + (Math.random() - 0.5) * 90;
            p.tx = Math.max(-HALF, Math.min(HALF, p.tx));
            p.tz = Math.max(-HALF, Math.min(HALF + 130, p.tz));
            p.timer = 6 + Math.random() * 6;
          }
          const d = dist(p.x, p.z, p.tx, p.tz);
          if (d > 1) {
            p.angle = Math.atan2(p.tx - p.x, p.tz - p.z);
            p.x += Math.sin(p.angle) * p.speed * dt * 4;
            p.z += Math.cos(p.angle) * p.speed * dt * 4;
            p.phase += dt * 6;
          }
          if (danger && dist(p.x, p.z, danger.x, danger.z) < danger.r) {
            p.state = "flee"; p.timer = 3;
            p.angle = Math.atan2(p.x - danger.x, p.z - danger.z);
          }
        }
        const [cx, cz] = collideBuildings(city.buildings, p.x, p.z, 0.5);
        p.x = cx; p.z = cz;
        syncPed(p);
      }
    },
  };
}
