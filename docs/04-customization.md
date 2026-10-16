# 04 · Car Customization

## Principles

- **See or feel every change within 2 seconds.** Instant preview in the garage, plus a test pad outside the door.
- **Looks and performance are separate tracks.** Any look works with any performance setup, within physical sense.
- **No part is best everywhere.** Functional parts trade strengths across terrain types. That trade-off is the game.
- **Data-driven.** A new part is one JSON entry plus one GLB model (or none, for paints and decals). No code changes.
- **Never punish experimenting.** Selling a part refunds 100 %. Owned parts stay owned across all builds.

## Customization layers

| Layer | What the player changes | Affects physics? |
|---|---|---|
| **Paint** | Primary, secondary and accent colour; finish (gloss, matte, satin, metallic, pearl, chrome); pattern (two-tone, stripes); patina slider for a weathered look | No |
| **Livery** | Stickers (120), custom text in 4 bundled fonts, licence plate text and style | No |
| **Body** | Front and rear bumpers, fenders and flares, hood, spoiler, side steps, mud flaps, bull bar | Slightly: mass, approach angle, drag |
| **Roof & cargo** | Rack, roof box, roof tent, light bar, surfboard, bikes, kayak, spare wheels | Mass, centre-of-mass height, drag |
| **Lights** | Headlight style and colour temperature, fog lights, light bar, underglow | Light bar improves night visibility only |
| **Wheels** | Rim style (24), size class, colour and finish | Wheel mass and radius change gearing |
| **Tyres** | Road, all-terrain, mud, snow/studded, sand paddle, rally gravel; width; sidewall | **Yes**: grip per surface, rolling resistance |
| **Suspension** | Lowered, stock, lift 1, lift 2, long-travel; adjustable springs and dampers | **Yes** |
| **Engine** | Stage 0–3 tune, engine swap per car type | **Yes** |
| **Transmission** | Auto/manual, short or long gearing, low-range kit | **Yes** |
| **Drivetrain** | FWD/RWD/AWD conversion where allowed, limited-slip diff, lockers | **Yes** |
| **Utility** | Snorkel, tyre-pressure system, skid plates, weight reduction, winch (P2) | **Yes** |
| **Interior** | Seat fabric, steering wheel, dash trinkets, mirror charm, plushies, air freshener | No |
| **Sound** | Horn (10), exhaust (6 sound profiles) | No |
| **Companion** | Dog or cat, collar, bandana, tiny hats | No |

Tyre grip per surface is defined in the tyre-surface matrix in [05-world-and-terrain.md](05-world-and-terrain.md).

## 1.0 content targets (~300 items)

| Category | Count | Shared or per type |
|---|---|---|
| Paint finishes | 6 | Shared |
| Curated colour swatches | 48 + free colour picker | Shared |
| Paint patterns | 6 per car type (48) | Per type (mask textures) |
| Stickers | 120 + text tool | Shared |
| Rims | 24 styles × 4 size classes | Shared by size class |
| Tyres | 6 types | Shared by size class |
| Body parts | ~10 per car type (80) | Per type |
| Roof & cargo | 20 | Shared by roof size class |
| Lights | 15 | Mostly shared |
| Performance parts | ~12 categories × 2–4 tiers | Mostly shared, some per type |
| Interior & trinkets | 50 | Shared |
| Horns & exhausts | 16 | Shared |
| Companion accessories | 12 | Shared |

Art cost control: anything that can be shared is shared by **size class** (S / M / L / XL). Per-type art is limited to the chassis, body parts and paint masks.

## Data model

All definitions live in `data/*.json`, are validated against schemas at build time (CI fails on errors), and load as typed objects.

```ts
type SizeClass = 'S' | 'M' | 'L' | 'XL';

interface CarType {
  id: string;                         // 'pip'
  model: string;                      // 'cars/pip/chassis.glb'
  baseSpec: VehicleSpec;              // stock physics values
  sockets: Socket[];                  // attachment points
  paintPatterns: string[];            // mask ids for this chassis
  tags: string[];                     // 'boxy', 'convertible', 'short-wheelbase'
  features: ('camp' | 'convertible' | 'cargoBed' | 'lowRange')[];
  defaultBuild: Build;
}

interface Socket { id: string; category: PartCategory; sizeClass?: SizeClass; node: string } // node = empty in the GLB

interface PartDef {
  id: string;
  category: PartCategory;
  model?: string;                     // GLB with pivot at the socket origin
  fits: { carTypes?: string[]; sizeClass?: SizeClass[]; requiresTags?: string[] };
  requires?: string[];                // e.g. 'suspension>=lift1' for XL tyres
  conflicts?: string[];               // part ids or categories
  hidesSockets?: string[];            // roof tent hides the roof-box socket
  paintSlots?: ('body' | 'trim' | 'accent' | 'rim')[];
  mass?: number;                      // kg, placed at the socket for CoM
  modifiers?: { path: string; op: 'set' | 'add' | 'mul'; value: number | string }[];
  unlock: { acorns?: number; collectible?: string; region?: string };
}

interface Build {
  version: 1;
  carType: string;
  parts: Record<string, string>;      // socketId → partId
  paint: { primary: Paint; secondary?: Paint; accent?: Paint; pattern?: string; patina: number };
  decals: { decal: string; uv: [number, number]; scale: number; rotation: number; color?: string; mirror?: boolean }[];
  tuning: Partial<Record<TuningKey, number>>;
  plate: string;
  name: string;
}

interface Paint { color: string; finish: 'gloss' | 'matte' | 'satin' | 'metallic' | 'pearl' | 'chrome' }
```

`VehicleSpec` holds every physics number from [03-vehicles-and-physics.md](03-vehicles-and-physics.md): mass, centre of mass, inertia scale, aero, engine torque curve, gearbox ratios, drivetrain layout and diffs, and per axle the suspension, steering, brakes, wheel and tyre values. It also holds derived values: clearance and wading depth.

## Build → Spec pipeline

`resolveSpec(build, registry) → VehicleSpec` is a **pure function**. The garage stats, the physics and save validation all use it.

1. Deep-clone the car type's `baseSpec`.
2. Apply part modifiers in a fixed order: by category priority, then `set` → `add` → `mul`.
3. Apply tuning sliders, clamped to ranges that fitted parts unlock (adjustable dampers unlock the damping slider).
4. Derive totals: mass and centre of mass from part masses at socket positions, effective gearing from wheel radius, wading depth from ride height and snorkel.
5. Sanity-clamp every value to physical ranges. Assert in dev builds.

Unit tests cover every modifier op, ordering, clamping, and a golden spec for each stock car.

## Compatibility rules

- A part fits if its car type, size class and tags match the socket.
- `requires` failures never silently remove parts. The garage explains ("Needs Lift 1 or higher") and offers a one-click "fit both".
- Conflicts show a preview of what will be removed before confirming.
- Loading an old or invalid build (from a save or a build code) repairs it: unknown parts fall back to stock and the player sees a notice.

## Rendering the custom car

- **Assembly:** load the chassis GLB, attach each part GLB to its socket node. "Stock" parts are ordinary parts, so there is no special case.
- **Draw-call merging:** after assembly, merge static meshes by material into ≤ 6 draw calls (paint, trim, glass, emissive, rims, tyres). Wheels stay separate as 4 instances of one merged wheel. Re-merge on change (target < 5 ms).
- **Paint shader:** physical material with base colour, metalness, roughness and clearcoat. Metallic adds a tiny flake normal noise. Pearl shifts hue with view angle. Chrome is high metalness, low roughness. Low quality drops clearcoat.
- **Patterns:** each chassis has a paint-mask texture (R, G, B = secondary, stripe, accent regions). The shader mixes the three paints by mask.
- **Patina & dirt:** the shader blends tiling rust, dust and mud textures. Patina is a static slider. Dirt is dynamic per region (the lower body gets dirty first) and washes off with an animation.
- **Stickers:** a per-car livery texture (2048², 1024² on Low) is composed in an `OffscreenCanvas` inside a worker. Stickers are placed in UV space: raycast on the car → hit UV → position. Mirror uses a symmetric UV map. Requirement for every chassis: clean, non-overlapping UVs with large panel islands and even texel density.
- **Text and plates:** rendered from bundled fonts into the livery canvas or a plate canvas texture.
- **Reflections:** baked environment map in the garage. In the world, a small dynamic cube map near the car on High, the sky environment on Medium and Low.
- **Thumbnails:** generated at build time by a headless render script using the real renderer, packed into a sprite atlas.

## Garage UX

```
┌─────────────────────────────────────────────────────────────┐
│ [Paint] [Livery] [Body] [Wheels] [Perf] [Interior] [Tune]   │
│ ┌────────┐                                  ┌──────────────┐│
│ │category│        car on turntable          │ Stats  Δ     ││
│ │  list  │     (camera preset per tab)      │ Speed   ▓▓▓░ ││
│ │        │                                  │ Off-road▓▓░░ ││
│ └────────┘                                  │ Mud ★★☆ Sand ││
│                                             └──────────────┘│
│ [ item grid: thumbnails, price, owned ]       [ Buy & fit ] │
└─────────────────────────────────────────────────────────────┘
```

- **Try before you buy:** focus or hover instantly previews a part. Confirming buys and fits it.
- **Undo/redo**, "Revert all", and "Surprise me" (random build from cozy palettes).
- **Camera presets per tab:** wheels get a low side angle, roof a top three-quarter view, interior the cockpit, plates the rear.
- **Stats panel:** Speed, Acceleration, Handling, Off-road, Comfort, Cargo, plus 1–5 star ratings for asphalt, gravel, mud, sand, snow and rock. Deltas show in green or red. Ratings come from heuristic formulas over the spec, calibrated once against proving-ground tests.
- **Tune tab** (unlocked by parts): plain-language sliders ("Softer ↔ Firmer") and presets: Comfy, Sporty, Trail, Snow, Dunes.
- **Loadouts:** up to 5 saved builds per car, switchable at any garage or camper van.
- **Test pad:** "Test drive" drops you on a short strip with mixed surfaces, then back to the garage.
- **Build codes:** a build serializes to a short text code (JSON → deflate → base64url, prefix `SD1-`). Import validates parts; unowned parts are previewed only, unless creative mode is on. Works offline by copy and paste.
- **In-field changes:** tyre pressure, 4WD mode and lockers adjust while driving. Paint and parts change only at garages and the camper van.
- Fully usable with a gamepad: tabs on bumpers, grid on the d-pad, rotate the car with the right stick.
