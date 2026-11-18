// Solmar Bay — cars. Arcade driving for Jax, simple street-following AI
// for traffic, and the spawn pool the other systems draw from. A car is
// plain data ({x, z, angle, speed, ...}); render.js owns its mesh.
import { CFG, PALETTE } from './config.js';
import { clamp, angleDiff, angleLerp, dist2, pushOutOfBox } from './util.js';
import { nearestStreet, streetLines } from './city.js';

let nextCarId = 1;

export function makeCar(W, x, z, angle, opts = {}) {
  const car = {
    id: nextCarId++,
    x, z, angle,
    speed: 0,
    color: opts.color ?? W.rng.pick(PALETTE.car),
    kind: opts.kind || 'sedan', // sedan | coupe | taxi | truck | cop
    isCop: !!opts.isCop,
    isTraffic: opts.isTraffic !== false,
    driver: opts.driver !== false, // false = parked, stealable
    dead: false,
    targetSpeed: opts.targetSpeed ?? CFG.TRAFFIC_SPEED,
    // Traffic AI state: which street line it follows and which way.
    axis: opts.axis || 'x',
    dir: opts.dir || 1,
    stuck: 0,
    mesh: null,
    wheelSpin: 0,
  };
  return car;
}

export function spawnTraffic(W, n) {
  const streets = streetLines();
  for (let i = 0; i < n; i++) {
    const axis = W.rng.chance(0.5) ? 'x' : 'z';
    const line = W.rng.pick(streets);
    const along = W.rng.range(-220, 220);
    const dir = W.rng.chance(0.5) ? 1 : -1;
    const x = axis === 'x' ? along : line + (dir > 0 ? 3.5 : -3.5);
    const z = axis === 'x' ? line + (dir > 0 ? 3.5 : -3.5) : along;
    const angle = axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const kind = W.rng.chance(0.12) ? 'taxi' : W.rng.pick(['sedan', 'sedan', 'coupe', 'truck']);
    const car = makeCar(W, x, z, angle, { kind, axis, dir, targetSpeed: CFG.TRAFFIC_SPEED * W.rng.range(0.8, 1.15) });
    W.cars.push(car);
  }
}

export function spawnParked(W, n) {
  const streets = streetLines();
  for (let i = 0; i < n; i++) {
    const axis = W.rng.chance(0.5) ? 'x' : 'z';
    const line = W.rng.pick(streets);
    const along = W.rng.range(-210, 210);
    const dir = W.rng.chance(0.5) ? 1 : -1;
    const x = axis === 'x' ? along : line + 5.5;
    const z = axis === 'x' ? line + 5.5 : along;
    const angle = axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = makeCar(W, x, z, angle, { kind: W.rng.pick(['sedan', 'coupe', 'sedan']), driver: false, isTraffic: false });
    W.cars.push(car);
  }
}

// Jax driving: W/S accelerate and brake, A/D steer, Space handbrakes.
export function updatePlayerCar(W, dt, input, audio) {
  const car = W.player.car;
  if (!car) return;
  const ax = input.axis();
  // Screenshot scenes hold the accelerator so the car is moving in frame.
  const drive = W.shotDrive ? { x: 0, y: 1 } : ax;
  const forward = Math.sin(car.angle), side = Math.cos(car.angle);
  if (drive.y > 0) car.speed += CFG.CAR_ACCEL * dt;
  else if (drive.y < 0) car.speed -= (car.speed > 0.5 ? CFG.CAR_BRAKE : CFG.CAR_REVERSE) * dt;
  else car.speed -= car.speed * 0.6 * dt; // coast
  if (input.down(' ')) car.speed -= car.speed * 2.2 * dt; // handbrake
  car.speed = clamp(car.speed, -CFG.CAR_REVERSE, CFG.CAR_TOP_SPEED);
  const steer = drive.x * CFG.CAR_TURN * clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed >= 0 ? 1 : -1);
  car.angle += steer * dt;
  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const nz = car.z + Math.cos(car.angle) * car.speed * dt;
  car.x = nx; car.z = nz;
  car.wheelSpin += car.speed * dt * 2;
  W.stats.distanceDriven += Math.abs(car.speed) * dt;

  // Collide with buildings: stop and bounce a little.
  for (const box of W.city.colliders) {
    const p = pushOutOfBox(car.x, car.z, 2.1, box);
    if (p) {
      car.x = p.x; car.z = p.z;
      if (Math.abs(car.speed) > 6) { audio.crash(); W.spawnBurst(car.x, car.z, 0xffc861, 8); }
      car.speed *= 0.35;
    }
  }
  // Bump into other cars. A rear-end shoves the other car ahead instead of
  // grinding both to a halt: separate, transfer speed, and only count the
  // impact once per half second (hitCd).
  car.hitCd = Math.max(0, (car.hitCd || 0) - dt);
  for (const other of W.cars) {
    if (other === car || other.dead) continue;
    const d = dist2(car.x, car.z, other.x, other.z);
    if (d < 4.4 && d > 0.01) {
      const overlap = 4.4 - d;
      const ux = (car.x - other.x) / d, uz = (car.z - other.z) / d;
      if (other.isCop) {
        // Cop cars get pushed aside instead of shoving Jax off the road.
        other.x -= ux * overlap; other.z -= uz * overlap;
      } else {
        // Shove the other car out of the way along Jax's direction.
        const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
        other.x += fx * overlap; other.z += fz * overlap;
        car.x -= ux * overlap * 0.25; car.z -= uz * overlap * 0.25;
      }
      if (car.hitCd <= 0 && Math.abs(car.speed) > 8) {
        car.hitCd = 0.5;
        other.speed = Math.max(other.speed, car.speed * 0.85);
        car.speed *= 0.92;
        audio.crash();
        W.spawnBurst(car.x, car.z, 0xffc861, 6);
        if (other.isTraffic) { W.addWanted(1); W.events.push('crash'); }
      }
    }
  }
  // Running over pedestrians is a crime, and it shows.
  for (const p of W.peds) {
    if (p.down) continue;
    if (dist2(car.x, car.z, p.x, p.z) < 2.4 && Math.abs(car.speed) > 3) {
      p.down = true;
      p.flee = 0;
      W.stats.pedsHit += 1;
      W.addWanted(1);
      W.spawnBurst(p.x, p.z, 0xd94f3d, 10);
      audio.crash();
      W.events.push('ped-down');
    }
  }
  car.x = clamp(car.x, -CFG.HALF - 8, CFG.HALF + 8);
  car.z = clamp(car.z, -CFG.HALF - 8, CFG.PIER_Z_END + 4);
  W.player.x = car.x;
  W.player.z = car.z;
  W.player.angle = car.angle;
  W.player.speed = car.speed;
}

// Traffic: follow the street it is on; at an intersection, sometimes turn.
export function updateTraffic(W, dt) {
  for (const car of W.cars) {
    if (!car.isTraffic || car.dead) continue;
    if (car === W.player.car) continue;
    // Slow for the car ahead on the same lane.
    let blocked = false;
    for (const other of W.cars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const ahead = dx * Math.sin(car.angle) + dz * Math.cos(car.angle);
      const side = Math.abs(dx * Math.cos(car.angle) - dz * Math.sin(car.angle));
      if (ahead > 0 && ahead < 9 && side < 2.4) { blocked = true; break; }
    }
    const want = blocked ? 0 : car.targetSpeed;
    car.speed += clamp(want - car.speed, -10 * dt, 8 * dt);
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;
    car.wheelSpin += car.speed * dt * 2;

    // At an intersection (near a crossing street line), maybe turn.
    const line = nearestStreet(car.axis === 'x' ? car.z : car.x);
    const cross = nearestStreet(car.axis === 'x' ? car.x : car.z);
    const distCross = Math.abs((car.axis === 'x' ? car.x : car.z) - cross);
    if (distCross < 1.2 && car.speed > 1 && W.rng.next() < 0.012) {
      // Turn onto the crossing street.
      const newAxis = car.axis === 'x' ? 'z' : 'x';
      const newDir = W.rng.chance(0.5) ? 1 : -1;
      car.axis = newAxis;
      car.dir = newDir;
      car.angle = newAxis === 'x'
        ? (newDir > 0 ? 0 : Math.PI)
        : (newDir > 0 ? Math.PI / 2 : -Math.PI / 2);
      if (newAxis === 'x') car.z = line + (newDir > 0 ? 3.5 : -3.5);
      else car.x = line + (newDir > 0 ? 3.5 : -3.5);
    }
    // Wrap around the city edge instead of piling up at the border.
    if (car.x > CFG.HALF + 6 || car.x < -CFG.HALF - 6 || car.z > CFG.HALF + 6 || car.z < -CFG.HALF - 6) {
      const streets = streetLines();
      const axis = W.rng.chance(0.5) ? 'x' : 'z';
      const s = W.rng.pick(streets);
      const dir = W.rng.chance(0.5) ? 1 : -1;
      car.axis = axis; car.dir = dir;
      car.angle = axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      car.x = axis === 'x' ? -dir * 220 : s + (dir > 0 ? 3.5 : -3.5);
      car.z = axis === 'x' ? s + (dir > 0 ? 3.5 : -3.5) : -dir * 220;
      car.speed = car.targetSpeed;
    }
  }
}
