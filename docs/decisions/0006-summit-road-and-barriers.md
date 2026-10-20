# 0006 · Summit Road, cliff barriers and road earthworks

**Status:** accepted

**Summit Road.** A 2.6 km asphalt road from the Village Road to the island's highest point: a stack of wide hairpins up the south-west flank, a second, tighter stack up the summit shoulder, then a loop round the summit dome to a small flat pad with a view all round. Viewpoint `vp-summit` ("Summit") sits on the pad.

- **How it was laid out.** The mountain is a steep (0.5–1.0), bumpy ridge, so hand-placed hairpins or a grid path search gave 40–70 m cuts or tall embankments. `tools/summit-road.mjs` uses a grade line instead: each leg crosses the corridor in 14 m steps and slides up or down the slope until the ground matches the design grade (9.5 %), with a minimum gap above the leg below. Hairpins are true semicircles (11–12 m radius) at the corridor edges. The lower stack stops before a hump on the crest, and the upper stack takes over from where it ends. The output is literal data in `src/world/roads.ts`; rerun the tool if the mountain's shape changes. Result: median cut/fill 4 m, 90 % under 18 m, tightest bend 7 m, legs at least 21 m apart.
- **Per-road overrides** on `RoadDef`: `maxGrade` (12 % here, like a real summit road), `smoothing`, `bankMax` (85 m, so the few deep cuts become broad saddles instead of canyons) and `summit` (pins the end just below the peak and levels the last metres onto the pad).
- **Summit dome.** Heights above 250 m are compressed (×0.35), so the summit is a rounded dome (~259 m) instead of a spike a road cannot reach. It is still the highest point.

**Road earthworks: bank blending.** Previously every terrain cell took its height from the single strongest road segment. Where two banks overlapped (stacked hairpin legs, junctions), the winner could flip from one cell to the next and leave a sheer stepped wall. Paved cells still take the closest road's exact height. Bank cells now blend every road that reaches them, weighted by `w⁴`, so stacked legs meet in one continuous slope.

**Drivable hairpins.** The first full autopilot climb stalled in a 9 m hairpin at 12 %. On the inside line that is ~17 %, and a front-drive car climbing carries little weight on its driven wheels, so it spun and slid onto snow. Three changes, all general:
- `limitGrade` flattens tight bends (`bendGrades`: the full limit above ~22 m radius, about two thirds of it at 9 m), as real mountain roads do.
- Road verges (3 m either side) that would be snow are plowed gravel, so running a little wide doesn't leave a car stranded.
- The autopilot measures the next ~18 m. In tight bends it shortens its look-ahead (pure pursuit otherwise cuts the inside), drifts to the centre of the road, slows, and eases the throttle.

**Frozen pond moved** from the Pass Road's cutting (where it stood on a pillar of ice) to a shelf on the plateau east of the pass, in view of the summit.

**Cliff barriers** (`src/world/barriers.ts`):
- **Dry-stone walls** wherever a road edge drops more than 3.2 m within 7 m. Stones vary in size and warm/cool grey and reach 2.5 m into the bank so they never float. A lantern post every ~26 m glows warm at night. Walls are solid: one static box per ~6 m. They never cross a road's pavement and bridge small gaps. Today that is ~700 m of wall, all on the Summit Road.
- **Chevron boards** (red on white, slightly retro-reflective) on posts round the outside of every bend tighter than 22 m on any road.

**Checks:** `tests/barriers.test.ts` (walls only above real drops, never on pavement, chevrons on the hairpins), the Summit Road test in `tests/places.test.ts` (reaches the highest point, never steeper than 12 %, no bend tighter than 6.5 m), the per-road grade in `tests/world.test.ts`.

Bumped `WORLD_VERSION` to 8.
