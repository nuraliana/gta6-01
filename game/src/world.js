// Solmar Bay — the world state and its helpers. Every system reads and
// writes this one object, so the game loop stays a short ordered list.
// Helpers live on the object itself (W.addWanted, W.spawnBurst, ...) so the
// systems never need circular imports back into this file.
import { CFG } from './config.js';
import { makeRng } from './random.js';
import { buildCity } from './city.js';
import { updatePlayer } from './player.js';
import { updateTraffic, updatePlayerCar } from './vehicles.js';
import { updatePedestrians } from './pedestrians.js';
import { updatePolice } from './police.js';
import { updateMissions, currentObjective } from './missions.js';
import { updateCombat } from './combat.js';
import { pushOutOfBox, dist2, clamp } from './util.js';

export function createWorld(seed) {
  const rng = makeRng(seed);
  const city = buildCity(rng);
  const W = {
    seed,
    rng,
    city,
    time: 0,
    state: 'menu', // menu | playing | paused | busted | complete
    // Jax Moreno, the courier.
    player: {
      x: 0, z: -14, angle: 0, health: CFG.PLAYER_HEALTH,
      inCar: false, car: null, speed: 0, punchTimer: 0, shootTimer: 0,
      gunDrawn: false, invuln: 0,
    },
    camera: { yaw: 0, pitch: 0.42, dist: 11 },
    cars: [],
    peds: [],
    cops: [],
    copCars: [],
    pickups: [],
    particles: [],
    cash: 150,
    ammo: CFG.PISTOL_AMMO_START,
    hasPistol: true,
    wanted: 0,
    wantedTimer: 0,
    missionIndex: 0,
    missionsDone: 0,
    mission: null,
    missionTimer: 0,
    storyComplete: false,
    autopilot: null, // {x, z} — screenshot scenes walk Jax to the marker
    stats: { carsStolen: 0, pedsHit: 0, shotsFired: 0, distanceDriven: 0 },
    // One-frame events the HUD/audio consume.
    events: [],
  };

  W.addWanted = (n) => {
    // Screenshot scenes stage their wanted level exactly (shots.js sets
    // W.wanted directly); settle collisions must not inflate it.
    if (W.shotMode) return;
    const before = W.wanted;
    W.wanted = clamp(W.wanted + n, 0, CFG.WANTED_MAX);
    if (W.wanted > before) W.wantedTimer = 0;
  };
  W.addCash = (n) => { W.cash += n; };
  W.spawnBurst = (x, z, color, n = 10, spread = 3) => {
    for (let i = 0; i < n; i++) {
      W.particles.push({
        x, z, y: 0.6,
        vx: (W.rng.next() - 0.5) * spread,
        vz: (W.rng.next() - 0.5) * spread,
        vy: W.rng.next() * 3 + 1,
        life: 0.7, maxLife: 0.7, color,
      });
    }
  };
  W.damagePlayer = (n) => {
    if (W.player.invuln > 0 || W.state !== 'playing') return;
    W.player.health -= n;
    W.player.invuln = 0.4;
    if (W.player.health <= 0) {
      W.player.health = 0;
      W.state = 'busted';
      W.events.push('busted');
    }
  };
  W.healPlayer = (n) => {
    W.player.health = clamp(W.player.health + n, 0, CFG.PLAYER_HEALTH);
  };
  // Keep a walker/driver inside the playable area and out of buildings.
  W.collide = (e, radius) => {
    for (const box of W.city.colliders) {
      const p = pushOutOfBox(e.x, e.z, radius, box);
      if (p) { e.x = p.x; e.z = p.z; }
    }
    e.x = clamp(e.x, -CFG.HALF - 8, CFG.HALF + 8);
    e.z = clamp(e.z, -CFG.HALF - 8, CFG.PIER_Z_END + 4);
    if (e.z > CFG.OCEAN_Z && Math.abs(e.x) > 6) {
      // Water: only the pier (x near 0) is walkable past the beach.
      e.z = CFG.OCEAN_Z;
    }
  };
  W.nearestCar = (x, z, maxD) => {
    let best = null, bestD = maxD;
    for (const c of W.cars) {
      if (c.dead) continue;
      const d = dist2(x, z, c.x, c.z);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  };
  return W;
}

export function updateWorld(W, dt, input, audio) {
  if (W.state !== 'playing') return;
  W.time += dt;
  W.player.invuln = Math.max(0, W.player.invuln - dt);
  W.player.punchTimer = Math.max(0, W.player.punchTimer - dt);
  W.player.shootTimer = Math.max(0, W.player.shootTimer - dt);

  updatePlayer(W, dt, input, audio);
  if (W.player.inCar && W.player.car) updatePlayerCar(W, dt, input, audio);
  updateTraffic(W, dt);
  updatePedestrians(W, dt);
  updatePolice(W, dt, audio);
  updateMissions(W, dt, audio);
  updateCombat(W, dt, input, audio);

  // Wanted slowly fades when no cop can see Jax.
  if (W.wanted > 0) {
    W.wantedTimer += dt;
    const seen = W.cops.some((c) => dist2(c.x, c.z, W.player.x, W.player.z) < 40)
      || W.copCars.some((c) => dist2(c.x, c.z, W.player.x, W.player.z) < 46);
    if (!seen && W.wantedTimer > CFG.WANTED_DECAY_S) {
      W.wanted -= 1;
      W.wantedTimer = 0;
      W.events.push('wanted-down');
    }
  }

  // Particles age out.
  for (let i = W.particles.length - 1; i >= 0; i--) {
    const p = W.particles[i];
    p.life -= dt;
    p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; p.vy -= 6 * dt;
    if (p.life <= 0 || p.y < 0) W.particles.splice(i, 1);
  }
  // Expired pickups fade.
  for (let i = W.pickups.length - 1; i >= 0; i--) {
    W.pickups[i].ttl -= dt;
    if (W.pickups[i].ttl <= 0) W.pickups.splice(i, 1);
  }
}

export function objectiveText(W) {
  return currentObjective(W);
}
