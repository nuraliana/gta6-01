// MARISOL HEAT — shots.js
// One job: staged screenshot scenes for the dossier + the photo hooks the
// tools drive. Each scene is a mid-verb moment, 1 hero, rule of thirds,
// diagonal action line, max 3 visual elements — never a parked portrait.
// Scenes: cover (chase), city (downtown alive), mission (Tia + neon night),
// vista (beach golden hour, half sky). window.__game.shot(name) stages one.
import { CONFIG } from "./config.js";

export function createShots(world) {
  const { player, vehicles, police, missions, render, state, tia } = world;
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
    // 1-cover: chase. Photo-mode diagonal: hero coupe 3/4 front-side on
    // road x=28, 2 cruisers + heli behind, 5 stars, tire smoke.
    cover() {
      world.setTimePreset("golden");
      missions.state.objective = "Escape to Marisol Pier — 5 stars!";
      const hero = vehicles.hero;
      putPlayerInCar(hero, 28, 40, Math.PI - 0.35, 14);
      police.setWanted(5, { x: 28, z: 40 });
      placeCruiser(0, 20, 54, Math.PI - 0.2);
      placeCruiser(1, 36, 50, Math.PI - 0.4);
      // Low hover for the cover: the sim holds the heli at 42 by default,
      // which puts it ~21 deg above the top of a chase frame (FOV 62 deg).
      // Staged low AND far down the road (x=24, z=85, alt 20): at ~60 m
      // from the camera it sits ~+14 deg up in clear sky, and its 26 m
      // spotlight cone reads as a narrow beam instead of a lampshade
      // filling the frame (v1: alt 15 at 36 m — cone dominated the shot).
      if (police.state.heli) { police.state.heliAlt = 20; police.state.heli.position.set(24, 20, 85); }
      world.particles.smoke(26, 0.5, 34);
      world.particles.smoke(30, 0.5, 36);
      state.photo = true;
      state.photoPos.set(60, 7, 14);
      state.photoYaw = 2.25; state.photoPitch = -0.12;
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
      state.photo = true;
      state.photoPos.set(120, 38, 80);
      state.photoYaw = 0.6; state.photoPitch = -0.3;
      document.getElementById("hud").style.display = "block";
      state.hudHidden = false;
    },
    // 3-mission: Riko + Tia in front of Cafe Alba at golden hour (the night
    // staging went unreadably dark at contact-sheet scale; neon still glows).
    // pistol in hand, objective on the HUD. The story, visible.
    // (Beacon hidden for the portrait: the cafe + Tia are the subject.)
    mission() {
      world.setTimePreset("golden");
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
      state.camYaw = 2.9; state.camPitch = 0.05; state.camDist = 8;
      document.getElementById("hud").style.display = "block";
      state.hudHidden = false;
    },
    // 4-vista: beach golden hour, sky half the frame, pier + Spire + ocean,
    // hero car parked on the sand beside Riko. HUD hidden: the world speaks.
    vista() {
      world.setTimePreset("golden");
      missions.state.objective = "Marisol Bay — golden hour";
      const p = player.state;
      p.inCar = null; player.state.mesh.visible = true;
      p.x = 8; p.z = 312; p.angle = Math.PI * 0.15;
      player.state.mesh.position.set(p.x, 0, p.z);
      vehicles.placeCar(vehicles.hero, 18, 306, Math.PI * 0.9, 0);
      police.setWanted(0);
      state.photo = true;
      state.photoPos.set(26, 5, 296);
      state.photoYaw = 2.6; state.photoPitch = 0.05;
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
