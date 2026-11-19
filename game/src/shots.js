// MARISOL HEAT — shots.js
// One job: staged screenshot scenes for the dossier + the photo hooks the
// tools drive. Each scene is a mid-verb moment, 1 hero, rule of thirds,
// diagonal action line, max 3 visual elements — never a parked portrait.
// Scenes: cover (chase), city (downtown alive), mission (Tia + neon night),
// vista (beach golden hour, half sky). window.__game.shot(name) stages one.
import * as THREE from "three";
import { CONFIG } from "./config.js";

export function createShots(world) {
  const { player, vehicles, police, missions, render, state, tia, peds, city } = world;
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
    // close behind, the SWAT interceptor cuts in from the front, and the
    // helicopter spawns at its gameplay altitude (42) north of the hero.
    // A short deterministic fast-forward lets the chase develop (cruisers
    // close in, heli flies toward the hero) before the frame is taken.
    // Camera sits south on the same road looking north, close enough that
    // the hero reads mid-frame: cruisers flank in front of it, and the heli
    // — still ~45 m down the road — sits in the upper frame with its
    // spotlight cone. The mission beacon is hidden (it would read as a
    // stray yellow pillar) and the foot officers wait at the roadside.
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
      placeCruiser(1, 30, 56, Math.PI - 0.4);
      if (police.state.swat[0]) vehicles.placeCar(police.state.swat[0], 37, 28, 0, 20);
      for (const [ox, oz] of [[19, 46], [37, 46]]) {
        const o = police.state.officers.shift();
        if (o) { o.x = ox; o.z = oz; police.state.officers.push(o); }
      }
      for (let i = 0; i < 5; i++) world.update(1 / 30);
      world.particles.smoke(26, 0.5, 34);
      world.particles.smoke(30, 0.5, 36);
      state.photo = true;
      state.photoPos.set(26, 5, 66);
      state.photoYaw = -0.25; state.photoPitch = 0.22;
      document.getElementById("hud").style.display = "block";
      state.hudHidden = false;
    },
    // 2-city: downtown alive at sunset, high oblique from the south-east:
    // glass towers, traffic queued at a red light, pedestrians below.
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
      // Street-level at the (84,84) crossing: 5 driven traffic cars queued
      // northbound in lane x=80.5 behind the zebra, 5 peds crossing the
      // zebra eastward, and the light forced red for a minute, lamps
      // repainted red on top, dark below.
      const queue = vehicles.cars.filter((c) => c.hasDriver).slice(0, 5);
      queue.forEach((c, i) => {
        vehicles.placeCar(c, 80.5, 100 + i * 8, Math.PI, 0);
        c.speed = 0; c.targetSpeed = 0;
      });
      peds.peds.slice(0, 5).forEach((pd, i) => {
        pd.x = 76 + i * 4; pd.z = 92; pd.angle = Math.PI / 2;
        pd.tx = 110; pd.tz = 92; pd.timer = 30; pd.state = "walk";
      });
      const light = city.trafficLights.find((t) => t.x === 84 && t.z === 84);
      if (light) {
        light.state = "r"; light.timer = 60;
        const order = ["r", "y", "g"];
        const col = new THREE.Color();
        for (let k = 0; k < 3; k++) {
          city.tlLampIM.setColorAt(light.lampBase + k,
            col.setHex(order[k] === "r" ? 0xff2a1a : 0x2a0d0d));
        }
        if (city.tlLampIM.instanceColor) city.tlLampIM.instanceColor.needsUpdate = true;
      }
      state.photo = true;
      state.photoPos.set(84, 14, 138);
      state.photoYaw = -0.12; state.photoPitch = -0.28;
      document.getElementById("hud").style.display = "block";
      state.hudHidden = false;
    },
    // 3-mission: Riko + Tia in front of Cafe Alba at NIGHT — the one night
    // shot on the sheet. The old golden-hour take failed twice: the sign was
    // cut at the top and the foreground went flat purple. This staging keeps
    // it readable at contact-sheet scale: camera at 8.5 m with a slight
    // upward pitch so the whole CAFE ALBA sign (top y≈9.3) sits in the
    // upper third, both figures large in the lower half, and the neon
    // sign + lit windows + the cafe's warm storefront glow carry the light
    // — the subjects stand between the camera and the glowing sign, never
    // in unlit shadow.
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
      state.photo = false;
      state.camYaw = 2.9; state.camPitch = 0.18; state.camDist = 14;
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
