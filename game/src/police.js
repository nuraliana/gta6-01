// Solmar Bay — the wanted level and the police who answer it. Cop cars
// chase Jax down and ram him; foot officers chase him on foot and try to
// bust him. When the heat is gone, the cops give up and drive away.
import { CFG } from './config.js';
import { clamp, angleLerp, dist2 } from './util.js';
import { makeCar } from './vehicles.js';
import { scarePeds } from './pedestrians.js';

const COP_BLUE = 0x2b4c8c;

function copCountFor(wanted) {
  return [0, 1, 2, 3, 4, 5][clamp(wanted, 0, 5)];
}

export function spawnCopCar(W) {
  const a = W.rng.range(0, Math.PI * 2);
  const r = 70;
  const x = clamp(W.player.x + Math.sin(a) * r, -240, 240);
  const z = clamp(W.player.z + Math.cos(a) * r, -240, 240);
  const car = makeCar(W, x, z, 0, { kind: 'cop', color: COP_BLUE, isCop: true, isTraffic: false, targetSpeed: CFG.COP_SPEED });
  W.cars.push(car);
  W.copCars.push(car);
  return car;
}

function spawnFootCop(W) {
  const a = W.rng.range(0, Math.PI * 2);
  const cop = {
    x: W.player.x + Math.sin(a) * 24,
    z: W.player.z + Math.cos(a) * 24,
    angle: 0,
    speed: 5.2,
    health: 50,
    bustTimer: 0,
    mesh: null,
  };
  W.cops.push(cop);
  return cop;
}

export function updatePolice(W, dt, audio) {
  if (W.shotFreezeCops) {
    // Screenshot scenes (shots.js): hold the staged cruiser formation
    // relative to Jax instead of chasing. Cop AI steers for a point behind
    // him, so free-running cruisers leave the chase camera's frame during
    // the settle; the formation keeps them ahead of him, in frame, while
    // he drives. Skips the spawn/despawn counts too — the scene stages
    // exactly copCountFor(wanted) cruisers.
    const fx = Math.sin(W.player.angle), fz = Math.cos(W.player.angle);
    const rx = Math.cos(W.player.angle), rz = -Math.sin(W.player.angle);
    const speed = W.player.inCar && W.player.car ? Math.abs(W.player.car.speed) : 0;
    for (const car of W.copCars) {
      const off = car.shotOffset;
      if (!off) continue;
      car.x = W.player.x + fx * off[0] + rx * off[1];
      car.z = W.player.z + fz * off[0] + rz * off[1];
      car.angle = W.player.angle + Math.PI;
      car.speed = speed;
      car.wheelSpin += car.speed * dt * 2;
    }
    return;
  }
  const want = copCountFor(W.wanted);
  // Keep the right number of cop cars on the road.
  while (W.copCars.length < want) spawnCopCar(W);
  while (W.copCars.length > want) {
    const car = W.copCars.pop();
    car.dead = true;
    const i = W.cars.indexOf(car);
    if (i >= 0) W.cars.splice(i, 1);
  }
  // Foot officers only while Jax is on foot and wanted.
  const wantFoot = W.wanted > 0 && !W.player.inCar ? Math.min(2, W.wanted) : 0;
  while (W.cops.length < wantFoot) spawnFootCop(W);
  while (W.cops.length > wantFoot) W.cops.pop();

  audio.siren(W.wanted > 0);

  // Cop cars: trail Jax from a point behind his direction of travel, so
  // they form a chase convoy instead of piling onto his car and pinning it.
  const pfx = Math.sin(W.player.angle), pfz = Math.cos(W.player.angle);
  for (const car of W.copCars) {
    const tx = W.player.x - pfx * 12;
    const tz = W.player.z - pfz * 12;
    const dx = tx - car.x, dz = tz - car.z;
    const dt2 = Math.hypot(dx, dz) || 1;
    const targetAngle = Math.atan2(dx / dt2, dz / dt2);
    car.angle = angleLerp(car.angle, targetAngle, 1 - Math.exp(-2.2 * dt));
    const playerSpeed = W.player.inCar && W.player.car ? Math.abs(W.player.car.speed) : Math.abs(W.player.speed || 0);
    const wantSpeed = dt2 > 24 ? CFG.COP_SPEED : Math.min(CFG.COP_SPEED, playerSpeed + 3);
    car.speed += clamp(wantSpeed - car.speed, -14 * dt, 12 * dt);
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;
    car.wheelSpin += car.speed * dt * 2;
    // A bump when a cruiser actually touches Jax's car — a nudge, not a pin.
    const d = dist2(car.x, car.z, W.player.x, W.player.z);
    if (d < 4.4) {
      if (W.player.inCar && W.player.car) {
        W.player.car.speed *= 0.92;
        W.damagePlayer(2);
      } else if (d < 2.6) {
        W.damagePlayer(8);
        audio.punch();
      }
      car.speed *= 0.6;
    }
    W.collide(car, 2.1);
  }

  // Foot officers: run Jax down; standing next to him for 2 s busts him.
  for (const cop of W.cops) {
    const dx = W.player.x - cop.x, dz = W.player.z - cop.z;
    const d = Math.hypot(dx, dz) || 1;
    cop.angle = angleLerp(cop.angle, Math.atan2(dx / d, dz / d), 1 - Math.exp(-6 * dt));
    if (d > 1.6) {
      cop.x += Math.sin(cop.angle) * cop.speed * dt;
      cop.z += Math.cos(cop.angle) * cop.speed * dt;
      cop.bustTimer = 0;
    } else {
      cop.bustTimer += dt;
      if (cop.bustTimer > 2) {
        W.state = 'busted';
        W.events.push('busted');
        W.wanted = 0;
      }
    }
    W.collide(cop, 0.8);
  }
}
