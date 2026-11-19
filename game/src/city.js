// MARISOL HEAT — city.js
// One job: build the whole city from the seed — 4 named districts, a global
// landmark, real named buildings (Cafe Alba, Bay Trust Bank, Lucky Gull,
// Quick Coat Garage, Iron & Lead), beach + pier + ocean, and instanced props.
// Buildings / palms / lamps / props are InstancedMesh per chunk so the full
// city stays well under 100 draw calls (measured in the dossier).
import * as THREE from "three";
import { CONFIG } from "./config.js";
import { makeRng } from "./random.js";
import { mergeGeometries } from "./util.js";
import { facadeTexture, signTexture, groundTexture, sidewalkTexture, grassTexture, awningTexture, storefrontTexture, menuTexture, lightPoolTexture } from "./textures.js";

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
    lampHeadMat: null, lightPoolIM: null,
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
  // two extra foam bands, fainter, further out
  for (const [fz, fo] of [[HALF + 156, 0.4], [HALF + 168, 0.25]]) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(560, 2.5),
      new THREE.MeshBasicMaterial({ color: 0xeaf6f2, transparent: true, opacity: fo }));
    band.rotation.x = -Math.PI / 2; band.position.set(0, 0.03, fz);
    scene.add(band);
  }
  // sun glitter: a warm additive strip on the water along the golden-hour
  // sun azimuth, from the shore out toward the sun
  {
    const glitGeo = new THREE.PlaneGeometry(46, 220);
    glitGeo.rotateX(-Math.PI / 2);
    glitGeo.rotateY(-0.9);
    const glitter = new THREE.Mesh(glitGeo,
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }));
    glitter.position.set(-77, 0.02, HALF + 208);
    scene.add(glitter);
  }

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
      blocks.push([bx, bz, ix, iz]);
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
  // block tops (instanced) — alternating ±8% tone per block, matching the
  // ground texture's checker so the sidewalk reads tiled, not flat
  const blockMesh = new THREE.InstancedMesh(blockTopGeo, blockTopMat, blocks.length);
  const m4 = new THREE.Matrix4();
  const blockCol = new THREE.Color();
  blocks.forEach(([bx, bz, ix, iz], i) => {
    m4.makeScale(CONFIG.BLOCK, 1, CONFIG.BLOCK);
    m4.setPosition(bx, 0, bz);
    blockMesh.setMatrixAt(i, m4);
    const tone = (ix + iz) % 2 === 0 ? 1.08 : 0.92;
    blockMesh.setColorAt(i, blockCol.setRGB(tone, tone, tone));
  });
  if (blockMesh.instanceColor) blockMesh.instanceColor.needsUpdate = true;
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
  // Palm variety comes from its OWN seeded sub-rng (positions stay on the
  // main rng stream, so the rest of the city layout never shifts): each
  // palm gets a random scale 0.7–1.3 and a slight lean ±0.06 rad.
  const palmRng = makeRng(CONFIG.SEED * 1000 + 11);
  const palmQ = new THREE.Quaternion();
  const palmE = new THREE.Euler();
  const palmS = new THREE.Vector3();
  const palmP = new THREE.Vector3();
  palmSpots.forEach(([x, z], i) => {
    const s = palmRng.range(0.7, 1.3);
    palmE.set(palmRng.range(-0.06, 0.06), palmRng.range(0, Math.PI * 2), palmRng.range(-0.06, 0.06));
    palmQ.setFromEuler(palmE);
    palmP.set(x, 0, z); palmS.set(s, s, s);
    m4.compose(palmP, palmQ, palmS);
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
  const poleIM = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6, metalness: 0.6 }), lampSpots.length + 1);
  const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffc978, emissiveIntensity: 0.4 });
  const headIM = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length + 1);
  lampSpots.forEach(([x, z], i) => {
    m4.identity(); m4.setPosition(x, 0, z); poleIM.setMatrixAt(i, m4);
    m4.identity(); m4.setPosition(x, 6.1, z); headIM.setMatrixAt(i, m4);
    out.lamps.push([x, z]);
  });
  // one extra streetlamp on the cafe's east sidewalk corner (68,-72):
  // the grid lamps are all far from Cafe Alba, so this is the lamp whose
  // light pool actually lands in the mission shot's foreground
  {
    const ci = lampSpots.length;
    m4.identity(); m4.setPosition(68, 0, -72); poleIM.setMatrixAt(ci, m4);
    m4.identity(); m4.setPosition(68, 6.1, -72); headIM.setMatrixAt(ci, m4);
    out.lamps.push([68, -72]);
  }
  scene.add(poleIM); scene.add(headIM);
  out.lampHeadMat = headMat;
  // Warm light pools on the ground under every streetlamp — night preset
  // only (toggled in world.setTimePreset). One instanced draw.
  {
    const poolGeo = new THREE.PlaneGeometry(7, 7);
    poolGeo.rotateX(-Math.PI / 2);
    const poolIM = new THREE.InstancedMesh(poolGeo,
      new THREE.MeshBasicMaterial({ map: lightPoolTexture(), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
      lampSpots.length + 1);
    lampSpots.forEach(([x, z], i) => {
      m4.identity(); m4.setPosition(x, 0.07, z);
      poolIM.setMatrixAt(i, m4);
    });
    // pool for the extra cafe-corner lamp
    m4.identity(); m4.setPosition(68, 0.07, -72);
    poolIM.setMatrixAt(lampSpots.length, m4);
    poolIM.visible = false;
    scene.add(poolIM);
    out.lightPoolIM = poolIM;
  }

  // ---- props: 3 distinct instanced shapes (bench / bin / hydrant), 20
  // each, kept inside the block interior (±14 from the block centre) so
  // none of them reads as litter sitting in the road.
  const propSpots = [];
  for (let i = 0; i < 60; i++) {
    const bx = -HALF + rng.int(0, N - 1) * P + P / 2 + rng.range(-14, 14);
    const bz = -HALF + rng.int(0, N - 1) * P + P / 2 + rng.range(-14, 14);
    propSpots.push([bx, bz]);
  }
  function propIM(geo, color, spots, extra = [], fixed = []) {
    const im = new THREE.InstancedMesh(geo,
      new THREE.MeshStandardMaterial({ color, roughness: 0.9 }), spots.length + extra.length + fixed.length);
    [...spots, ...extra].forEach(([x, z], i) => {
      m4.makeRotationY(rng.range(0, Math.PI * 2)); m4.setPosition(x, 0, z);
      im.setMatrixAt(i, m4);
    });
    // Hand-placed `fixed` spots use a position-hash yaw and draw NO rng:
    // the main rng stream must not shift, or every traffic car, ped and
    // police spawn angle downstream moves with it (r4 layout is verified).
    fixed.forEach(([x, z], j) => {
      const i = spots.length + extra.length + j;
      m4.makeRotationY((x * 0.37 + z * 0.73) % (Math.PI * 2)); m4.setPosition(x, 0, z);
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true; scene.add(im);
    return im;
  }
  const benchGeo = mergeGeometries([
    new THREE.BoxGeometry(1.6, 0.12, 0.7).translate(0, 0.45, 0),
    new THREE.BoxGeometry(1.6, 0.7, 0.1).translate(0, 0.85, -0.3),
  ]);
  // the 21st bench sits on the pier, facing the sea; the 22nd anchors the
  // city shot's empty bottom-left foreground (block (56,112) south edge,
  // clear of its one building at (56,112) which ends at x=64.6 / z=120.7;
  // NDC-verified in frame at screen ~(196,663))
  propIM(benchGeo, 0x8a6a3a, propSpots.slice(0, 20), [[2.5, 378]], [[72, 120]]);
  const binGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.0, 10);
  binGeo.translate(0, 0.5, 0);
  propIM(binGeo, 0x3a5a4a, propSpots.slice(20, 40));
  const hydrantGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.22, 0.28, 0.9, 8).translate(0, 0.45, 0),
    new THREE.SphereGeometry(0.22, 8, 6).translate(0, 0.95, 0),
  ]);
  // one red hydrant beside the foreground bench above (same clear strip,
  // NDC-verified in frame at screen ~(150,600))
  propIM(hydrantGeo, 0xb03a2a, propSpots.slice(40, 60), [], [[68, 116]]);

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
  // pier rails on both sides (1 instanced draw)
  {
    const railGeo = new THREE.BoxGeometry(0.15, 0.9, 88);
    const railIM = new THREE.InstancedMesh(railGeo, pierMat, 2);
    [-4.8, 4.8].forEach((rx, i) => {
      m4.identity(); m4.setPosition(rx, 1.7, HALF + 92);
      railIM.setMatrixAt(i, m4);
    });
    scene.add(railIM);
  }
  // 3 pier lamps: instanced poles + emissive heads
  {
    const pPoleGeo = new THREE.CylinderGeometry(0.09, 0.12, 2.6, 6);
    pPoleGeo.translate(0, 1.3, 0);
    const pPoleIM = new THREE.InstancedMesh(pPoleGeo,
      new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6, metalness: 0.6 }), 3);
    const pHeadIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffc978, emissiveIntensity: 2.2 }), 3);
    [[-4.2, 310], [4.2, 345], [-4.2, 380]].forEach(([lx, lz], i) => {
      m4.identity(); m4.setPosition(lx, 1.5, lz); pPoleIM.setMatrixAt(i, m4);
      m4.identity(); m4.setPosition(lx, 4.2, lz); pHeadIM.setMatrixAt(i, m4);
    });
    scene.add(pPoleIM); scene.add(pHeadIM);
  }
  // hut at the end of the pier (merged box + cone roof, 1 draw)
  {
    const hutGeo = mergeGeometries([
      new THREE.BoxGeometry(4, 2.6, 4).translate(0, 1.3, 0),
      new THREE.ConeGeometry(3.4, 1.6, 4).translate(0, 3.4, 0),
    ]);
    const hut = new THREE.Mesh(hutGeo,
      new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }));
    hut.position.set(0, 1.5, HALF + 132);
    hut.rotation.y = Math.PI / 4;
    hut.castShadow = true;
    scene.add(hut);
  }

  // ---- beach props (seeded sub-rng; pier + hero car + Riko kept clear) ----
  {
    const beachRng = makeRng(7101);
    const spots = [];
    for (let i = 0; i < 5; i++) {
      let x, z, tries = 0;
      do {
        x = beachRng.range(-120, 120);
        z = beachRng.range(268, 332);
        tries++;
      } while (tries < 20 && (Math.abs(x) < 10 ||
        Math.hypot(x - 20, z - 304) < 6 || Math.hypot(x - 14, z - 310) < 5));
      spots.push([x, z]);
    }
    // 5 umbrellas: coloured cone canopies + poles (2 instanced draws)
    const umbGeo = new THREE.ConeGeometry(1.8, 0.9, 8);
    umbGeo.translate(0, 2.2, 0);
    const umbIM = new THREE.InstancedMesh(umbGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }), 5);
    const umbCol = new THREE.Color();
    const UMB_COLORS = [0xff5a7a, 0xffe14a, 0x2ad8ff, 0xff8a2a, 0x7aff8a];
    const umbPoleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6);
    umbPoleGeo.translate(0, 1.1, 0);
    const umbPoleIM = new THREE.InstancedMesh(umbPoleGeo,
      new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.8 }), 5);
    spots.forEach(([x, z], i) => {
      m4.makeRotationY(beachRng.range(0, Math.PI * 2)); m4.setPosition(x, 0, z);
      umbIM.setMatrixAt(i, m4); umbPoleIM.setMatrixAt(i, m4);
      umbIM.setColorAt(i, umbCol.setHex(UMB_COLORS[i]));
    });
    if (umbIM.instanceColor) umbIM.instanceColor.needsUpdate = true;
    scene.add(umbIM); scene.add(umbPoleIM);
    // 3 towels: thin bright boxes beside the umbrellas
    const towelGeo = new THREE.BoxGeometry(1.8, 0.06, 0.9);
    towelGeo.translate(0, 0.05, 0);
    const towelIM = new THREE.InstancedMesh(towelGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), 3);
    const TOWEL_COLORS = [0xff5a7a, 0x2ad8ff, 0xffe14a];
    spots.slice(0, 3).forEach(([x, z], i) => {
      m4.makeRotationY(beachRng.range(0, Math.PI * 2));
      m4.setPosition(x + 2.5, 0, z + 2);
      towelIM.setMatrixAt(i, m4);
      towelIM.setColorAt(i, umbCol.setHex(TOWEL_COLORS[i]));
    });
    if (towelIM.instanceColor) towelIM.instanceColor.needsUpdate = true;
    scene.add(towelIM);
    // volleyball net near the pier (merged poles + net, 1 draw)
    const netGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6).translate(-3, 1.1, 0),
      new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6).translate(3, 1.1, 0),
      new THREE.BoxGeometry(6, 1.0, 0.06).translate(0, 1.6, 0),
    ]);
    const net = new THREE.Mesh(netGeo,
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.9 }));
    net.position.set(-20, 0, 320); net.rotation.y = 0.4;
    scene.add(net);
    // driftwood: logs lying flat. Matrices are built with compose()
    // (position + quaternion + scale) — never translate-then-rotate,
    // which would orbit the log around the map origin.
    const logGeo = new THREE.CylinderGeometry(0.25, 0.3, 3.5, 7);
    logGeo.rotateZ(Math.PI / 2);
    const logIM = new THREE.InstancedMesh(logGeo,
      new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 }), 2);
    const logQ = new THREE.Quaternion();
    const logE = new THREE.Euler();
    const logP = new THREE.Vector3();
    const logS = new THREE.Vector3(1, 1, 1);
    [[-40, 300, 0.7], [60, 318, -0.5]].forEach(([lx, lz, yaw], i) => {
      logE.set(0, yaw, 0); logQ.setFromEuler(logE);
      logP.set(lx, 0.25, lz);
      m4.compose(logP, logQ, logS);
      logIM.setMatrixAt(i, m4);
    });
    logIM.castShadow = true; scene.add(logIM);
    // starfish: 5-point stars flat on the sand
    const star = new THREE.Shape();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      const r = k % 2 === 0 ? 0.5 : 0.2;
      if (k === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    star.closePath();
    const starGeo = new THREE.ShapeGeometry(star);
    starGeo.rotateX(-Math.PI / 2);
    const starIM = new THREE.InstancedMesh(starGeo,
      new THREE.MeshStandardMaterial({ color: 0xff8a4a, roughness: 0.9 }), 6);
    for (let i = 0; i < 6; i++) {
      m4.makeRotationY(beachRng.range(0, Math.PI * 2));
      m4.setPosition(beachRng.range(-100, 100), 0.06, beachRng.range(262, 330));
      starIM.setMatrixAt(i, m4);
    }
    scene.add(starIM);
  }

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
  // Cafe Alba: low pastel cafe with striped awning + outdoor tables
  namedBox("cafeAlba", 22, 9, 16, 0xf2c29b, 14, 3.5, 7.5);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(22, 0.5, 5),
    new THREE.MeshStandardMaterial({ map: awningTexture(), roughness: 0.7 }));
  awning.position.set(CONFIG.PLACES.cafeAlba.x, 4.6, CONFIG.PLACES.cafeAlba.z - 10);
  awning.rotation.x = -0.2; // front edge dips down, like a real awning
  scene.add(awning);
  // scalloped front edge: 11 small valance boxes along the awning front
  {
    const scalGeo = new THREE.BoxGeometry(1.9, 0.45, 0.25);
    const scalIM = new THREE.InstancedMesh(scalGeo,
      new THREE.MeshStandardMaterial({ map: awningTexture(), roughness: 0.7 }), 11);
    for (let k = 0; k < 11; k++) {
      m4.identity();
      m4.setPosition(CONFIG.PLACES.cafeAlba.x - 10 + k * 2, 4.35 + (k % 2 === 0 ? 0.08 : -0.08), CONFIG.PLACES.cafeAlba.z - 12.6);
      scalIM.setMatrixAt(k, m4);
    }
    scene.add(scalIM);
  }
  // warm storefront: glass + shelves + door over the ground floor only
  // (top y=5.5 stays below the sign, which starts at y≈5.75)
  {
    const sfTex = storefrontTexture();
    const storefront = new THREE.Mesh(new THREE.PlaneGeometry(20, 5.5),
      new THREE.MeshStandardMaterial({ map: sfTex, emissive: 0xffffff, emissiveMap: sfTex, emissiveIntensity: 0.45, roughness: 0.4 }));
    storefront.position.set(CONFIG.PLACES.cafeAlba.x, 2.75, CONFIG.PLACES.cafeAlba.z - 8.35);
    storefront.rotation.y = Math.PI;
    scene.add(storefront);
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5),
      new THREE.MeshStandardMaterial({ map: menuTexture(), roughness: 0.9 }));
    menu.position.set(CONFIG.PLACES.cafeAlba.x + 6, 1.0, CONFIG.PLACES.cafeAlba.z - 9.5);
    menu.rotation.y = Math.PI;
    scene.add(menu);
  }
  // Warm storefront glow over the cafe tables: at night it lights Riko, Tia
  // and the pavement in front of the sign; by day it is a faint warm wash.
  const cafeGlow = new THREE.PointLight(0xff9e4a, 35, 22, 1.8);
  cafeGlow.position.set(CONFIG.PLACES.cafeAlba.x, 5, CONFIG.PLACES.cafeAlba.z - 12);
  scene.add(cafeGlow);
  const tableSpots = [[-8, -14], [0, -14], [8, -14]];
  const tableGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.15, 10);
  tableGeo.translate(0, 1.1, 0);
  const tableIM = new THREE.InstancedMesh(tableGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }), 3);
  tableSpots.forEach(([dx, dz], i) => {
    m4.identity(); m4.setPosition(CONFIG.PLACES.cafeAlba.x + dx, 0, CONFIG.PLACES.cafeAlba.z + dz);
    tableIM.setMatrixAt(i, m4);
  });
  scene.add(tableIM);
  // table legs + umbrella poles + red cone canopies (1 instanced draw each)
  {
    const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.1, 6);
    legGeo.translate(0, 0.55, 0);
    const legIM = new THREE.InstancedMesh(legGeo,
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 }), 3);
    const tPoleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6);
    tPoleGeo.translate(0, 1.2, 0);
    const tPoleIM = new THREE.InstancedMesh(tPoleGeo,
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 }), 3);
    const canopyGeo = new THREE.ConeGeometry(1.7, 0.8, 10);
    canopyGeo.translate(0, 2.6, 0);
    const canopyIM = new THREE.InstancedMesh(canopyGeo,
      new THREE.MeshStandardMaterial({ color: 0xd83a2a, roughness: 0.8, flatShading: true }), 3);
    tableSpots.forEach(([dx, dz], i) => {
      m4.identity(); m4.setPosition(CONFIG.PLACES.cafeAlba.x + dx, 0, CONFIG.PLACES.cafeAlba.z + dz);
      legIM.setMatrixAt(i, m4); tPoleIM.setMatrixAt(i, m4); canopyIM.setMatrixAt(i, m4);
    });
    scene.add(legIM); scene.add(tPoleIM); scene.add(canopyIM);
  }
  // 2 chairs per table (seat + backrest merged, 1 instanced draw)
  {
    const chairGeo = mergeGeometries([
      new THREE.BoxGeometry(0.55, 0.1, 0.55).translate(0, 0.45, 0),
      new THREE.BoxGeometry(0.55, 0.6, 0.08).translate(0, 0.8, -0.24),
    ]);
    const chairIM = new THREE.InstancedMesh(chairGeo,
      new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9 }), 6);
    let ci = 0;
    for (const [dx, dz] of tableSpots) {
      for (const [off, yaw] of [[1.8, Math.PI], [-1.8, 0]]) {
        m4.makeRotationY(yaw);
        m4.setPosition(CONFIG.PLACES.cafeAlba.x + dx, 0, CONFIG.PLACES.cafeAlba.z + dz + off);
        chairIM.setMatrixAt(ci++, m4);
      }
    }
    chairIM.castShadow = true; scene.add(chairIM);
  }
  // planter in the lower-left foreground of the mission shot (camera
  // faces south, so screen-left is world +x: the planter sits east of
  // the camera, in front of the right-hand table)
  {
    const planter = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 }));
    planter.position.set(64, 0.35, -76);
    planter.castShadow = true; scene.add(planter);
    const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a7a3a, roughness: 1 }));
    shrub.scale.y = 0.7; shrub.position.set(64, 0.95, -76);
    shrub.castShadow = true; scene.add(shrub);
  }
  // second planter, mirroring the first across the cafe centre (x=56):
  // it anchors the lower-right foreground of the mission shot, in front
  // of the left-hand table — 6 m clear of the mission-1 walk line (z=-70)
  {
    const planter = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 }));
    planter.position.set(48, 0.35, -76);
    planter.castShadow = true; scene.add(planter);
    const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a7a3a, roughness: 1 }));
    shrub.scale.y = 0.7; shrub.position.set(48, 0.95, -76);
    shrub.castShadow = true; scene.add(shrub);
  }
  // A-board menu beside the centre table (reuses the wall menu texture):
  // two slanted panels leaning top-to-top, menu face toward the camera.
  // 3 m clear of the mission-1 walk line (z=-70); low (top y≈1.0) so it
  // never hides Riko, Tia or the sign.
  {
    const boardMat = new THREE.MeshStandardMaterial({ map: menuTexture(), roughness: 0.9 });
    const boardGeo = new THREE.PlaneGeometry(1.2, 1.0);
    const north = new THREE.Mesh(boardGeo, boardMat);
    north.position.set(58.5, 0.48, -73.15);
    north.rotation.set(0.22, Math.PI, 0);
    north.castShadow = true; scene.add(north);
    const south = new THREE.Mesh(boardGeo, boardMat);
    south.position.set(58.5, 0.48, -72.85);
    south.rotation.set(-0.22, 0, 0);
    south.castShadow = true; scene.add(south);
  }
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
  // Lucky Gull Casino: wide neon building. Body tint lightened r5
  // (0x3a2a4a -> 0x5a3a6e): the near-black purple multiplied the facade
  // texture down to a flat dark wall in the city shot — mid-purple keeps
  // the identity and lets the lit windows read.
  namedBox("casino", 30, 16, 22, 0x5a3a6e, 20, 5, 13);
  // Quick Coat Garage: low wide, open shutter (dark mouth)
  namedBox("garage", 24, 8, 18, 0x4a6a8a, 18, 3.5, 6.5);
  const shutter = new THREE.Mesh(new THREE.PlaneGeometry(14, 5.5), new THREE.MeshStandardMaterial({ color: 0x0a0a0e, roughness: 1 }));
  shutter.position.set(CONFIG.PLACES.garage.x, 3, CONFIG.PLACES.garage.z - 9.2); scene.add(shutter);
  // Iron & Lead Arms: small dark shop
  namedBox("gunshop", 16, 8, 14, 0x5a2a2a, 12, 3, 6.5);
  // flush the instanced named boxes (light facade texture + per-instance tint,
  // so the pale bank reads as a building with windows, not a blank white box).
  // litFrac 0.4 (r5, was 0.25): the casino's dark tint needs more lit
  // windows to read like the downtown towers. Safe: this is the last rng
  // draw in buildCity, so the city layout stream never shifts.
  {
    const nbGeo = new THREE.BoxGeometry(1, 1, 1);
    nbGeo.translate(0, 0.5, 0);
    const nbIM = new THREE.InstancedMesh(nbGeo,
      new THREE.MeshStandardMaterial({ map: facadeTexture("#cfcfcf", 0.4, rng), roughness: 0.85 }), namedSpecs.length);
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
