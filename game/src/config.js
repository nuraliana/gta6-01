// Solmar Bay — shared tuning constants. One place for every number the
// other systems use, so balance changes never mean hunting through files.
export const CFG = {
  // City grid: streets every PITCH metres, ROAD wide; city spans +-HALF.
  PITCH: 56,
  ROAD: 14,
  STREETS: 9, // street lines at -224 .. 224
  HALF: 252,
  // Beach / ocean on the south edge (positive z).
  BEACH_Z: 252,
  OCEAN_Z: 300,
  PIER_X: 0,
  PIER_Z_END: 392,
  // Player on foot.
  WALK_SPEED: 7,
  SPRINT_SPEED: 11,
  PLAYER_RADIUS: 0.9,
  PLAYER_HEALTH: 100,
  // Driving.
  CAR_TOP_SPEED: 34,
  CAR_ACCEL: 22,
  CAR_BRAKE: 34,
  CAR_REVERSE: 12,
  CAR_TURN: 1.9,
  TRAFFIC_SPEED: 9,
  COP_SPEED: 30,
  // Combat.
  PUNCH_RANGE: 2.2,
  PUNCH_DAMAGE: 25,
  PISTOL_RANGE: 42,
  PISTOL_DAMAGE: 34,
  PISTOL_AMMO_START: 24,
  // Wanted.
  WANTED_MAX: 5,
  WANTED_DECAY_S: 26,
  // Missions.
  MARKER_RADIUS: 6,
  SAVE_KEY: 'solmarbay-save-v1',
};

// Warm, sun-soaked palette: sand, coral, teal sea, cream stucco, terracotta.
export const PALETTE = {
  sky: 0x87bfe8,
  fog: 0xcfd8e6,
  sun: 0xffe3b3,
  asphalt: 0x3a3f46,
  sidewalk: 0x9a938a,
  sand: 0xe8cf9e,
  ocean: 0x2e7f9e,
  grass: 0x7fae5a,
  building: [0xf2e3c6, 0xe8b48a, 0xd98a6a, 0xcfe0e8, 0xf6d9a0, 0xb8c4a8, 0xe6a8a0, 0x9fb8c8],
  glass: 0x8fc7dd,
  car: [0xd94f3d, 0x3d7fd9, 0xf2c230, 0x53b06a, 0xe8e4da, 0x2b2f36, 0x9b59d0, 0xef8f3c],
  cop: 0x2b4c8c,
  taxi: 0xf2c230,
  pedSkin: [0xe8b88a, 0xc98d5f, 0x8a5a3b, 0xf2c9a0],
  pedShirt: [0xe85d75, 0x4fae8a, 0x5a7fd9, 0xf2a541, 0x8a6fd9, 0xe8e4da],
};
