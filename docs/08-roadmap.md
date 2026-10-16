# 08 · Roadmap & Milestones

Assumes the **Standard** scope and one full-time developer (see [01-vision-and-scope.md](01-vision-and-scope.md)). Every task is a checkbox so this file doubles as the tracker.

## Timeline

| Milestone | Weeks | Ends at week | Question it answers | Demo |
|---|---|---|---|---|
| M0 Pre-production & spikes | 3 | 3 | Can the browser do this at 60 fps, offline? | Car on a 1 km² heightfield, works in airplane mode |
| M1 Driving prototype | 5 | 8 | Is driving fun on an empty map? | Proving ground + sandbox terrain, 2 greybox cars |
| M2 Customization foundations | 4 | 12 | Do parts change looks *and* behaviour? | Garage → drive → reload, build persists |
| M3 World tech | 6 | 18 | Can we stream a big, varied island smoothly? | 2 × 2 km greybox island, all 12 surfaces |
| M4 Vertical slice | 6 | 24 | Is a finished 30 minutes cozy and fun? | Home Valley at final quality, 3 cars |
| M5 Alpha | 14 | 38 | Is everything in? | All regions, cars, systems; rough edges OK |
| M6 Beta | 6 | 44 | Is it polished, fast and safe? | Release-quality build |
| M7 Release | 3 | 47 | Ship it | 1.0 live |
| Buffer | 6–8 | ~54 | Absorbs surprises | Spread: +1 after M1, +2 after M4, +3–5 in M5/M6 |

**≈ 11 months of planned work, ≈ 13 months with buffer.**

| Team | Estimate |
|---|---|
| Solo, full-time | ~13 months |
| Solo, part-time (~15 h/week) | ~2.5–3 years. Consider the Lite scope |
| 3 people (programmer, 3D artist, designer/audio generalist) | ~7–8 months |

## Working rhythm

- **Always playable.** The main branch builds and runs every day. A tagged build every Friday.
- **Playtest weekly from M1**, even if it's one friend for 15 minutes. Write down where they smiled and where they got stuck.
- **Gates are real.** If a milestone's exit criteria fail, spend buffer on fixing them rather than moving on. A bad-feeling car can't be fixed by more content.
- **Keep a cut list.** Every P1/P2 feature has a "cut if…" note. Cut early, not in Beta.
- **Decision records.** Each important technical choice gets a half-page note in `docs/decisions/` (context, options, decision, consequences).

## M0 · Pre-production & spikes (weeks 1–3)

Throwaway code lives in `spikes/`. Only the learnings and decisions carry forward.

- [ ] Repo setup: Vite + TypeScript strict + Biome + Vitest + Playwright; CI runs lint, typecheck, test, build _(done except Biome; CI workflow added)_
- [ ] **Renderer spike:** `WebGPURenderer`, 1 km² heightfield, 20 k instanced trees, fog, 1 shadow cascade. Measure on the target laptop in Chrome, Edge, Firefox, Safari, with WebGPU and with WebGL2 forced → decision gate in [06](06-technical-architecture.md) _(prototype runs on WebGLRenderer at 60 fps; WebGPU comparison still open, see decisions/0001)_
- [x] **Physics spike:** Rapier compat build, built-in ray-cast vehicle on a heightfield. Measure step cost at 120 Hz _(went straight to the custom model)_
- [x] **Offline spike:** `vite-plugin-pwa` precache; reload with the network off; IndexedDB read/write; `storage.persist()` _(offline reload verified by tools/smoke.mjs)_
- [ ] **Audio spike:** engine loops cross-faded by RPM; gapless-loop test in every browser; codec decision _(synthesized placeholder engine works; codec tests wait for real samples)_
- [x] **Streaming spike:** load and unload chunks through a worker with transferables; measure main-thread cost _(superseded by the real streaming in M3, see decisions/0004)_
- [ ] Art direction tests: one car, one tree set, one sky in 2–3 style variants → pick one
- [ ] Decision records for renderer, physics, UI library and audio codecs _(0001 renderer, 0002 vehicle model)_
- [ ] Choose the scope rung (Lite / Standard / Dream)

**Exit criteria**

- A car drives on a 1 km² heightfield at ≥ 60 fps on target hardware in all four browsers, or the fallback decision is recorded.
- The spike boots with the network disabled.
- Decision records written, scope chosen.

## M1 · Driving prototype (weeks 4–8)

The one question: **is it fun to just drive?**

- [x] Main loop: fixed step + interpolation; input actions for keyboard and gamepad with smoothing
- [x] Custom vehicle: suspension, tyre model, drivetrain (torque curve, auto gearbox, open diff), steering _(force-based tyres, see decisions/0002)_
- [x] Surface system v1: asphalt, gravel, dirt, grass, mud, sand, read from a painted test map _(all 12 surfaces)_
- [x] Assists (Relaxed, Standard) and flip recovery _(plus Sim-lite)_
- [x] Chase camera v1: spring, look-ahead, collision avoidance
- [x] Audio v1: engine loops for 2 cars, surface rolling sounds, skids _(synthesized placeholders)_
- [ ] Particles v1 (dust, gravel, mud) and skid marks _(particles done; skid marks not yet)_
- [ ] Debug tools: Tweakpane spec editor, force overlay, telemetry graphs, input recorder _(not started)_
- [ ] Proving ground scene: ramps, surface strips, bumps, braking strip _(test ramps exist headless only)_
- [x] Headless physics test harness: Rapier in Node, recorded inputs → asserted metrics
- [x] Two greybox cars as spec JSON: hatchback and 4×4 _(four car types)_

**Exit criteria**

- 5 playtesters drive for 10 minutes; at least 4 of 5 call it fun and relaxing.
- Acceleration, braking and the mud-slope yes/no targets from [03](03-vehicles-and-physics.md) pass for both cars.
- Physics + vehicle ≤ 2 ms per frame.
- **If the feel gate fails, spend up to 2 buffer weeks tuning before M2.**

## M2 · Customization foundations (weeks 9–12)

- [ ] Schemas for car types, parts, builds, surfaces and tyres; CI validation of all `data/` files
- [ ] Part registry, compatibility rules and `resolveSpec` as pure code, with ≥ 90 % unit-test coverage
- [ ] Car assembly from chassis + parts via sockets; per-material mesh merging
- [ ] Paint shader: colour, 6 finishes, one pattern mask, patina slider
- [ ] Garage v1: turntable, categories, item grid, instant preview, buy and fit, undo/redo, stats with deltas
- [ ] Functional parts v1: road, all-terrain and mud tyres with the grip matrix; suspension lift; engine stages
- [ ] Save v1: IndexedDB, versioned schema, builds + owned parts + Acorns, autosave, migration framework with its first fixture
- [ ] Thumbnail render script v1
- [ ] ~30 placeholder parts across the 2 greybox cars

**Exit criteria**

- Swapping road tyres for mud tyres flips the automated mud-slope test from fail to pass.
- Customize → drive → reload the page → the identical build comes back.
- Garage preview responds in < 100 ms; mesh re-merge < 5 ms.

## M3 · World tech foundation (weeks 13–18)

- [x] World baker v1: height, road carving, rule-based surface map with overrides, region packs, hashed manifest _(generated in a worker and cached instead of baked files, see decisions/0004)_
- [x] Streaming: chunk grid, LOD rings, workers, pools, physics collider radius, prefetch, resident low-LOD island _(GPU LOD terrain + streamed physics chunks; resident whole-island LOD instead of a separate mesh)_
- [x] Terrain shader: vertex surface weights, detail textures, triplanar cliffs _(procedural per-surface detail)_
- [ ] Road meshes from splines; runtime road graph (nearest point, A* routing) _(routing (A*) not yet)_
- [ ] Vegetation scatter in a worker, instancing, wind, impostors v1, grass v1
- [ ] Water v1: sea, lake, ford volumes with drag, buoyancy and splashes
- [ ] Sky and day/night v1: sun/moon light with shadows, fog, colour-grading LUTs
- [ ] Remaining surfaces: cobble, snow, ice, rock, wood, shallow water; trail-map deformation v1 _(trail-map deformation not yet)_
- [ ] Dev editor v1: road splines and POI placement, saved to JSON
- [ ] Performance HUD (frame breakdown, draw calls, triangles, memory) and a recorded benchmark route _(tools/perf.mjs and tools/tour.mjs measure from outside the game; no in-game HUD yet)_
- [ ] Leak test: 30-minute automated drive, heap stays flat

**Exit criteria**

- Cross a 2 × 2 km greybox island at 170 km/h with no visible holes and no hitches > 50 ms.
- [06](06-technical-architecture.md) budgets met at Medium on target hardware (greybox content).
- All 12 surfaces have distinct grip, sound and particles.

## M4 · Vertical slice (weeks 19–24)

A finished, shippable-quality 30 minutes. This is the most important milestone.

- [ ] Home Valley (~1 × 1 km) at final quality: village, farm, home garage, viewpoint, two trails
- [ ] 3 cars at final art: hatchback, 4×4, camper van (with camp deploy)
- [ ] ~40 final parts; stickers v1 (livery texture, 20 stickers); 6 rims; 4 tyre types
- [ ] Activities: 20 collectibles, 3 viewpoints, 5 errands with the jostle meter, 1 campsite
- [ ] Economy v1 and unlock rules; letters/journal; the 10-minute onboarding from [02](02-game-design.md)
- [ ] Photo mode v1 + scrapbook
- [ ] Map v1 with fog of war and waypoints; compass HUD
- [ ] One radio station; valley ambience; companion pet v1 (idle, head out of the window)
- [ ] Title, pause, settings (graphics presets, remapping, audio, comfort), save slots, export/import
- [ ] PWA: precache the slice, offline badge, update flow
- [ ] Quality presets, auto-detect, dynamic resolution

**Exit criteria**

- External playtest with 10+ people who didn't build it: relaxing ≥ 4/5, driving feel ≥ 4/5, ≥ 70 % want to keep playing.
- Fully offline after the first load in all four browsers.
- No blocker bugs; performance budgets met **with final art**.
- **Re-plan:** measure the real cost of one region and one car from M4, then re-estimate M5. Drop to a smaller scope rung now if needed, not later.

## M5 · Alpha: content & feature complete (weeks 25–38)

Each region goes through greybox → gameplay pass → art pass → polish pass. Budget ~2 weeks per region, overlapping with systems work.

- [ ] Regions: Pinewood & Lakes, Coast & Dunes, Red Rock Canyon, Alpine Pass, Wetlands
- [ ] Cars: kei truck, pickup, roadster, rally hatch, dune buggy; the barn-find questline
- [ ] Full parts list (~300); all 6 tyre types; lockers, low range, snorkel, tyre-pressure system, field-control HUD
- [ ] Activities at full count: 150 collectibles, 12 viewpoints, 40 errands, 15 trails, 20 photo requests, 8 campsites, car wash
- [ ] Weather (rain, fog, snow) with wetness physics; rainbows
- [ ] Cruise mode, fast travel, map polish
- [ ] Three radio stations, all ambience, all engine sets
- [ ] Wildlife (deer, sheep, birds, crabs), NPCs with blip voices
- [ ] Remaining customization: two-tone patterns, text stickers, plates, interior and trinkets, horns, exhaust sounds, companion accessories, build codes, loadouts, tune tab
- [ ] Local achievements

**Exit criteria**

- Every P0 and P1 feature is in. All content exists at greybox quality or better.
- A tester can go from a new game through every region and car without dev tools.
- Medium budgets met in most regions; outliers are logged as Beta tasks.

## M6 · Beta: polish (weeks 39–44)

- [ ] Bug bash; fix every A and B bug (severity scale in [09](09-quality-risks-release.md))
- [ ] Per-region performance pass, memory-leak pass, load-time pass
- [ ] Economy and pacing balance, using local session logs that testers export
- [ ] Handling polish for every car; all acceptance tests green
- [ ] Accessibility pass against the checklist in [02](02-game-design.md); comfort options checked with motion-sensitive players
- [ ] Audio mix pass and loudness consistency
- [ ] Onboarding polish from playtest recordings
- [ ] Full browser QA matrix; save migration tests from every alpha and beta version
- [ ] Pseudo-localization pass
- [ ] Credits and licence audit

**Exit criteria**

- No known A bugs; ≤ 10 B bugs and none involving saves.
- Three consecutive weekly builds pass the full QA matrix.
- Playtest "relaxing" score ≥ 4.3/5.

## M7 · Release (weeks 45–47)

- [ ] Release candidate; content freeze
- [ ] itch.io page with the HTML5 build, photo-mode screenshots, a 60–90 s trailer, GIFs, press kit
- [ ] Production deploy (itch.io + your own domain) with the hosting checklist from [06](06-technical-architecture.md)
- [ ] Final offline test on clean browser profiles
- [ ] Launch posts: devlog, cozy-game and web-game communities, three.js showcase
- [ ] Hotfix process: boot or save bugs patched within 48 hours

**Exit criteria:** 1.0 is live, beta saves import cleanly, and no open A bugs.

## Post-launch candidates (P2)

Touch controls and tablets · trailers and a camper trailer · winch · seasons · a second island · car meets · time-trial ghosts · Tauri desktop download · local mod packs (custom parts via file import) · more languages.

## Start here: week 1

1. Confirm the assumptions and pick a scope rung in [01](01-vision-and-scope.md).
2. Scaffold the project in this folder and install the core stack. When Vite says the folder is not empty, choose **Ignore files and continue**. The other choice deletes this `docs/` folder.

```bash
npm create vite@latest . -- --template vanilla-ts
npm i three @dimforge/rapier3d-compat preact @preact/signals idb tweakpane
npm i -D @types/three vitest @playwright/test @biomejs/biome vite-plugin-pwa zod
```

3. Add the CI workflow (lint, typecheck, test, build) and the folder layout from [06](06-technical-architecture.md).
4. Create `docs/decisions/` with a one-page decision-record template.
5. Start the renderer and physics spikes in `spikes/`.
6. Build a mood board: golden-hour photos, toy cars, the reference games in [01](01-vision-and-scope.md).
