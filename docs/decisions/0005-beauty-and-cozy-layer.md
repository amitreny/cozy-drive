# 0005 · Beauty pass and cozy layer (vertical-slice systems)

**Status:** accepted

**Visuals**
- **Post-processing:** scene → quarter-res bloom → warm grade + vignette (follows time of day) → tone mapping. `src/render/postfx.ts`.
- **Sky:** sun disc and halo, drifting fbm clouds lit by the sun, moon and stars at night. **Water:** depth tint from the terrain height texture, shoreline foam, animated waves, sky reflections. **Grass:** GPU blade clumps and wildflowers that wrap around the camera, sway in the wind and bend away from the car. **Trees** sway in the wind.
- **Adaptive quality:** resolution first (down to 0.75×), then bloom, then grass, restored with a cool-down. On an Intel HD 630 it settles around 56 fps with grass on.

**Cozy loop**
- **Discoveries:** 60 garden gnomes beside the roads (+20 🌰) and 9 viewpoints (+60 🌰, a postcard, map reveal). Viewpoints are chosen where the vista is wide and open; the Summit Cairn sits off-road high in the mountains as a reward for skilled 4×4 driving.
- **Economy:** Acorns, try-before-you-buy garage, Revert/Buy, nothing lost by leaving. Paint is always free; creative mode unlocks everything. Old saves keep the parts their car already had.
- **Map:** painted relief map with fog of war that clears as you drive; postcards collected beside it.
- **Autopilot (P):** pure-pursuit road following in the right-hand lane, speed set by road kind and curvature, honours cruise speed; steering or braking takes over.
- **Sound:** a generative 3-station radio (T) and procedural nature ambience (birds, crickets, waves). No audio files or licences needed.
- **Title screen** with the camera circling the parked car.

**Checks:** `tests/places.test.ts`, `tests/economy.test.ts`, the autopilot test in `tests/island.test.ts`, and `tools/gameplay.mjs` (end-to-end in the browser).

## Addendum: engine sound and audio mix

- **Engine:** synthesized per cylinder on the audio thread (`src/audio/engineWorklet.ts`). Each firing rings two exhaust resonators and a short noise burst; per-cylinder strength patterns give V8 burble and flat-engine lumpiness; throttle load adds weight and gentle grit; automatic level control keeps every car in a comfortable range. Plus an intake rush, and a muffled engine in the hood camera. Older browsers fall back to the previous oscillators.
- **Mix:** master → engine, radio, nature and effects channels. The Sound panel (Esc) has per-channel sliders, station buttons and mute; all saved with the game.
- **Check:** `tools/engine-check.mjs` renders every car offline and fails on clipping or silence, and writes rev-sweep WAVs for listening.

## Addendum: warmer engine and softer rolling sounds

- The first synthesized engine excited its resonators with single-sample clicks (flat spectrum = buzz), and a normalisation slip made the resonators ~30× too loud, so the output saturated into a square-ish wave. Now each firing is a rounded pressure pulse (raised cosine, ~40 % of the firing interval), the exhaust resonances are broad and unity-gain, the high "pipe" ring is gone, combustion noise is a low rumble, and a throttle-dependent two-pole low-pass acts as the muffler. Measured with `tools/engine-check.mjs`: the firing fundamental is now the strongest component, no saturation, brightness centroid ~150–430 Hz cruising (was 440–570) and ~500–830 Hz at full throttle (was 900–1700).
- Rolling sounds use pink noise with lower, softer band-passes and a per-surface low-pass, plus a slight random flutter. Grass went from a ~3.6 kHz hiss to a ~1.1 kHz swish.
- The most realistic step beyond this is recorded engine loops at several RPMs. Free CC0 options are scarce (see the conversation of Oct 2026); a commissioned or licensed set per car would be the release-quality path.
