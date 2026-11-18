// Solmar Bay — boot, game loop, camera glue, save/load and the hooks the
// playtest harness reads (window.__world, window.__shotReady).
import { CFG } from './config.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { createWorld, updateWorld } from './world.js';
import { spawnTraffic, spawnParked } from './vehicles.js';
import { spawnPedestrians } from './pedestrians.js';
import { startMission } from './missions.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';
import { applyShot } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 7);
const shotName = params.get('shot');

const canvas = document.getElementById('game');
const input = new Input();
input.attach(canvas);
const audio = new AudioSys();

const W = createWorld(seed);
window.__world = W;
window.__gameErrors = [];
window.addEventListener('error', (e) => window.__gameErrors.push(String(e.message || e.error)));
window.__shotReady = false;

// Traffic, parked cars and pedestrians fill the city.
spawnTraffic(W, 14);
spawnParked(W, 10);
spawnPedestrians(W, 24);

const renderer = new Renderer(W, canvas);
const hud = new Hud(W);

function saveGame() {
  try {
    localStorage.setItem(CFG.SAVE_KEY, JSON.stringify({
      cash: W.cash,
      missionIndex: W.missionIndex,
      missionsDone: W.missionsDone,
      px: W.player.x,
      pz: W.player.z,
      health: W.player.health,
      storyComplete: W.storyComplete,
    }));
  } catch { /* storage may be unavailable */ }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(CFG.SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

const saved = loadSave();
if (saved) {
  W.cash = saved.cash ?? 150;
  W.missionIndex = saved.missionIndex ?? 0;
  W.missionsDone = saved.missionsDone ?? 0;
  W.storyComplete = !!saved.storyComplete;
  W.player.x = saved.px ?? 0;
  W.player.z = saved.pz ?? -14;
  W.player.health = saved.health ?? CFG.PLAYER_HEALTH;
} else {
  W.missionIndex = 0;
  W.missionsDone = 0;
}

function startPlaying() {
  audio.ensure();
  if (!W.mission) startMission(W, W.storyComplete ? 0 : W.missionIndex);
  W.state = 'playing';
  hud.showMenu(null);
  hud.showBanner('Solmar Bay', 'Jax Moreno owes Tia Sol one last favour.');
}

function resumeFromBusted() {
  const P = W.city.places.hospital;
  W.player.health = CFG.PLAYER_HEALTH;
  W.player.x = P.x;
  W.player.z = P.z;
  W.player.inCar = false;
  W.player.car = null;
  W.wanted = 0;
  W.cash = Math.max(0, W.cash - 200);
  W.state = 'playing';
  hud.showMenu(null);
  hud.showToast('Patched up at Solmar Clinic — $200 lighter.');
}

function bindMenus() {
  const on = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };
  on('btn-start', () => { localStorage.removeItem(CFG.SAVE_KEY); startPlaying(); });
  on('btn-continue', () => startPlaying());
  on('btn-resume', () => { W.state = 'playing'; hud.showMenu(null); });
  on('btn-restart', () => { localStorage.removeItem(CFG.SAVE_KEY); location.reload(); });
  on('btn-busted', () => resumeFromBusted());
  on('btn-continue-free', () => { W.state = 'playing'; hud.showMenu(null); });
  on('btn-again', () => { localStorage.removeItem(CFG.SAVE_KEY); location.reload(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && W.state === 'playing') {
      W.state = 'paused';
      hud.showMenu('menu-pause');
      saveGame();
    } else if (e.key === 'Escape' && W.state === 'paused') {
      W.state = 'playing';
      hud.showMenu(null);
    }
    if (e.key.toLowerCase() === 'm') {
      audio.setMuted(!audio.muted);
      hud.showToast(audio.muted ? 'Sound muted' : 'Sound on');
    }
  });
  // Any first click also unlocks audio.
  canvas.addEventListener('mousedown', () => audio.ensure(), { once: true });
}
bindMenus();

// Shot scenes: stage the world, run it a little, then flag ready.
let shotSettle = 0;
if (shotName) {
  W.shotMode = true;
  applyShot(W, shotName);
  hud.showMenu(null);
  // No mission banner or wanted toast in the shot: the HUD already shows
  // the objective and the stars, and the frame stays clean.
  hud.lastMission = W.missionIndex;
  hud.lastWanted = W.wanted;
  shotSettle = 2.2; // cops still near the player, car already at speed
} else if (saved) {
  document.getElementById('btn-continue').classList.remove('hidden');
  document.getElementById('menu-start-title').textContent = 'Welcome back to Solmar Bay';
  hud.showMenu('menu-start');
} else {
  hud.showMenu('menu-start');
}

let last = performance.now();
let saveTimer = 0;
let eventCursor = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;

  if (W.state === 'playing') {
    updateWorld(W, dt, input, audio);
    audio.update(dt);
    const speed01 = W.player.inCar && W.player.car
      ? Math.abs(W.player.car.speed) / CFG.CAR_TOP_SPEED
      : 0;
    audio.engine(speed01, W.player.inCar);

    // Drain one-frame events into toasts and saves.
    for (let i = eventCursor; i < W.events.length; i++) {
      const ev = W.events[i];
      if (ev === 'mission-complete') {
        hud.showBanner('Mission complete', `+$${[300, 500, 700, 800, 1000, 5000][W.missionsDone - 1] || ''} — nice work, Jax.`);
        saveGame();
      } else if (ev === 'mission-failed') {
        hud.showToast('Too slow — the delivery failed. Try again!');
      } else if (ev === 'stole-car') {
        hud.showToast('Car stolen — the PD noticed.');
      } else if (ev === 'busted') {
        audio.busted();
        saveGame();
        hud.showMenu('menu-busted');
      } else if (ev === 'story-complete') {
        hud.showMenu('menu-complete');
        document.getElementById('menu-complete-cash').textContent = `$${W.cash.toLocaleString('en-US')}`;
        saveGame();
      }
    }
    eventCursor = W.events.length;

    saveTimer += dt;
    if (saveTimer > 15) { saveTimer = 0; saveGame(); }
  }

  if (W.state !== 'menu') {
    renderer.sync(W, dt);
    if (W.state === 'playing') hud.update(dt);
  }

  if (shotName && !window.__shotReady) {
    shotSettle -= dt;
    if (shotSettle <= 0) window.__shotReady = true;
  }
}
requestAnimationFrame(frame);
