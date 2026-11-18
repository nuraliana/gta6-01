// MARISOL HEAT — economy.js
// One job: money has somewhere to go. Quick Coat respray ($250, new paint +
// breaks the police description), Iron & Lead Arms (ammo / armor / SMG),
// Lucky Gull slots ($50 a spin), and a street race side job (checkpoints,
// $400). Each is a real place the player drives to, with a zone + prompt.
import { CONFIG } from "./config.js";
import { dist } from "./util.js";

export function createEconomy(ctx) {
  const P = CONFIG.PLACES;
  const state = {
    raceActive: false, raceNext: 0, raceTimer: 0,
    racePoints: [[-140, -140], [140, -140], [140, 140], [-140, 140], [0, 0]],
    slotsSpinning: false,
  };

  function near(x, z, px, pz, r = 14) { return dist(x, z, px, pz) < r; }

  return {
    state,
    // Returns a prompt string when the player is in a shop zone, else "".
    prompt(px, pz) {
      if (near(P.garage.x, P.garage.z, px, pz)) return "[E] Respray $250 — new paint, lose the heat";
      if (near(P.gunshop.x, P.gunshop.z, px, pz)) return "[1] Ammo $50  [2] Armor $150  [3] SMG $800";
      if (near(P.casino.x, P.casino.z, px, pz)) return "[E] Lucky Gull slots — $50 a spin";
      if (!state.raceActive && near(0, -196, px, pz)) return "[E] Street race — 5 checkpoints, $400";
      return "";
    },
    interact(px, pz, car) {
      if (near(P.garage.x, P.garage.z, px, pz)) {
        if (ctx.cash < CONFIG.RESPRAY_COST) { ctx.toast("Not enough cash for a respray."); return; }
        ctx.cash -= CONFIG.RESPRAY_COST;
        if (car) {
          const colors = [0xc23a2e, 0x2e6ac2, 0xd8c95a, 0x3a8a4a, 0xff7ab0, 0x8a5ad8];
          const nc = colors[Math.floor(Math.random() * colors.length)];
          ctx.vehicles.setCarColor(car, nc);
        }
        ctx.police.breakIdentification();
        ctx.police.setWanted(Math.max(0, ctx.police.state.wanted - 2), {});
        ctx.audio.cash();
        ctx.toast("Respray done — new paint, police description is stale.");
        return;
      }
      if (near(P.casino.x, P.casino.z, px, pz)) {
        if (ctx.cash < CONFIG.SLOTS_COST) { ctx.toast("Not enough cash for the slots."); return; }
        ctx.cash -= CONFIG.SLOTS_COST;
        const roll = Math.random();
        if (roll < 0.12) { ctx.cash += 400; ctx.toast("LUCKY GULL — JACKPOT +$400!"); ctx.audio.missionDone(); }
        else if (roll < 0.4) { ctx.cash += 100; ctx.toast("Slots: small win +$100"); ctx.audio.cash(); }
        else ctx.toast("Slots: nothing. The Gull keeps its feathers.");
        return;
      }
      if (!state.raceActive && near(0, -196, px, pz)) {
        state.raceActive = true; state.raceNext = 0; state.raceTimer = 120;
        ctx.banner("STREET RACE", "5 checkpoints, 120 seconds, $400 on the line.");
        return;
      }
    },
    buyAmmo() {
      if (ctx.cash < CONFIG.AMMO_COST) { ctx.toast("Not enough cash for ammo."); return; }
      ctx.cash -= CONFIG.AMMO_COST; ctx.combat.state.ammo += 24;
      ctx.audio.cash(); ctx.toast("Ammo +24");
    },
    buyArmor() {
      if (ctx.cash < CONFIG.ARMOR_COST) { ctx.toast("Not enough cash for armor."); return; }
      ctx.cash -= CONFIG.ARMOR_COST; ctx.player.state.armor = 100;
      ctx.audio.cash(); ctx.toast("Armor fitted — 100");
    },
    buySmg() {
      if (ctx.combat.state.hasSmg) { ctx.toast("You already own the SMG."); return; }
      if (ctx.cash < CONFIG.SMG_COST) { ctx.toast("SMG costs $800. Save up."); return; }
      ctx.cash -= CONFIG.SMG_COST; ctx.combat.state.hasSmg = true; ctx.combat.state.smgAmmo = 90;
      ctx.audio.cash(); ctx.toast("SMG bought — press 2 to equip");
    },
    update(dt, px, pz) {
      if (!state.raceActive) return;
      state.raceTimer -= dt;
      const pt = state.racePoints[state.raceNext];
      ctx.missionObjective(`Street race — checkpoint ${state.raceNext + 1}/5, ${Math.max(0, Math.ceil(state.raceTimer))}s`);
      ctx.raceMarker(pt[0], pt[1]);
      if (dist(px, pz, pt[0], pt[1]) < 8) {
        state.raceNext++;
        ctx.audio.pickup();
        if (state.raceNext >= state.racePoints.length) {
          state.raceActive = false;
          ctx.cash += CONFIG.RACE_REWARD;
          ctx.toast(`Race won! +$${CONFIG.RACE_REWARD}`);
          ctx.audio.missionDone();
          ctx.raceMarker(null);
        }
      } else if (state.raceTimer <= 0) {
        state.raceActive = false;
        ctx.toast("Race over — too slow. The streets keep their money.");
        ctx.raceMarker(null);
      }
    },
  };
}
