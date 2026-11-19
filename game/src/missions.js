// MARISOL HEAT — missions.js
// One job: the 6-mission story of Riko Vale and Tia Sol. Every mission ends
// at a REAL place with a REAL building and sign — Cafe Alba has Tia standing
// outside it, Bay Trust Bank has columns and a vault door, the pier is a
// pier. No mission is "walk to an empty coordinate": each step names a
// person or a building the player can see.
import * as THREE from "three";
import { CONFIG } from "./config.js";
import { dist } from "./util.js";

export function createMissions(scene, city, tia) {
  // Mission marker: a golden beacon column + spinning diamond, visible across
  // the district so the player navigates by the world, not only the minimap.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc21a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
  );
  beacon.visible = false;
  scene.add(beacon);
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: 0xffc21a }));
  diamond.visible = false;
  scene.add(diamond);

  const P = CONFIG.PLACES;
  const state = {
    index: 0, step: 0, done: false, allDone: false,
    objective: "", subtitle: "", timer: 0, suppressBeacon: false,
    marker: { x: 0, z: 0, visible: false },
    drops: [], targetCar: null, vaultTaken: false,
  };

  const DIALOG = {
    m1: [
      "TIA: Riko! You actually came. The Bay Trust job needs a driver, not a hero.",
      "TIA: First, prove you can move in this city. Borrow a coupe — any coupe — and bring it to Quick Coat.",
      "RIKO: Borrow. Right. Nobody says steal anymore.",
    ],
    m3: [
      "TIA: Sunset package, Port to Pier. Ninety seconds. The tide waits for no one.",
    ],
    m6: [
      "TIA: Vault's open. Grab it, run for the pier, and do NOT stop for the view.",
      "RIKO: Three stars and a sunset. This is why I came back to Marisol.",
    ],
  };

  function setObjective(text, x, z, sub = "") {
    state.objective = text;
    state.subtitle = sub;
    if (x !== undefined) {
      state.marker = { x, z, visible: true };
      beacon.position.set(x, 30, z);
      diamond.position.set(x, 8, z);
      beacon.visible = !state.suppressBeacon; diamond.visible = !state.suppressBeacon;
    }
  }
  function clearMarker() {
    state.marker.visible = false;
    beacon.visible = false; diamond.visible = false;
  }

  function startMission(i) {
    state.index = i; state.step = 0;
    if (i === 0) setObjective("Meet Tia Sol at Cafe Alba", P.cafeAlba.x, P.cafeAlba.z - 14, "Cafe Alba — follow the orange awning");
    else if (i === 1) setObjective("Steal a coupe — any coupe (E)", 84, -140, "Tia wants a fast car. Borrow one.");
    else if (i === 2) {
      state.timer = 90;
      setObjective("Pick up the package at the Port", -196, 84, "90 seconds on the clock");
    }
    else if (i === 3) setObjective("Reach 2 stars — exposure builds heat the longer you stay visible", 0, 0, "Stay visible too long and a witness phones it in after 20 seconds");
    else if (i === 4) {
      state.drops = [
        [-140, -140], [140, 140], [-84, 196], [196, -28], [0, 84],
      ];
      setObjective("Collect the cash drops (0/5)", state.drops[0][0], state.drops[0][1], "Five envelopes, five corners of Marisol");
    }
    else if (i === 5) setObjective("Hit Bay Trust Bank — reach the vault door", P.bank.x, P.bank.z - 12, "The big one. Bring a fast car.");
  }

  function completeMission(ctx) {
    const reward = CONFIG.MISSIONS[state.index].reward;
    ctx.cash += reward;
    ctx.audio.missionDone();
    ctx.toast(`Mission complete: ${CONFIG.MISSIONS[state.index].name}  +$${reward}`);
    clearMarker();
    if (state.index >= CONFIG.MISSIONS.length - 1) {
      state.allDone = true;
      state.objective = "All missions complete — Marisol is yours. Free roam, races, slots.";
      ctx.banner("THE MARISOL SCORE — DONE", "Riko Vale owns this city now.");
    } else {
      startMission(state.index + 1);
    }
  }

  startMission(0);

  return {
    state, beacon, diamond,
    currentName() { return CONFIG.MISSIONS[state.index].name; },
    // ctx: {player, vehicles, police, combat, cash, audio, toast, banner, spawnPickup, peds}
    update(dt, ctx) {
      if (state.allDone) return;
      const p = ctx.player.state;
      const px = p.inCar ? p.inCar.x : p.x;
      const pz = p.inCar ? p.inCar.z : p.z;
      diamond.rotation.y += dt * 2;
      diamond.position.y = 8 + Math.sin(performance.now() / 400) * 0.6;

      const i = state.index;
      if (i === 0) {
        if (state.step === 0 && dist(px, pz, P.cafeAlba.x, P.cafeAlba.z - 14) < 4) {
          state.step = 1;
          state.subtitle = DIALOG.m1[0];
          ctx.banner("Coffee with Tia", "Tia Sol is waiting by the tables.");
          setObjective("Talk to Tia (press E near her)", tia.position.x, tia.position.z);
        } else if (state.step === 1 && dist(px, pz, tia.position.x, tia.position.z) < 3.5) {
          if (ctx.pressedE) {
            state.subtitle = DIALOG.m1[1];
            completeMission(ctx);
          }
        }
      } else if (i === 1) {
        if (state.step === 0 && p.inCar && p.inCar.type.name === "Coupe") {
          state.step = 1;
          state.targetCar = p.inCar;
          setObjective("Deliver the coupe to Quick Coat Garage", P.garage.x, P.garage.z, "Don't scratch it. Much.");
        } else if (state.step === 1 && p.inCar === state.targetCar && dist(px, pz, P.garage.x, P.garage.z) < 10) {
          completeMission(ctx);
        }
      } else if (i === 2) {
        state.timer -= dt;
        state.objective = `Deliver the package to the pier — ${Math.max(0, Math.ceil(state.timer))}s left`;
        if (state.step === 0 && dist(px, pz, -196, 84) < 8) {
          state.step = 1;
          state.subtitle = DIALOG.m3[0];
          setObjective("Package aboard — reach Marisol Pier!", P.pier.x, P.pier.z);
        } else if (state.step === 1 && dist(px, pz, P.pier.x, P.pier.z) < 10) {
          completeMission(ctx);
        } else if (state.timer <= 0) {
          state.timer = 90; state.step = 0;
          ctx.toast("Delivery failed — the tide waited for no one. Try again.");
          setObjective("Pick up the package at the Port", -196, 84, "90 seconds on the clock");
        }
      } else if (i === 3) {
        if (state.step === 0) {
          if (ctx.police.state.wanted >= 2) {
            state.step = 1;
            setObjective("LOSE the heat — get to 0 stars", P.garage.x, P.garage.z, "Respray at Quick Coat ($250) clears your description fast");
          } else {
            setObjective("Reach 2 stars — exposure builds heat the longer you stay visible", 0, 0, "Keep yourself in plain sight and a witness will call the police after 20 seconds");
            // nudge: after 20 s with no heat, a witness reports the player anyway
            state.nudge = (state.nudge || 0) + dt;
            if (state.nudge > 20) { ctx.police.addWanted(2, px, pz); state.nudge = 0; }
          }
        } else if (ctx.police.state.wanted === 0) {
          completeMission(ctx);
        }
      } else if (i === 4) {
        const remaining = state.drops.length;
        if (remaining === 0) { completeMission(ctx); return; }
        const [dx, dz] = state.drops[0];
        state.objective = `Collect the cash drops (${5 - remaining}/5)`;
        setObjective(state.objective, dx, dz);
        if (dist(px, pz, dx, dz) < 4) {
          state.drops.shift();
          ctx.cash += 100;
          ctx.audio.cash();
          ctx.toast("Cash drop +$100");
          if (state.drops.length === 0) completeMission(ctx);
        }
      } else if (i === 5) {
        if (state.step === 0 && dist(px, pz, P.bank.x, P.bank.z - 12) < 5) {
          state.step = 1;
          state.vaultTaken = true;
          ctx.cash += 500;
          ctx.police.setWanted(3, { x: px, z: pz });
          state.subtitle = DIALOG.m6[0];
          ctx.banner("THE MARISOL SCORE", "Vault cash grabbed — reach the pier to escape!");
          setObjective("Escape to Marisol Pier — 3 stars!", P.pier.x, P.pier.z);
        } else if (state.step === 1 && dist(px, pz, P.pier.x, P.pier.z) < 10) {
          state.subtitle = DIALOG.m6[1];
          completeMission(ctx);
        }
      }
    },
  };
}
