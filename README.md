# MARISOL HEAT — Heli Pursuit, Radio & Respray

An open-world crime game in the spirit of GTA 6, built with three.js r160
(vendored, 100% offline, no network requests). Riko Vale is back in Marisol
Bay: Tia Sol has a job at the Bay Trust Bank, the police have a helicopter,
and the sunset has never looked this good.

## What is in the game

- **A city with 4 named districts** — Downtown (glass towers), Beachside
  (pastel + pier), Port (industrial), Hills (residential) — plus one global
  landmark, the neon **Marisol Spire**, visible from across the map.
- **Real places, not markers on empty asphalt**: Cafe Alba (Tia Sol stands
  outside it), Bay Trust Bank (columns + vault door), Lucky Gull Casino,
  Quick Coat Garage, Iron & Lead Arms.
- **Wanted 0–5 that reads**: hollow stars + SEARCHING when the police lose
  you, witnesses who phone the police 2.5 s after a crime, escalation that
  changes the UNIT (patrol → roadblocks → helicopter with spotlight →
  roadblock vans → SWAT interceptors). The helicopter can be shot down.
  Swapping cars breaks the police description.
- **6 story missions** (Coffee with Tia, Borrow a Coupe, Sunset Delivery,
  Lose the Heat, Cash Drops, The Marisol Score) + side jobs: street race,
  Lucky Gull slots, respray, gun shop. Money has somewhere to go.
- **Traffic that stops at red lights**, 48 pedestrians who flee gunfire,
  carjacking that pulls the driver out, car damage (smoke → fire → explosion),
  handbrake drift with tire smoke.
- **Radio**: 3 stations (WAVE 88, FUEGO 101, TALK BAY); every car remembers
  its own station. R cycles, M mutes (gain restored correctly on unmute).
- **Look**: golden-hour default (17:45), ACES filmic tone mapping, selective
  HDR bloom (neon / lamps / sun / muzzle flash only), vignette + film grain,
  one shadowed sun with a tight frustum + blob shadows, canvas-texture
  facades with lit windows, neon signage.
- **HUD + live minimap** (roads, districts, police dots, heli ring, mission
  diamond), start / pause / save (localStorage, autosave every 15 s),
  photo mode (P: free camera, H: hide HUD, T: time of day).
- **Deterministic**: seeded RNG (seed 7); two runs build the same city and
  the same dossier bytes.

## Controls

WASD move / drive · E enter or steal car · Space handbrake · Click shoot ·
F punch · R radio · 1/2 weapons · P photo mode · H hide HUD · T time of day ·
M mute · Esc pause.

## Screenshots (the dossier's 4, in order)

1. **1-cover.jpg** — "Five stars. One exit." Chase: hero coupe diagonal,
   2 cruisers with light bars flanking behind, 5 stars, tire smoke,
   golden-hour downtown.
2. **2-city.jpg** — "The city never sleeps." Downtown at sunset, lit
   windows, palms, streets and the skyline.
3. **3-mission.jpg** — "Coffee with Tia." Riko + Tia at Cafe Alba in
   golden hour, CAFE ALBA neon sign overhead, pistol in hand.
4. **4-vista.jpg** — "Half the frame is sky." Beach golden hour, sun over
   the ocean, pier diagonal, hero coupe + Riko on the sand.

## Play

```sh
node serve.ts        # http://localhost:8080
```

## Tests (run in this repo)

```sh
node tools/gate-check.js    # load, 0 console errors, 0 external requests
node tools/playtest.js      # autopilot finishes mission 1, cash before -> after
node tools/shots.js         # 10 candidates -> pick 4, grayscale/blur/168x94 checks
```

Measured in this session (2026-11-18, headless Chromium 1255 + SwiftShader):

- **Gate** (`tools/gate-check.js`): PASS — 0 console errors, 0 page
  errors, 0 failed requests, 0 external requests; canvas non-blank
  (pixel mean ~35, 107 distinct colors); 48–55 draw calls in the spawn scene.
- **Playtest** (`tools/playtest.js`): PASS (2 consecutive runs) — autopilot
  finishes mission 1, cash **$150 → $450 (+$300)**, mission 0 → 1
  ("Borrow a Coupe"); 0 page errors; 48 pedestrians, 27 traffic cars live.
- **Screenshots** (`tools/shots.js`): 10 candidates, 0 errors, draw calls
  37–69 across scenes; finals 960×540 JPEG q80, 51–89 KiB each (limit
  256 KiB); all 4 pass the grayscale + blur + 168×94 legibility check.
- **Dossier** (`MAKEFUN_OUTPUT_DIR=out node main.ts`): 520,283 bytes
  (limit 4 MiB), text 142,434 bytes (limit 163,840), 4 images; two runs
  byte-identical (sha256
  5d66ac3a3266787fe2bdb591fa022326fafc2bcdf880d20e7205f126b8b01b9a).
- **Limits**: `game/` is 22 files, 811,832 bytes (limits: 993 files,
  48 MiB); `index.html` well under 1 MiB.

## License

MIT — see LICENSE.
