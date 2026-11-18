// Solmar Bay — the three.js renderer. Builds the static city once from
// city data, then syncs the moving pieces (Jax, cars, pedestrians, cops,
// markers, pickups, particles) and the chase camera every frame.
import * as THREE from 'three';
import { CFG, PALETTE } from './config.js';
import { clamp, angleLerp } from './util.js';

const tmpM = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

export class Renderer {
  constructor(W, canvas) {
    this.W = W;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 220, 620);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);

    // Low golden sun + soft sky fill.
    const sun = new THREE.DirectionalLight(PALETTE.sun, 1.9);
    sun.position.set(-140, 190, 120);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.85));

    this.carMeshes = new Map();
    this.pedMeshes = new Map();
    this.copMeshes = new Map();
    this.pickupMeshes = new Map();
    this.particles = null;
    this.particleGeo = null;
    this.buildStatic(W);
    this.buildPlayer(W);
    this.buildMarker();
  }

  buildStatic(W) {
    const S = this.scene;
    const city = W.city;
    // Ground: one big slab, sidewalk grey; roads are dark strips on top.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CFG.HALF * 2 + 140, CFG.HALF * 2 + 260),
      lambert(0x8f8a80),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 60);
    S.add(ground);
    // Grass parks.
    for (const park of city.parks) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(38, 38), lambert(PALETTE.grass));
      g.rotation.x = -Math.PI / 2;
      g.position.set(park.x, 0.06, park.z);
      S.add(g);
    }
    // Beach sand, then the ocean.
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(CFG.HALF * 2 + 140, 48), lambert(PALETTE.sand));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.08, CFG.BEACH_Z + 24);
    S.add(sand);
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(CFG.HALF * 2 + 400, 260),
      new THREE.MeshLambertMaterial({ color: PALETTE.ocean, transparent: true, opacity: 0.94 }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, 0.05, CFG.OCEAN_Z + 130);
    S.add(ocean);
    // Roads: dark strips along every street line, both directions.
    const roadMat = lambert(PALETTE.asphalt);
    for (const s of city.streets) {
      const h = new THREE.Mesh(new THREE.PlaneGeometry(CFG.HALF * 2 + 16, CFG.ROAD), roadMat);
      h.rotation.x = -Math.PI / 2;
      h.position.set(0, 0.1, s);
      S.add(h);
      const v = new THREE.Mesh(new THREE.PlaneGeometry(CFG.ROAD, CFG.HALF * 2 + 16), roadMat);
      v.rotation.x = -Math.PI / 2;
      v.position.set(s, 0.1, 0);
      S.add(v);
    }
    // Dashed centre lines, instanced.
    const dashGeo = new THREE.BoxGeometry(0.5, 0.06, 3);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf2e8c8 });
    const dashes = [];
    for (const s of city.streets) {
      for (let v = -224; v <= 224; v += 10) {
        dashes.push([v, s, 0]);
        dashes.push([s, v, 1]);
      }
    }
    const inst = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
    dashes.forEach(([x, z, rot], i) => {
      tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot ? Math.PI / 2 : 0);
      tmpM.compose(tmpV.set(x, 0.14, z), tmpQ, tmpS.set(1, 1, 1));
      inst.setMatrixAt(i, tmpM);
    });
    S.add(inst);

    // Buildings: stucco boxes with a darker roof slab and a glass band.
    const roofMat = lambert(0x6a5a4a);
    const glassMat = new THREE.MeshLambertMaterial({ color: PALETTE.glass, emissive: 0x2a4a5a });
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const matCache = new Map();
    for (const b of city.buildings) {
      if (!matCache.has(b.color)) matCache.set(b.color, lambert(b.color));
      const m = new THREE.Mesh(boxGeo, matCache.get(b.color));
      m.scale.set(b.w, b.h, b.d);
      m.position.set(b.x, b.h / 2, b.z);
      S.add(m);
      const roof = new THREE.Mesh(boxGeo, roofMat);
      roof.scale.set(b.w + 0.6, 0.5, b.d + 0.6);
      roof.position.set(b.x, b.h + 0.25, b.z);
      S.add(roof);
      if (b.glass && b.h > 18) {
        const band = new THREE.Mesh(boxGeo, glassMat);
        band.scale.set(b.w * 0.7, Math.min(6, b.h * 0.25), 0.3);
        band.position.set(b.x, b.h * 0.72, b.z + b.d / 2 + 0.05);
        S.add(band);
      }
    }

    // Palms: instanced trunks + instanced canopies.
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5, 6);
    const trunkMat = lambert(0x8a6a4a);
    const canopyGeo = new THREE.SphereGeometry(2.2, 8, 5);
    canopyGeo.scale(1, 0.45, 1);
    const canopyMat = lambert(0x4f9e4a);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, city.palms.length);
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, city.palms.length);
    city.palms.forEach((p, i) => {
      tmpQ.identity();
      tmpM.compose(tmpV.set(p.x, 2.5, p.z), tmpQ, tmpS.set(1, 1, 1));
      trunks.setMatrixAt(i, tmpM);
      tmpM.compose(tmpV.set(p.x, 5.4, p.z), tmpQ, tmpS.set(1, 1, 1));
      canopies.setMatrixAt(i, tmpM);
    });
    S.add(trunks);
    S.add(canopies);

    // Street lamps: instanced poles with a warm glowing head.
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6, 5);
    const poles = new THREE.InstancedMesh(poleGeo, lambert(0x3a3f46), city.lamps.length);
    const headGeo = new THREE.SphereGeometry(0.35, 6, 5);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffe3b3 }), city.lamps.length);
    city.lamps.forEach((p, i) => {
      tmpQ.identity();
      tmpM.compose(tmpV.set(p.x, 3, p.z), tmpQ, tmpS.set(1, 1, 1));
      poles.setMatrixAt(i, tmpM);
      tmpM.compose(tmpV.set(p.x, 6.1, p.z), tmpQ, tmpS.set(1, 1, 1));
      heads.setMatrixAt(i, tmpM);
    });
    S.add(poles);
    S.add(heads);

    // The pier: wooden deck on posts over the ocean, with a hut at the end.
    const deck = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, CFG.PIER_Z_END - CFG.OCEAN_Z + 8), lambert(0x9a7a52));
    deck.position.set(CFG.PIER_X, 1.2, (CFG.OCEAN_Z + CFG.PIER_Z_END) / 2);
    S.add(deck);
    const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6);
    const postMat = lambert(0x6a4a32);
    for (let z = CFG.OCEAN_Z + 6; z <= CFG.PIER_Z_END; z += 14) {
      for (const dx of [-4, 4]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(CFG.PIER_X + dx, 0.4, z);
        S.add(post);
      }
    }
    const hut = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 6), lambert(0xd98a6a));
    hut.position.set(CFG.PIER_X, 3.4, CFG.PIER_Z_END - 4);
    S.add(hut);
    const hutRoof = new THREE.Mesh(new THREE.ConeGeometry(5.4, 2.4, 4), lambert(0x8a4a3a));
    hutRoof.position.set(CFG.PIER_X, 6.6, CFG.PIER_Z_END - 4);
    hutRoof.rotation.y = Math.PI / 4;
    S.add(hutRoof);

    // Sun disc + a few flat clouds for the golden-hour sky.
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(26, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff2c8, fog: false }),
    );
    sunDisc.position.set(-260, 150, -260);
    sunDisc.lookAt(0, 40, 0);
    S.add(sunDisc);
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    for (const [cx, cy, cz, s] of [[-120, 120, -180, 34], [80, 140, -220, 44], [180, 110, 60, 30], [-200, 130, 120, 26]]) {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), cloudMat);
      cloud.scale.set(s, s * 0.22, s * 0.5);
      cloud.position.set(cx, cy, cz);
      S.add(cloud);
    }

    // Particles pool (Points, 300 slots).
    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(300 * 3), 3));
    this.particleGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(300 * 3), 3));
    this.particles = new THREE.Points(this.particleGeo, new THREE.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, opacity: 0.95 }));
    this.particles.frustumCulled = false;
    S.add(this.particles);
  }

  buildPlayer(W) {
    const g = new THREE.Group();
    const skin = lambert(0xc98d5f);
    const jacket = lambert(0x2e7f9e);
    const pants = lambert(0x2b2f36);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), skin);
    head.position.y = 1.62;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.8, 0.4), jacket);
    torso.position.y = 1.05;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.3), pants);
    legL.position.set(-0.18, 0.35, 0);
    const legR = legL.clone();
    legR.position.x = 0.18;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.66, 0.24), jacket);
    armL.position.set(-0.48, 1.05, 0);
    const armR = armL.clone();
    armR.position.x = 0.48;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.42), lambert(0x1a1d22));
    gun.position.set(0.48, 0.82, 0.3);
    gun.name = 'gun';
    gun.visible = false;
    g.add(head, torso, legL, legR, armL, armR, gun);
    g.userData = { legL, legR, armL, armR, gun };
    this.playerMesh = g;
    this.scene.add(g);
  }

  buildMarker() {
    const geo = new THREE.CylinderGeometry(2.6, 2.6, 30, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd23d, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.markerBeam = new THREE.Mesh(geo, mat);
    this.markerBeam.position.y = 15;
    const ringGeo = new THREE.RingGeometry(2.2, 3.1, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    this.markerRing = new THREE.Mesh(ringGeo, ringMat);
    this.markerRing.rotation.x = -Math.PI / 2;
    this.markerRing.position.y = 0.2;
    this.scene.add(this.markerBeam, this.markerRing);
  }

  makeCarMesh(car) {
    const g = new THREE.Group();
    const bodyColor = car.kind === 'cop' ? 0x2b4c8c : car.kind === 'taxi' ? PALETTE.taxi : car.color;
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, car.kind === 'truck' ? 5.6 : 4.4), lambert(bodyColor));
    body.position.y = 0.55;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.55, car.kind === 'truck' ? 1.6 : 2.2),
      new THREE.MeshLambertMaterial({ color: PALETTE.glass, emissive: 0x1a2a33 }),
    );
    cabin.position.set(0, 1.1, car.kind === 'truck' ? 1.4 : -0.2);
    g.add(body, cabin);
    const wheelGeo = new THREE.BoxGeometry(0.34, 0.62, 0.62);
    const wheelMat = lambert(0x14161a);
    const wheels = [];
    for (const [wx, wz] of [[-1.0, 1.5], [1.0, 1.5], [-1.0, -1.5], [1.0, -1.5]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(wx, 0.32, wz * (car.kind === 'truck' ? 1.15 : 1));
      g.add(w);
      wheels.push(w);
    }
    if (car.kind === 'cop') {
      const barR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
      barR.position.set(-0.4, 1.5, -0.2);
      barR.name = 'barR';
      const barB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0x2a6aff }));
      barB.position.set(0.4, 1.5, -0.2);
      barB.name = 'barB';
      g.add(barR, barB);
      g.userData.barR = barR;
      g.userData.barB = barB;
    }
    g.userData.wheels = wheels;
    return g;
  }

  makePedMesh(ped, isCop) {
    const g = new THREE.Group();
    const skin = lambert(ped.skin || 0xc98d5f);
    const shirt = lambert(isCop ? 0x2b4c8c : (ped.shirt || 0x5a7fd9));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 7), skin);
    head.position.y = 1.55;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.36), shirt);
    torso.position.y = 1.0;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.26), lambert(0x2b2f36));
    legL.position.set(-0.15, 0.31, 0);
    const legR = legL.clone();
    legR.position.x = 0.15;
    g.add(head, torso, legL, legR);
    g.userData = { legL, legR };
    return g;
  }

  missionMarkerPos(W) {
    if (W.storyComplete || !W.mission) return null;
    const i = W.missionIndex;
    const P = W.city.places;
    if (i === 0) return P.cafe;
    if (i === 1) {
      if (W.player.inCar && W.player.car === W.mission.coupe) return P.garage;
      if (W.mission.coupe) return { x: W.mission.coupe.x, z: W.mission.coupe.z };
      return P.garage;
    }
    if (i === 2) return P.pierEnd;
    if (i === 4) {
      const pk = W.pickups.find((p) => p.kind === 'cash');
      return pk || null;
    }
    if (i === 5) return W.mission.phase === 'escape' ? P.pierEnd : P.bank;
    return null;
  }

  sync(W, dt) {
    // Resize.
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * this.renderer.getPixelRatio() || canvas.height !== h * this.renderer.getPixelRatio()) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    // Cars.
    const seenCars = new Set();
    for (const car of W.cars) {
      seenCars.add(car.id);
      let mesh = this.carMeshes.get(car.id);
      if (!mesh) {
        mesh = this.makeCarMesh(car);
        this.carMeshes.set(car.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.angle;
      for (const wheel of mesh.userData.wheels) wheel.rotation.x = car.wheelSpin || 0;
      if (car.kind === 'cop' && mesh.userData.barR) {
        const on = Math.floor(W.time * 3) % 2 === 0;
        mesh.userData.barR.visible = on;
        mesh.userData.barB.visible = !on;
      }
    }
    for (const [id, mesh] of this.carMeshes) {
      if (!seenCars.has(id)) { this.scene.remove(mesh); this.carMeshes.delete(id); }
    }

    // Pedestrians.
    const seenPeds = new Set();
    W.peds.forEach((p, idx) => {
      seenPeds.add(idx);
      let mesh = this.pedMeshes.get(idx);
      if (!mesh) {
        mesh = this.makePedMesh(p, false);
        this.pedMeshes.set(idx, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(p.x, p.down ? 0.25 : 0, p.z);
      mesh.rotation.y = p.angle;
      mesh.rotation.z = p.down ? Math.PI / 2 : 0;
      const swing = p.down ? 0 : Math.sin(p.walkPhase) * 0.5;
      mesh.userData.legL.rotation.x = swing;
      mesh.userData.legR.rotation.x = -swing;
    });
    // Foot cops.
    const seenCops = new Set();
    W.cops.forEach((c, idx) => {
      seenCops.add(idx);
      let mesh = this.copMeshes.get(idx);
      if (!mesh) {
        mesh = this.makePedMesh({ skin: 0xc98d5f, shirt: 0x2b4c8c }, true);
        this.copMeshes.set(idx, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(c.x, 0, c.z);
      mesh.rotation.y = c.angle;
      const swing = Math.sin(W.time * 12) * 0.6;
      mesh.userData.legL.rotation.x = swing;
      mesh.userData.legR.rotation.x = -swing;
    });
    for (const [idx, mesh] of this.copMeshes) {
      if (!seenCops.has(idx)) { this.scene.remove(mesh); this.copMeshes.delete(idx); }
    }

    // Pickups.
    const seenPk = new Set();
    W.pickups.forEach((pk, idx) => {
      seenPk.add(idx);
      let mesh = this.pickupMeshes.get(idx);
      if (!mesh) {
        const color = pk.kind === 'cash' ? 0x58c96b : pk.kind === 'health' ? 0xffffff : 0x2b2f36;
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), lambert(color));
        if (pk.kind === 'health') {
          const cross = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.14), lambert(0xd94f3d));
          cross.position.y = 0.28;
          mesh.add(cross);
        }
        this.pickupMeshes.set(idx, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(pk.x, 0.6 + Math.sin(W.time * 3 + idx) * 0.15, pk.z);
      mesh.rotation.y = W.time * 1.5 + idx;
    });
    for (const [idx, mesh] of this.pickupMeshes) {
      if (!seenPk.has(idx)) { this.scene.remove(mesh); this.pickupMeshes.delete(idx); }
    }

    // Player.
    const p = W.player;
    const pm = this.playerMesh;
    if (p.inCar && p.car) {
      pm.visible = false;
    } else {
      pm.visible = true;
      pm.position.set(p.x, 0, p.z);
      pm.rotation.y = p.angle;
      const swing = p.speed > 0.5 ? Math.sin(W.time * (p.speed > 9 ? 13 : 9)) * 0.6 : 0;
      pm.userData.legL.rotation.x = swing;
      pm.userData.legR.rotation.x = -swing;
      pm.userData.armL.rotation.x = -swing * 0.7;
      pm.userData.armR.rotation.x = swing * 0.7;
      pm.userData.gun.visible = p.gunDrawn;
    }

    // Particles.
    const pos = this.particleGeo.attributes.position.array;
    const col = this.particleGeo.attributes.color.array;
    const c = new THREE.Color();
    for (let i = 0; i < 300; i++) {
      const pt = W.particles[i];
      if (pt) {
        pos[i * 3] = pt.x; pos[i * 3 + 1] = pt.y; pos[i * 3 + 2] = pt.z;
        c.setHex(pt.color);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      } else {
        pos[i * 3 + 1] = -100;
      }
    }
    this.particleGeo.attributes.position.needsUpdate = true;
    this.particleGeo.attributes.color.needsUpdate = true;

    // Mission marker beam.
    const marker = this.missionMarkerPos(W);
    const showMarker = !!marker && W.state === 'playing';
    this.markerBeam.visible = showMarker;
    this.markerRing.visible = showMarker;
    if (showMarker) {
      this.markerBeam.position.set(marker.x, 15, marker.z);
      this.markerRing.position.set(marker.x, 0.2, marker.z);
      const pulse = 1 + Math.sin(W.time * 3) * 0.12;
      this.markerRing.scale.set(pulse, pulse, 1);
    }

    // Chase camera: behind Jax (or his car), eased toward the car heading.
    const cam = W.camera;
    if (p.inCar && p.car) {
      cam.yaw = angleLerp(cam.yaw, p.car.angle, 1 - Math.exp(-2.5 * dt));
      cam.dist = 13;
    } else {
      cam.dist = 10;
    }
    const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
    const eyeX = p.x - fx * cam.dist;
    const eyeZ = p.z - fz * cam.dist;
    const eyeY = 4.5 + cam.pitch * 7;
    this.camera.position.set(eyeX, eyeY, eyeZ);
    this.camera.lookAt(p.x + fx * 4, 2.2, p.z + fz * 4);

    this.renderer.render(this.scene, this.camera);
  }
}
