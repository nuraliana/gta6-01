// Solmar Bay — the procedural coastal city. A road grid with downtown
// towers, a park, a beach and a pier over the ocean. Pure data: building
// boxes, palm and lamp spots, street lines and colliders. render.js turns
// this data into three.js meshes; the gameplay systems use the colliders.
import { CFG, PALETTE } from './config.js';

export function streetLines() {
  const lines = [];
  const start = -((CFG.STREETS - 1) / 2) * CFG.PITCH;
  for (let i = 0; i < CFG.STREETS; i++) lines.push(start + i * CFG.PITCH);
  return lines;
}

export function buildCity(rng) {
  const streets = streetLines();
  const buildings = [];
  const colliders = [];
  const palms = [];
  const lamps = [];
  const parks = [];

  // Blocks sit between neighbouring streets. Downtown is the centre 3x3.
  for (let bx = 0; bx < CFG.STREETS - 1; bx++) {
    for (let bz = 0; bz < CFG.STREETS - 1; bz++) {
      const cx = (streets[bx] + streets[bx + 1]) / 2;
      const cz = (streets[bz] + streets[bz + 1]) / 2;
      const downtown = Math.abs(bx - 3.5) <= 1.5 && Math.abs(bz - 3.5) <= 1.5;
      const isPark = !downtown && rng.chance(0.14);
      if (isPark) {
        parks.push({ x: cx, z: cz });
        for (let i = 0; i < 5; i++) {
          palms.push({ x: cx + rng.range(-16, 16), z: cz + rng.range(-16, 16) });
        }
        continue;
      }
      // One to three buildings per block, kept inside the block with a
      // sidewalk margin so pedestrians always have somewhere to walk.
      const count = downtown ? rng.int(2, 3) : rng.int(1, 2);
      const slots = [
        { dx: -11, dz: -11 }, { dx: 11, dz: -11 },
        { dx: -11, dz: 11 }, { dx: 11, dz: 11 },
      ];
      for (let i = 0; i < count; i++) {
        const slot = slots[(i * 2 + (bx + bz) % 2) % slots.length];
        const w = rng.range(12, 16);
        const d = rng.range(12, 16);
        const h = downtown ? rng.range(26, 68) : rng.range(7, 20);
        const b = {
          x: cx + slot.dx, z: cz + slot.dz, w, d, h,
          color: rng.pick(PALETTE.building),
          glass: rng.chance(0.5),
        };
        buildings.push(b);
        colliders.push({ x: b.x, z: b.z, hx: w / 2, hz: d / 2 });
      }
    }
  }

  // Palms along the beach promenade and the pier road.
  for (let x = -224; x <= 224; x += 28) {
    palms.push({ x, z: 262 });
    if (rng.chance(0.6)) palms.push({ x: x + 10, z: 240 });
  }
  // Street lamps at every intersection, alternating corners.
  for (const sx of streets) {
    for (const sz of streets) {
      lamps.push({ x: sx + 9, z: sz + 9 });
    }
  }

  // Named places the missions and the HUD point at. Each sits on a street
  // line (not inside a block) so Jax can always reach its marker.
  const places = {
    cafe: { x: -56, z: -28, label: 'Cafe Alba' },          // meet Tia Sol
    garage: { x: 168, z: 84, label: 'Marina Garage' },     // drop the coupe
    pierEnd: { x: CFG.PIER_X, z: CFG.PIER_Z_END - 8, label: 'Solmar Pier' },
    bank: { x: 56, z: -84, label: 'Bay Trust Bank' },       // the Solmar Score
    hospital: { x: -168, z: 140, label: 'Solmar Clinic' },  // respawn after bust
    park: { x: 112, z: 140, label: 'Palm Court Park' },
    beach: { x: -84, z: 276, label: 'Solmar Beach' },
  };

  return { streets, buildings, colliders, palms, lamps, parks, places };
}

// Is (x, z) on a road (within half the road width of a street line)?
export function onRoad(x, z) {
  const half = CFG.ROAD / 2;
  const near = (v) => {
    const start = -((CFG.STREETS - 1) / 2) * CFG.PITCH;
    const k = Math.round((v - start) / CFG.PITCH);
    return Math.abs(v - (start + k * CFG.PITCH)) <= half;
  };
  return near(x) || near(z);
}

// Nearest street line coordinate to v.
export function nearestStreet(v) {
  const start = -((CFG.STREETS - 1) / 2) * CFG.PITCH;
  const k = Math.round((v - start) / CFG.PITCH);
  return start + Math.max(0, Math.min(CFG.STREETS - 1, k)) * CFG.PITCH;
}

// A point on the sidewalk next to a street: used for pedestrian spawns.
export function sidewalkPoint(rng) {
  const streets = streetLines();
  const s = rng.pick(streets);
  const along = rng.range(-224, 224);
  if (rng.chance(0.5)) return { x: s + 8.5, z: along };
  return { x: along, z: s + 8.5 };
}
