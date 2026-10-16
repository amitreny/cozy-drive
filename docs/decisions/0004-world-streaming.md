# 0004 · 4 × 4 km world: worker generation, GPU terrain, streamed physics

**Status:** accepted

**Context.** The 1 × 1 km prototype island felt small, the terrain looked soft (vertex colours on a 2 m mesh), and there were no long roads for cruising.

**Decision.**
- **Generation:** the island (4096 m, 2 m height and surface grids, roads, scatter) is generated in a Web Worker (~3.5 s) and cached in IndexedDB under `world-v{WORLD_VERSION}`. Bump `WORLD_VERSION` in `terrainGen.ts` whenever generation changes. This replaces the plan's offline world baker for now: nothing extra to download, still deterministic.
- **Rendering:** heights and surface ids are GPU textures. Four instanced chunk grids (2/4/8/16 m spacing, 128 m chunks, skirts) are displaced in the vertex shader: 4 draw calls for the whole island. A per-surface procedural shader (texture-based value noise, anti-aliased by screen footprint) gives grass patches, gravel grain, rock strata, sand ripples, cobbles and ice cracks.
- **Physics:** 128 m heightfield chunks plus their tree and rock colliders stream in around a point ahead of the car (≤ 2 chunks per frame; the chunk under the car always loads at once).
- **Roads:** highways have a 6 % max grade and wide smoothing; cuts and fills get ~37° banks sized to their depth; junctions are locked during grade limiting; open road ends don't carve past their end.
- **Shadows:** only trees within 130 m of the car cast shadows (a shadow-only instanced set); the tiled forest itself casts none.

**Consequences.** 60 fps at 720p on the dev machine's GPU in the browser check, first launch ~4 s, later launches skip generation. The bump effect is limited to gentle nearby ground because derivative-based bumps alias on steep walls.
