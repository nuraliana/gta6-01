// Solmar Bay — Jax on foot: walk, sprint, enter and steal cars, exit.
// Camera-relative movement so W points where the camera looks.
import { CFG } from './config.js';
import { clamp, angleLerp, dist2 } from './util.js';

export function updatePlayer(W, dt, input, audio) {
  const p = W.player;
  // Camera orbit from mouse drag.
  const drag = input.takeDrag();
  W.camera.yaw -= drag.x * 0.005;
  W.camera.pitch = clamp(W.camera.pitch + drag.y * 0.003, 0.12, 1.1);

  if (p.inCar) {
    // E steps out next to the car.
    if (input.pressed('e')) {
      const car = p.car;
      p.inCar = false;
      p.car = null;
      p.x = car.x + Math.cos(car.angle) * 3;
      p.z = car.z - Math.sin(car.angle) * 3;
      p.angle = car.angle;
      p.speed = 0;
      W.collide(p, CFG.PLAYER_RADIUS);
    }
    return;
  }

  // Autopilot (screenshot scenes): walk straight at the target.
  let mx = 0, mz = 0;
  if (W.autopilot) {
    const dx = W.autopilot.x - p.x, dz = W.autopilot.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 1.2) { mx = dx / d; mz = dz / d; }
    else { W.autopilot = null; }
  } else {
    const ax = input.axis();
    if (ax.x !== 0 || ax.y !== 0) {
      // Camera-relative: forward is away from the camera.
      const cy = W.camera.yaw;
      const fx = Math.sin(cy), fz = Math.cos(cy);
      const rx = Math.cos(cy), rz = -Math.sin(cy);
      mx = fx * ax.y + rx * ax.x;
      mz = fz * ax.y + rz * ax.x;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len; mz /= len;
    }
  }

  const sprint = input.down('shift');
  const speed = sprint ? CFG.SPRINT_SPEED : CFG.WALK_SPEED;
  if (mx !== 0 || mz !== 0) {
    p.x += mx * speed * dt;
    p.z += mz * speed * dt;
    p.angle = angleLerp(p.angle, Math.atan2(mx, mz), 1 - Math.exp(-12 * dt));
    p.speed = speed;
  } else {
    p.speed = 0;
  }
  W.collide(p, CFG.PLAYER_RADIUS);

  // E near a car: enter it. Parked cars are stolen (a crime); driven cars
  // need their driver pulled out first — here, E just takes the wheel and
  // the city notices.
  if (input.pressed('e')) {
    const car = W.nearestCar(p.x, p.z, 4.5);
    if (car) {
      p.inCar = true;
      p.car = car;
      car.isTraffic = false;
      car.driver = true;
      if (!car.stolen) {
        car.stolen = true;
        W.stats.carsStolen += 1;
        W.addWanted(1);
        W.events.push('stole-car');
        audio.blip(220, 0.15, 'square', 0.06);
      }
      p.x = car.x; p.z = car.z;
    }
  }
}
