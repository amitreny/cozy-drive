# 07 · Art, Audio & Content Pipeline

## Art direction

- **World: soft low-poly.** Chunky, rounded silhouettes, few textures, strong atmospheric fog. Matte surfaces.
- **Cars: glossy toys.** Slightly oversized wheels, short overhangs, bevelled edges. PBR paint so finishes really differ.
- **Light:** warm key, cool fill, long golden hours, blue-hour dusk. The sun is the main art tool.
- **Palette:** warm, slightly desaturated. Avoid pure black and pure white.

| Region | Palette mood |
|---|---|
| Home Valley | Sage, butter yellow, terracotta roofs |
| Pinewood & Lakes | Deep teal, moss, bark brown |
| Coast & Dunes | Sand, turquoise, white-wash |
| Red Rock Canyon | Rust, ochre, lavender shadows |
| Alpine Pass | Snow white, ice blue, pine green |
| Wetlands | Olive, reed gold, slate water |

- **UI:** rounded shapes, paper and postcard textures, one friendly handwritten-style accent font plus one clean UI font (both OFL-licensed and bundled), big hit targets.

### The palette-atlas trick

Most props and buildings use **one shared material** with a small (256²) palette texture. Each face's UVs point at a colour cell. Benefits: almost no texture memory, very few material switches, and recolouring a region (or adding seasons later) is a texture swap.

### Polygon & texture budgets

| Asset | LOD0 triangles | LODs | Textures |
|---|---|---|---|
| Car chassis | 15–30 k | 3 (30 k / 8 k / 2 k) | Palette + paint mask 1024² + livery 2048² (runtime) |
| Car part (bumper, rack…) | 0.5–3 k | Merged with car | Palette |
| Wheel (rim + tyre) | 2–4 k | 2 | Palette + tyre tread normal 512² |
| Tree | 1.5–4 k | 2 + impostor | Palette + leaf atlas 1024² |
| Bush, rock | 0.2–1.5 k | 2 | Palette |
| Building | 2–10 k | 2–3 | Palette + one shared trim sheet 1024² |
| NPC / companion | 3–8 k | 2 | Palette, rigged |

### Sourcing

- **CC0 starter kits** (Kenney, Quaternius) for prototype and filler props. Poly Haven for HDRIs and reference textures.
- **Commissioned or self-made:** the 8 car chassis, body parts, hero landmarks, companion pets. These carry the game's identity.
- Placeholder art must use the final budgets and naming rules, so swapping is drop-in.

## Blender → game conventions

- Units in metres, +Y up on export (glTF default), car forward = +Z (match three.js wheel and camera code).
- **Sockets:** empties named `socket_<id>` (for example `socket_roof`, `socket_bumper_front`, `socket_wheel_fl`).
- **Parts:** pivot at the socket origin, so attaching is "parent and zero the transform".
- **LOD naming:** `name_LOD0`, `name_LOD1`, `name_LOD2`. **Colliders:** `name_COL` convex meshes, stripped from render.
- **Car bodies:** non-overlapping UVs with large panel islands and even texel density (needed for stickers); a mirrored UV set for symmetric stickers; paint-mask texture painted on the same UVs.
- **Material slot names** map to paint slots: `paint_body`, `paint_trim`, `paint_accent`, `rim`, `glass`, `light_emissive`, `tyre`.

## Asset build pipeline

`npm run assets` turns `assets-src/` into `public/assets/`. Incremental: only changed sources rebuild.

1. **Validate** naming, sockets, material slots and triangle budgets. Fail loudly.
2. **Optimize meshes** with glTF-Transform: dedup, prune, weld, generate LOD1/LOD2 with the meshoptimizer simplifier, then meshopt compression.
3. **Textures** → KTX2: ETC1S for colour, UASTC for normal maps, mipmaps on, size caps per asset class.
4. **Thumbnails:** a headless browser renders every part with the real renderer and packs a sprite atlas for the garage.
5. **Manifest:** content-hashed file names plus a JSON manifest the game and the service worker both use.
6. **License check:** every source file must have an entry in `assets-src/licenses.json` (source, author, licence). CI fails otherwise, and `CREDITS.md` is generated from it.

## World baker

A Node tool, `tools/world-baker`. **Deterministic:** the same inputs always produce byte-identical outputs, so CI can cache it.

**Inputs**

| File | Made in |
|---|---|
| `world/height.png` (16-bit, 2048²) | Gaea / World Machine, or the in-house noise generator, then hand-sculpted |
| `world/biomes.png` (index map) | Painted in Krita or similar |
| `world/surface-overrides.png` | Painted ("force mud here") |
| `world/roads.json` | In-game editor (spline graph) |
| `world/pois.json`, `world/water.json` | In-game editor |
| `data/biomes/*.json` | Surface rules, scatter rules, ambience |

**Steps**

1. Validate all inputs against schemas.
2. Carve roads into the heightfield; mark bridge spans.
3. Derive slope, curvature and moisture (approximate flow accumulation).
4. Build the surface map: biome rules (slope > 35° → rock, above the snow line → snow, near water → mud or wet sand), then painted overrides, then rasterized roads.
5. Build scatter exclusion masks from roads, POIs and water.
6. Render the painted map texture: hillshade, biome colours, roads, water, paper grain.
7. Split into chunks and region packs, compress, write a hashed manifest.
8. Report: stats, plus warnings such as road grades over 15 %, POIs not connected to the road graph, or collectibles inside rock.

## In-game dev editor

Enabled only in dev builds (`?editor=1`).

- Road spline editing: move control points, set width and surface, live re-carve preview.
- Placement of POIs, triggers, collectibles, errand routes and trail markers.
- Brushes for surface overrides and scatter exclusion.
- Saving writes straight to `world/*.json` through the File System Access API (Chromium), or downloads the file elsewhere.
- A small Vite dev-server plugin re-runs the baker for touched region packs. This server exists only during development; the shipped game stays fully static.
- Data and region packs hot-reload without restarting the session or moving the car.

## Audio pipeline

- **Engine sounds:** per car type, on-load and off-load loops at ~4 RPM points. Sourced from libraries licensed for games, or recorded. Trimmed at zero crossings, normalized, 48 kHz masters.
- **SFX & foley:** CC0 sources (Freesound with the CC0 filter) plus home foley. A tray of gravel and a microphone go a long way.
- **Loudness targets:** music −16 LUFS integrated, ambience around −24 LUFS, SFX peaks ≤ −3 dBTP.
- **Encoding:** Opus (WebM) at 96–128 kbps with an AAC (`.m4a`) fallback for browsers that need it.
- **Music:** 3 stations × 6–8 tracks (~1 hour, ~45 MB). Commissioned, or CC0 / CC-BY with credit. Avoid NonCommercial licences if the game might ever be sold. Station 1 is precached; the others download on demand.

## Localization

- Every player-facing string lives in `data/i18n/en.json` under a key. ICU MessageFormat handles plurals.
- A pseudo-localization mode (+30 % length, accented characters) catches truncated or hard-coded text early.
- Bundled fonts must cover Latin Extended at minimum.
- English ships at 1.0. Other languages are post-1.0, which this pipeline makes cheap.

## Legal hygiene

- Fictional cars only: no real logos, badges, names or recognizable lookalike silhouettes.
- Fonts under OFL or similar, bundled with their licence files.
- Every third-party asset tracked with its licence; `CREDITS.md` generated from the record.
- Check the final game name for trademark conflicts before building a store page.
