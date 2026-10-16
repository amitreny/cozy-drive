# 05 · World, Terrain Types & Surfaces

## Surface types

Base grip `μ` is for road tyres at nominal pressure. `Crr` is the rolling-resistance coefficient.

| Surface | Where | μ | Crr | Deforms | Particles | Sound | Visual cue |
|---|---|---|---|---|---|---|---|
| Asphalt | Main roads | 1.00 | 0.012 | No (skid marks) | Light smoke on big slip | Smooth hum, squeal | Dark grey, lane lines |
| Cobble | Village | 0.85 | 0.020 | No | None | Rattle + slight camera buzz | Stone pattern |
| Gravel | Logging roads | 0.65 | 0.030 | Faint lines | Gravel spray, dust | Crunch | Speckled light grey |
| Dirt | Tracks, farms | 0.70 | 0.030 | Ruts | Dust, or clods when wet | Soft crunch | Warm brown |
| Grass | Meadows | 0.55 | 0.050 | Flattened grass | Clippings | Swish | Grass blades |
| Mud | Wetlands, forest after rain | 0.35 | 0.120 | Deep ruts + sinkage | Splats that stick to the car | Squelch | Glossy dark brown |
| Sand | Dunes, beach, washes | 0.45 | 0.150 | Tracks + sinkage | Sand spray | Hiss | Pale ripples |
| Snow | Alpine | 0.35 | 0.080 (fresh) / 0.030 (packed) | Deep tracks | Powder puffs | Crunch, squeak | White, blue shadows |
| Ice | Frozen lake | 0.12 | 0.010 | Scratches | Shavings (studded) | Creak, glide | Glassy blue |
| Rock | Canyon | 0.80 | 0.020 | No | Chips, dust | Rumble, clunks | Red rock, cracks |
| Wood planks | Bridges, boardwalk | 0.75 | 0.015 | No | None | Clunk per plank | Planks |
| Shallow water | Fords, puddles | 0.50 | 0.100 + drag | Ripples | Splash, wake | Slosh | Reflective |

## Tyre × surface grip matrix

Multiplier on the surface μ. Road tyres are the 1.00 baseline. The point is that **every tyre loses somewhere**.

| Surface | Road | All-terrain | Mud | Snow/studded | Sand paddle | Rally gravel |
|---|---|---|---|---|---|---|
| Asphalt | 1.00 | 0.92 | 0.82 | 0.85 | 0.70 | 0.90 |
| Cobble | 1.00 | 0.95 | 0.88 | 0.90 | 0.75 | 0.95 |
| Gravel | 1.00 | 1.20 | 1.20 | 1.10 | 1.00 | 1.35 |
| Dirt | 1.00 | 1.20 | 1.30 | 1.10 | 1.05 | 1.30 |
| Grass | 1.00 | 1.20 | 1.35 | 1.10 | 1.10 | 1.15 |
| Mud | 1.00 | 1.40 | 1.90 | 1.20 | 1.10 | 1.20 |
| Sand | 1.00 | 1.20 | 1.20 | 1.00 | 1.80 | 1.10 |
| Snow | 1.00 | 1.25 | 1.30 | 2.00 | 1.10 | 1.20 |
| Ice | 1.00 | 1.10 | 1.00 | 3.00 | 0.90 | 1.10 |
| Rock | 1.00 | 1.10 | 1.15 | 0.95 | 0.85 | 1.00 |

Starting values only. Tune them on the proving ground against the acceptance targets in [03-vehicles-and-physics.md](03-vehicles-and-physics.md).

## Modifiers

- **Tyre pressure** (0.8–2.6 bar). Low pressure: soft surfaces (sand, snow, mud) get grip × 1.25 and sinkage − 40 %. Hard surfaces get grip × 0.9, `Crr` × 1.5 and mushier steering. High pressure: `Crr` × 0.85 on asphalt, worse on soft ground.
- **Wetness** (0–1, from weather). Asphalt grip × 0.75 when fully wet. Dirt blends toward mud properties. Grass × 0.8. Rock × 0.7. Wet sand near water is *firmer*: grip × 1.15 and less sinkage.
- **Existing ruts.** Driving in packed tracks gives grip + 10 % and `Crr` − 30 %. Following someone's ruts is easier, as in real life.
- **Surface blending.** Each wheel blends up to 2 surfaces at borders, so grip never "pops".

## World structure

- **Size:** 4 × 4 km island, origin at the centre. Float32 precision is fine at this size. Floating origin is only needed if the world grows past ~8 km.
- **Grid:** 128 m chunks (32 × 32 = 1024). Chunks are packed into **512 m region packs** (64 files, ~100–200 KB compressed each) to keep request counts low.
- **Always resident:** a whole-island low-LOD terrain mesh (16 m spacing, ~65 k vertices). There are never holes at the horizon.

### Data layers (baked offline, see [07-art-audio-pipeline.md](07-art-audio-pipeline.md))

| Layer | Resolution | Format | Used by |
|---|---|---|---|
| Height | 2 m | uint16, delta + deflate | Rendering, physics, AI, map |
| Detail height | Procedural, 0.5 m | Deterministic noise, amplitude per surface | Near-field render + physics (same shared function) |
| Surface id | 1 m | uint8 id, run-length + deflate | Physics grip, splat colour, particles, audio |
| Biome & moisture | 8 m | uint8 × 2 | Scatter rules, weather, ambience |
| Road graph | Vector | JSON: nodes, spline edges, width, surface, name | Road meshes, carving, GPS, cruise mode |
| POIs & triggers | Vector | JSON | Activities, discovery, audio emitters |
| Water bodies | Vector | JSON: sea level, lake polygons, river splines | Water meshes, physics volumes |
| Scatter rules | Per biome | JSON: species, density, slope/height/moisture limits | Runtime scatter in workers |

Vegetation instances are **not** shipped. Workers regenerate them deterministically from the rules and a per-chunk seed, with exclusion masks from roads and POIs. This saves tens of MB of download.

## Streaming

| Layer | Radius | Detail |
|---|---|---|
| Physics heightfield + static colliders | 192 m | Rapier heightfield per chunk. Activate at most 1 chunk per frame |
| Terrain LOD0 | 0–250 m | 0.5–1 m spacing including detail noise |
| Terrain LOD1 | 250–600 m | 2 m spacing |
| Terrain LOD2 | 600–1200 m | 4 m spacing |
| Terrain far | 1200 m → horizon | Merged 512 m tiles, then the resident island mesh |
| Buildings & rocks | 0–600 m full, to 1500 m low LOD | |
| Trees | 0–300 m mesh, 300–1500 m impostors | Pre-baked 8-view billboards |
| Grass & small plants | 0–60 m | Fades out with distance |
| Gameplay triggers, audio emitters | 0–300 m | |

- **Workers** do the heavy work: decompression, chunk mesh building, scatter. Results return as transferable `ArrayBuffer`s.
- **Main-thread budget:** ≤ 2 ms per frame for activating chunks (GPU upload, collider creation).
- **Prefetch** along the velocity vector: the faster you go, the further ahead it loads. At 170 km/h a chunk lasts ~3 s, so keep 2 rings ahead.
- **Pooling:** chunk geometries and instance buffers are reused, not reallocated. Everything unloaded is disposed through a resource tracker, which leak tests verify.
- LOD seams are hidden with skirts. Physics heightfields overlap by one sample at borders so wheels never catch on seams.

## Terrain rendering

- **Approach:** chunked meshes with distance-based LOD and skirts. Simple and debuggable. Move to a GPU clipmap only if profiling shows terrain CPU cost is the bottleneck.
- **Shading:** stylized. Per-vertex surface weights and colour, low-frequency colour variation noise, and small tiling detail textures (texture array) near the camera. Triplanar mapping on steep slopes (cliffs).
- **Roads:** ribbon meshes generated along road splines, with UVs along their length and soft edges blended into the terrain. The baker **carves** the terrain under roads (flattened bed, smooth shoulders, gentle banking). That way physics only needs the heightfield, and roads never float. Bridges are separate meshes with trimesh colliders.
- **Trails:** narrower dirt ribbons, or surface paint plus a slight carve, with marker posts as props.

## Water

- **Sea:** stylized shader with depth-based colour, shoreline foam from the depth texture, gentle waves (Gerstner on High).
- **Lakes:** flat polygons at fixed heights. **Rivers:** spline ribbons with flow-map normals. **Waterfalls:** animated meshes plus particles.
- **Physics:** water volumes are Rapier sensors. They drive drag, partial buoyancy, wading-depth checks and splash effects.

## Vegetation

- Per-chunk, per-species `InstancedMesh` (or `BatchedMesh`) so frustum culling works per chunk.
- Wind sway in the vertex shader, with world-space phase so neighbours move together.
- Trees have cylinder colliders inside the physics radius. Bushes and tall grass have no collision but bend away from the car via a shader uniform.
- Grass: instanced clumps within 60 m on grass surfaces only, coloured from the terrain, flattened by the trail map. No grass on Low.

## Deformable surfaces & effects

- **Trail map:** a render target (1024² Medium, 2048² High) covering 128 × 128 m around the car, with wrap-around addressing so it scrolls without copying. Wheels stamp depth and width on mud, sand and snow. The terrain shader reads it for darkening and normal perturbation. Tracks fade after ~10 in-game minutes.
- **Rut grid:** a coarse 0.5 m CPU-side copy gives the physics its "packed track" bonus.
- **Particles:** pooled, GPU-instanced quads with per-surface emitter presets. Budget: 4,000 live particles. Soft particles on High.
- **Skid marks:** ring-buffer ribbon meshes per wheel on hard surfaces, max 2,000 segments, fading.
- **Car dirt:** wheel slip on mud, dust and snow raises the car's per-region dirt level (see [04-customization.md](04-customization.md)).

## Sky, time of day & weather

- **Sky:** analytic sky dome, sun and moon, stars at night, 2–3 scrolling cloud layers plus a few billboard cumulus.
- **Light:** one shadow-casting directional light (sun by day, moon by night) and a hemisphere ambient tinted by time of day. Fog colour comes from the sky horizon.
- **Grading:** colour-grading LUTs for dawn, day, golden hour, dusk and night, blended over time.
- **Night:** car headlights are 2 spotlights (shadows on High only). Tail lights, street lamps and windows are emissive with bloom, plus fake light pools as projected decals. At most ~4 dynamic lights at once. Campsite lantern: one point light within 50 m. Fireflies.
- **Weather blend:** per-region states drive global parameters (cloud cover, rain, fog, snow, wetness, wind) that interpolate over 60–120 s.
- **Rain:** GPU particles in a camera-following volume, drops on the windshield in cockpit view, wiper animation. Wetness lowers roughness, darkens albedo, adds puddles on flat ground and feeds the physics wetness value.
- **Snow:** height-based snow coverage in the alpine region, falling-snow particles, softer ambient audio.
