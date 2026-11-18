// Solmar Bay — the HUD: cash, health, wanted stars, objective line, speed,
// ammo, the live minimap, banners and the start/pause/busted menus. All DOM,
// no canvas except the minimap.
import { CFG } from './config.js';
import { currentObjective } from './missions.js';

export class Hud {
  constructor(W) {
    this.W = W;
    this.el = {};
    for (const id of ['hud-cash', 'hud-health-fill', 'hud-stars', 'hud-objective',
      'hud-speed', 'hud-ammo', 'hud-mission', 'banner', 'toast', 'minimap',
      'menu-start', 'menu-pause', 'menu-busted', 'menu-complete',
      'menu-start-title', 'menu-complete-cash', 'hud-time']) {
      this.el[id] = document.getElementById(id);
    }
    this.map = this.el['minimap'].getContext('2d');
    this.bannerTimer = 0;
    this.toastTimer = 0;
    this.lastMission = -1;
    this.lastWanted = 0;
  }

  showBanner(text, sub = '') {
    this.el['banner'].innerHTML = `<div class="banner-title">${text}</div><div class="banner-sub">${sub}</div>`;
    this.el['banner'].classList.add('show');
    this.bannerTimer = 3.2;
  }

  showToast(text) {
    if (this.W.shotMode) return; // screenshots stay clean
    this.el['toast'].textContent = text;
    this.el['toast'].classList.add('show');
    this.toastTimer = 2.4;
  }

  showMenu(name) {
    for (const m of ['menu-start', 'menu-pause', 'menu-busted', 'menu-complete']) {
      this.el[m].classList.toggle('hidden', m !== name);
    }
    if (name) document.getElementById('hud').classList.add('dim');
    else document.getElementById('hud').classList.remove('dim');
  }

  update(dt) {
    const W = this.W;
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el['banner'].classList.remove('show');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el['toast'].classList.remove('show');
    }
    // Mission banner on change.
    if (W.missionIndex !== this.lastMission && W.state === 'playing') {
      this.lastMission = W.missionIndex;
      const m = W.mission;
      if (m) {
        const def = { title: '', brief: '' };
        const titles = [
          ['Coffee with Tia', 'Meet Tia Sol at Cafe Alba — follow the yellow marker.'],
          ['Borrow a Coupe', 'Steal the gold coupe by Palm Court, park it at Marina Garage.'],
          ['Sunset Delivery', 'Deliver the package to the end of Solmar Pier — 90 seconds!'],
          ['Lose the Heat', 'Three stars. Break line of sight and let the heat fade.'],
          ['Cash Drops', 'Five envelopes hidden around the city. Collect them all.'],
          ['The Solmar Score', 'Hit Bay Trust Bank, grab the vault cash, reach the pier.'],
        ];
        const t = titles[W.missionIndex] || ['Free Roam', ''];
        this.showBanner(t[0], t[1]);
      }
    }
    if (W.wanted !== this.lastWanted) {
      this.lastWanted = W.wanted;
      if (W.wanted > 0) this.showToast(`Wanted level ${W.wanted} — the Solmar PD is on you!`);
    }

    // Cash, health, stars, ammo, speed.
    this.el['hud-cash'].textContent = `$${W.cash.toLocaleString('en-US')}`;
    this.el['hud-health-fill'].style.width = `${W.player.health}%`;
    this.el['hud-health-fill'].style.background = W.player.health > 50 ? '#58c96b' : W.player.health > 25 ? '#f2c230' : '#d94f3d';
    this.el['hud-stars'].textContent = '★'.repeat(W.wanted) + '☆'.repeat(CFG.WANTED_MAX - W.wanted);
    this.el['hud-stars'].style.color = W.wanted > 0 ? '#ffd23d' : 'rgba(255,255,255,0.35)';
    this.el['hud-objective'].textContent = currentObjective(W);
    this.el['hud-ammo'].textContent = W.player.gunDrawn ? `🔫 ${W.ammo}` : '👊 Fists';
    if (W.player.inCar && W.player.car) {
      const kmh = Math.abs(W.player.car.speed) * 3.6;
      this.el['hud-speed'].textContent = `${Math.round(kmh)} km/h`;
    } else {
      this.el['hud-speed'].textContent = '';
    }
    // Golden-hour clock: the sun never sets on Solmar Bay.
    const mins = 17 * 60 + 24 + Math.floor(W.time / 60);
    const hh = Math.floor(mins / 60) % 24;
    const mm = mins % 60;
    this.el['hud-time'].textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.drawMinimap();
  }

  drawMinimap() {
    const W = this.W;
    const ctx = this.map;
    const S = 188;
    const scale = S / (CFG.HALF * 2 + 60);
    const toMap = (x, z) => [S / 2 + x * scale, S / 2 + z * scale];
    ctx.clearRect(0, 0, S, S);
    // Land, beach, ocean.
    ctx.fillStyle = '#3d4a4a';
    ctx.fillRect(0, 0, S, S);
    const [, beachY] = toMap(0, CFG.BEACH_Z);
    ctx.fillStyle = '#e8cf9e';
    ctx.fillRect(0, beachY, S, S - beachY);
    const [, oceanY] = toMap(0, CFG.OCEAN_Z);
    ctx.fillStyle = '#2e7f9e';
    ctx.fillRect(0, oceanY, S, S - oceanY);
    // Roads.
    ctx.strokeStyle = '#5a636e';
    ctx.lineWidth = Math.max(2, CFG.ROAD * scale);
    for (const s of W.city.streets) {
      const [x1] = toMap(s, -CFG.HALF);
      const [, y1] = toMap(-CFG.HALF, s);
      ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(S, y1); ctx.stroke();
    }
    // Pier.
    ctx.strokeStyle = '#8a6a4a';
    ctx.lineWidth = 4;
    const [px] = toMap(0, 0);
    const [, pz1] = toMap(0, CFG.OCEAN_Z);
    const [, pz2] = toMap(0, CFG.PIER_Z_END);
    ctx.beginPath(); ctx.moveTo(px, pz1); ctx.lineTo(px, pz2); ctx.stroke();
    // Mission marker.
    const marker = this.missionMarker();
    if (marker) {
      const [mx, my] = toMap(marker.x, marker.z);
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mx, my, 8, 0, Math.PI * 2); ctx.stroke();
    }
    // Pickups.
    ctx.fillStyle = '#f2c230';
    for (const pk of W.pickups) {
      const [x, y] = toMap(pk.x, pk.z);
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    // Traffic (white), cops (blue), player (green arrow).
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const c of W.cars) {
      if (c.isCop) continue;
      const [x, y] = toMap(c.x, c.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    ctx.fillStyle = '#4f8cff';
    for (const c of W.copCars) {
      const [x, y] = toMap(c.x, c.z);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    const [ux, uy] = toMap(W.player.x, W.player.z);
    ctx.save();
    ctx.translate(ux, uy);
    ctx.rotate(Math.atan2(Math.sin(W.player.angle), Math.cos(W.player.angle)) + Math.PI);
    ctx.fillStyle = '#58c96b';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // North marker.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', S - 14, 14);
  }

  missionMarker() {
    const W = this.W;
    if (W.storyComplete || !W.mission) return null;
    const i = W.missionIndex;
    const P = W.city.places;
    if (i === 0) return P.cafe;
    if (i === 1) {
      if (W.player.inCar && W.player.car === W.mission.coupe) return P.garage;
      if (W.mission.coupe) return { x: W.mission.coupe.x, z: W.mission.coupe.z };
      return P.garage;
    }
    if (i === 2) return P.pierEnd;
    if (i === 4) {
      const pk = W.pickups.find((p) => p.kind === 'cash');
      return pk || null;
    }
    if (i === 5) return W.mission.phase === 'escape' ? P.pierEnd : P.bank;
    return null;
  }
}
