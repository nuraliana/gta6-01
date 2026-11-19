// MARISOL HEAT — textures.js
// One job: every texture is drawn on a 2D canvas at boot — no image files, no
// network. Facade grids (some windows lit warm for golden hour / night),
// neon signage, asphalt with lane dashes, sand, sidewalk, blob shadow.
import * as THREE from "three";
import { makeRng } from "./random.js";

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Facade: window grid on a tinted wall. Lit windows glow in VARIED colours
// (warm amber / cool white-blue / warm yellow / peach, picked by position
// hash so no extra rng is drawn and the city layout never shifts); dark
// windows vary too. One atlas texture per district palette keeps buildings
// to 1 material each.
const LIT_WINDOW_COLORS = ["#ffc978", "#cfe4ff", "#ffe9a8", "#ffb98a"];
const DARK_WINDOW_COLORS = ["#1d2f45", "#27394f", "#141c28"];
export function facadeTexture(base, litFrac, rng) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // subtle vertical grime gradient
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(255,255,255,0.10)");
    grad.addColorStop(1, "rgba(0,0,0,0.28)");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    const cols = 8, rows = 12, cw = w / cols, rh = h / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const lit = rng.next() < litFrac;
        if (lit) {
          g.fillStyle = LIT_WINDOW_COLORS[(x * 5 + y * 11) % LIT_WINDOW_COLORS.length];
        } else {
          // same second rng draw as before (layout-neutral), now picking
          // one of three dark shades instead of two
          g.fillStyle = DARK_WINDOW_COLORS[Math.floor(rng.next() * DARK_WINDOW_COLORS.length)];
        }
        g.fillRect(x * cw + 3, y * rh + 4, cw - 6, rh - 8);
        if (lit) { g.fillStyle = "rgba(255,220,150,0.85)"; g.fillRect(x * cw + 5, y * rh + 6, cw - 10, 2); }
      }
    }
    // rooftop parapet band
    g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(0, 0, w, 6);
  });
}

// Neon sign: glowing text on a dark plate, drawn once, used as emissive map.
export function signTexture(text, color, sub) {
  const t = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = "#0a0a12"; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
    g.font = "bold 52px Arial, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = color; g.shadowBlur = 22;
    g.fillStyle = color;
    g.fillText(text, w / 2, sub ? h / 2 - 14 : h / 2);
    if (sub) {
      g.font = "bold 26px Arial, sans-serif"; g.shadowBlur = 10;
      g.fillText(sub, w / 2, h / 2 + 34);
    }
  });
  return t;
}

// Asphalt: dark with centre dashes + edge lines, tiled along roads.
export function asphaltTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#23262e"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.12)";
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.fillStyle = "#d8c95a";
    g.fillRect(w / 2 - 3, 20, 6, 70); g.fillRect(w / 2 - 3, 150, 6, 70);
    g.fillStyle = "#e8e8e8";
    g.fillRect(6, 0, 4, h); g.fillRect(w - 10, 0, 4, h);
  });
}

export function sidewalkTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#8d8578"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 2;
    g.strokeRect(1, 1, w - 2, h - 2);
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  });
}

// Whole-map ground: base + sidewalk blocks + roads with dashes + sand,
// drawn once on a canvas. One plane, one draw call — replaces 22 road
// strips + the base + the sand plane.
// Sand detail (speckle / dunes / shells) uses its own seeded sub-rng so
// the main city rng stream — and therefore the city layout — never shifts.
export function groundTexture() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const trng = makeRng(7007);
    const X0 = -312, Z0 = -302, SX = w / 624, SZ = h / 724;
    const X = (x) => (x - X0) * SX, Z = (z) => (z - Z0) * SZ;
    g.fillStyle = "#33363e"; g.fillRect(0, 0, w, h);
    // sidewalk blocks: alternating ±8% tone + curb edge line
    for (let ix = 0; ix < 9; ix++) for (let iz = 0; iz < 9; iz++) {
      const bx = -252 + ix * 56 + 7, bz = -252 + iz * 56 + 7;
      if (bz + 42 > 252) continue;
      g.fillStyle = (ix + iz) % 2 === 0 ? "#978f82" : "#837a6d";
      g.fillRect(X(bx), Z(bz), 42 * SX, 42 * SZ);
      g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 2;
      g.strokeRect(X(bx), Z(bz), 42 * SX, 42 * SZ);
    }
    // roads
    g.fillStyle = "#23262e";
    for (let i = 0; i <= 9; i++) {
      const c = -252 + i * 56;
      g.fillRect(X(c - 7), Z(-252), 14 * SX, 504 * SZ);
      g.fillRect(X(-252), Z(c - 7), 504 * SX, 14 * SZ);
    }
    // asphalt grain: speckle only on the road strips (before the dashes,
    // so the lane paint stays readable)
    for (let i = 0; i < 2200; i++) {
      const vertical = trng.next() < 0.5;
      const c = -252 + trng.int(0, 9) * 56;
      const along = trng.range(-252, 252);
      const off = trng.range(-6, 6);
      g.fillStyle = trng.next() < 0.5 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.14)";
      g.fillRect(X(vertical ? c + off : along), Z(vertical ? along : c + off), 2, 2);
    }
    // manholes (fixed spots) + cracks
    for (const [mx, mz] of [[28, 28], [-84, 140]]) {
      g.fillStyle = "#17181c";
      g.beginPath(); g.arc(X(mx), Z(mz), 4.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1;
      g.beginPath(); g.arc(X(mx), Z(mz), 4.5, 0, Math.PI * 2); g.stroke();
    }
    g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1.5;
    for (const [cx, cz] of [[84, -28], [-140, 84]]) {
      g.beginPath(); g.moveTo(X(cx), Z(cz));
      g.lineTo(X(cx + 6), Z(cz + 4)); g.lineTo(X(cx + 3), Z(cz + 11)); g.lineTo(X(cx + 9), Z(cz + 15));
      g.stroke();
    }
    // centre dashes
    g.fillStyle = "#d8c95a";
    for (let i = 0; i <= 9; i++) {
      const c = -252 + i * 56;
      for (let s = -240; s < 250; s += 24) {
        g.fillRect(X(c - 0.4), Z(s), 0.8 * SX, 12 * SZ);
        g.fillRect(X(s), Z(c - 0.4), 12 * SX, 0.8 * SZ);
      }
    }
    // sand + foam edge
    g.fillStyle = "#d9b380"; g.fillRect(0, Z(252), w, h - Z(252));
    // dune patches: soft darker / lighter ellipses
    for (let i = 0; i < 14; i++) {
      const dx = trng.range(0, w), dz = Z(252) + trng.range(0, h - Z(252));
      g.fillStyle = trng.next() < 0.5 ? "rgba(120,80,40,0.10)" : "rgba(255,240,200,0.10)";
      g.beginPath(); g.ellipse(dx, dz, trng.range(18, 60), trng.range(8, 22), 0, 0, Math.PI * 2); g.fill();
    }
    // wet-sand band just above the foam line
    g.fillStyle = "rgba(120,80,40,0.22)"; g.fillRect(0, Z(252), w, 8 * SZ);
    // sand speckle 3,500
    for (let i = 0; i < 3500; i++) {
      g.fillStyle = trng.next() < 0.5 ? "rgba(255,240,200,0.25)" : "rgba(120,80,40,0.18)";
      g.fillRect(trng.range(0, w), Z(252) + trng.range(0, h - Z(252)), 2, 2);
    }
    // shells / pebbles: 140 tiny warm dots
    const SHELLS = ["#fff2e0", "#ffb0a0", "#ffd9a0", "#f2f2f2"];
    for (let i = 0; i < 140; i++) {
      g.fillStyle = SHELLS[trng.int(0, SHELLS.length - 1)];
      g.fillRect(trng.range(0, w), Z(252) + trng.range(0, h - Z(252)), 3, 2);
    }
    // r5 near-camera sand (vista foreground, z 268-332): the 2 px speckle
    // above reads as flat pink from the vista camera — the camera looks
    // along the sand at a grazing angle, so ground detail is foreshortened
    // to almost nothing. The band the camera actually stands on therefore
    // gets its own louder detail: bigger shells, a denser high-contrast
    // speckle cluster, a footprint trail from the camera toward the hero
    // car, and a few stronger dune patches. Appended last, texture only:
    // no layout rng is touched.
    for (let i = 0; i < 40; i++) {
      g.fillStyle = SHELLS[trng.int(0, SHELLS.length - 1)];
      const sx = trng.range(0, w), sz = Z(268) + trng.range(0, (332 - 268) * SZ);
      g.fillRect(sx, sz, trng.range(8, 13), trng.range(5, 8));
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = trng.next() < 0.5 ? "rgba(255,240,200,0.38)" : "rgba(120,80,40,0.30)";
      g.fillRect(trng.range(0, w), Z(268) + trng.range(0, (332 - 268) * SZ), 4, 3);
    }
    for (let i = 0; i < 8; i++) {
      const dx = trng.range(0, w), dz = Z(268) + trng.range(0, (332 - 268) * SZ);
      g.fillStyle = trng.next() < 0.5 ? "rgba(120,80,40,0.16)" : "rgba(255,240,200,0.16)";
      g.beginPath(); g.ellipse(dx, dz, trng.range(30, 70), trng.range(12, 26), 0, 0, Math.PI * 2); g.fill();
    }
    // footprints: paired ovals, camera (30,294) -> hero car (20,304)
    for (let k = 0; k < 12; k++) {
      const t = k / 11;
      const fx = 30 + (20 - 30) * t + trng.range(-0.6, 0.6);
      const fz = 294 + (304 - 294) * t + trng.range(-0.6, 0.6);
      const side = k % 2 === 0 ? -0.5 : 0.5;
      g.fillStyle = "rgba(120,80,40,0.4)";
      g.beginPath(); g.ellipse(X(fx + side), Z(fz), 5, 3, 0.5, 0, Math.PI * 2); g.fill();
    }
    // wet-sand band at the waterline (z 386-398), subtle: the shoreline
    // reads, the horizon stays clean
    g.fillStyle = "rgba(120,80,40,0.14)"; g.fillRect(0, Z(386), w, 12 * SZ);
    g.fillStyle = "rgba(234,246,242,0.9)"; g.fillRect(0, Z(252) - 2, w, 3);
  });
}

export function sandTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#d9b380"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = Math.random() < 0.5 ? "rgba(255,240,200,0.25)" : "rgba(120,80,40,0.18)";
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

// Cafe awning: orange / white vertical stripes.
export function awningTexture() {
  return canvasTex(256, 64, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 === 0 ? "#ff7a2a" : "#fff2e0";
      g.fillRect(i * (w / 8), 0, w / 8, h);
    }
    g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(0, h - 6, w, 6);
  });
}

// Cafe Alba storefront: warm glass, interior shelves with bottles, a door.
// Used as an overlay plane on the cafe's ground floor (the generic 12-row
// facade stays above it).
export function storefrontTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#ffb36b"); grad.addColorStop(1, "#c96a2a");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    // interior shelves with bottles
    g.fillStyle = "rgba(60,30,10,0.55)";
    g.fillRect(20, 92, 300, 8); g.fillRect(20, 150, 300, 8);
    const BOTTLES = ["#2a8a4a", "#d8c95a", "#8a2a2a", "#2a6a8a", "#e8e8e8"];
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < 12; i++) {
        g.fillStyle = BOTTLES[(i * 3 + s * 5) % BOTTLES.length];
        g.fillRect(28 + i * 24, (s === 0 ? 58 : 116), 10, 34);
      }
    }
    // window mullions
    g.fillStyle = "rgba(40,20,8,0.8)";
    for (const mx of [170, 340]) g.fillRect(mx, 0, 10, h);
    // door (right side): dark frame, glass, handle
    g.fillStyle = "#2a1608"; g.fillRect(380, 20, 110, 236);
    g.fillStyle = "#ffcf8a"; g.fillRect(392, 32, 86, 212);
    g.fillStyle = "#2a1608"; g.fillRect(392, 120, 86, 8);
    g.fillStyle = "#ffe14a"; g.beginPath(); g.arc(466, 140, 6, 0, Math.PI * 2); g.fill();
    // fascia band
    g.fillStyle = "rgba(40,20,8,0.85)"; g.fillRect(0, 0, w, 26);
  });
}

// Chalk menu board for Cafe Alba.
export function menuTexture() {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = "#1a1a1a"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#f2ead8"; g.lineWidth = 4; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = "#f2ead8"; g.textAlign = "center";
    g.font = "bold 26px Arial, sans-serif";
    g.fillText("MENU", w / 2, 36);
    g.font = "22px Arial, sans-serif";
    g.fillText("espresso $4", w / 2, 70);
    g.fillText("cortado $5", w / 2, 102);
  });
}

// Warm radial light pool for the ground under a streetlamp (night only).
export function lightPoolTexture() {
  return canvasTex(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, "rgba(255,190,110,0.55)");
    grad.addColorStop(0.6, "rgba(255,170,90,0.22)");
    grad.addColorStop(1, "rgba(255,170,90,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  });
}

export function grassTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#4a7a3a"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = Math.random() < 0.5 ? "rgba(140,200,90,0.3)" : "rgba(20,60,20,0.3)";
      g.fillRect(Math.random() * w, Math.random() * h, 2, 3);
    }
  });
}

// Soft radial blob shadow (1 plane under each car / ped, no shadow-map cost).
export function blobTexture() {
  const t = canvasTex(128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
  return t;
}

// Circular sprite for the pooled particle system (smoke, sparks, muzzle).
export function particleTexture() {
  const t = canvasTex(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.5)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  });
  return t;
}
