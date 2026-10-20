# 0008 · Detailed low-poly car models

**Status:** accepted (supersedes 0003)

**Context.** The Kenney Car Kit (0003) was clean but toy-like. The goal was cars like IvOfficial's Range Rover on Poly Pizza: low-poly but semi-realistic and textured, with real proportions, trim, roof racks and number plates.

**Decision.**
- **Seven CC BY 3.0 models from Poly Pizza** (`public/models/cars/`, 5.4 MB in all), one per car type. Each model is credited in `CREDITS.md` and on the garage panel. In-game names are our own; the real makes are named only in the credits.

  | Car | Model |
  |---|---|
  | Pip | AE86 |
  | Maple | 80s sedan |
  | Badger | Range Rover |
  | Biscuit | Generic Van |
  | Bramble | L200 |
  | Comet | RX-7 |
  | Skipper | Buggy |

- **One loader for any model** (`vehicle/detailedModel.ts`). `DETAILED` lists each car's file, credit and a yaw that turns the model nose-forward (+z): the van and buggy face sideways, and the sedan faces backwards. The procedural bodies stay as a fallback.
- **Wheels are found, not authored.** The loader first looks for parts named wheel, tire, tyre or rim. Otherwise it takes the biggest round, low part at each corner, plus any parts inside it (hubs, brake discs). The wheels are pulled out of the body, re-centred on their hubs and driven by the physics.
- **Physics follows the model.** `fit()` in `spec.ts` scales each model to its real wheelbase. From that it derives the wheel radius, axle positions, track, collider box and ride height, and rescales the final drive so road speeds don't change. The wheels are centred across the track (two models were off-centre). An optional `comZ` moves the centre of mass forward for front-engined cars, so Maple's front-wheel drive still has weight over the front wheels.
- **Paint without re-authoring.** Each body triangle's colour is sampled from the model's texture or material, then grouped by hue (or by lightness for greys). The biggest group becomes the player's paint. Each triangle keeps its shade relative to the paint, so baked panel shading survives repainting. Glass, headlights and tail lights get the game's own materials; everything else keeps the original texture.
- **Wheel options** reuse the model's own wheels. Black wheels darken the rims and sport wheels turn them gold. Sand tyres widen the wheels by 30% and off-road wheels by 20%.

**Consequences.**
- The cars look far more grown-up and stay cheap to draw: one draw call per material.
- A new car costs one `DETAILED` line and one `fit()` entry, measured with the scratch tooling.
- Two-tone models like the AE86 repaint only their main colour, so the second tone stays.
- Models without coloured lights (the sedan) keep their grey lamp lenses.
