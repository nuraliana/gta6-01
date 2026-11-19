// MARISOL HEAT — textures.js
// One job: every texture is drawn on a 2D canvas at boot — no image files, no
// network. Facade grids (some windows lit warm for golden hour / night),
// neon signage, asphalt with lane dashes, sand, sidewalk, blob shadow.
import * as THREE from "three";
import { makeRng } from "./random.js";

// Lighten (>1) or darken (<1) a hex colour by a factor.
function shadeHex(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const gg = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${gg},${b})`;
}

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Facade: window grid on a tinted wall. Lit windows glow in four warm/cool
// tones, dark windows in four deep tones — picked per window from a palette.
const LIT_WINDOWS = ["#ffc978", "#ffd98a", "#cfe4ff", "#ffb08a"];
const DARK_WINDOWS = ["#1d2f45", "#27394f", "#16222e", "#2e3a2a"];
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
        g.fillStyle = lit ? rng.pick(LIT_WINDOWS) : rng.pick(DARK_WINDOWS);
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
// strips + the base + the sand plane. Takes the seeded world rng so every
// grain, dune and shell lands in the same place on every run; the extra
// sand detail runs on its own seeded stream (707) so the main stream is
// untouched by it.
export function groundTexture(rng) {
  return canvasTex(1024, 1024, (g, w, h) => {
    const X0 = -312, Z0 = -302, SX = w / 624, SZ = h / 724;
    const X = (x) => (x - X0) * SX, Z = (z) => (z - Z0) * SZ;
    g.fillStyle = "#33363e"; g.fillRect(0, 0, w, h);
    // sidewalk blocks: checkerboard tone (+/-8%), dark curb rim, faint
    // mid-block slab seams (one vertical, one horizontal per block)
    for (let ix = 0; ix < 9; ix++) for (let iz = 0; iz < 9; iz++) {
      const bx = -252 + ix * 56 + 7, bz = -252 + iz * 56 + 7;
      if (bz + 42 > 252) continue;
      const tone = (ix + iz) % 2 === 0 ? 1.08 : 0.92;
      g.fillStyle = shadeHex("#8d8578", tone);
      g.fillRect(X(bx), Z(bz), 42 * SX, 42 * SZ);
      g.strokeStyle = "rgba(0,0,0,0.45)"; g.lineWidth = 2;
      g.strokeRect(X(bx) + 1, Z(bz) + 1, 42 * SX - 2, 42 * SZ - 2);
      g.strokeStyle = "rgba(0,0,0,0.18)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(X(bx + 21), Z(bz)); g.lineTo(X(bx + 21), Z(bz + 42)); g.stroke();
      g.beginPath(); g.moveTo(X(bx), Z(bz + 21)); g.lineTo(X(bx + 42), Z(bz + 21)); g.stroke();
    }
    // roads
    g.fillStyle = "#23262e";
    for (let i = 0; i <= 9; i++) {
      const c = -252 + i * 56;
      g.fillRect(X(c - 7), Z(-252), 14 * SX, 504 * SZ);
      g.fillRect(X(-252), Z(c - 7), 504 * SX, 14 * SZ);
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
    // asphalt grain: 2200 specks, half light half dark, on the roads
    for (let i = 0; i < 2200; i++) {
      const vertical = rng.next() < 0.5;
      const c = -252 + rng.int(0, 9) * 56;
      const along = rng.range(-252, 252);
      const gx = vertical ? c + rng.range(-6, 6) : along;
      const gz = vertical ? along : c + rng.range(-6, 6);
      g.fillStyle = rng.next() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.12)";
      g.fillRect(X(gx), Z(gz), 2, 2);
    }
    // manholes: dark disc + thin bright rim
    for (const [mx, mz] of [[0, 0], [140, -84]]) {
      g.beginPath(); g.arc(X(mx), Z(mz), 5 * SX, 0, Math.PI * 2);
      g.fillStyle = "#17191d"; g.fill();
      g.strokeStyle = "rgba(255,255,255,0.28)"; g.lineWidth = 1; g.stroke();
    }
    // cracks: jagged dark 3-segment lines
    for (const [cx, cz] of [[-140, 84], [84, -140]]) {
      g.strokeStyle = "rgba(0,0,0,0.4)"; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(X(cx), Z(cz));
      let px = cx, pz = cz;
      for (let s = 0; s < 3; s++) {
        px += rng.range(2, 5) * (s % 2 === 0 ? 1 : -1);
        pz += rng.range(2, 5);
        g.lineTo(X(px), Z(pz));
      }
      g.stroke();
    }
    // sand + foam edge
    g.fillStyle = "#d9b380"; g.fillRect(0, Z(252), w, h - Z(252));
    // wet-sand band just landward of the foam line
    g.fillStyle = "rgba(120,80,40,0.30)"; g.fillRect(0, Z(252) - 12, w, 12);
    function dune(r, x0, x1, z0, z1) {
      const cx = r.range(x0, x1), cz = r.range(z0, z1);
      const rx = r.range(7, 20), ry = r.range(2.5, 6.5);
      g.beginPath(); g.ellipse(X(cx), Z(cz), rx * SX, ry * SZ, 0, 0, Math.PI * 2);
      g.fillStyle = r.next() < 0.5 ? "rgba(120,80,40,0.12)" : "rgba(255,240,200,0.14)";
      g.fill();
    }
    function speckle(r, n, z0, z1) {
      for (let i = 0; i < n; i++) {
        g.fillStyle = r.next() < 0.5 ? "rgba(255,240,200,0.25)" : "rgba(120,80,40,0.18)";
        g.fillRect(X(r.range(-312, 312)), Z(r.range(z0, z1)), 2, 2);
      }
    }
    function shells(r, n, size) {
      for (let i = 0; i < n; i++) {
        g.fillStyle = r.next() < 0.75 ? "rgba(255,250,240,0.9)" : "rgba(255,180,180,0.9)";
        g.fillRect(X(r.range(-312, 312)), Z(r.range(254, 420)), size, size);
      }
    }
    for (let i = 0; i < 14; i++) dune(rng, -300, 300, 258, 360);
    speckle(rng, 3500, 254, 420);
    shells(rng, 140, 2);
    // extra sand detail on its own seeded stream (707): more dunes,
    // more speckle, big shells, footprints wandering toward the hero car,
    // and a wet band in the vista foreground strip (world z 290-300).
    const xr = makeRng(707);
    for (let i = 0; i < 8; i++) dune(xr, -300, 300, 258, 360);
    speckle(xr, 900, 254, 420);
    shells(xr, 40, 3);
    g.fillStyle = "rgba(120,80,40,0.28)";
    g.fillRect(0, Z(290), w, (300 - 290) * SZ);
    {
      let fx = 30, fz = 292;
      const tx = 20, tz = 304;
      for (let pair = 0; pair < 12; pair++) {
        const dx = tx - fx, dz = tz - fz;
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len, uz = dz / len;
        const px = -uz, pz = ux; // perpendicular
        for (let side = -1; side <= 1; side += 2) {
          const sx = fx + px * 0.45 * side + ux * 0.42;
          const sz = fz + pz * 0.45 * side + uz * 0.42;
          g.beginPath();
          g.ellipse(X(sx), Z(sz), 1.6, 2.6, Math.atan2(ux, uz), 0, Math.PI * 2);
          g.fillStyle = "rgba(90,60,30,0.45)"; g.fill();
        }
        fx += ux * 0.85 + px * xr.range(-0.3, 0.3);
        fz += uz * 0.85 + pz * xr.range(-0.3, 0.3);
      }
    }
    g.fillStyle = "rgba(234,246,242,0.9)"; g.fillRect(0, Z(252) - 2, w, 3);
  });
}

// Cafe Alba storefront: warm plaster, dark band on top, glowing interior
// (orange fading down to dark brown), two big glass panels with frames,
// a door on the right (darker glass + bright handle), a shelf with cup
// silhouettes inside, and a menu board above the glass.
export function cafeStorefrontTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = "#f2c29b"; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(0, 0, w, 22);
    // interior glow behind the glass
    const glow = g.createLinearGradient(0, 40, 0, 220);
    glow.addColorStop(0, "#ffb35c");
    glow.addColorStop(0.55, "#c96a2e");
    glow.addColorStop(1, "#4a2410");
    g.fillStyle = glow; g.fillRect(24, 60, 340, 160);
    // menu board above the glass
    g.fillStyle = "#2a1a12"; g.fillRect(24, 26, 340, 30);
    g.fillStyle = "#ffd9a0"; g.font = "bold 17px Arial, sans-serif"; g.textAlign = "left"; g.textBaseline = "middle";
    const menuLine = "espresso $4   cortado $5   open late";
    g.fillText(menuLine, 34, 41);
    // glass frames: two panels + door on the right
    g.strokeStyle = "#3a2418"; g.lineWidth = 8;
    g.strokeRect(24, 60, 164, 160);
    g.strokeRect(196, 60, 168, 160);
    g.strokeRect(376, 60, 112, 160);
    // door glass darker + bright handle
    g.fillStyle = "rgba(20,10,6,0.45)"; g.fillRect(380, 64, 104, 152);
    g.fillStyle = "#ffd9a0"; g.fillRect(470, 130, 6, 26);
    // shelf + cup silhouettes inside the glass
    g.fillStyle = "rgba(40,20,10,0.85)"; g.fillRect(40, 150, 300, 6);
    for (let i = 0; i < 6; i++) {
      const cx = 56 + i * 48;
      g.fillRect(cx, 128, 18, 22);
      g.fillRect(cx + 18, 134, 6, 8);
    }
    // warm light spill on the plaster
    g.fillStyle = "rgba(255,180,90,0.18)"; g.fillRect(0, 220, w, 36);
  });
}

// Awning: 8 alternating orange / cream vertical bands, darker bottom edge.
export function awningTexture() {
  return canvasTex(256, 128, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 === 0 ? "#ff7a2a" : "#f6ead6";
      g.fillRect((i * w) / 8, 0, w / 8 + 1, h);
    }
    g.fillStyle = "rgba(0,0,0,0.30)"; g.fillRect(0, h - 14, w, 14);
  });
}

// Light pool: warm radial glow fading to transparent on a clear canvas.
export function lightPoolTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    grad.addColorStop(0, "rgba(255,190,110,0.85)");
    grad.addColorStop(0.5, "rgba(255,190,110,0.30)");
    grad.addColorStop(1, "rgba(255,190,110,0)");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
}

// A-board menu: dark chalk board, bright frame, cafe name + prices + today line.
export function aboardTexture() {
  return canvasTex(256, 384, (g, w, h) => {
    g.fillStyle = "#f6ead6"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#1c1c26"; g.fillRect(10, 10, w - 20, h - 20);
    g.fillStyle = "#f6ead6"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "bold 30px Arial, sans-serif";
    g.fillText("CAFE ALBA", w / 2, 52);
    g.font = "24px Arial, sans-serif";
    const espressoLine = "espresso $4";
    g.fillText(espressoLine, w / 2, 120);
    const cortadoLine = "cortado $5";
    g.fillText(cortadoLine, w / 2, 160);
    const lateLine = "open late";
    g.fillText(lateLine, w / 2, 200);
    g.strokeStyle = "#ff7a2a"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(40, 250); g.lineTo(w - 40, 250); g.stroke();
    g.fillStyle = "#ff7a2a"; g.font = "bold 24px Arial, sans-serif";
    g.fillText("— TODAY —", w / 2, 290);
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
