// MARISOL HEAT — hud.js
// One job: everything the player reads. Cash, health + armor, wanted stars
// (full vs HOLLOW + SEARCHING when the police lost you), objective, speed,
// ammo, radio station, clock, and a LIVE minimap (roads, player arrow,
// police dots, helicopter, mission diamond, district names). Lean layout:
// corners for persistent info, bottom-centre for the objective, centre for
// the crosshair only while aiming.
import { CONFIG } from "./config.js";
import { fmtClock, fmtCash } from "./util.js";

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    cash: $("hud-cash"), health: $("hud-health"), armor: $("hud-armor"),
    stars: $("hud-stars"), wantedLabel: $("hud-wanted-label"),
    objective: $("hud-objective"), subtitle: $("hud-subtitle"),
    speed: $("hud-speed"), ammo: $("hud-ammo"), radio: $("hud-radio"),
    clock: $("hud-clock"), banner: $("hud-banner"), bannerTitle: $("hud-banner-title"),
    bannerSub: $("hud-banner-sub"), toast: $("hud-toast"), prompt: $("hud-prompt"),
    crosshair: $("hud-crosshair"), minimap: $("hud-minimap"),
  };
  const mm = els.minimap.getContext("2d");
  let bannerTimer = 0, toastTimer = 0;

  function starHtml(wanted, searching) {
    let s = "";
    for (let i = 1; i <= 5; i++) {
      if (i <= wanted) s += searching ? '<span class="star hollow">☆</span>' : '<span class="star">★</span>';
      else s += '<span class="star empty">☆</span>';
    }
    return s;
  }

  return {
    setCash(c) { els.cash.textContent = fmtCash(c); },
    setHealth(h, armor) {
      els.health.style.width = Math.max(0, h) + "%";
      els.armor.style.width = Math.max(0, armor) + "%";
    },
    setWanted(wanted, searching) {
      els.stars.innerHTML = starHtml(wanted, searching);
      els.wantedLabel.textContent = wanted === 0 ? "" : searching ? "SEARCHING…" : CONFIG.ESCALATION[wanted];
      els.wantedLabel.classList.toggle("searching", searching);
    },
    setObjective(t) { els.objective.textContent = t; },
    setSubtitle(t) { els.subtitle.textContent = t; },
    setSpeed(kmh, inCar) { els.speed.textContent = inCar ? Math.round(kmh) + " km/h" : ""; },
    setAmmo(weapon, ammo, smgAmmo, hasSmg) {
      els.ammo.textContent = weapon === "smg" ? `SMG ${smgAmmo}` : `PISTOL ${ammo}` + (hasSmg ? "  [2] SMG" : "");
    },
    setRadio(name) { els.radio.textContent = "♪ " + name; },
    setClock(hour) { els.clock.textContent = fmtClock(hour); },
    setPrompt(t) { els.prompt.textContent = t; els.prompt.style.display = t ? "block" : "none"; },
    setCrosshair(on) { els.crosshair.style.display = on ? "block" : "none"; },
    banner(title, sub) {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub || "";
      els.banner.style.display = "block";
      bannerTimer = 3.2;
    },
    toast(msg) {
      els.toast.textContent = msg;
      els.toast.style.display = "block";
      toastTimer = 3;
    },
    update(dt, shotMode) {
      if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) els.banner.style.display = "none"; }
      // staged shots: no big banner text over the frame
      if (shotMode) els.banner.style.display = "none";
      if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) els.toast.style.display = "none"; }
    },
    // Live minimap: 170x170, city +/-252 m -> scale. Roads, districts, dots.
    drawMinimap(px, pz, angle, police, missionMarker, raceMarker, heliPos) {
      const S = 170, HALF = 252, sc = S / (HALF * 2 + 60);
      const toX = (x) => S / 2 + (x - 0) * sc;
      const toY = (z) => S / 2 + (z - 40) * sc;
      mm.clearRect(0, 0, S, S);
      mm.fillStyle = "rgba(10,12,20,0.82)";
      mm.fillRect(0, 0, S, S);
      // district tints
      mm.fillStyle = "rgba(46,74,102,0.5)"; mm.fillRect(toX(-130), toY(-214), 260 * sc, 260 * sc);
      mm.fillStyle = "rgba(232,168,124,0.4)"; mm.fillRect(toX(-130), toY(86), 260 * sc, 130 * sc);
      // roads
      mm.strokeStyle = "rgba(200,200,210,0.55)"; mm.lineWidth = 1.5;
      for (let i = 0; i <= 9; i++) {
        const c = -252 + i * 56;
        mm.beginPath(); mm.moveTo(toX(c), toY(-252)); mm.lineTo(toX(c), toY(300)); mm.stroke();
        mm.beginPath(); mm.moveTo(toX(-252), toY(c)); mm.lineTo(toX(252), toY(c)); mm.stroke();
      }
      // beach + sea
      mm.fillStyle = "rgba(217,179,128,0.7)"; mm.fillRect(0, toY(252), S, toY(330) - toY(252));
      mm.fillStyle = "rgba(14,106,114,0.8)"; mm.fillRect(0, toY(330), S, S - toY(330));
      // district labels
      mm.fillStyle = "rgba(255,255,255,0.65)"; mm.font = "8px Arial";
      mm.fillText("DOWNTOWN", toX(-60), toY(-150));
      mm.fillText("BEACH", toX(-20), toY(280));
      mm.fillText("PORT", toX(-230), toY(60));
      // mission diamond
      if (missionMarker && missionMarker.visible) {
        mm.fillStyle = "#ffc21a";
        const mx = toX(missionMarker.x), my = toY(missionMarker.z);
        mm.beginPath(); mm.moveTo(mx, my - 5); mm.lineTo(mx + 5, my); mm.lineTo(mx, my + 5); mm.lineTo(mx - 5, my); mm.fill();
      }
      if (raceMarker) {
        mm.fillStyle = "#2aff5a";
        mm.beginPath(); mm.arc(toX(raceMarker[0]), toY(raceMarker[1]), 4, 0, 7); mm.fill();
      }
      // police: blue dots, heli as a circle
      mm.fillStyle = "#4a9aff";
      for (const c of police.cruisers) { mm.beginPath(); mm.arc(toX(c.x), toY(c.z), 3, 0, 7); mm.fill(); }
      if (heliPos) {
        mm.strokeStyle = "#4a9aff"; mm.lineWidth = 2;
        mm.beginPath(); mm.arc(toX(heliPos.x), toY(heliPos.z), 5, 0, 7); mm.stroke();
      }
      // player arrow
      mm.save();
      mm.translate(toX(px), toY(pz));
      mm.rotate(Math.atan2(Math.sin(angle), Math.cos(angle)) + Math.PI);
      mm.fillStyle = "#ffb020";
      mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(5, 5); mm.lineTo(-5, 5); mm.closePath(); mm.fill();
      mm.restore();
    },
  };
}
