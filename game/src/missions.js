// Solmar Bay — the six-mission story. Jax Moreno, a courier who owes the
// fixer Tia Sol one last favour, works the debt off across the city. Each
// mission is data plus a small update step: go to a marker, do the thing,
// get paid. The HUD reads currentObjective() for its objective line.
import { CFG } from './config.js';
import { dist2 } from './util.js';
import { makeCar } from './vehicles.js';

export const MISSIONS = [
  {
    id: 'meet-tia',
    title: '1 — Coffee with Tia',
    objective: 'Meet Tia Sol at Cafe Alba',
    brief: 'Tia Sol runs Solmar Bay from a corner table. She has one last job for you — go hear her out.',
    reward: 300,
    marker: (W) => ({ x: W.city.places.cafe.x, z: W.city.places.cafe.z, label: 'Cafe Alba' }),
  },
  {
    id: 'borrow-coupe',
    title: '2 — Borrow a Coupe',
    objective: 'Steal the gold coupe, then park it at Marina Garage',
    brief: 'Tia needs a fast car with no questions attached. The gold coupe by Palm Court is yours to borrow.',
    reward: 500,
    marker: (W) => ({ x: W.city.places.garage.x, z: W.city.places.garage.z, label: 'Marina Garage' }),
  },
  {
    id: 'sunset-delivery',
    title: '3 — Sunset Delivery',
    objective: 'Deliver the package to the end of Solmar Pier — 90 seconds',
    brief: 'A package, a pier, a deadline. The buyer waits at the end of the pier and does not wait long.',
    reward: 700,
    timeLimit: 90,
  },
  {
    id: 'lose-heat',
    title: '4 — Lose the Heat',
    objective: 'Lose the cops — get your wanted level back to zero',
    brief: 'The pickup went loud. Three stars and every cruiser in the city. Break line of sight and vanish.',
    reward: 800,
  },
  {
    id: 'cash-drops',
    title: '5 — Cash Drops',
    objective: 'Collect the cash drops around the city',
    brief: 'Tia stashed five envelopes across Solmar Bay. Pick them all up — the city is watching.',
    reward: 1000,
  },
  {
    id: 'solmar-score',
    title: '6 — The Solmar Score',
    objective: 'Hit Bay Trust Bank, grab the vault cash, reach the pier',
    brief: 'One bank, one vault, one getaway. Take the cash from Bay Trust and be at the pier before the city wakes up.',
    reward: 5000,
  },
];

export function currentObjective(W) {
  if (W.storyComplete) return 'Story complete — Solmar Bay is yours. Free roam!';
  const m = MISSIONS[W.missionIndex];
  if (!m) return '';
  let text = m.objective;
  if (W.missionIndex === 4) {
    const left = W.mission.dropsLeft ?? 5;
    text = `Collect the cash drops around the city (${5 - left}/5)`;
  }
  if (W.missionIndex === 2 && W.missionTimer > 0) {
    text += ` — ${Math.ceil(W.missionTimer)}s left`;
  }
  if (W.missionIndex === 5 && W.mission.phase === 'escape') {
    text = 'Vault cash grabbed — reach the pier to escape!';
  }
  if (W.missionIndex === 5 && W.mission.phase === 'grab') {
    text = 'Hold the vault marker to crack it open…';
  }
  return text;
}

function markerFor(W) {
  const i = W.missionIndex;
  if (i === 0) return { x: W.city.places.cafe.x, z: W.city.places.cafe.z };
  if (i === 1) return { x: W.city.places.garage.x, z: W.city.places.garage.z };
  if (i === 2) return { x: W.city.places.pierEnd.x, z: W.city.places.pierEnd.z };
  if (i === 4) return null; // drops are the markers
  if (i === 5) {
    return W.mission.phase === 'escape'
      ? { x: W.city.places.pierEnd.x, z: W.city.places.pierEnd.z }
      : { x: W.city.places.bank.x, z: W.city.places.bank.z };
  }
  return null;
}

export function startMission(W, index) {
  const m = MISSIONS[index];
  W.missionIndex = index;
  W.mission = { id: m.id, phase: 'go', dropsLeft: 5, grabTimer: 0, timer: m.timeLimit || 0 };
  W.missionTimer = m.timeLimit || 0;
  W.events.push('mission-start');
  if (index === 1) {
    // Park the gold coupe on Palm Court street for Jax to steal.
    const coupe = makeCar(W, 112, 128, Math.PI / 2, { kind: 'coupe', color: 0xf2c230, driver: false, isTraffic: false });
    coupe.missionCar = true;
    W.cars.push(coupe);
    W.mission.coupe = coupe;
  }
  if (index === 3) {
    W.addWanted(3);
  }
  if (index === 4) {
    // Five cash drops scattered across the city.
    const spots = [
      { x: -168, z: -168 }, { x: 168, z: -168 }, { x: -168, z: 168 },
      { x: 168, z: 168 }, { x: 0, z: 276 },
    ];
    for (const s of spots) {
      W.pickups.push({ kind: 'cash', x: s.x, z: s.z, amount: 150, ttl: 600 });
    }
  }
}

function completeMission(W, audio) {
  const m = MISSIONS[W.missionIndex];
  W.addCash(m.reward);
  W.missionsDone += 1;
  W.events.push('mission-complete');
  audio.missionDone();
  W.spawnBurst(W.player.x, W.player.z, 0xf2c230, 24, 5);
  if (W.missionIndex >= MISSIONS.length - 1) {
    W.storyComplete = true;
    W.state = 'complete';
    W.events.push('story-complete');
    return;
  }
  startMission(W, W.missionIndex + 1);
}

function failMission(W, reason) {
  W.events.push('mission-failed');
  // Timed delivery failed: restart it from the top.
  startMission(W, W.missionIndex);
}

export function updateMissions(W, dt, audio) {
  if (!W.mission || W.storyComplete) return;
  const i = W.missionIndex;
  const p = W.player;

  if (i === 2) {
    W.missionTimer -= dt;
    if (W.missionTimer <= 0) { failMission(W, 'time'); return; }
  }

  const marker = markerFor(W);
  const atMarker = marker ? dist2(p.x, p.z, marker.x, marker.z) < CFG.MARKER_RADIUS : false;

  if (i === 0 && atMarker) { completeMission(W, audio); return; }

  if (i === 1) {
    const coupe = W.mission.coupe;
    const inCoupe = p.inCar && p.car === coupe;
    if (inCoupe && atMarker) { completeMission(W, audio); return; }
    if (!inCoupe && coupe && !p.inCar) {
      // Point Jax at the coupe until he takes it.
      W.mission.hint = { x: coupe.x, z: coupe.z };
    }
  }

  if (i === 2 && atMarker) { completeMission(W, audio); return; }

  if (i === 3) {
    if (W.wanted === 0) { completeMission(W, audio); return; }
  }

  if (i === 4) {
    if (W.mission.dropsLeft <= 0) { completeMission(W, audio); return; }
  }

  if (i === 5) {
    if (W.mission.phase === 'go' && atMarker) {
      W.mission.phase = 'grab';
      W.addWanted(2);
      W.events.push('vault-start');
    } else if (W.mission.phase === 'grab') {
      if (atMarker) {
        W.mission.grabTimer += dt;
        if (W.mission.grabTimer > 5) {
          W.mission.phase = 'escape';
          W.addCash(2500);
          W.addWanted(2);
          W.events.push('vault-grabbed');
          audio.cash();
        }
      } else {
        W.mission.grabTimer = Math.max(0, W.mission.grabTimer - dt);
      }
    } else if (W.mission.phase === 'escape' && atMarker) {
      completeMission(W, audio);
      return;
    }
  }
}
