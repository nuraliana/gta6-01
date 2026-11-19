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
import { facadeTexture, signTexture, groundTexture, sidewalkTexture, grassTexture, cafeStorefrontTexture, awningTexture, lightPoolTexture, aboardTexture } from "./textures.js";

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
    new THREE.MeshStandardMaterial({ map: groundTexture(rng), roughness: 1 })
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
  // Palms: one seeded draw per palm drives its size (0.7-1.3x), its lean
  // (up to ~0.06 rad, random direction) and its facing, so the stream
  // stays exactly one draw per palm like the base.
  palmSpots.forEach(([x, z], i) => {
    const u = rng.next();
    const rotY = u * Math.PI * 2;
    const scale = 0.7 + 0.6 * u;
    const lean = 0.06 * ((u * 7.31 + 0.13) % 1);
    const leanDir = u * Math.PI * 2;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    const tilt = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(Math.cos(leanDir), 0, Math.sin(leanDir)), lean);
    q.multiply(tilt);
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(scale, scale, scale));
    trunkIM.setMatrixAt(i, m4); crownIM.setMatrixAt(i, m4);
  });
  trunkIM.castShadow = true; crownIM.castShadow = true;
  scene.add(trunkIM); scene.add(crownIM);

  // ---- streetlights (instanced poles + emissive heads) ----
  // Each spot carries its own base height and head height (defaults 0 / 6.1):
  // the extra cafe-corner lamp and the three pier lamps ride the same two
  // instanced meshes, with shorter poles on the pier deck.
  const lampSpots = [];
  for (let i = 0; i <= N; i += 2) for (let j = 0; j <= N; j += 2) {
    lampSpots.push([-HALF + i * P + 9, -HALF + j * P + 9, 0, 6.1, false]);
  }
  lampSpots.push([68, -72, 0, 6.1, false]); // extra lamp, Cafe Alba corner
  lampSpots.push([4, 312, 1.5, 4.8, true], [-4, 344, 1.5, 4.8, true], [4, 376, 1.5, 4.8, true]); // pier lamps
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  poleGeo.translate(0, 3, 0);
  const poleIM = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6, metalness: 0.6 }), lampSpots.length);
  const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffc978, emissiveIntensity: 0.4 });
  const headIM = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
  lampSpots.forEach(([x, z, baseY, headY], i) => {
    m4.makeScale(1, (headY - baseY) / 6, 1); m4.setPosition(x, baseY, z); poleIM.setMatrixAt(i, m4);
    m4.identity(); m4.setPosition(x, headY, z); headIM.setMatrixAt(i, m4);
    out.lamps.push([x, z]);
  });
  scene.add(poleIM); scene.add(headIM);
  out.lampHeadMat = headMat;

  // Warm light pools under every street lamp (not the pier lamps — their
  // pools would fall under the deck). One shared radial texture, one draw.
  {
    const streetSpots = lampSpots.filter((s) => !s[4]);
    const poolGeo = new THREE.PlaneGeometry(8, 8);
    poolGeo.rotateX(-Math.PI / 2);
    const poolIM = new THREE.InstancedMesh(poolGeo,
      new THREE.MeshBasicMaterial({ map: lightPoolTexture(), transparent: true, depthWrite: false }),
      streetSpots.length);
    streetSpots.forEach(([x, z], i) => {
      m4.identity(); m4.setPosition(x, 0.07, z); poolIM.setMatrixAt(i, m4);
    });
    poolIM.visible = false; // only the night preset shows them (world.js)
    scene.add(poolIM);
    out.lightPools = poolIM;
  }

  // ---- props: benches, bins, hydrants — three real shapes, one draw each.
  // 60 spots spread round-robin across the three shapes; spots stay inside
  // the block interior (+/-14 m) so they never read as litter mid-road.
  const propSpots = [];
  for (let i = 0; i < 60; i++) {
    const bx = -HALF + rng.int(0, N - 1) * P + P / 2 + rng.range(-14, 14);
    const bz = -HALF + rng.int(0, N - 1) * P + P / 2 + rng.range(-14, 14);
    propSpots.push([bx, bz, rng.pick([0x8a6a3a, 0x2a4a2a, 0xb03a2a])]);
  }
  const benchGeo = mergeGeometries([
    new THREE.BoxGeometry(1.7, 0.12, 0.65).translate(0, 0.45, 0),
    new THREE.BoxGeometry(1.7, 0.65, 0.1).rotateX(-0.12).translate(0, 0.85, -0.3),
    new THREE.BoxGeometry(0.1, 0.45, 0.55).translate(-0.7, 0.22, 0),
    new THREE.BoxGeometry(0.1, 0.45, 0.55).translate(0.7, 0.22, 0),
  ]);
  const binGeo = new THREE.CylinderGeometry(0.45, 0.4, 0.95, 10).translate(0, 0.48, 0);
  const hydrantGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.24, 0.28, 0.7, 8).translate(0, 0.35, 0),
    new THREE.SphereGeometry(0.24, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.7, 0),
    new THREE.CylinderGeometry(0.09, 0.09, 0.3, 6).rotateZ(Math.PI / 2).translate(0.3, 0.45, 0),
  ]);
  const benchIM = new THREE.InstancedMesh(benchGeo, new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9 }), 21);
  const binIM = new THREE.InstancedMesh(binGeo, new THREE.MeshStandardMaterial({ color: 0x2a4a2a, roughness: 0.9 }), 20);
  const hydrantIM = new THREE.InstancedMesh(hydrantGeo, new THREE.MeshStandardMaterial({ color: 0xb03a2a, roughness: 0.7 }), 21);
  let bi = 0, ni = 0, hi = 0;
  propSpots.forEach(([x, z], i) => {
    m4.makeRotationY(rng.range(0, Math.PI * 2)); m4.setPosition(x, 0, z);
    if (i % 3 === 0) benchIM.setMatrixAt(bi++, m4);
    else if (i % 3 === 1) binIM.setMatrixAt(ni++, m4);
    else hydrantIM.setMatrixAt(hi++, m4);
  });
  // Two fixed spots (no rng draws, so the stream after them is untouched):
  // a bench on the sidewalk facing the city-shot camera, and a red hydrant
  // beside it filling the shot's empty lower-left foreground.
  m4.makeRotationY(Math.PI); m4.setPosition(72, 0, 120); benchIM.setMatrixAt(bi++, m4);
  m4.identity(); m4.setPosition(75, 0, 122); hydrantIM.setMatrixAt(hi++, m4);
  for (const im of [benchIM, binIM, hydrantIM]) { im.castShadow = true; scene.add(im); }

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

  // Pier rails (two thin bars per side, two heights) + a bench mid-pier,
  // merged into one wooden piece, one draw.
  {
    const railParts = [];
    for (const sx of [-4.8, 4.8]) for (const ry of [2.4, 3.2]) {
      railParts.push(new THREE.BoxGeometry(0.12, 0.12, 88).translate(sx, ry, HALF + 92));
    }
    railParts.push(new THREE.BoxGeometry(1.8, 0.12, 0.6).translate(0, 1.95, HALF + 92));
    railParts.push(new THREE.BoxGeometry(1.8, 0.6, 0.1).translate(0, 2.35, HALF + 92 - 0.3));
    const railMesh = new THREE.Mesh(mergeGeometries(railParts), pierMat);
    railMesh.castShadow = true; scene.add(railMesh);
  }
  // Little hut at the end of the pier: box + four-sided pyramid roof
  // turned 45 degrees, merged into one piece.
  {
    const hutParts = [
      new THREE.BoxGeometry(4, 3, 4).translate(0, 3.0, 384),
      new THREE.ConeGeometry(3.4, 2, 4).rotateY(Math.PI / 4).translate(0, 5.5, 384),
    ];
    const hut = new THREE.Mesh(mergeGeometries(hutParts), pierMat);
    hut.castShadow = true; scene.add(hut);
  }
  // Sun glitter on the sea: one warm translucent sheet under the sun.
  const glint = new THREE.Mesh(new THREE.PlaneGeometry(90, 140),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }));
  glint.rotation.x = -Math.PI / 2; glint.position.set(0, -0.2, 470); scene.add(glint);
  // Two fainter extra foam lines, merged into one piece.
  {
    const foamParts = [
      new THREE.PlaneGeometry(560, 2).rotateX(-Math.PI / 2).translate(0, 0.05, HALF + 140),
      new THREE.PlaneGeometry(560, 2).rotateX(-Math.PI / 2).translate(0, 0.05, HALF + 156),
    ];
    const foam2 = new THREE.Mesh(mergeGeometries(foamParts),
      new THREE.MeshBasicMaterial({ color: 0xeaf6f2, transparent: true, opacity: 0.35 }));
    scene.add(foam2);
  }
  // Beach props on their own seeded stream, kept clear of the pier strip
  // and of the vista hero car at (20,304) so the staging stays clean.
  {
    const brng = makeRng(311);
    const clearOfPierAndCar = (x, z, r) => Math.abs(x) > 13 && Math.hypot(x - 20, z - 304) > r;
    const umbrellaSpots = [];
    while (umbrellaSpots.length < 5) {
      const x = brng.range(-140, 140), z = brng.range(262, 340);
      if (clearOfPierAndCar(x, z, 16)) umbrellaSpots.push([x, z]);
    }
    const poleGeoB = new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6).translate(0, 1.1, 0);
    const poleIMB = new THREE.InstancedMesh(poleGeoB, new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.8 }), 5);
    const canopyGeo = new THREE.ConeGeometry(1.9, 0.9, 8).translate(0, 2.5, 0);
    const canopyIM = new THREE.InstancedMesh(canopyGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), 5);
    const umbrellaCols = [0xff5a7a, 0xffd23a, 0x2ad8c2, 0xff7a2a, 0xe84a4a];
    const towelCols = [0x2a6ad8, 0xffd23a, 0xff5a7a];
    const towelGeo = new THREE.PlaneGeometry(2.2, 1.2).rotateX(-Math.PI / 2);
    const towelIM = new THREE.InstancedMesh(towelGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), 3);
    const bc = new THREE.Color();
    umbrellaSpots.forEach(([x, z], i) => {
      m4.makeRotationY(brng.range(0, Math.PI * 2)); m4.setPosition(x, 0, z);
      poleIMB.setMatrixAt(i, m4); canopyIM.setMatrixAt(i, m4);
      canopyIM.setColorAt(i, bc.setHex(umbrellaCols[i]));
      m4.identity(); m4.setPosition(x + 2.6, 0.08, z + 1.6);
      if (i < 3) { towelIM.setMatrixAt(i, m4); towelIM.setColorAt(i, bc.setHex(towelCols[i])); }
    });
    scene.add(poleIMB); scene.add(canopyIM); scene.add(towelIM);
    // Volleyball net near the pier (2 posts merged + net plane).
    {
      const netPosts = mergeGeometries([
        new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6).translate(12, 1.2, 360),
        new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6).translate(20, 1.2, 360),
      ]);
      const posts = new THREE.Mesh(netPosts, new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.8 }));
      scene.add(posts);
      const net = new THREE.Mesh(new THREE.PlaneGeometry(8, 1),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
      net.position.set(16, 1.9, 360); scene.add(net);
    }
    // Driftwood + six orange starfish scattered on the sand.
    const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 4, 7),
      new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 }));
    wood.rotation.z = Math.PI / 2; wood.rotation.y = 0.5; wood.position.set(-60, 0.3, 385); scene.add(wood);
    const starGeo = new THREE.ConeGeometry(0.55, 0.18, 5).translate(0, 0.09, 0);
    const starIM = new THREE.InstancedMesh(starGeo, new THREE.MeshStandardMaterial({ color: 0xff7a2a, roughness: 0.9 }), 6);
    for (let i = 0; i < 6; i++) {
      let x = 0, z = 0, tries = 0;
      do { x = brng.range(-120, 120); z = brng.range(265, 335); tries++; } while (!clearOfPierAndCar(x, z, 12) && tries < 20);
      m4.makeRotationY(brng.range(0, Math.PI * 2)); m4.setPosition(x, 0, z);
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
  // Cafe Alba: its own low building with a real storefront — NOT part of
  // the generic named-box group. Warm plaster sides, the storefront
  // texture on the street face, a striped awning with scalloped tabs,
  // and tables that finally stand on legs, with umbrella poles, striped
  // canopies and two chairs each.
  const cafe = CONFIG.PLACES.cafeAlba;
  out.buildings.push({ x: cafe.x, z: cafe.z, hw: 11, hd: 8, h: 9 });
  out.named.cafeAlba = { x: cafe.x, z: cafe.z };
  {
    const plaster = new THREE.MeshStandardMaterial({ color: 0xf2c29b, roughness: 0.85 });
    const cafeMesh = new THREE.Mesh(new THREE.BoxGeometry(22, 9, 16), plaster);
    cafeMesh.position.set(cafe.x, 4.5, cafe.z);
    cafeMesh.castShadow = true; cafeMesh.receiveShadow = true; scene.add(cafeMesh);
    // Storefront texture on its own thin plane on the street face, so the
    // box stays a single draw call instead of one per face material.
    const front = new THREE.Mesh(new THREE.PlaneGeometry(22, 9),
      new THREE.MeshStandardMaterial({ map: cafeStorefrontTexture(), roughness: 0.85 }));
    front.position.set(cafe.x, 4.5, cafe.z - 8.06);
    front.rotation.y = Math.PI; scene.add(front);
  }
  addSign(scene, cafe, 14, 3.5, 7.5).position.set(cafe.x, 7.5, cafe.z - 8.3);
  const awningMat = new THREE.MeshStandardMaterial({ map: awningTexture(), roughness: 0.7 });
  const awning = new THREE.Mesh(new THREE.BoxGeometry(22, 0.5, 5), awningMat);
  awning.position.set(cafe.x, 4.6, cafe.z - 10);
  awning.rotation.x = -0.17; // tipped down toward the street, about 10 degrees
  scene.add(awning);
  {
    const tabs = [];
    for (let i = 0; i < 11; i++) {
      tabs.push(new THREE.BoxGeometry(1.9, 0.55, 0.3).rotateX(-0.17)
        .translate(cafe.x - 10 + i * 2, 3.95, cafe.z - 12.45));
    }
    scene.add(new THREE.Mesh(mergeGeometries(tabs), awningMat));
  }
  // Warm storefront glow over the cafe tables: at night it lights Riko, Tia
  // and the pavement in front of the sign; by day it is a faint warm wash.
  const cafeGlow = new THREE.PointLight(0xff9e4a, 35, 22, 1.8);
  cafeGlow.position.set(cafe.x, 5, cafe.z - 12);
  scene.add(cafeGlow);
  const tableGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.15, 10);
  tableGeo.translate(0, 1.1, 0);
  const tableIM = new THREE.InstancedMesh(tableGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }), 3);
  [[-8, -14], [0, -14], [8, -14]].forEach(([dx, dz], i) => {
    m4.identity(); m4.setPosition(cafe.x + dx, 0, cafe.z + dz);
    tableIM.setMatrixAt(i, m4);
  });
  scene.add(tableIM);
  // Table legs (the old tops floated), umbrella poles, striped canopies.
  {
    const legParts = [-8, 0, 8].map((dx) =>
      new THREE.CylinderGeometry(0.09, 0.12, 1.1, 6).translate(cafe.x + dx, 0.55, cafe.z - 14));
    scene.add(new THREE.Mesh(mergeGeometries(legParts),
      new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.8 })));
    const poleParts = [-8, 0, 8].map((dx) =>
      new THREE.CylinderGeometry(0.06, 0.06, 1.7, 6).translate(cafe.x + dx, 2.0, cafe.z - 14));
    scene.add(new THREE.Mesh(mergeGeometries(poleParts),
      new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: 0.8 })));
    const canopyGeo = new THREE.ConeGeometry(1.7, 0.8, 10).translate(0, 3.2, 0);
    const canopyIM = new THREE.InstancedMesh(canopyGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), 3);
    const canopyCols = [0xff7a2a, 0xf6ead6, 0xff7a2a];
    const cc = new THREE.Color();
    [-8, 0, 8].forEach((dx, i) => {
      m4.identity(); m4.setPosition(cafe.x + dx, 0, cafe.z - 14);
      canopyIM.setMatrixAt(i, m4);
      canopyIM.setColorAt(i, cc.setHex(canopyCols[i]));
    });
    scene.add(canopyIM);
    // Two chairs per table: one road-side facing the cafe, one cafe-side
    // facing the road. Seats + backs merged into one dark piece.
    const chairParts = [];
    for (const dx of [-8, 0, 8]) {
      for (const side of [-1, 1]) {
        const cz = cafe.z - 14 + side * 1.35;
        chairParts.push(new THREE.BoxGeometry(0.55, 0.08, 0.55).translate(cafe.x + dx, 0.55, cz));
        chairParts.push(new THREE.BoxGeometry(0.55, 0.7, 0.08).translate(cafe.x + dx, 0.95, cz + side * 0.28));
      }
    }
    scene.add(new THREE.Mesh(mergeGeometries(chairParts),
      new THREE.MeshStandardMaterial({ color: 0x4a2a1a, roughness: 0.9 })));
  }
  // Night-shot foreground: two planters and an A-board menu.
  {
    const boxParts = [[56, -76], [48, -76]].map(([x, z]) =>
      new THREE.BoxGeometry(1.4, 0.8, 1.4).translate(x, 0.4, z));
    scene.add(new THREE.Mesh(mergeGeometries(boxParts),
      new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 })));
    const shrubParts = [];
    for (const [x, z] of [[56, -76], [48, -76]]) {
      shrubParts.push(new THREE.SphereGeometry(0.9, 8, 6).translate(x, 1.25, z));
      shrubParts.push(new THREE.SphereGeometry(0.5, 8, 6).translate(x + 0.4, 1.7, z));
    }
    scene.add(new THREE.Mesh(mergeGeometries(shrubParts),
      new THREE.MeshStandardMaterial({ color: 0x3a7a2a, roughness: 1 })));
    const boardParts = [
      new THREE.PlaneGeometry(1.3, 1.7).rotateX(-0.3).translate(0, 0.8, 0.26),
      new THREE.PlaneGeometry(1.3, 1.7).rotateX(0.3).translate(0, 0.8, -0.26),
    ];
    const board = new THREE.Mesh(mergeGeometries(boardParts),
      new THREE.MeshStandardMaterial({ map: aboardTexture(), side: THREE.DoubleSide, roughness: 0.9 }));
    board.position.set(52, 0, -73); board.rotation.y = 0.5; scene.add(board);
  }
  // A red car parked at the kerb in front of the cafe — a static prop, not
  // traffic, not in the carjack census.
  {
    const redCar = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.75, 4.4),
      new THREE.MeshStandardMaterial({ color: 0xc23a2e, roughness: 0.35, metalness: 0.55 }));
    body.position.y = 0.65; body.castShadow = true; redCar.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.42, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x7fa8bc, roughness: 0.3, metalness: 0.2 }));
    cabin.position.y = 1.24; redCar.add(cabin);
    const wheelParts = [];
    for (const sx of [-0.9, 0.9]) for (const sz of [-1.3, 1.3]) {
      wheelParts.push(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10).rotateZ(Math.PI / 2).translate(sx, 0.38, sz));
    }
    redCar.add(new THREE.Mesh(mergeGeometries(wheelParts),
      new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 })));
    redCar.position.set(60, 0, -74); redCar.rotation.y = Math.PI / 2;
    scene.add(redCar);
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
  // Lucky Gull Casino: wide neon building
  namedBox("casino", 30, 16, 22, 0x5a3a6e, 20, 5, 13);
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
