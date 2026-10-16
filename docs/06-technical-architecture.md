# 06 · Technical Architecture

## Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript, strict mode | Safety for data-heavy systems (parts, specs, saves) |
| Build & dev server | Vite | Fast hot reload, native ESM, workers and WASM support, PWA plugin |
| Rendering | three.js `WebGPURenderer` + TSL shaders, automatic WebGL2 fallback | Biggest ecosystem; TSL compiles one shader source to WGSL and GLSL; compute where WebGPU exists |
| Physics | Rapier 3D (`@dimforge/rapier3d-compat`) | Fast, deterministic WASM. Heightfields, shape casts, sensors. The compat build inlines the WASM, which makes offline bundling trivial |
| UI | Preact + `@preact/signals` | Tiny and React-like. Game code publishes signals without importing any UI code |
| Entities | `miniplex` or plain typed arrays | Few dynamic entities in this game; keep it light |
| Storage | IndexedDB via `idb` | Async, large blobs (photos), transactions |
| Offline | `vite-plugin-pwa` (Workbox) | Hashed precache manifest, controlled update flow |
| Audio | Web Audio API directly | Engine sound needs low-level control |
| Debug UI | Tweakpane | Live tuning of physics and visuals |
| Data validation | zod, in build scripts and CI only | Schemas for cars, parts, surfaces; not shipped to players |
| Asset processing | glTF-Transform CLI, meshoptimizer, KTX2 (Basis Universal) | Small meshes, GPU-compressed textures |
| Lint & format | Biome | One fast tool |
| Tests | Vitest (unit, physics), Playwright (browser end-to-end) | |
| CI/CD | GitHub Actions | Lint, typecheck, test, build, e2e, deploy |
| Hosting | Static only: itch.io + GitHub Pages or Netlify | No server exists |

### Alternatives considered

- **Babylon.js + Havok:** strong all-in-one engine with a great inspector. A fine choice if you already know it. Heavier bundle and fewer stylized examples.
- **Godot web export:** great editor and a built-in vehicle body. Large WASM payload, slower first load, weaker Safari and mobile story.
- **Unity WebGL:** heavy downloads and long load times. Works against "instant & offline".
- **react-three-fiber:** pleasant, but adds React reconciliation to hot paths and fights a fixed-step simulation loop. Imperative three.js + Preact for menus is simpler here.

### Decision gate: WebGPU (end of M0)

Run the M0 renderer spike on the target laptop in Chrome, Firefox and Safari, once with WebGPU and once with the WebGL2 fallback forced. If the fallback runs below ~80 % of plain `WebGLRenderer` for our scene, ship on `WebGLRenderer` with GLSL and revisit at Beta. Scene-graph code is the same either way; only shaders and post-processing differ.

### Version & dependency policy

- Pin exact versions. Upgrade three.js once per milestone on its own branch, since it ships breaking changes often.
- **No runtime network dependencies.** Self-host every decoder and transcoder (Basis, meshopt), all fonts and all WASM. A CI step fails the build if the output references any external `http(s)` host.
- Keep the runtime bundle lean: target ≤ 1.5 MB of gzipped JS + WASM for the app shell.

## Module layers

```
  ui ............ Preact screens & HUD. Reads signals, sends commands.
   │
  game .......... State machine: Boot → Title → Loading → Driving ⇄ Garage | Photo | Map | Pause
   │
  features ...... gameplay (activities, economy) · vehicle (spec, physics) · customization
                  world (streaming, terrain, water, weather) · camera · audio
   │
  core .......... loop · time · events · input · assets · save · physics wrapper · render wrapper
```

**Rules**

1. Dependencies point downward only. `core` never imports a feature.
2. UI never touches three.js or Rapier objects. It reads signals and dispatches commands.
3. Simulation state (positions, progress, owned parts) is separate from presentation (meshes, sounds, particles). Presentation can always be rebuilt from simulation state. Saves serialize simulation state only.
4. Pure logic has zero three.js or DOM imports: `resolveSpec`, tyre curves, surface lookup, economy, save migrations. All of it runs and is tested in Node.
5. Content lives in `data/` JSON. Code never hard-codes content ids, except in tests.

## Main loop

```ts
const STEP = 1 / 120;              // 1/60 on Low
const MAX_STEPS = 4;               // avoids the "spiral of death" after a hitch
let acc = 0, last = performance.now();

renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  input.poll();
  acc += dt * timeScale;           // timeScale = 0 while paused
  let steps = 0;
  while (acc >= STEP && steps++ < MAX_STEPS) {
    fixedUpdate(STEP);             // vehicle, Rapier step, triggers, weather sim
    acc -= STEP;
  }
  const alpha = acc / STEP;
  update(dt, alpha);               // interpolation, camera, streaming, particles, audio, UI signals
  render();
});
```

- On `visibilitychange` to hidden: pause, autosave, suspend the `AudioContext`.
- Menus that are static (map, settings) render on demand to save battery.

## Communication

- **Signals** for continuous state the UI shows: speed, gear, Acorns, time of day, prompts.
- **Typed event bus** for one-off happenings: `collectibleFound`, `errandCompleted`, `surfaceChanged`, `regionEntered`. Gameplay, audio and UI subscribe independently.
- **Commands** from UI to game: `fitPart`, `buyPart`, `setPaint`, `startPhotoMode`, `fastTravel`. Each is a plain object, which makes undo/redo and testing easy.

## Workers

| Worker | Job |
|---|---|
| Terrain | Decompress region packs, build chunk meshes and heightfield arrays |
| Scatter | Deterministic vegetation and rock placement per chunk |
| Livery | Compose sticker and text layers in an `OffscreenCanvas` |
| Utility | Save export compression, map-reveal mask compression, photo thumbnails |

Message passing uses transferable `ArrayBuffer`s and a small typed RPC wrapper (or Comlink). Physics stays on the main thread: one player vehicle does not justify the cross-origin-isolation headers that shared memory needs.

## Assets & resources

- An asset manager with reference counting and an LRU cache for GLB files and textures.
- `KTX2Loader` and `MeshoptDecoder` are configured once, pointing at self-hosted files.
- **Shader pre-compilation** (`renderer.compileAsync`) during loading screens and garage entry prevents first-use hitches.
- A resource tracker disposes geometries, materials and textures on unload. Dev builds show a live count to catch leaks.
- Zero allocations in hot paths: reuse temp vectors, pool particles and chunk buffers.

## Offline & PWA

- **Precache at install** (~25 MB): app shell (HTML, JS, CSS, WASM), UI art, the starter car, Home Valley region packs, core audio.
- **Runtime cache** (cache-first, versioned by hash): other regions, car types, radio stations. Settings has "Download full world for offline" with a progress bar, and the title screen shows "Ready for offline ✓" once everything is cached.
- **Updates:** a new service worker installs in the background. The player sees "Update ready, it applies next launch". Never reload mid-session. Old caches are cleaned using the manifest.
- **Persistence:** call `navigator.storage.persist()` after the first save (browsers grant it more readily after engagement). Settings shows `navigator.storage.estimate()`. Keep the full install ≤ 200 MB.
- **Safari caveat:** sites that are not installed can have script-written storage cleared after 7 days without interaction. Prompt players to install the app (Add to Dock / Home Screen) and to export saves. Installed web apps are exempt.
- **Not supported:** opening `index.html` from disk. Service workers, ES modules and `fetch` don't work on `file://`. "Offline" means "visit once, then play without network", or the installed PWA. A true download build (Tauri) is a post-1.0 option.
- **Hosting checklist:** `.wasm` served as `application/wasm`, service worker at the root scope, long-cache headers for hashed assets, no-cache for `index.html` and `sw.js`.

## Save system

**IndexedDB stores**

| Store | Contents |
|---|---|
| `profile` | Settings, key bindings, comfort options |
| `slots` | 3 save slots: progress, owned parts, builds, Acorns, car position, clock, weather seed |
| `photos` | Scrapbook images and thumbnails per slot (blobs) |
| `mapReveal` | Compressed fog-of-war mask per slot |
| `meta` | Schema version, rolling backups, checksums |

- **Versioned schema** with a `saveVersion` field and an ordered list of migration functions. Every migration is unit-tested against fixture saves from **every** past version. Fixtures are kept forever.
- **Autosave:** every 60 s while driving, on leaving the garage, when camping, and when the tab is hidden. Don't rely on `beforeunload` for async writes.
- **Safety:** one IndexedDB transaction per save, a CRC32 checksum, and the last 2 autosaves kept as backups. On a corrupted save, load the backup and tell the player gently.
- **Export / import:** one `.json` file, with photos optionally as a `.zip`. Import runs schema validation and migrations.
- **Local error log:** a ring buffer of the last 200 errors and warnings, exportable from Settings for bug reports. Nothing is ever sent anywhere.

## Input

- Action-based map: throttle, brake, steer, handbrake, shift up/down, look, camera, horn, lights, flip, cruise, photo, map, pause, tyre pressure ±, drive mode, diff lock.
- Devices: keyboard (WASD and arrows), Gamepad API standard mapping (analog triggers, rumble where `vibrationActuator` exists), mouse for camera orbit and menus.
- Remapping UI with conflict detection, saved in the profile.
- Button prompts follow the last-used device.
- Touch controls are post-1.0.

## Audio

- **Buses:** master → music, engine, sfx, ambience, ui; a compressor on master. A low-pass "inside the car" filter for cockpit view and closed roofs.
- **Engine:** 4–6 loops per car type (on and off throttle at several RPM points), cross-faded by RPM and load, pitched with `playbackRate`. Exhaust parts swap the sample set or EQ.
- **Surfaces:** per-wheel rolling loops blended by contact weights and speed. One-shots for bumps (suspension velocity spikes), splashes and gravel kicks.
- **Ambience:** biome beds cross-faded by biome weight at the listener. Positional emitters for rivers, waterfalls, sea and birds (HRTF panning on High). Night variants with crickets.
- **Music:** long radio tracks stream through `<audio>` elements from the cache. Short loops and SFX are decoded `AudioBuffer`s.
- **Unlock:** resume the `AudioContext` on the first key press or click on the title screen.
- **Codecs:** Opus (WebM) with AAC (`.m4a`) fallback. Verify gapless looping per browser in M0. Loops use `loopStart`/`loopEnd` on decoded buffers to dodge encoder padding gaps.

## Performance budgets

Target: 1080p, "Medium", 2020-era integrated GPU (Intel Iris Xe / Apple M1).

| Metric | Budget |
|---|---|
| Frame time | 16.6 ms (60 fps) |
| Physics + vehicle (2 steps at 120 Hz) | ≤ 2.0 ms |
| Gameplay + streaming on main thread | ≤ 2.5 ms |
| Render CPU (culling, submission) | ≤ 4.0 ms |
| GPU frame | ≤ 11 ms |
| Draw calls | ≤ 250 |
| Visible triangles | ≤ 1.5 M |
| Texture memory | ≤ 512 MB |
| JS heap | ≤ 350 MB, flat over a 30-minute drive |
| GC pauses while driving | None > 4 ms |
| Download to first drive | ≤ 25 MB |
| Full offline install | ≤ 200 MB |
| Time to drive, cold / cached | ≤ 10 s / ≤ 3 s |

## Quality presets

| Setting | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Render scale | 0.75 + dynamic | 1.0 + dynamic | 1.0 | 1.0–1.5 |
| Shadows | Blob shadow under car | 1 cascade, 1024 | 2 cascades, 2048 | 3 cascades, 2048 |
| View distance | 1.2 km | 2 km | 3 km | Whole island |
| Grass radius | Off | 40 m | 60 m | 80 m |
| Trail map | Off (decals only) | 1024² | 2048² | 2048² |
| Post-processing | Tone map + fog | + bloom, colour grading | + SSAO | + depth of field, god rays |
| Reflections | Sky environment | Sky environment | Dynamic cube map, low | Dynamic cube map |
| Physics rate | 60 Hz | 120 Hz | 120 Hz | 120 Hz |

- **Auto-detect** on first launch: measure frame times during a short scripted fly-over behind the title screen, then pick a preset.
- **Dynamic resolution:** scale between 0.6 and 1.0 to hold the target frame time.

## Optimization checklist

- Instancing for vegetation and props; per-chunk instance sets so culling works.
- Car meshes merged per material after customization.
- One shared palette-texture material for most props, which slashes material and state changes.
- LODs and impostors for everything beyond 300 m.
- KTX2 textures and meshopt-compressed geometry.
- Shader pre-compilation behind loading screens.
- Pools and reused temporaries; no per-frame allocation.
- Heavy work in workers; ≤ 2 ms per frame of main-thread streaming work.
- At most ~4 dynamic lights; fake light pools for lamps.

## Project structure

```
/
├─ src/
│  ├─ main.ts
│  ├─ core/            loop, time, events, input, assets, save, physics + render wrappers
│  ├─ game/            state machine, commands, session
│  ├─ vehicle/         spec types, suspension, tyre model, drivetrain, assists, controller
│  ├─ customization/   registry, resolveSpec, compatibility, assembly, paint, livery
│  ├─ world/           streaming, chunks, terrain, surfaces, roads, water, vegetation, weather, sky
│  ├─ gameplay/        activities, economy, progression, discovery, cruise mode
│  ├─ camera/          chase, cockpit, orbit, photo, cinematic
│  ├─ audio/           mixer, engine, surfaces, ambience, radio
│  ├─ ui/              Preact HUD, garage, map, scrapbook, settings, menus
│  ├─ workers/         terrain, scatter, livery, utility
│  └─ debug/           Tweakpane panels, overlays, telemetry, proving ground
├─ data/               cars, parts, tyres, surfaces, biomes, POIs, activities, i18n (JSON)
├─ assets-src/         Blender files, raw audio, source textures (Git LFS)
├─ public/assets/      optimized output (generated, never hand-edited)
├─ tools/              asset pipeline, world baker, validators, thumbnail renderer
├─ tests/              unit/, physics/, e2e/, fixtures/ (old saves)
└─ docs/               this plan
```
