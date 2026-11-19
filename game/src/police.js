// MARISOL HEAT — police.js
// One job: the wanted system, readable in a screenshot. Stars 0-5; when the
// player breaks line of sight the stars go HOLLOW with a "SEARCHING" label
// and cruisers converge on the last-known position. Escalation changes the
// KIND of unit, not just the count (see CONFIG.ESCALATION): 1* patrol,
// 2* roadblocks, 3* helicopter with spotlight, 4* roadblock vans,
// 5* SWAT interceptors. The helicopter can be shot down. Swapping to a
// different car breaks the description the police hold, so wanted decays
// twice as fast right after a car swap.
import * as THREE from "three";
import { CONFIG } from "./config.js";
import { dist, clamp } from "./util.js";

function buildHeli(scene) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a2a44, roughness: 0.4, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 5.2), bodyMat);
  body.castShadow = true; g.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.1, metalness: 0.8 }));
  glass.position.set(0, 0.3, 2.0); g.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.5), bodyMat);
  tail.position.set(0, 0.3, -4.2); g.add(tail);
  const rotor = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  rotor.add(blade);
  const blade2 = blade.clone(); blade2.rotation.y = Math.PI / 2; rotor.add(blade2);
  rotor.position.y = 1.1; g.add(rotor);
  // spotlight cone + pool (visible at night, dramatic at golden hour)
  const spot = new THREE.SpotLight(0xfff2c0, 0, 90, 0.28, 0.5, 1.2);
  spot.position.set(0, -0.5, 0);
  g.add(spot);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }));
  cone.rotation.x = Math.PI; cone.position.y = -13; g.add(cone);
  g.userData = { rotor, spot, cone };
  scene.add(g);
  return g;
}

export function createPolice(scene, city, vehicles, rng, blobs) {
  const state = {
    wanted: 0, searching: false, searchTimer: 0, decayTimer: 0,
    lastKnown: { x: 0, z: 0 }, bustTimer: 0, swapGrace: 0,
    cruisers: [], officers: [], roadblocks: [], heli: null, heliHp: 0, heliDown: false,
    // SWAT interceptors: black armored trucks, only at 5 stars (see syncUnits).
    swat: [],
  };

  function spawnCruiser(x, z) {
    const c = vehicles.spawnPoliceCar(x, z);
    c.ai = true;
    state.cruisers.push(c);
    return c;
  }
  function spawnSwat(x, z) {
    const c = vehicles.spawnSwatCar(x, z);
    c.ai = true;
    state.swat.push(c);
    return c;
  }
  function spawnOfficer(x, z) {
    // foot officer: dark-blue person mesh, chases on foot, busts on touch
    const g = new THREE.Group();
    const mat = (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.34), mat(0x1a2a44));
    torso.position.y = 1.18; g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), mat(0xc98a5a));
    head.position.y = 1.78; g.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 8), mat(0x0a1428));
    cap.position.y = 1.98; g.add(cap);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.22), mat(0x0a1428));
    legL.position.set(-0.14, 0.4, 0); g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.14; g.add(legR);
    g.position.set(x, 0, z);
    scene.add(g);
    const o = { mesh: g, legL, legR, x, z, angle: 0, phase: 0 };
    state.officers.push(o);
    return o;
  }
  function spawnRoadblock(x, z, angle) {
    const g = new THREE.Group();
    const van = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 5.5),
      new THREE.MeshStandardMaterial({ color: 0x1a2a44, roughness: 0.5 }));
    van.position.y = 1.1; van.castShadow = true; g.add(van);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.5, 5.55),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 1.4; g.add(stripe);
    g.position.set(x, 0, z); g.rotation.y = angle;
    scene.add(g);
    state.roadblocks.push(g);
    return g;
  }

  function setWanted(n, opts = {}) {
    const before = state.wanted;
    state.wanted = clamp(n, 0, 5);
    state.searching = false;
    state.decayTimer = CONFIG.WANTED_DECAY_S;
    if (state.wanted > before && !opts.silent) state.lastKnown = { x: opts.x ?? 0, z: opts.z ?? 0 };
    syncUnits();
  }

  function syncUnits() {
    const w = state.wanted;
    // At 5 stars the 4th cruiser is replaced by a SWAT interceptor: 3 navy
    // cruisers + 1 black armored truck, not 4 identical cruisers.
    const wantCruisers = w >= 5 ? 3 : w >= 3 ? 3 : w;
    const wantSwat = w >= 5 ? 1 : 0;
    while (state.cruisers.length < wantCruisers) {
      const a = rng.range(0, Math.PI * 2);
      spawnCruiser(state.lastKnown.x + Math.sin(a) * 45, state.lastKnown.z + Math.cos(a) * 45);
    }
    while (state.cruisers.length > wantCruisers) {
      const c = state.cruisers.pop();
      vehicles.removeCar(c);
    }
    while (state.swat.length < wantSwat) {
      const a = rng.range(0, Math.PI * 2);
      spawnSwat(state.lastKnown.x + Math.sin(a) * 45, state.lastKnown.z + Math.cos(a) * 45);
    }
    while (state.swat.length > wantSwat) {
      const c = state.swat.pop();
      vehicles.removeCar(c);
    }
    const wantOfficers = w >= 2 ? 2 : w >= 1 ? 1 : 0;
    while (state.officers.length < wantOfficers) {
      const a = rng.range(0, Math.PI * 2);
      spawnOfficer(state.lastKnown.x + Math.sin(a) * 20, state.lastKnown.z + Math.cos(a) * 20);
    }
    while (state.officers.length > wantOfficers) {
      const o = state.officers.pop();
      scene.remove(o.mesh);
      blobs.hide(90 + state.officers.length);
    }
    // helicopter from 3 stars — but never right after one was shot down:
    // heliDown stays true until wanted falls below 3, so a crash at 5 stars
    // does not instantly respawn a fresh heli at 4 stars.
    if (w >= 3 && !state.heli && !state.heliDown) {
      state.heli = buildHeli(scene);
      state.heliHp = 3;
      state.heli.position.set(state.lastKnown.x, 42, state.lastKnown.z - 30);
    }
    if (w < 3 && state.heli) {
      scene.remove(state.heli);
      state.heli = null;
    }
    if (w < 3) state.heliDown = false;
    // roadblocks from 4 stars, cleared below
    if (w >= 4 && state.roadblocks.length === 0) {
      spawnRoadblock(state.lastKnown.x + 40, state.lastKnown.z, Math.PI / 2);
      spawnRoadblock(state.lastKnown.x - 40, state.lastKnown.z, Math.PI / 2);
    }
    if (w < 4) {
      for (const rb of state.roadblocks) scene.remove(rb);
      state.roadblocks.length = 0;
    }
  }

  return {
    state,
    setWanted,
    addWanted(n, x, z) { setWanted(state.wanted + n, { x, z }); },
    // Called after the player swaps cars: the police description goes stale.
    breakIdentification() { state.swapGrace = 12; },
    // The heli can be shot down: 3 pistol hits.
    damageHeli() {
      if (!state.heli || state.heliDown) return false;
      state.heliHp--;
      if (state.heliHp <= 0) {
        state.heliDown = true;
        return true;
      }
      return false;
    },
    heliPosition() {
      return state.heli ? { x: state.heli.position.x, y: state.heli.position.y, z: state.heli.position.z } : null;
    },
    update(dt, playerPos, lineOfSight, audio, particles) {
      const w = state.wanted;
      // searching: no line of sight -> hollow stars, converge on last known
      if (w > 0) {
        if (!lineOfSight) {
          if (!state.searching) { state.searching = true; state.searchTimer = 0; }
          state.searchTimer += dt;
          state.decayTimer -= dt * (state.swapGrace > 0 ? 2 : 1);
          if (state.decayTimer <= 0) { setWanted(w - 1); }
        } else {
          state.searching = false;
          state.decayTimer = CONFIG.WANTED_DECAY_S;
          state.lastKnown = { x: playerPos.x, z: playerPos.z };
        }
      }
      if (state.swapGrace > 0) state.swapGrace -= dt;
      // cruisers + SWAT interceptors: intercept with lead + fan-out (they do
      // not stack on one point). SWAT is faster and rams harder.
      const units = [...state.cruisers, ...state.swat];
      units.forEach((c, i) => {
        const tx = state.searching ? state.lastKnown.x : playerPos.x;
        const tz = state.searching ? state.lastKnown.z : playerPos.z;
        const lead = 0.35;
        const px = tx + (playerPos.vx || 0) * lead + Math.sin(i * 2.4) * 8;
        const pz = tz + (playerPos.vz || 0) * lead + Math.cos(i * 2.4) * 8;
        const want = Math.atan2(px - c.x, pz - c.z);
        const diff = ((want - c.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        c.angle += clamp(diff, -2.2 * dt, 2.2 * dt);
        const top = c.isSwat ? CONFIG.SWAT_TOP_SPEED : w >= 5 ? 34 : 28;
        c.speed = Math.min(c.speed + 16 * dt, top);
        c.x += Math.sin(c.angle) * c.speed * dt;
        c.z += Math.cos(c.angle) * c.speed * dt;
        vehicles.placeCar(c, c.x, c.z, c.angle, c.speed);
        // strobe the light bar (instanced red/blue for cruisers, amber for SWAT)
        if (c.isSwat) vehicles.setSwatStrobe(c, Math.floor(performance.now() / 130) % 2 === 0);
        else vehicles.setPoliceStrobe(c, Math.floor(performance.now() / 130) % 2 === 0);
        // ram the player car (SWAT hits harder)
        const d = dist(c.x, c.z, playerPos.x, playerPos.z);
        if (d < 3.2 && playerPos.inCar) {
          playerPos.damageCar((c.isSwat ? CONFIG.SWAT_RAM : 6) * dt);
          if (Math.random() < 0.1) particles.burst(c.x, 1, c.z, 4, [1, 0.8, 0.3], 3, 0.5, 2);
        }
      });
      // foot officers chase on foot
      for (let oi = 0; oi < state.officers.length; oi++) {
        const o = state.officers[oi];
        const d = dist(o.x, o.z, playerPos.x, playerPos.z);
        if (d > 1.6) {
          o.angle = Math.atan2(playerPos.x - o.x, playerPos.z - o.z);
          o.x += Math.sin(o.angle) * 5.5 * dt;
          o.z += Math.cos(o.angle) * 5.5 * dt;
          o.phase += dt * 12;
          o.legL.rotation.x = Math.sin(o.phase) * 0.6;
          o.legR.rotation.x = -Math.sin(o.phase) * 0.6;
        } else if (!playerPos.inCar) {
          // busted: officer on foot touches the player
          state.bustTimer += dt;
          if (state.bustTimer > CONFIG.BUST_TIME_S) {
            state.bustTimer = 0;
            return "busted";
          }
        }
        o.mesh.position.set(o.x, 0, o.z);
        o.mesh.rotation.y = o.angle;
        blobs.set(90 + oi, o.x, o.z, 1.1, 1.1);
      }
      // helicopter: hover above the player, spotlight follows
      if (state.heli) {
        const h = state.heli;
        if (state.heliDown) {
          h.position.y -= 22 * dt;
          h.rotation.z += dt * 1.2;
          h.userData.rotor.rotation.y += dt * 30;
          if (h.position.y <= 1) {
            particles.burst(h.position.x, 1, h.position.z, 50, [1, 0.6, 0.1], 10, 1.4, 5);
            audio.crash();
            scene.remove(h);
            state.heli = null;
            // heliDown is NOT cleared here: it stays true until wanted falls
            // below 3, or syncUnits would respawn a heli at 4 stars at once.
            setWanted(Math.max(0, w - 1));
          }
          return null;
        }
        const tx = state.searching ? state.lastKnown.x : playerPos.x;
        const tz = state.searching ? state.lastKnown.z : playerPos.z;
        h.position.x += (tx - h.position.x) * Math.min(1, dt * 0.7);
        h.position.z += (tz - h.position.z) * Math.min(1, dt * 0.7);
        h.position.y = 42 + Math.sin(performance.now() / 900) * 2;
        h.userData.rotor.rotation.y += dt * 32;
        h.userData.spot.target.position.set(tx - h.position.x, -42, tz - h.position.z);
        h.userData.spot.target.updateMatrixWorld();
        h.userData.spot.intensity = 60;
        h.lookAt(tx, h.position.y, tz);
      }
      audio.setSiren(w > 0, w);
      return null;
    },
  };
}
