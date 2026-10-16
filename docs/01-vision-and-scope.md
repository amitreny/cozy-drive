# 01 · Vision & Scope

> Working title: **Sunday Drive**. Placeholder; rename freely.

## Pitch

A cozy, offline, open-world driving game that runs in any modern desktop browser. You live on a quiet island, restore old cars you find in barns, customize every bolt and color, and wander through meadows, forests, dunes, canyons and snowy passes. Each terrain feels different under your tyres. There are no timers, no crashes that matter, and nothing to lose.

## Planning assumptions

These shape every estimate in this plan. Change them first if they are wrong.

| Assumption | Value |
|---|---|
| Team | 1 full-time developer (code + tech art), with CC0/commissioned models and music |
| Platform | Desktop browsers: Chrome, Edge, Firefox, Safari (latest 2 versions) |
| Input | Keyboard, gamepad. Touch is post-1.0 |
| "Offline" | No server, no accounts, no network calls after first load. Installable PWA. Saves stay on the device |
| Art style | Stylized "soft low-poly" world, glossy PBR cars that show off paint |
| Engine | Web-native stack (Three.js + Rapier). No commercial engine |
| Monetization | Out of scope for this plan (premium itch.io release or free) |

## Design pillars

Every feature must serve at least one pillar. If it serves none, cut it.

1. **Unhurried.** No fail states, no timers by default, no damage. The player sets the pace.
2. **Yours.** Deep customization of looks *and* behaviour. Your car carries your personality.
3. **Tactile terrain.** Asphalt, gravel, mud, sand, snow and ice must feel, sound and look distinct. Choosing the right setup for the terrain is the main "puzzle".
4. **Warm world.** Golden-hour light, weather, animals, small errands for neighbours. Discovery over objectives.
5. **Instant & offline.** From tab-open to driving in under 10 seconds. Works on a plane.

## Anti-goals

We explicitly will **not** build:

- Combat, police chases, wanted levels, or vehicle destruction.
- Mandatory races or timed objectives. Optional personal-best trails only, no leaderboards.
- Fuel management, breakdowns, or repair grinding.
- Online features, accounts, telemetry, ads, or microtransactions.
- Hard progression walls. Terrain is a *soft* gate: hard but always attemptable.
- Real-world car brands or lookalike trade dress. All cars are fictional designs.

## Player fantasy & audience

- **Fantasy:** "a lazy Sunday drive in a car I built myself, to somewhere I've never been."
- **Primary audience:** cozy-game players (Stardew, A Short Hike, Lil Gator Game) who like cars but don't want racing.
- **Secondary audience:** car-customization fans (Forza, My Summer Car) who want a relaxing sandbox.
- **Session length:** 15–45 minutes. Must feel good in 10 minutes and still have goals at hour 20.

## Reference games (what to borrow)

| Game | Borrow |
|---|---|
| Slow Roads (browser) | Proof that cozy driving works in a browser; scenic flow; zero friction start |
| Art of Rally | Stylized look, readable handling on loose surfaces, photo mode |
| SnowRunner / Expedition | Terrain-vs-setup interplay: tyre pressure, diff locks, low range, fords |
| Over the Hill | Approachable off-roading, exploration rewards |
| A Short Hike | Compact, dense, handcrafted open world; gentle soft-gating; warmth |
| Forza Horizon | Garage UX, paint and livery tools, photo mode, barn finds |

## Scope ladder

Pick a rung before starting M1. The roadmap in [08-roadmap.md](08-roadmap.md) assumes **Standard**.

| | Lite | **Standard (1.0)** | Dream |
|---|---|---|---|
| World | 2 × 2 km, 2 biomes | 4 × 4 km island, 6 biomes | 8 × 8 km, seasons |
| Car types | 3 | 8 | 12 + trailers, tracked snowcat |
| Parts & cosmetics | ~60 | ~300 | 500+ and mod support |
| Activities | Collectibles, viewpoints | + errands, trails, photo requests, camping, barn finds | + car meets, fishing spots, seasonal events |
| Weather | Clear, fog | Clear, cloudy, rain, fog, alpine snow | Storms, seasons, puddle physics |
| Solo full-time estimate | ~5 months | ~11 months (+ buffer → 13) | 20+ months |

Part-time (~15 h/week): multiply by 2.5–3.

## 1.0 feature list (prioritized)

P0 = ship blocker. P1 = should ship. P2 = cut first / post-launch.

| Area | P0 | P1 | P2 |
|---|---|---|---|
| Driving | Raycast vehicle, 6 surfaces, assists, chase cam, KB + gamepad | Cockpit cam, manual gears, tyre pressure, diff locks, low range | Winch, trailers, 6-wheelers |
| Cars | 3 car types | 8 car types, barn-find unlocks | Tracked/amphibious vehicles |
| Customization | Paint (colour + finish), wheels, tyres, suspension, engine tiers, body parts | Two-tone patterns, decals & text, interior trinkets, horns, exhaust sounds | Livery layer editor, mod parts |
| World | 1 polished biome, streaming, day/night | 6 biomes, weather, water & fords, deformable snow/mud/sand | Seasons, ambient traffic |
| Activities | Collectibles, viewpoints | Errands, trails, photo requests, camping | Car meets, time-trial ghosts |
| Meta | Save/load, settings, offline PWA | Map + fast travel, photo album, build codes, save export | Achievements, NG+ |
| Platform | Desktop browsers | Quality auto-detect, dynamic resolution | Touch controls, Tauri desktop build |

## 1.0 success criteria

- First playtest group (10+ people) rates "relaxing" ≥ 4/5 and "driving feels good" ≥ 4/5.
- 60 fps at 1080p "Medium" on a 2020-era integrated GPU (Intel Iris Xe / Apple M1); 30 fps floor on "Low".
- Cold load to driving ≤ 10 s on broadband; ≤ 3 s cached; fully playable with the network disabled.
- Zero save-loss bugs in beta; save export/import round-trips.
- ≥ 20 hours of content for completionists; the core loop is clear within 5 minutes.
