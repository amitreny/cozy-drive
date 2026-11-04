# 0009 · The archipelago, Longreach International and model-built airports

**Status:** accepted

**The world is an 8 × 8 km archipelago.** The main island is unchanged at the centre (every road, town, save position and test keeps its coordinates). Around it, in `src/world/islands.ts`:

| Island | Where (+x is west) | What's there |
|---|---|---|
| **Longreach** | west across a 750 m strait, 5 km long | The causeway, Longreach town (10 homes, a café and stores), Longreach International, Longreach Pier, Beacon Hill |
| **Gull Isle** | north-east, 1.6 km | Gull Isle Strip (800 m grass), the hamlet of Gull Haven with its fish shack, a lane, Gull Haven Pier |
| **Pine Holm** | north-west, wooded | Pine Holm Helipad and Pier; no roads |
| **Lantern Rock** | south-east | A lighthouse (flashes at night) beside Lantern Rock Helipad |
| **Seal Skerries** | off the harbour | Three bare rocks, scenery for boats and seaplanes |

- Each outlying island is an ellipse with a noisy coast, a 260 m beach rise, gently rolling ground and a few hills (`islandHeight` in `terrainGen.ts`). The terrain is the highest of the main island and every island at each point, so they never interfere.
- **Same 2 m grid, four times the area.** Heights and surfaces are now 4097² samples (84 MB; the GPU height texture is 4097², within WebGL2's usual 16k limit). First-launch generation takes about 11 s in the worker, up from 4 s, and is cached as before. Sea cells are cheap: the island functions bail out on a bounding circle.
- **Rendering cost stays flat.** Terrain chunks wholly under the opaque open sea (deeper than 6 m) are never drawn, trees are culled per 1 km tile as before, and each airport's buildings and parked aircraft are hidden beyond the fog (which opens out with height). Measured with `tools/perf.mjs` at the village: 24.5–27.5 fps against 28 on the 4 km island, within run-to-run noise. Before the per-airport culling it was 22.5.
- **The map** paints at 4 m a pixel (2048²) and the fog of war at 16 m a pixel, so both look as they did.

**Landmasses.** `landmassAt(x, z)` says which island a spot is on. Longreach shares the main island's landmass because the causeway joins them. Airport access roads only join a road on their own landmass (Pine Holm and Lantern Rock get none), and road-delivery jobs only go to homes and shops a car can reach from the job board.

**The Longreach Causeway** is an ordinary highway with `minHeight: 3.5`. Over the strait the road's fill banks carve an embankment up out of the sea floor, so it needed no bridge geometry.

**Bigger runways.**
- **Island Airfield: 900 m → 1.2 km**, extended north-west from its old southern threshold, which stays where it was.
- **Longreach International: 3.2 km × 45 m (runway 18/36)**, long enough for a 787 at its heaviest, about 2.9 km at sea level. It is level to within 10 cm end to end.

**Airport geometry by ICAO code letter** (`CODES` in `airports.ts`). Everything that was a fixed number in `airport()` is now looked up:

| | B (light aircraft, turboprops, the jet) | E (787, A350: up to 65 m span) |
|---|---|---|
| Parallel taxiway, runway centreline to taxiway centreline | 29 m (on a 30 m runway) | 95 m |
| Taxiway width | 15 m | 23 m |
| Apron edge, from the runway edge | 28 m | 124 m |
| Taxiway turn radii | 7 / 12 m | 30 / 45 m |
| Hold-short line, from the runway edge | 4 m | 40 m |
| Hangar (barn) door × depth × height | 18 × 26 × 17.5 m | 66 × 96 × 64 m |

A taxiing 787 on Longreach's parallel taxiway has its wingtips 42 m clear of the runway's edge and 21 m clear of the apron. Long runways (2.4 km and up) also get:
- an aim point 300 m in, with the aiming-point blocks and touchdown-zone bars painted;
- 900 m of approach lights with two crossbars, standing on the water where they run out over the sea;
- wider piano keys and bigger runway numbers.

**Ready for the Dreamliner.** A 787-class aircraft only needs `minRunway: 2500` in its spec. The hangar's existing `usableAt` then offers it only at Longreach (tested). Longreach also has a terminal with an A320-size and a 787-size airliner at its stands, two hangars a wide-body fits in, a fire station with its engine, an air-cargo depot, an apron bus and a catering truck.

**Buildings come from published models, not code** (`src/world/worldModels.ts`, credited in CREDITS.md). Each model is turned to face +z, has parts it shouldn't show left off, and is scaled evenly (never stretched) to its real size:
- **Fit modes:** `scale` uses a kit's own scale (Kenney's buildings at the town's ×7, so their floors match the houses'); `uniform`, `height` and `length` fit a footprint, a height or a length. The models come in units from millimetres to arbitrary thousands, so everything is measured from the bounding box.
- **Hangars are big barns, a stand-in.** No open (CC0/CC BY, no-login) hangar or control-tower model was found: Poly Pizza has none, and the good free ones (assetfactory's Airport Hangar and Control Tower, Matvis's Hangar on Sketchfab) need a signed-in download. A barn keeps its proportions, so the small fields' are 18 m wide and 17 m tall, and Longreach's (66 m wide, enough for a 787's span) are 64 m tall. **There are no control towers** until a real model is added. Tried and dropped: an army tent stretched to hangar size (its bunks became giant floating slabs) and a pagoda-like tower.
- **Air-cargo office:** the town's low Kenney shop (`kenney-commercial/building-e`) with the airfield's sign.
- **Terminal:** a row of Kenney office blocks along the frontage, three storeys at the town's scale, with the airport's name board.
- **Colliders:** every building has a box collider. Parked airliners have none, so a wingtip clipping one is harmless.

**Seeing the other islands.** The ground-level fog now runs from 900 m to 7 km (was 500 m to 3.4 km), so the islands 3–5 km off show through the haze; airport buildings are drawn out to the same distance. Trees are still drawn only within 2.2 km.

Tested in `tests/archipelago.test.ts`:
- islands with sea between them and open sea at the world's edge;
- the causeway above the sea, out over open water;
- every other road on its own island;
- homes and a business on the new islands, and road deliveries never crossing water;
- piers reaching water at least 1.5 m deep;
- Longreach: runway length, width and surface; levelling (under 0.8 % along, under 0.6 m out to the taxiway); 787 wingtip clearances; no trees on the paving; building sizes; the 300 m aim point; Longreach the only base for a 2.5 km aircraft;
- the longer Island Airfield keeping its threshold.
