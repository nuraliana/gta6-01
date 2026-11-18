// MARISOL HEAT — world.js
// One job: wire every system together and own the frame. Update order is
// fixed: input -> player/vehicle -> traffic -> peds -> police -> missions ->
// economy -> combat -> particles -> camera -> HUD. Save/load is localStorage
// (cash, mission, position, health, time preset). Photo mode (P) is a free
// camera + H hides the HUD + T cycles the time preset — the screenshot tools
// drive exactly these hooks.
import * as THREE from "three";
import { CONFIG, SAVE_KEY } from "./config.js";
import { makeRng } from "./random.js";
import { clamp, dist } from "./util.js";
import { createRenderer, createParticles, createBlobShadows } from "./render.js";
import { buildCity } from "./city.js";
import { createInput } from "./input.js";
import { createAudio } from "./audio.js";
import { createPlayer, buildTia } from "./player.js";
import { createVehicles } from "./vehicles.js";
import { createPedestrians } from "./pedestrians.js";
import { createPolice } from "./police.js";
import { createCombat } from "./combat.js";
import { createMissions } from "./missions.js";
import { createEconomy } from "./economy.js";
import { createHud } from "./hud.js";

export function createWorld(canvas) {
  const rng = makeRng(CONFIG.SEED);
  const render = createRenderer(canvas);
  const particles = createParticles(render.scene);
  const blobs = createBlobShadows(render.scene, 92); // 0 player, 1 Tia, 2-41 cars, 42-89 peds, 90-91 officers
  const city = buildCity(render.scene, rng);
  const input = createInput(canvas);
  const audio = createAudio();
  const hud = createHud();
  const tia = buildTia(render.scene, CONFIG.PLACES.cafeAlba.x - 8, CONFIG.PLACES.cafeAlba.z - 14);
  blobs.set(1, tia.position.x, tia.position.z, 1.4, 1.4);
  const player = createPlayer(render.scene, city);
  const vehicles = createVehicles(render.scene, city, rng, blobs, particles);
  const peds = createPedestrians(render.scene, city, rng, blobs);
  const police = createPolice(render.scene, city, vehicles, rng, blobs);
  const combat = createCombat(render.scene, particles, audio);
  const missions = createMissions(render.scene, city, tia);

  const state = {
    cash: CONFIG.START_CASH, running: false, paused: false,
    timePreset: "golden", hour: 17.75, photo: false, hudHidden: false, shotMode: false,
    camYaw: Math.PI, camPitch: 0.32, camDist: 10,
    photoPos: new THREE.Vector3(0, 20, -60), photoYaw: 0, photoPitch: -0.4,
    gameTime: 0, raceMarker: null, debug: { drawCalls: 0 },
  };

  // Economy ctx (live references, filled after creation).
  const econCtx = {
    get cash() { return state.cash; }, set cash(v) { state.cash = v; },
    police, combat, player, audio, vehicles,
    toast: (m) => hud.toast(m),
    banner: (t, s) => hud.banner(t, s),
    missionObjective: (t) => hud.setObjective(t),
    raceMarker: (x, z) => { state.raceMarker = x === null ? null : [x, z]; },
  };
  const economy2 = createEconomy(econCtx);

  // ---- camera ----
  const camTarget = new THREE.Vector3();
  function updateCamera(dt) {
    const drag = input.consumeDrag();
    if (state.photo) {
      state.photoYaw -= drag.x * 0.004;
      state.photoPitch = clamp(state.photoPitch - drag.y * 0.003, -1.2, 1.2);
      const sp = (input.down("ShiftLeft") ? 30 : 12) * dt;
      const ax = input.axis();
      const fwd = new THREE.Vector3(-Math.sin(state.photoYaw), 0, -Math.cos(state.photoYaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      state.photoPos.addScaledVector(fwd, ax.z * sp);
      state.photoPos.addScaledVector(right, ax.x * sp);
      if (input.down("KeyQ")) state.photoPos.y -= sp;
      if (input.down("KeyE")) state.photoPos.y += sp;
      render.camera.position.copy(state.photoPos);
      render.camera.lookAt(
        state.photoPos.x - Math.sin(state.photoYaw) * Math.cos(state.photoPitch),
        state.photoPos.y + Math.sin(state.photoPitch),
        state.photoPos.z - Math.cos(state.photoYaw) * Math.cos(state.photoPitch));
      return;
    }
    state.camYaw -= drag.x * 0.005;
    state.camPitch = clamp(state.camPitch + drag.y * 0.003, 0.08, 1.1);
    const p = player.state;
    const cx = p.inCar ? p.inCar.x : p.x;
    const cz = p.inCar ? p.inCar.z : p.z;
    const focusAngle = p.inCar ? p.inCar.angle : state.camYaw;
    const yaw = p.inCar ? focusAngle + Math.PI + state.camYaw * 0.15 : state.camYaw;
    const d = state.camDist + (p.inCar ? 3 : 0);
    const tx = cx + Math.sin(yaw) * d * Math.cos(state.camPitch);
    const tz = cz + Math.cos(yaw) * d * Math.cos(state.camPitch);
    const ty = 2 + d * Math.sin(state.camPitch);
    camTarget.set(cx, 1.6, cz);
    render.camera.position.x += (tx - render.camera.position.x) * Math.min(1, dt * 6);
    render.camera.position.y += (ty - render.camera.position.y) * Math.min(1, dt * 6);
    render.camera.position.z += (tz - render.camera.position.z) * Math.min(1, dt * 6);
    render.camera.lookAt(camTarget);
    render.followShadow(cx, cz);
  }

  // ---- save / load ----
  function save() {
    const p = player.state;
    const data = {
      cash: state.cash, mission: missions.state.index, health: p.health,
      x: p.inCar ? p.inCar.x : p.x, z: p.inCar ? p.inCar.z : p.z,
      timePreset: state.timePreset, wanted: police.state.wanted,
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      state.cash = d.cash ?? CONFIG.START_CASH;
      player.reset(d.x ?? 28, d.z ?? -8);
      player.state.health = d.health ?? 100;
      if (d.timePreset) setTimePreset(d.timePreset);
      return true;
    } catch (e) { return false; }
  }
  function setTimePreset(name) {
    state.timePreset = name;
    const p = render.applyTime(name);
    state.hour = p.hour;
    city.lampHeadMat.emissiveIntensity = name === "night" ? 2.6 : name === "golden" ? 1.2 : 0.25;
  }

  // ---- shooting input (mouse click = shoot toward crosshair ray) ----
  let shooting = false;
  canvas.addEventListener("mousedown", (e) => { if (e.button === 0) shooting = true; });
  window.addEventListener("mouseup", () => { shooting = false; });

  function tryShoot() {
    const p = player.state;
    if (p.inCar || !shooting) return;
    const origin = { x: p.x, z: p.z };
    // aim: 26 m ahead of the player facing
    const aimX = p.x + Math.sin(p.angle) * 26, aimZ = p.z + Math.cos(p.angle) * 26;
    const targets = police.state.officers.map((o) => ({ x: o.x, z: o.z, hp: 100, officer: o }));
    const result = combat.shoot(origin, aimX, aimZ, targets,
      police.heliPosition(),
      () => police.damageHeli());
    if (result === "heli-down") {
      hud.banner("HELICOPTER DOWN", "The spotlight just went dark.");
      state.cash += 200; hud.toast("Heli down — scrap bounty +$200");
    } else if (result === "kill") {
      state.cash += 50;
      hud.toast("Officer down — +$50");
      peds.scare(p.x, p.z, 30);
    } else if (result === "hit" || result === "miss") {
      peds.scare(p.x, p.z, 22);
      // a witness may report the gunfire
      if (Math.random() < 0.5) peds.witnessCrime(p.x, p.z);
    }
    if (result === "empty") hud.toast("Out of ammo — buy more at Iron & Lead");
  }

  // ---- crime hooks ----
  function onEnterCar(car) {
    audio.startRadio();
    audio.setStation(car.station);
    hud.setRadio(audio.station());
    // stealing a car in front of witnesses gets reported (2.5 s delay)
    const seen = peds.witnessCrime(car.x, car.z);
    if (seen) {
      hud.toast("A witness is calling the police…");
      setTimeout(() => { if (police.state.wanted === 0) police.addWanted(1, car.x, car.z); }, CONFIG.WITNESS_DELAY_S * 1000);
    }
    police.breakIdentification();
  }

  let saveTimer = 0;
  function update(dt) {
    if (!state.running || state.paused) return;
    state.gameTime += dt;
    const p = player.state;

    // input edges
    if (input.wasPressed("KeyP")) {
      state.photo = !state.photo;
      hud.setPrompt(state.photo ? "PHOTO MODE — WASD fly, Q/E down/up, H hide HUD, T time, P exit" : "");
    }
    if (input.wasPressed("KeyH")) {
      state.hudHidden = !state.hudHidden;
      document.getElementById("hud").style.display = state.hudHidden ? "none" : "block";
    }
    if (input.wasPressed("KeyT")) {
      const order = ["golden", "night", "noon"];
      setTimePreset(order[(order.indexOf(state.timePreset) + 1) % order.length]);
    }
    if (input.wasPressed("KeyM")) { audio.setMuted(!audio.isMuted()); hud.toast(audio.isMuted() ? "Muted" : "Sound on"); }
    if (input.wasPressed("KeyR") && p.inCar) {
      p.inCar.station = (p.inCar.station + 1) % 3;
      hud.setRadio(audio.setStation(p.inCar.station));
    }
    if (input.wasPressed("Digit1")) { combat.selectWeapon("pistol"); }
    if (input.wasPressed("Digit2")) { combat.selectWeapon("smg"); }
    if (input.wasPressed("Escape")) { state.paused = true; document.getElementById("menu-pause").style.display = "flex"; }

    // One physical E press per frame, shared by player / missions / shops:
    // wasPressed() consumes, so capture it once here and pass it down.
    const ePressed = input.wasPressed("KeyE");

    // player / driving
    if (p.inCar) {
      const car = p.inCar;
      if (car.dead) {
        player.exitCar(vehicles);
        hud.banner("WASTED", "Your car blew up. Riko walks away.");
        p.health = Math.max(10, p.health - 25);
      } else {
        vehicles.drivePlayer(car, input, dt, audio);
        if (ePressed) {
          const left = player.exitCar(vehicles);
          left.isPlayer = false;
          audio.setEngine(0, false);
        }
      }
    } else {
      player.update(input, dt, vehicles, onEnterCar, () => {}, ePressed);
      if (input.wasPressed("KeyF")) {
        const targets = police.state.officers.map((o) => ({ x: o.x, z: o.z, hp: 100 }));
        const r = combat.punch({ x: p.x, z: p.z }, p.angle, targets);
        if (r === "hit" || r === "kill") peds.scare(p.x, p.z, 15);
      }
      tryShoot();
    }

    // shop / interact
    const px = p.inCar ? p.inCar.x : p.x;
    const pz = p.inCar ? p.inCar.z : p.z;
    const prompt = economy2.prompt(px, pz);
    hud.setPrompt(state.shotMode ? "" : state.photo ? hudPromptPhoto() : prompt);
    if (ePressed && prompt && !p.inCar) economy2.interact(px, pz, null);
    else if (ePressed && prompt && p.inCar && prompt.includes("Respray")) economy2.interact(px, pz, p.inCar);
    if (prompt.includes("Iron & Lead")) {
      if (input.wasPressed("Digit1")) economy2.buyAmmo();
      if (input.wasPressed("Digit2")) economy2.buyArmor();
      if (input.wasPressed("Digit3")) economy2.buySmg();
    }

    // systems
    vehicles.updateTraffic(dt, city.trafficLights);
    vehicles.updateTrafficLights(dt);
    const danger = shooting ? { x: px, z: pz, r: 24 } : null;
    peds.update(dt, danger);
    // witness calls that finished -> star rises now
    for (const ped of peds.peds) {
      if (ped.witnessCalled) {
        ped.witnessCalled = false;
        if (police.state.wanted === 0) police.addWanted(1, ped.x, ped.z);
      }
    }
    // line of sight: police see the player if any cruiser/officer is close
    let los = false;
    for (const c of police.state.cruisers) if (dist(c.x, c.z, px, pz) < 55) los = true;
    for (const o of police.state.officers) if (dist(o.x, o.z, px, pz) < 30) los = true;
    if (police.state.heli) los = true;
    const bust = police.update(dt, {
      x: px, z: pz, inCar: !!p.inCar,
      vx: p.inCar ? Math.sin(p.inCar.angle) * p.inCar.speed : 0,
      vz: p.inCar ? Math.cos(p.inCar.angle) * p.inCar.speed : 0,
      damageCar: (n) => { if (p.inCar) p.inCar.damage += n; },
    }, los, audio, particles);
    if (bust === "busted") {
      state.cash = Math.max(0, state.cash - CONFIG.BUST_FINE);
      police.setWanted(0);
      audio.busted();
      hud.banner("BUSTED", `Fine $${CONFIG.BUST_FINE} — Tia bails you out.`);
      player.reset(28, -8);
    }

    missions.update(dt, {
      player, vehicles, police, combat,
      get cash() { return state.cash; }, set cash(v) { state.cash = v; },
      audio, pressedE: ePressed,
      toast: (m) => hud.toast(m), banner: (t, s) => hud.banner(t, s),
      spawnPickup: (x, z, k) => combat.spawnPickup(x, z, k), peds,
    });
    economy2.update(dt, px, pz);
    combat.update(dt, p.inCar ? p.inCar.x : p.x, p.inCar ? p.inCar.z : p.z, (kind) => {
      if (kind === "cash") { state.cash += 100; hud.toast("Cash +$100"); }
      if (kind === "health") { p.health = Math.min(100, p.health + 30); }
      if (kind === "ammo") { combat.state.ammo += 12; }
    });

    // player blob shadow (hidden while driving — the car has its own)
    if (p.inCar) blobs.hide(0);
    else blobs.set(0, p.x, p.z, 1.4, 1.4);

    // ocean foam drift + spire beacon pulse
    city.foamMat.opacity = 0.6 + Math.sin(state.gameTime * 1.4) * 0.15;
    city.spireTop.material.emissiveIntensity = 2.6 + Math.sin(state.gameTime * 3) * 0.8;

    particles.update(dt);
    updateCamera(dt);

    // HUD
    hud.setCash(state.cash);
    hud.setHealth(p.health, p.armor);
    hud.setWanted(police.state.wanted, police.state.searching);
    hud.setObjective(missions.state.objective);
    hud.setSubtitle(missions.state.subtitle);
    hud.setSpeed(p.inCar ? Math.abs(p.inCar.speed) * 3.6 : 0, !!p.inCar);
    hud.setAmmo(combat.state.weapon, combat.state.ammo, combat.state.smgAmmo, combat.state.hasSmg);
    hud.setClock(state.hour);
    hud.setCrosshair(!p.inCar && !state.photo);
    hud.update(dt, state.shotMode);
    hud.drawMinimap(px, pz, p.inCar ? p.inCar.angle : p.angle, police.state,
      missions.state.marker, state.raceMarker, police.heliPosition());

    // autosave
    saveTimer += dt;
    if (saveTimer > 15) { saveTimer = 0; save(); }

    state.debug.drawCalls = render.sceneDrawCalls;
  }

  function hudPromptPhoto() {
    return "PHOTO MODE — WASD fly, Q/E down/up, H hide HUD, T time, P exit";
  }

  setTimePreset("golden");

  return {
    state, render, city, player, vehicles, peds, police, combat, missions, economy: economy2, hud, audio, input, particles,
    start() { state.running = true; state.paused = false; state.shotMode = false; audio.unlock(); audio.startRadio(); },
    pause(v) { state.paused = v; },
    save, load, setTimePreset,
    update, updateCamera,
    tia,
    // Test hooks (used by tools/shots.js, never by the player UI).
    debugInfo() {
      return {
        cash: state.cash, mission: missions.state.index, missionName: missions.currentName(),
        objective: missions.state.objective, wanted: police.state.wanted,
        searching: police.state.searching, drawCalls: state.debug.drawCalls,
        player: { x: player.state.x, z: player.state.z, inCar: !!player.state.inCar },
        cruisers: police.state.cruisers.length, heli: !!police.state.heli,
        peds: peds.peds.length, traffic: vehicles.cars.length,
      };
    },
  };
}
