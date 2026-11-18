# MARISOL HEAT — Heli Pursuit, Radio & Respray

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/nuraliana/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/nuraliana/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game in the spirit of GTA 6, built with three.js r160
(vendored, 100% offline, no network requests). Riko Vale is back in Marisol
Bay: Tia Sol has a job at the Bay Trust Bank, the police have a helicopter,
and the sunset has never looked this good.

**Wanted is a system, not a number.** Every crime is seen first and punished
later: a pedestrian who watches you steal a car or fire a shot pulls out a
phone, and the star only rises 2.5 seconds after the call — so a quiet alley
is safer than a crowded avenue. Stars 0–5 change what hunts you, not just how
many: foot patrol and 1 cruiser, then roadblocks, then a helicopter with a
spotlight at 3 stars, roadblock vans at 4, and at 5 stars a black armored
SWAT interceptor — faster than any cruiser and twice as hard a ram — joins
the chase. Break line of sight and the stars go hollow with a SEARCHING
label while cruisers converge on your last-known position; swap cars and the
police description goes stale, so wanted decays twice as fast. The helicopter
can be shot down in 3 hits (+$200 scrap bounty) and stays down until the heat
falls below 3 stars; get caught on foot and it is a $200 fine.

**Money has somewhere to go.** Missions pay $300–$1,200, a street race pays
$400, and every dollar can be spent: respray $250 (drops 2 stars), ammo $50,
armor $150, an SMG $800, Lucky Gull slots $50 a spin. The loop is the game:
earn heat doing jobs, spend cash to shed heat, and keep enough in hand for
the next job's buy-in — going broke with 5 stars and a smoking engine is
how runs end.

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

1. **1-cover.jpg** — "Five stars. One exit." Chase: hero coupe mid-frame,
   2 cruisers with light bars, a black SWAT interceptor cutting in, the
   police helicopter with its spotlight cone overhead, 5 stars, tire smoke,
   golden-hour downtown. Staged through live gameplay state only — no
   visual overrides.
2. **2-city.jpg** — "The city never sleeps." Downtown at sunset, lit
   windows, palms, streets and the skyline.
3. **3-mission.jpg** — "Coffee with Tia." Riko + Tia at Cafe Alba at NIGHT,
   whole CAFE ALBA neon sign overhead, warm storefront glow on the tables,
   lit windows behind. The dossier's one night shot.
4. **4-vista.jpg** — "Half the frame is sky." Beach golden hour, sun over
   the ocean, pier diagonal, hero coupe + Riko whole in frame on the sand.

## Play

```sh
node serve.ts        # http://localhost:8080
```

## Tests (run in this repo)

```sh
node tools/gate-check.js    # load, 0 console errors, 0 external requests
node tools/playtest.js      # autopilot finishes mission 1, cash before -> after
node tools/carjack-swat.js  # driver pull-out + 5* SWAT + heli shot down
node tools/shots.js         # 10 candidates -> pick 4, grayscale/blur/168x94 checks
```

Measured in this session (2026-11-18, headless Chromium 1255 + SwiftShader):

- **Gate** (`tools/gate-check.js`): PASS — 0 console errors, 0 page
  errors, 0 failed requests, 0 external requests; canvas non-blank
  (pixel mean ~34.8, 108 distinct colors); 48 draw calls in the spawn scene.
- **Playtest** (`tools/playtest.js`): PASS — autopilot finishes mission 1,
  cash **$150 → $450 (+$300)**, mission 0 → 1 ("Borrow a Coupe");
  0 page errors; 48 pedestrians, 27 traffic cars live.
- **Carjack + SWAT** (`tools/carjack-swat.js`): PASS — 16 driven traffic
  cars have drivers, 10 parked + hero have none; E-steal pulls exactly 1
  driver out, fleeing, 5.2 m covered; at 5 stars 3 cruisers + 1 SWAT
  (black armored Truck, top speed 38 vs cruiser 34); heli down on the
  3rd hit and stays down until wanted falls below 3 stars.
- **Screenshots** (`tools/shots.js`): 10 candidates, 0 errors, draw calls
  32–73 across scenes; finals 1280×720 JPEG q82, 98–153 KiB each (limit
  256 KiB, long side at most 1280 per RULES.txt); all 4 pass the
  grayscale + blur + 168×94 legibility check.
- **Dossier** (`MAKEFUN_OUTPUT_DIR=out node main.ts`): 857,007 bytes
  (limit 4 MiB), 4 images; two runs byte-identical (sha256
  1493662959838ad8351ffec55da142fcb7fb1a5fa733e877eb902d4c278ba19a).

## License

MIT — see LICENSE.
