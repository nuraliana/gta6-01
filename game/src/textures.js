// MARISOL HEAT — textures.js
// One job: every texture is drawn on a 2D canvas at boot — no image files, no
// network. Facade grids (some windows lit warm for golden hour / night),
// neon signage, asphalt with lane dashes, sand, sidewalk, blob shadow.
import * as THREE from "three";

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Facade: window grid on a tinted wall. litFrac windows glow warm amber.
// One atlas texture per district palette keeps buildings to 1 material each.
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
        g.fillStyle = lit ? "#ffc978" : (rng.next() < 0.5 ? "#1d2f45" : "#27394f");
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
export function groundTexture() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const X0 = -312, Z0 = -302, SX = w / 624, SZ = h / 724;
    const X = (x) => (x - X0) * SX, Z = (z) => (z - Z0) * SZ;
    g.fillStyle = "#33363e"; g.fillRect(0, 0, w, h);
    // sidewalk blocks
    g.fillStyle = "#8d8578";
    for (let ix = 0; ix < 9; ix++) for (let iz = 0; iz < 9; iz++) {
      const bx = -252 + ix * 56 + 7, bz = -252 + iz * 56 + 7;
      if (bz + 42 > 252) continue;
      g.fillRect(X(bx), Z(bz), 42 * SX, 42 * SZ);
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
    // sand + foam edge
    g.fillStyle = "#d9b380"; g.fillRect(0, Z(252), w, h - Z(252));
    for (let i = 0; i < 1200; i++) {
      g.fillStyle = Math.random() < 0.5 ? "rgba(255,240,200,0.25)" : "rgba(120,80,40,0.18)";
      g.fillRect(Math.random() * w, Z(252) + Math.random() * (h - Z(252)), 2, 2);
    }
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
