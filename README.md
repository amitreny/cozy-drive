# Cozy Drive (working title)

A cozy, offline, open-world driving game for the browser. This repository holds the **M0/M1 prototype** from the plan in [docs/](docs/README.md).

![The sports coupe on the coastal highway at sunset](docs/screenshots/coastal-highway-sunset.jpg)

| | |
|---|---|
| ![The hatchback on the cobbled village plaza](docs/screenshots/village.jpg) | ![The 4×4 on the red-rock canyon track](docs/screenshots/canyon-track.jpg) |
| *Village plaza: the starting point* | *Canyon track in the 4×4* |
| ![The dune buggy on the trail through the dunes](docs/screenshots/dunes.jpg) | ![The camper van on the cross-island highway](docs/screenshots/cross-island-highway.jpg) |
| *Dune trail in the buggy* | *Cross-island highway in the camper van* |

![The 4×4 in a Summit Road hairpin at golden hour, chevrons round the bend and the frozen tarn below](docs/screenshots/summit-road.jpg)
*The Summit Road: hairpins up the tallest mountain, chevrons on the bends and stone walls along the cliff edges.*

![The garage: a pickup with off-road wheels and a lift kit](docs/screenshots/garage.jpg)
*The garage: every change previews instantly on the car.*

Screenshots come from the real game and can be regenerated with `npm run screenshots`.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 with hot reload
npm test           # world, physics and acceptance tests (Node, headless)
npm run build      # production build + offline service worker in dist/
npm run smoke      # builds, opens the game in installed Chrome, drives, checks offline boot
```

For realistic frame rates in the smoke test on a machine with a GPU: `SMOKE_GPU=1 node tools/smoke.mjs <screenshot-dir>`.
To screenshot a tour of the island: `node tools/tour.mjs <screenshot-dir>`. To measure frame rate per layer: `node tools/perf.mjs`. To check the synthesized engines (levels, pitch, clipping) and save rev-sweep WAVs: `node tools/engine-check.mjs <dir>`. To measure driving smoothness: `node tools/smoothness.mjs` (add `THROTTLE=4` to emulate a slow CPU).
To screenshot every car type in the garage: `npm run build && node tools/cars.mjs <screenshot-dir> [hour]`.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Drive / brake / reverse | W / S (or arrows) | Right / left trigger |
| Steer | A / D | Left stick |
| Handbrake | Space | A |
| Flip back onto wheels | R | Y |
| Camera (chase, far, hood) | C · drag the mouse to look around | B |
| Garage | G | Start |
| Tyre pressure down / up | [ / ] | Bumpers |
| Low range (4×4) / diff lockers | F / L | X / – |
| Cruise control (brake cancels) | K | D-pad up |
| Map | M | D-pad down |
| Mini map on/off (style in Settings) | Tab | – |
| Autopilot (steer or brake to take over) | P | D-pad left |
| Radio station | T | D-pad right |
| Settings (sound mix, radio, mini map) | Esc | – |
| Help, mute | H, N | Back |
| Hangar / job board / park the aircraft | E (or Enter) | Left stick click |

**Flying** (from the hangar at an airfield, the grass strip, a helipad or a pier):

| Action | Keyboard | Gamepad |
|---|---|---|
| Pitch (S = nose up) / roll | W S / A D (A D also steer on the ground) | Left stick |
| Rudder / helicopter pedals | Z / X | Right stick |
| Throttle · collective · balloon burner (R) and vent (F) | R / F (hold) | Right / left trigger |
| Flaps | V | Right stick click |
| Wheel brakes | Space | A |
| Cockpit view | C | B |

## What's in the prototype

- **Island:** a generated 4 × 4 km island with the village of Hearthwick and eight hamlets (56 homes and 13 businesses built from Kenney's City Kits, with gardens, driveways, letterboxes and shop signs), an airfield with a 900 m runway, a grass strip, helipads (one on the summit), two seaplane piers, a 9 km coastal highway loop, a 3 km cross-island highway, gravel and dirt tracks, a mountain pass, a Summit Road that winds up the tallest mountain in a stack of hairpins (stone walls with lanterns on the cliff edges, chevrons on the bends), a boardwalk, a lake, a frozen alpine tarn, dunes, a red-rock canyon, snowy peaks and a marsh. Built in a background worker on first launch and cached.
- **12 surfaces** with their own grip, rolling resistance, particles and rolling sound, from the plan's tables.
- **7 car types:** hatchback, 4×4 (low range, lockers), camper van, sedan, pickup, sports coupe and dune buggy. Each is a detailed low-poly CC BY model from Poly Pizza, repaintable in the garage, with physics fitted to its real proportions. See [CREDITS.md](CREDITS.md) and [decisions/0008](docs/decisions/0008-detailed-car-models.md).
- **Garage:** car type, 6 tyre types, 4 wheel styles, lift, engine stage, differential, snorkel, paint and accent colours, 5 finishes, driving assists, with live stat bars.
- **Physics:** custom ray-cast vehicle on Rapier at 120 Hz, verified by automated acceptance tests.
- **6 aircraft:** a high-wing trainer, a biplane, an amphibious floatplane, an aerobatic monoplane, a light helicopter and a hot-air balloon. Flight physics is built from the aircraft's real wings, tail and engine: each surface makes its own lift and drag (finite-wing lift slope, stall, ground effect, propeller slipstream), so take-off runs, stall, cruise, climb and glide match the real types (tested: the trainer lifts off at ~100 km/h after ~200 m, climbs ~4 m/s, stalls at ~90 km/h, glides 9:1). The helicopter uses rotor momentum theory, the balloon real buoyancy of hot air, and the wind veers with height so balloons steer by altitude. Relaxed / Standard / Sim-lite assists change only what the stick commands, never the physics.
- **Deliveries:** every business has a job board (parcels from the post office, cakes from the bakery, fish that must arrive fresh, armchairs that need a van), and the airfields have an air-cargo office for flights between bases. Pay in Acorns by distance and load, with bonuses for careful handling, being on time, and delivering to the doorstep by helicopter.
- **Things to do:** 60 garden gnomes to find, 10 scenic viewpoints with postcards (one on the very top of the island, one an off-road cairn for 4×4s), Acorns to earn and spend on cars and aircraft, a map of the whole island, and an autopilot for lazy coastal cruises.
- **Atmosphere:** bloom and warm grading, drifting clouds, stars, shoreline foam, swaying meadow grass with wildflowers, a generative radio and nature sounds. Quality adapts to your GPU.
- **Cozy systems:** day/night cycle, gentle rescue from deep water, flip-back, autosave to IndexedDB, offline play after the first visit.

## Layout

```
src/core          loop, input, math, storage
src/world         generation, roads, surfaces, terrain, props, airports, homes and shops, sky
src/flight        aircraft specs, aerodynamics, flight physics, visuals, session
src/vehicle       specs, physics, models, visual sync
src/customization build → spec (pure, tested)
src/camera, src/ui, src/audio, src/fx
tests/            vitest suites + headless sim helper
tools/smoke.mjs   browser smoke test
docs/             the dev plan and decision records
```

## Status

Early prototype (milestones M0–M1 of the [roadmap](docs/08-roadmap.md), plus parts of M2 and M3). Expect rough edges.

## Licence

Third-party assets and their licences are listed in [CREDITS.md](CREDITS.md). The project's own code has no licence chosen yet, so all rights are reserved until one is added.
