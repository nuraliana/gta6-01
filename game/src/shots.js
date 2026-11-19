// MARISOL HEAT — shots.js
// One job: staged screenshot scenes for the dossier + the photo hooks the
// tools drive. Each scene is a mid-verb moment, 1 hero, rule of thirds,
// diagonal action line, max 3 visual elements — never a parked portrait.
// Scenes: cover (chase), city (downtown alive), mission (Tia + neon night),
// vista (beach golden hour, half sky). window.__game.shot(name) stages one.
import { CONFIG } from "./config.js";

export function createShots(world) {
  const { player, vehicles, police, missions, render, state, tia, peds } = world;
  const P = CONFIG.PLACES;

  function putPlayerInCar(car, x, z, angle, speed) {
    const p = player.state;
    vehicles.placeCar(car, x, z, angle, speed);
    p.inCar = car; car.isPlayer = true;
    player.state.mesh.visible = false;
    p.x = x; p.z = z;
  }
  function placeCruiser(idx, x, z, angle) {
    const c = police.state.cruisers[idx];
    if (!c) return;
    vehicles.placeCar(c, x, z, angle, 26);
  }

  const scenes = {
    // 1-cover: chase, staged ONLY through live gameplay state — no visual
    // overrides. Hero coupe flees north up road x=28 at 5 stars; 2 cruisers
    // close behind, the SWAT interceptor cuts in HEAD-ON from the front
    // (east side of the hero's lane, facing south toward the hero, ~7 m
    // ahead of the coupe after the fast-forward, so the black armored
    // truck + big amber bar + white headlights read against the asphalt,
    // not against a dark tower), and the helicopter spawns at its gameplay
    // altitude (42) north of the hero.
    // A short deterministic fast-forward lets the chase develop (cruisers
    // close in, heli flies toward the hero) before the frame is taken.
    // Camera sits south on the same road looking north, close enough that
    // the hero reads mid-frame: cruisers flank in front of it, and the heli
    // — still ~45 m down the road — sits in the upper frame with its
    // spotlight cone. The mission beacon is hidden (it would read as a
    // stray yellow pillar) and the foot officers wait on the sidewalk.
    // Camera (32, 4.5, 60), yaw 0.30, pitch 0.24 (r5): closer + lower than
    // the r4 take (34, 5, 66 / 0.245 / 0.22), so the amber coupe is ~25%
    // larger and sits clear of the left cruiser instead of hiding behind
    // it; the extra yaw also pushes the palm-cone tip out of the top-right
    // corner, and the higher pitch keeps the heli fully in frame.
    cover() {
      world.setTimePreset("golden");
      missions.state.objective = "Escape to Marisol Pier — 5 stars!";
      missions.state.suppressBeacon = true;
      missions.beacon.visible = false;
      missions.diamond.visible = false;
      const hero = vehicles.hero;
      putPlayerInCar(hero, 28, 40, Math.PI - 0.35, 14);
      police.setWanted(5, { x: 28, z: 40 });
      placeCruiser(0, 20, 52, Math.PI - 0.2);
      placeCruiser(1, 36, 48, Math.PI - 0.4);
      if (police.state.swat[0]) vehicles.placeCar(police.state.swat[0], 33, 28, -0.1, 20);
      for (const [ox, oz] of [[12, 46], [44, 46]]) {
        const o = police.state.officers.shift();
        if (o) { o.x = ox; o.z = oz; police.state.officers.push(o); }
      }
      for (let i = 0; i < 5; i++) world.update(1 / 30);
      world.particles.smoke(26, 0.5, 34);
      world.particles.smoke(30, 0.5, 36);
      state.photo = true;
      state.photoPos.set(32, 4.5, 60);
      state.photoYaw = 0.30; state.photoPitch = 0.24;
      document.getElementById("hud").style.display = "block";
      state.hudHidden = false;
    },
    // 2-city: downtown alive at sunset. Camera sits above road x=84 looking
    // north, so the road is a leading line: 5 traffic cars queue at the red
    // light at (84,84) and 5 pedestrians cross the zebra in front of it —
    // all staged through live gameplay state (red light held 30 s, cars
    // placed with speed 0, peds given zebra crossings as targets).
    city() {
      world.setTimePreset("golden");
      missions.state.objective = "Downtown — Marisol never sleeps";
      missions.state.suppressBeacon = true;
      missions.beacon.visible = false;
      missions.diamond.visible = false;
      const p = player.state;
      p.inCar = null; player.state.mesh.visible = true;
      p.x = -40; p.z = -60; p.angle = Math.PI * 0.75;
      player.state.mesh.position.set(p.x, 0, p.z);
      police.setWanted(0);
      // red light at (84,84) + a 5-car queue facing north in the east lane
      vehicles.forceRedLight(84, 84, 30);
      const queue = vehicles.cars.filter((c) => c.ai && !c.isPolice && !c.isPlayer).slice(0, 5);
      queue.forEach((c, k) => {
        vehicles.placeCar(c, 87.5, 92 + k * 7, Math.PI, 0);
        c.targetSpeed = 0;
      });
      // 5 pedestrians crossing the zebra at z=92, west to east
      peds.peds.slice(0, 5).forEach((pd, k) => {
        pd.x = 76 + k * 4; pd.z = 92;
        pd.tx = 94; pd.tz = 92; pd.timer = 8;
        pd.state = "walk"; pd.angle = Math.PI / 2;
      });
      state.photo = true;
      state.photoPos.set(84, 14, 138);
      state.photoYaw = -0.12; state.photoPitch = -0.22;
      document.getElementById("hud").style.display = "block";
      state.hudHidden = false;
    },
    // 3-mission: Riko + Tia in front of Cafe Alba at NIGHT — the one night
    // shot on the sheet. Photo mode with a measured aim: the camera stands
    // north of the cafe looking south, so the whole CAFE ALBA sign (top
    // y≈9.3) sits in the upper third, both figures large in the lower half,
    // the planter anchors the lower-left foreground, and the neon sign +
    // lit windows + the cafe's warm storefront glow + the streetlamp light
    // pools carry the light — the subjects stand between the camera and
    // the glowing sign, never in unlit shadow.
    // (Beacon hidden for the portrait: the cafe + Tia are the subject.)
    mission() {
      world.setTimePreset("night");
      missions.state.objective = "Meet Tia Sol at Cafe Alba";
      missions.state.subtitle = "TIA: The Bay Trust job needs a driver, not a hero.";
      missions.beacon.visible = false;
      missions.diamond.visible = false;
      missions.state.suppressBeacon = true;
      // Tia steps next to Riko for the portrait; Riko faces her (3/4 front).
      tia.position.set(P.cafeAlba.x - 6, 0, P.cafeAlba.z - 10);
      tia.rotation.y = 2.03;
      const p = player.state;
      p.inCar = null; player.state.mesh.visible = true;
      p.x = P.cafeAlba.x - 2; p.z = P.cafeAlba.z - 12; p.angle = -1.1;
      player.state.mesh.position.set(p.x, 0, p.z);
      police.setWanted(1, { x: p.x, z: p.z });
      // Foreground anchor for the night portrait: one parked car on the
      // curb lane in front of the cafe. Reuses a seeded parked car (the
      // instanced car meshes already exist, so this costs 0 draw calls),
      // angled nose-toward-camera so the headlights + front read at
      // night. Prefer a vivid-coloured sedan/coupe (a pale grey car read
      // as a blank slab in the first take); (60,-78) is 6+ m clear of
      // the mission-1 walk line (z=-70) and of Riko/Tia, and clear of
      // the east planter (64,-76).
      const VIVID = [0xc23a2e, 0xd8c95a, 0x2e6ac2, 0x3a8a4a];
      const parked = vehicles.cars.find((c) => !c.ai && !c.isPolice && !c.isPlayer && c.type.len <= 4.4 && VIVID.includes(c.color))
        ?? vehicles.cars.find((c) => !c.ai && !c.isPolice && !c.isPlayer);
      if (parked) vehicles.placeCar(parked, 60, -78, Math.PI - 0.25, 0);
      state.photo = true;
      state.photoPos.set(56, 3.2, -86);
      state.photoYaw = Math.PI; state.photoPitch = 0.18;
      document.getElementById("hud").style.display = "block";
      state.hudHidden = false;
    },
    // 4-vista: beach golden hour, sky half the frame, pier + Spire + ocean,
    // hero car parked on the sand beside Riko. HUD hidden: the world speaks.
    // Riko stands at the frame's centre-left, fully in frame next to the
    // hero car — the old take cut him off at the bottom-right edge.
    vista() {
      world.setTimePreset("golden");
      missions.state.objective = "Marisol Bay — golden hour";
      const p = player.state;
      p.inCar = null; player.state.mesh.visible = true;
      p.x = 14; p.z = 310; p.angle = Math.PI * 0.15;
      player.state.mesh.position.set(p.x, 0, p.z);
      vehicles.placeCar(vehicles.hero, 20, 304, Math.PI * 0.9, 0);
      police.setWanted(0);
      state.photo = true;
      state.photoPos.set(32, 6, 288);
      // yaw nudged 2.48 -> 2.42 (one attempt) to push the palm-cone tip
      // out of the top-right corner
      state.photoYaw = 2.42; state.photoPitch = 0.05;
      document.getElementById("hud").style.display = "none";
      state.hudHidden = true;
    },
  };

  return {
    scenes,
    stage(name) {
      if (!scenes[name]) return false;
      state.shotMode = true;
      scenes[name]();
      return true;
    },
  };
}
