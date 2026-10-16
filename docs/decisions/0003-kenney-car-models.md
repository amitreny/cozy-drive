# 0003 · Car bodies from the CC0 Kenney Car Kit

**Status:** accepted

**Context.** Procedural car bodies (0002-era `carBody.ts`) looked like stacks of shapes. Commissioned models are planned for later, but a better look was wanted now.

**Decision.**
- Use Kenney's Car Kit 3.1 (CC0, see `CREDITS.md`) for the hatchback, 4×4, camper van, sedan and pickup. The buggy keeps its procedural model. The procedural bodies stay as a fallback if the models fail to load.
- **Physics follows the model.** `fit()` in `spec.ts` sets wheel radius, axle positions, track, collider box and ride height from each model's measurements and scale, and rescales the final drive so road speeds are unchanged.
- **Paint without re-authoring.** Every model uses one palette texture. At load time, each body triangle's palette colour is read; tones are clustered by hue. The biggest cluster becomes the player's paint, the second the accent colour, dark bluish tones become glass, and bright front/red rear tones become lights. Each tone's lightness is kept as a vertex shade, so baked panel shading survives repainting.
- **Wheels** are separate Kenney wheel models (4 styles), scaled to the physics wheel and driven by it.

**Consequences.** Cars are clean, consistent and fully repaintable. The style is chunky and toy-like with big wheels, which suits a cozy game. New Kenney vehicles cost one `fit()` entry plus one line in `modelLibrary.ts`. Kenney models have narrower tracks than real cars, so anti-roll settings are a bit higher.
