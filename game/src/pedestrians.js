// Solmar Bay — pedestrians: locals strolling the sidewalks who scatter
// when a gun goes off or a car comes at them, and get back up afterwards.
import { CFG, PALETTE } from './config.js';
import { dist2, angleLerp } from './util.js';
import { sidewalkPoint } from './city.js';

export function spawnPedestrians(W, n) {
  for (let i = 0; i < n; i++) {
    const s = sidewalkPoint(W.rng);
    W.peds.push({
      x: s.x, z: s.z,
      angle: W.rng.range(0, Math.PI * 2),
      speed: W.rng.range(1.2, 2.4),
      skin: W.rng.pick(PALETTE.pedSkin),
      shirt: W.rng.pick(PALETTE.pedShirt),
      flee: 0,
      down: false,
      downTimer: 0,
      walkPhase: W.rng.range(0, Math.PI * 2),
      mesh: null,
    });
  }
}

export function scarePeds(W, x, z, radius) {
  for (const p of W.peds) {
    if (p.down) continue;
    if (dist2(p.x, p.z, x, z) < radius) p.flee = 2.5;
  }
}

export function updatePedestrians(W, dt) {
  for (const p of W.peds) {
    p.walkPhase += dt * (p.flee > 0 ? 14 : 7);
    if (p.down) {
      p.downTimer -= dt;
      if (p.downTimer <= 0) { p.down = false; p.flee = 1.5; }
      continue;
    }
    if (p.flee > 0) {
      p.flee -= dt;
      // Run away from the player.
      const dx = p.x - W.player.x, dz = p.z - W.player.z;
      const d = Math.hypot(dx, dz) || 1;
      p.angle = angleLerp(p.angle, Math.atan2(dx / d, dz / d), 1 - Math.exp(-8 * dt));
      p.x += Math.sin(p.angle) * 5.5 * dt;
      p.z += Math.cos(p.angle) * 5.5 * dt;
    } else {
      // Amble along the sidewalk; turn at random, avoid buildings.
      if (W.rng.next() < dt * 0.08) p.angle += W.rng.range(-1.2, 1.2);
      p.x += Math.sin(p.angle) * p.speed * dt;
      p.z += Math.cos(p.angle) * p.speed * dt;
      // A car bearing down scares them off the road.
      for (const c of W.cars) {
        if (dist2(p.x, p.z, c.x, c.z) < 7 && Math.abs(c.speed) > 4) { p.flee = 2; break; }
      }
      if (dist2(p.x, p.z, W.player.x, W.player.z) < 2 && W.player.speed > 4) p.flee = 1.5;
    }
    W.collide(p, 0.7);
    // Keep them out of the sea and inside the city.
    if (p.z > CFG.OCEAN_Z - 2) p.z = CFG.OCEAN_Z - 2;
  }
}
