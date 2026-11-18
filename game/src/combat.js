// Solmar Bay — combat: fists, the pistol, and the pickups that keep Jax
// alive. Shooting is a cone check in front of Jax; the city notices.
import { CFG } from './config.js';
import { dist2, angleDiff } from './util.js';
import { scarePeds } from './pedestrians.js';

function nearestTarget(W, range, cone) {
  // Closest living ped, cop or cop car inside a forward cone.
  const px = W.player.x, pz = W.player.z;
  const fx = Math.sin(W.player.angle), fz = Math.cos(W.player.angle);
  let best = null, bestD = range;
  const consider = (e, kind) => {
    const dx = e.x - px, dz = e.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > bestD || d < 0.01) return;
    const dot = (dx * fx + dz * fz) / d;
    if (dot < cone) return;
    best = { e, kind, d };
    bestD = d;
  };
  for (const p of W.peds) if (!p.down) consider(p, 'ped');
  for (const c of W.cops) consider(c, 'cop');
  for (const car of W.copCars) consider(car, 'copcar');
  return best;
}

export function updateCombat(W, dt, input, audio) {
  const p = W.player;

  // 1 draws the pistol; clicking fires it. F punches.
  if (input.pressed('1')) { p.gunDrawn = !p.gunDrawn; }
  if (input.pressed('f') && !p.inCar && p.punchTimer <= 0) {
    p.punchTimer = 0.45;
    audio.punch();
    const target = nearestTarget(W, CFG.PUNCH_RANGE, 0.3);
    if (target) {
      if (target.kind === 'ped') {
        target.e.down = true;
        target.e.downTimer = 6;
        W.addWanted(1);
        W.spawnBurst(target.e.x, target.e.z, 0xffc861, 8);
      } else if (target.kind === 'cop') {
        target.e.health -= CFG.PUNCH_DAMAGE;
        if (target.e.health <= 0) {
          W.cops.splice(W.cops.indexOf(target.e), 1);
          W.addWanted(1);
          W.spawnBurst(target.e.x, target.e.z, 0x9fb8ff, 10);
        }
      }
    }
  }

  const click = input.takeClick();
  if (click && p.gunDrawn && !p.inCar && p.shootTimer <= 0) {
    p.shootTimer = 0.28;
    if (W.ammo > 0) {
      W.ammo -= 1;
      W.stats.shotsFired += 1;
      audio.shot();
      W.spawnBurst(p.x + Math.sin(p.angle) * 2, p.z + Math.cos(p.angle) * 2, 0xffe08a, 5, 2);
      scarePeds(W, p.x, p.z, 30);
      W.addWanted(1);
      const target = nearestTarget(W, CFG.PISTOL_RANGE, 0.86);
      if (target) {
        if (target.kind === 'ped') {
          target.e.down = true;
          target.e.downTimer = 8;
          W.spawnBurst(target.e.x, target.e.z, 0xd94f3d, 10);
        } else if (target.kind === 'cop') {
          target.e.health -= CFG.PISTOL_DAMAGE;
          if (target.e.health <= 0) {
            W.cops.splice(W.cops.indexOf(target.e), 1);
            W.spawnBurst(target.e.x, target.e.z, 0x9fb8ff, 12);
          }
        } else if (target.kind === 'copcar') {
          target.e.speed *= 0.5;
          W.spawnBurst(target.e.x, target.e.z, 0xffc861, 8);
        }
      }
    } else {
      audio.blip(120, 0.08, 'square', 0.05);
    }
  }

  // Pickups: cash drops, health kits and ammo boxes.
  for (let i = W.pickups.length - 1; i >= 0; i--) {
    const pk = W.pickups[i];
    if (dist2(p.x, p.z, pk.x, pk.z) < 3) {
      if (pk.kind === 'cash') {
        W.addCash(pk.amount);
        audio.cash();
        W.spawnBurst(pk.x, pk.z, 0xf2c230, 12);
        if (W.missionIndex === 4 && W.mission) W.mission.dropsLeft -= 1;
      } else if (pk.kind === 'health') {
        W.healPlayer(40);
        audio.pickup();
      } else if (pk.kind === 'ammo') {
        W.ammo += 24;
        audio.pickup();
      }
      W.pickups.splice(i, 1);
    }
  }
}

// Spawn a health kit or ammo box near the player, used by the shot scenes
// and by the world when Jax is hurting.
export function spawnPickupNear(W, kind) {
  const a = W.rng.range(0, Math.PI * 2);
  W.pickups.push({
    kind,
    x: W.player.x + Math.sin(a) * 12,
    z: W.player.z + Math.cos(a) * 12,
    amount: 0,
    ttl: 120,
  });
}
