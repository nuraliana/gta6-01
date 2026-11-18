// MARISOL HEAT — config.js
// One job: every tunable number, palette, district and named place in the game.
// Palette rule 60-30-10: 60% dark blue-grey asphalt + dusk sky, 30% glass teal
// buildings, 10% hot orange/magenta neon + the hero car. Golden hour is the
// default look: low warm sun, orange-to-violet sky, long shadows.
export const CONFIG = {
  SEED: 7,
  // City grid: 9 x 9 blocks, 56 m pitch, city spans about +/-252 m.
  GRID: 9,
  PITCH: 56,
  ROAD_HALF: 7,
  BLOCK: 42,
  // Player / driving
  WALK_SPEED: 7,
  RUN_SPEED: 11,
  CAR_TOP_SPEED: 38,
  CAR_ACCEL: 22,
  CAR_BRAKE: 34,
  // Wanted
  WANTED_DECAY_S: 26,
  WITNESS_DELAY_S: 2.5,
  BUST_TIME_S: 2,
  BUST_FINE: 200,
  // Economy
  RESPRAY_COST: 250,
  AMMO_COST: 50,
  ARMOR_COST: 150,
  SMG_COST: 800,
  SLOTS_COST: 50,
  RACE_REWARD: 400,
  START_CASH: 150,
  // Population
  TRAFFIC_COUNT: 16,
  PARKED_COUNT: 10,
  PED_COUNT: 48,
  // Render budgets (measured, written to the dossier by the tools)
  DRAW_CALL_TARGET: 100,
  SHADOW_MAP_SIZE: 1024,
  // Clock: golden hour default 17:45, night neon 21:30, noon 12:00
  TIME_PRESETS: {
    golden: { hour: 17.75, sunColor: 0xffb36b, sunIntensity: 2.2, hemiSky: 0x8a7bd8, hemiGround: 0x3a2f2a, fog: 0xe08a5a, exposure: 1.08 },
    noon: { hour: 12.0, sunColor: 0xfff2d8, sunIntensity: 2.2, hemiSky: 0xbfd9ff, hemiGround: 0x8a7a6a, fog: 0xcfd8e6, exposure: 1.0 },
    night: { hour: 21.5, sunColor: 0x7a86ff, sunIntensity: 0.5, hemiSky: 0x2a2a55, hemiGround: 0x14101c, fog: 0x1c1830, exposure: 1.1 },
  },
  // Districts: name, palette, height band, centre (x, z) in metres.
  DISTRICTS: [
    { name: "Downtown", cx: 0, cz: -84, r: 130, palette: ["#2e4a66", "#37586e", "#274058"], glass: true, hMin: 26, hMax: 68 },
    { name: "Beachside", cx: 0, cz: 196, r: 110, palette: ["#e8a87c", "#f2c29b", "#d98f6a"], glass: false, hMin: 7, hMax: 16 },
    { name: "Port", cx: -196, cz: 84, r: 100, palette: ["#5a5a52", "#6e6258", "#4a4a44"], glass: false, hMin: 9, hMax: 22 },
    { name: "Hills", cx: 196, cz: 0, r: 110, palette: ["#c9b18c", "#b89a72", "#d8c49a"], glass: false, hMin: 6, hMax: 14 },
  ],
  // Named places: real buildings with signs, never bare coordinates.
  // All sit on BLOCK CENTRES (never on a road line) so the building owns
  // its block and the sign faces the street.
  PLACES: {
    cafeAlba: { name: "Cafe Alba", x: 56, z: -56, sign: "CAFE ALBA", signColor: "#ff9e4a" },
    bank: { name: "Bay Trust Bank", x: -56, z: -112, sign: "BAY TRUST BANK", signColor: "#7fe0ff" },
    casino: { name: "Lucky Gull Casino", x: 112, z: 112, sign: "LUCKY GULL", signColor: "#ff4ad8" },
    garage: { name: "Quick Coat Garage", x: -112, z: 56, sign: "QUICK COAT • RESPRAY $250", signColor: "#ffe14a" },
    gunshop: { name: "Iron & Lead Arms", x: 168, z: -112, sign: "IRON & LEAD", signColor: "#ff5a4a" },
    pier: { name: "Marisol Pier", x: 0, z: 336, sign: "MARISOL PIER", signColor: "#7fe0ff" },
    spire: { name: "Marisol Spire", x: -56, z: 168, sign: "MARISOL SPIRE", signColor: "#ff4ad8" },
  },
  // Wanted escalation: star -> unit types (not just counts).
  ESCALATION: {
    1: "Foot patrol + 1 cruiser",
    2: "2 cruisers, roadblocks form",
    3: "3 cruisers + police helicopter with spotlight",
    4: "4 cruisers + helicopter + roadblock vans",
    5: "SWAT interceptors + helicopter + full roadblocks",
  },
  // Radio stations: each car remembers its own station.
  STATIONS: [
    { name: "WAVE 88", genre: "synthwave", root: 57, bpm: 96 },
    { name: "FUEGO 101", genre: "latin", root: 62, bpm: 120 },
    { name: "TALK BAY", genre: "talk", root: 50, bpm: 72 },
  ],
  // Missions: name, reward, one-line arc. Steps live in missions.js.
  MISSIONS: [
    { name: "Coffee with Tia", reward: 300 },
    { name: "Borrow a Coupe", reward: 400 },
    { name: "Sunset Delivery", reward: 500 },
    { name: "Lose the Heat", reward: 450 },
    { name: "Cash Drops", reward: 600 },
    { name: "The Marisol Score", reward: 1200 },
  ],
};

export const HERO_CAR_COLOR = 0xffb020; // hero coupe: hot amber, pops in grayscale
export const POLICE_COLOR = 0x1a2a44; // dark navy cruiser, white doors, light bar
export const SAVE_KEY = "marisol-heat-save-v1";
