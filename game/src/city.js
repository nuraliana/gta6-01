// MARISOL HEAT — city.js
// One job: build the whole city from the seed — 4 named districts, a global
// landmark, real named buildings (Cafe Alba, Bay Trust Bank, Lucky Gull,
// Quick Coat Garage, Iron & Lead), beach + pier + ocean, and instanced props.
// Buildings / palms / lamps / props are InstancedMesh per chunk so the full
// city stays well under 100 draw calls (measured in the dossier).
import * as THREE from "three";
import { CONFIG } from "./config.js";
import { facadeTexture, signTexture, groundTexture, sidewalkTexture, grassTexture } from "./textures.js";

function districtAt(x, z) {
  let best = CONFIG.DISTRICTS[0], bd = Infinity;
  for (const d of CONFIG.DISTRICTS) {
    const dd = (x - d.cx) ** 2 + (z - d.cz) ** 2;
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}

function addSign(scene, place, w, h, y) {
  const tex = signTexture(place.sign, place.signColor);
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  // Emissive-look: MeshBasicMaterial with a bright color multiplies the map,
  // so push the color above 1 via a second additive glow plane is unnecessary;
  // bloom picks it up because the texture itself is bright on dark.
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(place.x, y, place.z);
  mesh.rotation.y = Math.PI; // signs sit on the north face: face north, outward
  scene.add(mesh);
  return mesh;
}

export function buildCity(scene, rng) {
  const out = {
    buildings: [],        // {x,z,hw,hd,h} collision boxes
    named: {},            // place key -> {x,z}
    trafficLights: [],    // {x,z,axis,state,timer,lamps:{r,y,g}}
    lamps: [],            // streetlight head positions (for night glow)
    oceanMat: null, foamMat: null,
    spireTop: null,       // landmark beacon mesh (bloom source)
  };
  const P = CONFIG.PITCH, N = CONFIG.GRID;
  const HALF = (N * P) / 2; // 252

  // ---- ground: ONE textured plane (base + blocks + roads + dashes + sand).
  // Replaces 22 road strips + base + sand plane = 1 draw call.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 120, HALF * 2 + 220),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 60);
  ground.receiveShadow = true; scene.add(ground);

  out.oceanMat = new THREE.MeshStandardMaterial({ color: 0x0e6a72, roughness: 0.25, metalness: 0.1 });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(900, 320), out.oceanMat);
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, -0.4, HALF + 150 + 160);
  scene.add(ocean);
  // foam line where sea meets sand, drifts with time
  out.foamMat = new THREE.MeshBasicMaterial({ color: 0xeaf6f2, transparent: true, opacity: 0.75 });
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(560, 4), out.foamMat);
  foam.rotation.x = -Math.PI / 2; foam.position.set(0, 0.05, HALF + 148);
  scene.add(foam);

  // (roads are painted into the ground texture — see textures.js groundTexture)

  // ---- blocks: sidewalk tops + buildings (instanced, 3 facade variants) ----
  const blockTopGeo = new THREE.BoxGeometry(1, 0.3, 1);
  const blockTopMat = new THREE.MeshStandardMaterial({ map: sidewalkTexture(), roughness: 1 });
  const blocks = [];
  const facades = [
    { tex: facadeTexture("#2e4a66", 0.35, rng), mat: null }, // downtown glass
    { tex: facadeTexture("#b57a4e", 0.25, rng), mat: null }, // pastel beach
    { tex: facadeTexture("#5a5a52", 0.15, rng), mat: null }, // port industrial
  ];
  facades[0].mat = new THREE.MeshStandardMaterial({ map: facades[0].tex, roughness: 0.35, metalness: 0.35 });
  facades[1].mat = new THREE.MeshStandardMaterial({ map: facades[1].tex, roughness: 0.8 });
  facades[2].mat = new THREE.MeshStandardMaterial({ map: facades[2].tex, roughness: 0.9 });
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const perFacade = [[], [], []];
  const parks = [];

  for (let ix = 0; ix < N; ix++) {
    for (let iz = 0; iz < N; iz++) {
      const bx = -HALF + ix * P + P / 2, bz = -HALF + iz * P + P / 2;
      if (bz > HALF - P) continue; // beach row stays open sand
      blocks.push([bx, bz]);
      const d = districtAt(bx, bz);
      const isPark = rng.next() < 0.1;
      if (isPark) { parks.push([bx, bz]); continue; }
      const count = d.name === "Downtown" ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const w = rng.range(14, 26), dep = rng.range(14, 26);
        const h = rng.range(d.hMin, d.hMax);
        const ox = count === 2 ? (k === 0 ? -9 : 9) : 0;
        const oz = count === 2 ? (k === 0 ? -9 : 9) : 0;
        const x = bx + ox, z = bz + oz;
        // keep named-place plots clear
        let clear = true;
        for (const key of Object.keys(CONFIG.PLACES)) {
          const pl = CONFIG.PLACES[key];
          if (Math.abs(pl.x - x) < 24 && Math.abs(pl.z - z) < 24) clear = false;
        }
        if (!clear) continue;
        const fi = d.name === "Downtown" ? 0 : d.name === "Beachside" ? 1 : 2;
        perFacade[fi].push({ x, z, w, h, d: dep });
        out.buildings.push({ x, z, hw: w / 2, hd: dep / 2, h });
      }
    }
  }
  // block tops (instanced)
  const blockMesh = new THREE.InstancedMesh(blockTopGeo, blockTopMat, blocks.length);
  const m4 = new THREE.Matrix4();
  blocks.forEach(([bx, bz], i) => {
    m4.makeScale(CONFIG.BLOCK, 1, CONFIG.BLOCK);
    m4.setPosition(bx, 0, bz);
    blockMesh.setMatrixAt(i, m4);
  });
  blockMesh.receiveShadow = true; scene.add(blockMesh);

  // buildings (3 instanced draws)
  perFacade.forEach((list, fi) => {
    const im = new THREE.InstancedMesh(bGeo, facades[fi].mat, Math.max(list.length, 1));
    list.forEach((b, i) => {
      m4.makeScale(b.w, b.h, b.d);
      m4.setPosition(b.x, 0, b.z);
      im.setMatrixAt(i, m4);
    });
    im.count = list.length;
    im.castShadow = true; im.receiveShadow = true;
    scene.add(im);
  });

  // parks: grass + palms
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 });
  for (const [bx, bz] of parks) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.BLOCK - 4, CONFIG.BLOCK - 4), grassMat);
    g.rotation.x = -Math.PI / 2; g.position.set(bx, 0.12, bz); g.receiveShadow = true; scene.add(g);
  }

  // ---- palms (instanced trunks + crowns), along beach + parks ----
  const palmSpots = [];
  for (let i = 0; i < 46; i++) {
    const x = rng.range(-HALF, HALF);
    const z = rng.next() < 0.6 ? rng.range(HALF + 6, HALF + 130) : rng.range(-HALF, HALF);
    palmSpots.push([x, z]);
  }
  for (const [bx, bz] of parks) for (let i = 0; i < 3; i++) palmSpots.push([bx + rng.range(-14, 14), bz + rng.range(-14, 14)]);
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 7, 6);
  trunkGeo.translate(0, 3.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
  const trunkIM = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const crownGeo = new THREE.ConeGeometry(2.3, 2.4, 7);
  crownGeo.translate(0, 7.8, 0);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2f7a33, roughness: 0.9, flatShading: true });
  const crownIM = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
  palmSpots.forEach(([x, z], i) => {
    m4.makeRotationY(rng.range(0, Math.PI * 2)); m4.setPosition(x, 0, z);
    trunkIM.setMatrixAt(i, m4); crownIM.setMatrixAt(i, m4);
  });
  trunkIM.castShadow = true; crownIM.castShadow = true;
  scene.add(trunkIM); scene.add(crownIM);

  // ---- streetlights (instanced poles + emissive heads) ----
  const lampSpots = [];
  for (let i = 0; i <= N; i += 2) for (let j = 0; j <= N; j += 2) {
    lampSpots.push([-HALF + i * P + 9, -HALF + j * P + 9]);
  }
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  poleGeo.translate(0, 3, 0);
  const poleIM = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6, metalness: 0.6 }), lampSpots.length);
  const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffc978, emissiveIntensity: 0.4 });
  const headIM = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    m4.identity(); m4.setPosition(x, 0, z); poleIM.setMatrixAt(i, m4);
    m4.identity(); m4.setPosition(x, 6.1, z); headIM.setMatrixAt(i, m4);
    out.lamps.push([x, z]);
  });
  scene.add(poleIM); scene.add(headIM);
  out.lampHeadMat = headMat;

  // ---- props: benches, bins, hydrants (instanced boxes) ----
  const propSpots = [];
  for (let i = 0; i < 60; i++) {
    const bx = -HALF + rng.int(0, N - 1) * P + P / 2 + rng.range(-18, 18);
    const bz = -HALF + rng.int(0, N - 1) * P + P / 2 + rng.range(-18, 18);
    propSpots.push([bx, bz, rng.pick([0x8a6a3a, 0x2a4a2a, 0xb03a2a])]);
  }
  const propGeo = new THREE.BoxGeometry(1.6, 0.9, 0.7);
  propGeo.translate(0, 0.45, 0);
  const propIM = new THREE.InstancedMesh(propGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), propSpots.length);
  const col = new THREE.Color();
  propSpots.forEach(([x, z, c], i) => {
    m4.makeRotationY(rng.range(0, Math.PI * 2)); m4.setPosition(x, 0, z);
    propIM.setMatrixAt(i, m4);
    propIM.setColorAt(i, col.setHex(c));
  });
  propIM.castShadow = true; scene.add(propIM);

  // ---- zebra crossings at 4 main intersections ----
  const zebraGeo = new THREE.PlaneGeometry(1.2, 5);
  const zebraMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
  const zebraIM = new THREE.InstancedMesh(zebraGeo, zebraMat, 32);
  let zi = 0;
  for (const [ix, iz] of [[2, 2], [6, 2], [2, 6], [6, 6]]) {
    const cx = -HALF + ix * P, cz = -HALF + iz * P;
    for (let k = 0; k < 8; k++) {
      m4.makeRotationX(-Math.PI / 2);
      m4.setPosition(cx - 10 + k * 3, 0.06, cz + 8);
      zebraIM.setMatrixAt(zi++, m4);
    }
  }
  zebraIM.count = zi; scene.add(zebraIM);

  // ---- traffic lights: 3 instanced draws total (poles, boxes, 12 lamps).
  // Lamp colours live in instanceColor and are rewritten on state change.
  const tlSpots = [[2, 2], [6, 2], [2, 6], [6, 6]].map(([ix, iz]) => [-HALF + ix * P, -HALF + iz * P]);
  const tlPoleGeo = new THREE.CylinderGeometry(0.12, 0.12, 5, 6);
  tlPoleGeo.translate(0, 2.5, 0);
  const tlPoleIM = new THREE.InstancedMesh(tlPoleGeo, new THREE.MeshStandardMaterial({ color: 0x222226 }), 4);
  const tlBoxGeo = new THREE.BoxGeometry(0.7, 1.8, 0.7);
  tlBoxGeo.translate(0, 5.4, 0);
  const tlBoxIM = new THREE.InstancedMesh(tlBoxGeo, new THREE.MeshStandardMaterial({ color: 0x111111 }), 4);
  const tlLampIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff }), 12);
  const tlLampCol = new THREE.Color();
  tlSpots.forEach(([cx, cz], i) => {
    m4.identity(); m4.setPosition(cx + 8, 0, cz + 8);
    tlPoleIM.setMatrixAt(i, m4); tlBoxIM.setMatrixAt(i, m4);
    let ly = 6.0;
    for (let k = 0; k < 3; k++) {
      m4.identity(); m4.setPosition(cx + 8, ly, cz + 8.45); ly -= 0.55;
      tlLampIM.setMatrixAt(i * 3 + k, m4);
      tlLampIM.setColorAt(i * 3 + k, tlLampCol.setHex(0x331111));
    }
    out.trafficLights.push({ x: cx, z: cz, axis: (i % 2 === 0) ? "x" : "z", state: "g", timer: rng.range(0, 6), lampBase: i * 3 });
  });
  scene.add(tlPoleIM); scene.add(tlBoxIM); scene.add(tlLampIM);
  out.tlLampIM = tlLampIM;

  // ---- pier: wooden deck on posts into the sea ----
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 1 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 92), pierMat);
  deck.position.set(0, 1.2, HALF + 150 - 46 + 46); deck.position.z = HALF + 92;
  deck.castShadow = true; deck.receiveShadow = true; scene.add(deck);
  const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 3, 6);
  const postIM = new THREE.InstancedMesh(postGeo, pierMat, 24);
  let pi = 0;
  for (let k = 0; k < 12; k++) for (const sx of [-4.5, 4.5]) {
    m4.identity(); m4.setPosition(sx, 0, HALF + 8 + k * 7.5); postIM.setMatrixAt(pi++, m4);
  }
  postIM.count = pi; scene.add(postIM);

  // ---- named buildings: ONE InstancedMesh (per-instance colour) + signs.
  // Real geometry + signs — never bare coordinates.
  const namedSpecs = [];
  function namedBox(key, w, h, d, color, signW, signH, signY) {
    const pl = CONFIG.PLACES[key];
    namedSpecs.push({ x: pl.x, z: pl.z, w, h, d, color });
    out.buildings.push({ x: pl.x, z: pl.z, hw: w / 2, hd: d / 2, h });
    out.named[key] = { x: pl.x, z: pl.z };
    addSign(scene, pl, signW, signH, signY).position.set(pl.x, signY, pl.z - d / 2 - 0.3);
  }
  // Cafe Alba: low pastel cafe with orange awning + outdoor tables
  namedBox("cafeAlba", 22, 9, 16, 0xf2c29b, 14, 3.5, 7.5);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(22, 0.5, 5), new THREE.MeshStandardMaterial({ color: 0xff7a2a, roughness: 0.7 }));
  awning.position.set(CONFIG.PLACES.cafeAlba.x, 4.6, CONFIG.PLACES.cafeAlba.z - 10); scene.add(awning);
  // Warm storefront glow over the cafe tables: at night it lights Riko, Tia
  // and the pavement in front of the sign; by day it is a faint warm wash.
  const cafeGlow = new THREE.PointLight(0xff9e4a, 35, 22, 1.8);
  cafeGlow.position.set(CONFIG.PLACES.cafeAlba.x, 5, CONFIG.PLACES.cafeAlba.z - 12);
  scene.add(cafeGlow);
  const tableGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.15, 10);
  tableGeo.translate(0, 1.1, 0);
  const tableIM = new THREE.InstancedMesh(tableGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }), 3);
  [[-8, -14], [0, -14], [8, -14]].forEach(([dx, dz], i) => {
    m4.identity(); m4.setPosition(CONFIG.PLACES.cafeAlba.x + dx, 0, CONFIG.PLACES.cafeAlba.z + dz);
    tableIM.setMatrixAt(i, m4);
  });
  scene.add(tableIM);
  // Bay Trust Bank: tall stone bank with columns + steps
  namedBox("bank", 26, 22, 20, 0xd8d2c4, 18, 4, 18);
  const colGeo = new THREE.CylinderGeometry(0.9, 0.9, 14, 10);
  colGeo.translate(0, 7, 0);
  const colIM = new THREE.InstancedMesh(colGeo, new THREE.MeshStandardMaterial({ color: 0xefe9da, roughness: 0.7 }), 4);
  [-9, -3, 3, 9].forEach((dx, i) => {
    m4.identity(); m4.setPosition(CONFIG.PLACES.bank.x + dx, 0, CONFIG.PLACES.bank.z - 11);
    colIM.setMatrixAt(i, m4);
  });
  colIM.castShadow = true; scene.add(colIM);
  // Lucky Gull Casino: wide neon building
  namedBox("casino", 30, 16, 22, 0x3a2a4a, 20, 5, 13);
  // Quick Coat Garage: low wide, open shutter (dark mouth)
  namedBox("garage", 24, 8, 18, 0x4a6a8a, 18, 3.5, 6.5);
  const shutter = new THREE.Mesh(new THREE.PlaneGeometry(14, 5.5), new THREE.MeshStandardMaterial({ color: 0x0a0a0e, roughness: 1 }));
  shutter.position.set(CONFIG.PLACES.garage.x, 3, CONFIG.PLACES.garage.z - 9.2); scene.add(shutter);
  // Iron & Lead Arms: small dark shop
  namedBox("gunshop", 16, 8, 14, 0x5a2a2a, 12, 3, 6.5);
  // flush the instanced named boxes (light facade texture + per-instance tint,
  // so the pale bank reads as a building with windows, not a blank white box)
  {
    const nbGeo = new THREE.BoxGeometry(1, 1, 1);
    nbGeo.translate(0, 0.5, 0);
    const nbIM = new THREE.InstancedMesh(nbGeo,
      new THREE.MeshStandardMaterial({ map: facadeTexture("#cfcfcf", 0.25, rng), roughness: 0.85 }), namedSpecs.length);
    const c = new THREE.Color();
    namedSpecs.forEach((s, i) => {
      m4.makeScale(s.w, s.h, s.d);
      m4.setPosition(s.x, 0, s.z);
      nbIM.setMatrixAt(i, m4);
      nbIM.setColorAt(i, c.setHex(s.color));
    });
    nbIM.castShadow = true; nbIM.receiveShadow = true;
    scene.add(nbIM);
  }

  // ---- global landmark: Marisol Spire (casino tower, neon, beacon) ----
  const sp = CONFIG.PLACES.spire;
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(7, 10, 74, 10),
    new THREE.MeshStandardMaterial({ color: 0x2a2a4a, roughness: 0.3, metalness: 0.5 }));
  spire.position.set(sp.x, 37, sp.z); spire.castShadow = true; scene.add(spire);
  out.buildings.push({ x: sp.x, z: sp.z, hw: 10, hd: 10, h: 74 });
  const spireTop = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff4ad8, emissiveIntensity: 3.2 }));
  spireTop.position.set(sp.x, 76, sp.z); scene.add(spireTop);
  out.spireTop = spireTop;
  const spireRing = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.5, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffe14a, emissiveIntensity: 2.4 }));
  spireRing.rotation.x = Math.PI / 2; spireRing.position.set(sp.x, 62, sp.z); scene.add(spireRing);
  addSign(scene, sp, 22, 5, 52).position.set(sp.x, 52, sp.z - 8.5);
  out.named.spire = { x: sp.x, z: sp.z };
  out.named.pier = { x: 0, z: HALF + 92 };

  return out;
}

// Circle-vs-building push-out used by player, traffic and peds.
export function collideBuildings(buildings, x, z, radius) {
  let nx = x, nz = z;
  for (const b of buildings) {
    const dx = nx - b.x, dz = nz - b.z;
    if (Math.abs(dx) < b.hw + radius && Math.abs(dz) < b.hd + radius) {
      const px = b.hw + radius - Math.abs(dx), pz = b.hd + radius - Math.abs(dz);
      if (px < pz) nx = b.x + Math.sign(dx || 1) * (b.hw + radius);
      else nz = b.z + Math.sign(dz || 1) * (b.hd + radius);
    }
  }
  return [nx, nz];
}
