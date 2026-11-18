# Solmar Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/nuraliana/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/nuraliana/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Plays offline](https://img.shields.io/badge/plays-offline-brightgreen.svg)](#how-to-play)

A sun-soaked coastal open-world crime game that runs entirely in your browser.
Explore the city of Solmar Bay on foot or behind the wheel, steal cars, take
jobs from the fixer Tia Sol, and try not to end up in the back of a Solmar PD
cruiser.

## The story

Jax Moreno is a courier who owes the fixer Tia Sol one last favour. Six jobs
stand between him and a clean slate — a stolen coupe, a sunset delivery, and
the Solmar Score at Bay Trust Bank. Clear the debt and the whole city opens
up for free roam.

## What is in the game

- **An open coastal city** — nine-by-nine streets of stucco buildings, a
  beach and ocean to the south, and the long Solmar Pier stretching out to sea.
- **Traffic and pedestrians** — cars cruise the streets and people walk the
  sidewalks, so the city feels alive even when you are just driving around.
- **Steal and drive** — walk up to any parked or passing car, take it, and
  drive it. Sprint on foot, handbrake around corners, and ditch your ride
  wherever you like.
- **Wanted level 0–5** — the more heat you attract, the harder the Solmar PD
  chases you. Break line of sight and lay low until the stars fade.
- **Six story missions** — meet Tia at Cafe Alba, borrow a gold coupe, make a
  90-second sunset delivery, shake a three-star manhunt, collect five cash
  drops, and pull off the bank heist.
- **Combat** — fists up close, or a pistol when things get loud.
- **HUD with a live minimap** — cash, health, wanted stars, the time of day,
  your weapon and ammo, speed, and a minimap that tracks you, your objective,
  and the police in real time.
- **Start screen, pause, and save** — progress is stored in localStorage, so
  you can pick up where you left off. Getting busted costs $200 bail and drops
  you back at Solmar Clinic.
- **Synthesized sound** — engine hum, sirens, punches, gunshots, and mission
  stings, all generated in code. No audio files. Press M to mute.

## Controls

| Key / mouse | Action |
| --- | --- |
| W A S D / arrow keys | Move on foot / drive |
| Mouse drag | Rotate the camera |
| E | Enter or steal a car |
| F | Punch |
| 1 | Draw the pistol |
| Click | Shoot |
| Shift | Sprint |
| Space | Handbrake |
| P or Esc | Pause |
| M | Mute |

## How to play

No build step, no network, no install. Serve the `game/` folder with any
static server and open `index.html`:

```bash
cd game
python3 -m http.server 8000
# then open http://localhost:8000 in your browser
```

## Tech notes

Built with [three.js](https://threejs.org/), vendored locally under
`game/vendor/` so the game works fully offline. The game code is plain
JavaScript modules under `game/src/` — city, vehicles, pedestrians, police,
missions, combat, HUD, and audio are each their own file. Screenshots are
captured deterministically with `?shot=start|play|end&seed=1`.

## Originality

Everything here is original: the city of Solmar Bay, the characters Jax
Moreno and Tia Sol, the story and mission names, the art, and the sound.
Nothing is taken from Rockstar Games or the Grand Theft Auto series.
