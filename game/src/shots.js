// Solmar Bay — deterministic screenshot scenes (?shot=<name>&seed=N).
// Each scene stages the world, lets it settle for a couple of seconds, then
// sets window.__shotReady so the harness can capture it.
import { CFG } from './config.js';
import { makeCar } from './vehicles.js';
import { startMission } from './missions.js';
import { spawnPickupNear } from './combat.js';

function putPlayerInCar(W, x, z, angle, color) {
  const car = makeCar(W, x, z, angle, { kind: 'coupe', color, isTraffic: false });
  W.cars.push(car);
  W.player.inCar = true;
  W.player.car = car;
  W.player.x = x;
  W.player.z = z;
  W.player.angle = angle;
  car.speed = 16;
  W.camera.yaw = angle;
  return car;
}

function trafficAhead(W, x, z, angle, n) {
  // A few ordinary cars on the same street, coming the other way so they
  // pass by instead of being rear-ended in the shot.
  for (let i = 0; i < n; i++) {
    const d = 40 + i * 30;
    const lane = (i % 2 === 0 ? 3.5 : -3.5);
    const car = makeCar(W,
      x + Math.sin(angle) * d + Math.cos(angle) * lane,
      z + Math.cos(angle) * d - Math.sin(angle) * lane,
      angle + Math.PI, { kind: 'sedan', isTraffic: true, targetSpeed: CFG.TRAFFIC_SPEED });
    car.speed = CFG.TRAFFIC_SPEED;
    W.cars.push(car);
  }
}

function stageCopsInFrame(W, spots, wanted) {
  // Stage cruisers AHEAD of Jax, inside the chase camera's frame, facing
  // him like a roadblock closing in — and hold that formation while he
  // drives (see police.js: W.shotFreezeCops). Free-running cruisers are
  // useless here: cop AI steers for a point 12 units BEHIND Jax, so within
  // the 2.2 s settle they end up behind the camera and never appear in the
  // shot. Spots are [ahead, lateral] in metres from Jax, along his heading;
  // lateral stays >= 5.5 so his car passes without touching them.
  W.wanted = wanted;
  W.shotFreezeCops = true;
  for (const [ahead, lateral] of spots) {
    const car = makeCar(W, W.player.x, W.player.z, W.player.angle + Math.PI, {
      kind: 'cop', color: 0x2b4c8c, isCop: true, isTraffic: false, targetSpeed: 0,
    });
    car.speed = 0;
    car.shotOffset = [ahead, lateral];
    W.cars.push(car);
    W.copCars.push(car);
  }
}

function beachStrollers(W, spots) {
  // Locals ambling on the sand so the beach vista is alive, not empty.
  for (const [x, z, angle] of spots) {
    W.peds.push({
      x, z, angle,
      speed: 1.6,
      skin: 0xe8b88a,
      shirt: 0x4fae8a,
      flee: 0,
      down: false,
      downTimer: 0,
      walkPhase: 0,
      mesh: null,
    });
  }
}

export function applyShot(W, name) {
  const P = W.city.places;
  if (name === 'cover') {
    // The money shot: Jax in a red coupe mid-chase down Palm Court street,
    // 3 stars, the bank job live, traffic passing and cruisers closing in.
    startMission(W, 5);
    W.mission.phase = 'escape';
    putPlayerInCar(W, -140, 112, Math.PI / 2, 0xd94f3d);
    W.shotDrive = true;
    trafficAhead(W, -140, 112, Math.PI / 2, 2);
    stageCopsInFrame(W, [[12, -6], [18, 6], [26, -5]], 3);
    W.cash = 12450;
    W.player.health = 82;
    spawnPickupNear(W, 'health');
    W.camera.pitch = 0.34;
  } else if (name === 'beach') {
    // The vista shot: Jax on foot on Solmar Beach at golden hour, the pier
    // and the ocean ahead, the Sunset Delivery marker glowing at the pier
    // end, a few locals strolling the sand.
    W.player.x = -20;
    W.player.z = 278;
    W.player.angle = 0.45;
    W.camera.yaw = 0.45;
    W.camera.pitch = 0.5;
    startMission(W, 2);
    beachStrollers(W, [[-32, 282, 2.2], [-8, 290, -0.6], [-44, 270, 1.1], [4, 286, 2.8]]);
    W.cash = 150;
  } else if (name === 'playtest') {
    // Not a dossier shot: the end-to-end playtest drives this scene.
    // Autopilot walks Jax straight down the street to Tia, so mission 1
    // completes on its own.
    W.player.x = -56;
    W.player.z = 60;
    W.player.angle = Math.PI;
    W.camera.yaw = Math.PI;
    W.camera.pitch = 0.5;
    startMission(W, 0);
    W.autopilot = { x: P.cafe.x, z: P.cafe.z };
    W.cash = 150;
  } else if (name === 'chase') {
    // Full police chase: 4 stars, four cruisers closing in, Jax flooring it.
    startMission(W, 3);
    putPlayerInCar(W, 0, -40, 0, 0x3d7fd9);
    W.shotDrive = true;
    trafficAhead(W, 0, -40, 0, 2);
    stageCopsInFrame(W, [[12, 6], [18, -6], [25, 6], [32, -5]], 4);
    W.cash = 8300;
    W.camera.pitch = 0.3;
  } else if (name === 'mission') {
    // The Solmar Score at Bay Trust Bank: Jax on foot, pistol drawn, the
    // vault marker glowing, a cruiser arriving.
    startMission(W, 5);
    W.player.x = P.bank.x - 4;
    W.player.z = P.bank.z + 10;
    W.player.angle = Math.PI;
    W.player.gunDrawn = true;
    W.ammo = 18;
    W.camera.yaw = Math.PI;
    W.camera.pitch = 0.42;
    addCopChase(W, 1, 2);
    W.cash = 2100;
  } else {
    startMission(W, 0);
  }
  W.state = 'playing';
}

function addCopChase(W, n, wanted) {
  W.wanted = wanted;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    const car = makeCar(W, W.player.x + Math.sin(a) * 26, W.player.z + Math.cos(a) * 26, a, {
      kind: 'cop', color: 0x2b4c8c, isCop: true, isTraffic: false, targetSpeed: CFG.COP_SPEED,
    });
    car.speed = 18;
    W.cars.push(car);
    W.copCars.push(car);
  }
}
