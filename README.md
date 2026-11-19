# MARISOL HEAT — Heli Pursuit, Radio & Respray

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/nuraliana/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/nuraliana/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

## The game

Marisol Bay at sunset. Riko Vale is back in town, Tia Sol has work waiting at Bay Trust Bank, and the police have a helicopter. MARISOL HEAT is an open-world crime game in the spirit of GTA 6, built on three.js r160 vendored straight into this repo. It is 100% offline — once the page loads, the game makes no network requests at all.

## Wanted: how heat works

Crime here is seen before it is chased. A witness who watches you commit a crime calls the police, and a new star climbs onto your wanted level 2.5 seconds after that call goes out.

The stars run 0–5, and every step changes who comes after you:

- **1 star** — foot patrol plus a single cruiser.
- **2 stars** — roadblocks join the hunt.
- **3 stars** — the police helicopter arrives, sweeping a searchlight over the streets.
- **4 stars** — roadblock vans box you in.
- **5 stars** — a black armoured SWAT interceptor rolls out. It is faster than a cruiser and hits twice as hard.

Break line of sight and the stars go hollow with a SEARCHING label while cruisers converge on your last known position. Swap cars and the police description goes stale, so your wanted level drops twice as fast.

The helicopter is not invincible: three hits bring it down (+$200 bounty scrap). It drops on the third hit, stays down after the crash until your wanted level falls below 3 stars, and is gone once it hits the ground. Get caught on foot and you pay a $200 fine.

## Money

Story missions pay $300–$1,200, and a street race pays $400. Cash is for spending:

- Respray — $250, and it drops 2 stars off your wanted level.
- Ammo — $50.
- Armor — $150.
- SMG — $800.
- Lucky Gull slot machine — $50 a spin.

The loop is simple: raise heat on a job, spend the cash to shed it.

## The city

Marisol Bay is four named districts:

- **Downtown** — glass towers.
- **Beachside** — pastel fronts and a pier.
- **Port** — industrial yards.
- **Hills** — residential streets.

Over it all stands the Marisol Spire, a neon landmark visible from across the map.

Real places you can walk up to: Cafe Alba, where Tia Sol waits outside; Bay Trust Bank, with its columns and vault door; the Lucky Gull Casino; Quick Coat Garage; and Iron & Lead Arms.

## Missions and side work

Six story missions:

1. Coffee with Tia
2. Borrow a Coupe
3. Sunset Delivery
4. Lose the Heat
5. Cash Drops
6. The Marisol Score

Around them: street races, the slot machine, resprays, and the gun store.

Mission 4 is honest about heat: stay out in the open too long and it climbs — a witness reports you after 20 seconds.

## Driving, traffic and the street

Traffic stops at red lights. 48 pedestrians run when shots are fired. Carjacking drags the driver out of the car. Cars take damage — smoke, then fire, then an explosion. The handbrake gives you a drift, with tyre smoke to prove it.

## Radio

Three stations, one fixed song each:

- **WAVE 88** • Neon Tide
- **FUEGO 101** • Solstice Salsa
- **TALK BAY** • Voices of the Bay

The HUD shows the station and its song, and every car remembers its own station. Press **R** to switch stations, **M** to mute — the gain comes back correctly when you unmute.

## Look and feel

Golden hour is the default light (17:45), with ACES filmic tone mapping. HDR bloom is selective — only neon, lamps, the sun and muzzle flashes glow. A vignette and film grain sit over the frame. There is one shadow-casting sun, plus blob shadows under cars and people. Facades are canvas textures with lit windows, and neon signage lights the streets.

## HUD, minimap, save and photo mode

The HUD and live minimap track roads, districts, police positions, the helicopter ring and mission diamonds. Start, pause and save are all in-game; progress saves to localStorage and autosaves every 15 seconds. Photo mode: **P** for a free camera, **H** to hide the HUD, **T** to change the time.

## Determinism

The world runs on a seeded RNG (seed 7). Two runs produce a byte-identical city and a byte-identical dossier.

## Controls

| Key | Action |
|-----|--------|
| WASD | Move / drive |
| E | Enter / steal a car |
| Space | Handbrake |
| Click | Shoot |
| F | Punch |
| R | Radio station |
| 1 / 2 | Weapons |
| P | Photo mode |
| H | Hide HUD |
| T | Time of day |
| M | Mute |
| Esc | Pause |

## Screenshots

1. **cover.jpg — "Five stars. One exit."** A sunset pursuit: the amber hero coupe centred in frame, a black SWAT interceptor head-on in the east lane, a wide amber bar glowing, 2 cruisers closing in, the police helicopter and its searchlight cone overhead, 5 stars, tyre smoke, downtown in golden hour. Staged from live gameplay state only — no visual overrides.
2. **city.jpg — "The city never sleeps."** Downtown at dusk from street level: 5 cars queued at a red light, 5 pedestrians on the crossing, lit windows in 4 colours, asphalt grain, chequerboard pavement tone, a bench and a red hydrant in the left foreground.
3. **mission.jpg — "Coffee with Tia."** Riko and Tia at Cafe Alba at night — the only night shot: striped awning, a table with legs, a striped umbrella canopy and chairs, a warmly lit shopfront with a menu board, a pool of light under the lamp, a red car parked at the kerb, planters and an A-board.
4. **vista.jpg — "Half the frame is sky."** The beach at golden hour: a pier with rails, lamps, a bench and a hut at its end, dunes, shells, one large shell, footprints, a band of wet sand, 5 beach umbrellas, a towel, a volleyball net, sun glitter on the sea, palms of different sizes, the hero coupe and Riko intact on the sand.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080.

## Tests

```sh
node tools/gate-check.js   # load, 0 console errors, 0 external requests
node tools/playtest.js      # autopilot finishes mission 1, cash before -> after
node tools/carjack-swat.js  # driver pull-out, 5-star SWAT, helicopter downed
node tools/shots.js         # 10 candidates -> pick 4, grayscale / blur / 168x94 checks
```

## Measured numbers (2026-11-19, headless Chromium 1255 + SwiftShader)

- **Gate: PASS** — 0 console errors, 0 page errors, 0 failed requests, 0 external requests. Canvas not blank (pixel mean ~25.7, 95 colours); 62 draw calls in the spawn scene.
- **Playtest: PASS** — autopilot finished mission 1, cash $150 → $450 (+$300), missions 0 → 1 ("Borrow a Coupe"); 0 page errors; 48 pedestrians, 27 traffic cars.
- **Carjack + SWAT: PASS** — 16 traffic cars with drivers, 10 parked + hero with no driver; the E-steal pulled exactly 1 driver out, who ran 5.1 m; at 5 stars there were 3 cruisers + 1 SWAT (black armoured truck, top speed 38 vs cruiser 34); the helicopter went down on the 3rd hit and stayed down until wanted fell below 3 stars.
- **Screenshots:** 10 candidates, 0 errors, draw calls 45–94 (cover 79–87, city 78–80, mission 93–94, vista 45–53); final JPEGs 1280×720 q82, 134,167 / 141,413 / 131,403 / 100,071 bytes (limit 256 KiB); all four passed the grayscale, blur and 168×94 checks. Cover final is candidate b (candidate a hid the hero coupe behind a cruiser); vista final is candidate c (candidate a cut a palm at the right edge).
- **Dossier** (`MAKEFUN_OUTPUT_DIR=out node main.ts`): 845,491 bytes (limit 4 MiB), 4 images; two runs byte-identical (sha256 `4b8ac17b99a6ecf628513ceb558a473db61c66c00547dbefec5397311dcf3494`).

## License

MIT — see LICENSE.
