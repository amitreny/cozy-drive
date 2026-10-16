# 03 · Car Types & Vehicle Physics

## Car roster (1.0)

All names are placeholders. All designs are fictional. No real brands or lookalike silhouettes.

| Type | Placeholder | Drive | Mass | Power | 0–100 km/h | Top | Clearance | Signature feature | Unlock |
|---|---|---|---|---|---|---|---|---|---|
| Compact hatchback | Pip | FWD | 1000 kg | 60 kW | 11 s | 160 | 15 cm | Nimble, cheap parts | Start |
| Off-roader 4×4 | Badger | 4WD + low range | 1800 kg | 130 kW | 10.5 s | 150 | 28 cm | Diff locks, fords, rocks | Barn 1 |
| Camper van | Biscuit | RWD | 2100 kg | 90 kW | 16 s | 130 | 18 cm | Camp anywhere, mobile garage | Barn 2 |
| Kei truck | Tofu | RWD (4WD part) | 750 kg | 47 kW | 14 s | 120 | 18 cm | Cargo bed, tiny, cute | Barn 3 |
| Pickup | Bramble | RWD / 4WD | 1900 kg | 150 kW | 9 s | 160 | 23 cm | Bed cargo, all-rounder | Barn 4 |
| Vintage roadster | Dot | RWD | 900 kg | 70 kW | 10 s | 165 | 12 cm | Convertible roof, scenic | Barn 5 |
| Rally hatch | Sprite | AWD | 1200 kg | 150 kW | 6.5 s | 170 | 17 cm | Gravel and dirt hero | Barn 6 |
| Dune buggy | Skipper | RWD | 650 kg | 75 kW | 7 s | 150 | 30 cm | Long-travel, sand, jumps | Barn 7 |

Top speeds are deliberately modest (≤ 170 km/h). The world feels bigger, motion sickness drops, and streaming stays easy.

Vertical slice ships Pip, Badger and Biscuit. They cover road, off-road and the cozy "home on wheels".

### What makes a type distinct (beyond stats)

- **Own chassis model** with its own sockets (attachment points) and paint masks.
- **Unique mechanics:** Badger has low range and lockers. Biscuit deploys camp. Dot opens its roof (changes audio and view). Bramble and Tofu carry visible cargo for errands. Skipper has a tuned air-control feel.
- **Own sound profile:** engine samples, horn default, door and suspension sounds.
- **Shared part classes:** rims, tyres, roof items, trinkets and decals work across types by size class.

## Physics model overview

- **Library:** Rapier 3D (WASM). The chassis is a dynamic rigid body. Wheels are **not** rigid bodies. Each wheel is a raycast or shape cast plus a custom spring, damper and tyre model. This is the standard, stable approach for games.
- **Rate:** fixed 120 Hz step (60 Hz on Low), accumulator loop, render interpolation between the last two states.
- **Forces:** applied each step as impulses (`applyImpulseAtPoint(F · dt)`), because Rapier forces persist until reset.
- **Determinism:** fixed dt + recorded inputs → identical replays on the same build. This powers regression tests.
- **Prototype path:** in the M0 spike, use Rapier's built-in ray-cast vehicle controller to get moving in a day. Replace it with the custom model in M1 for per-surface tyre control.

### Chassis

- Collider: 1–3 convex hulls (body, cabin), not the render mesh.
- Mass from the resolved spec. Centre of mass lowered 10–25 cm below "real" for forgiving roll behaviour.
- Inertia tensor scaled per axis (yaw × 1.3–1.6) to calm twitchiness.
- Linear/angular damping small but non-zero. Continuous collision detection (CCD) on.

### Suspension (per wheel, per step)

1. Cast from the suspension mount along the chassis "down" axis, length = rest length + travel + wheel radius. Use a **shape cast** (cylinder or ball) for rocks and kerbs; plain raycast on Low quality.
2. Compression `x = clamp(restLen − (hitDist − radius), 0, travel)`.
3. Spring + damper: `Fs = k·x + c·ẋ`, separate bump and rebound damping, clamped ≥ 0. A stiff bump stop near full compression.
4. Anti-roll bar per axle: `Farb = kArb · (xLeft − xRight)`, added to one side and subtracted from the other.
5. `Fs` is the tyre's normal load `Fz` and is applied along the contact normal.

### Tyre model

Contact frame: forward `f` = wheel forward projected on the ground plane; side `s = n × f`.

- Contact velocity `v = linVel + angVel × (contact − com)`; `vLong = v·f`, `vLat = v·s`.
- Slip ratio `κ = (ω·r − vLong) / max(|vLong|, vMin)`. Slip angle `α = atan2(vLat, max(|vLong|, vMin))`.
- Grip: `μ = tyre.baseGrip × surface.grip × tyreSurface[tyre][surface] × wetness × pressureFactor`.
- Forces: `Fx = μ·Fz·curveLong(κ)`, `Fy = −μ·Fz·curveLat(α)`. Curves are simplified Pacejka or a 4-point spline. Peak near κ ≈ 0.1 and α ≈ 7°, then a **gentle** falloff to ~75 % (cozy: slides are catchable).
- Combined slip: friction ellipse. If `(Fx/μFz)² + (Fy/μFz)² > 1`, scale both down, favouring lateral grip slightly for stability.
- Rolling resistance: `Frr = Crr(surface, pressure) · Fz`, opposing `vLong`. Soft surfaces add **sinkage**: more resistance, and the wheel visual sinks a few cm.
- Low-speed stabilizer: below ~2 m/s, blend slip-based forces into a velocity-damping "sticky" force so cars don't creep on slopes or jitter at rest. The handbrake holds on any slope.

### Drivetrain

- **Engine:** torque curve as a table (6–8 RPM points), idle control, soft rev limiter, engine braking proportional to RPM.
- **Gearbox:** automatic by default (shift up at ~85 % RPM under load, down with hysteresis, 0.2–0.4 s shifts). Manual optional. Ratios and final drive come from the spec.
- **Clutch:** automatic launch slip below a threshold speed, so stalls are impossible.
- **Wheel spin:** `I·dω/dt = Tdrive − Tbrake − Fx·r`, semi-implicit integration. Braking never reverses ω (it locks at 0).
- **Differentials:** open (equal torque), limited-slip (coupling torque ∝ speed difference) and locked (strong coupling toward equal ω). Lockers are toggleable in the field.
- **Layouts:** FWD, RWD, AWD (fixed centre split, for example 40/60) and part-time 4WD with 2H / 4H / 4L. Low range multiplies the ratio by ~2.7 for crawling.

### Steering

- Ackermann approximation: inner wheel turns more.
- Max angle shrinks with speed (for example 35° at rest → 8° at 120 km/h).
- Keyboard input passes through rise/fall smoothing so digital keys feel analog. Gamepad gets a configurable deadzone and response curve.

## Assists

| Assist | Relaxed (default) | Standard | Sim-lite |
|---|---|---|---|
| Traction control (cuts throttle above slip κ threshold) | Strong | Light | Off |
| ABS (modulates brake above slip threshold) | On | On | Optional |
| Stability (small corrective yaw torque) | Strong | Light | Off |
| Counter-steer help | On | Light | Off |
| Anti-rollover (limits roll rate, auto-right prompt) | On | On | Prompt only |
| Air control (small torques when airborne) | On | On | Off |
| Gearbox | Auto | Auto | Manual optional |

## Feel layer (visual only, never affects physics)

- Extra visual body roll, pitch and a soft "bounce" spring on the render mesh, so cars feel cartoony-soft while the physics stays stable.
- Camera: spring-damped chase cam with look-ahead, speed-based FOV (+5° max), gentle terrain-based shake (off in comfort settings).
- Wheel visuals: steering angle, spin, suspension travel, sinkage, and mud/snow build-up on tyres.
- Dashboard bobblehead and mirror charm run tiny spring/pendulum sims driven by chassis acceleration.

## Terrain interaction

Surface data lives in [05-world-and-terrain.md](05-world-and-terrain.md). The vehicle reads it per wheel, per step.

- `getSurfaceAt(x, z)` returns surface id + wetness from the CPU surface map. Roads, bridges and props override via their collider's user data.
- Each wheel blends up to 2 surfaces at boundaries, to avoid grip "pops".
- **Water:** a water volume adds drag and partial buoyancy. If the water depth exceeds the car's **wading depth** (from ride height + snorkel), the gentle "sputter and fade to bank" recovery kicks in.
- **Field controls** (only when the relevant part is fitted): tyre pressure (hold a key to deflate or inflate, 0.8–2.6 bar), 2H/4H/4L, diff lock, convertible roof.

## Debug & tuning tools

- Live tuning panel (Tweakpane) bound to the resolved spec. "Copy as JSON" pastes straight into the car data file.
- Overlay drawing per wheel: suspension force, `Fx`/`Fy`, contact normal, surface id.
- Telemetry graphs (10 s rolling): RPM, gear, speed, per-wheel load, slip ratio, slip angle, μ.
- Input recorder: record a drive, replay it deterministically, and diff telemetry between builds.
- **Proving ground** scene: surface strips, ramps from 10° to 45° on every surface, bumps, kerbs, rock steps, fords at 20/40/60/90 cm, a skidpad and a braking strip. It is used for tuning and automated tests, and it ships later as an unlockable "test track".

## Handling acceptance targets

Measured on the proving ground with the Standard assist preset and stock parts. They become automated tests (see [09-quality-risks-release.md](09-quality-risks-release.md)).

| Test | Pip (hatch) | Badger (4×4) | Skipper (buggy) |
|---|---|---|---|
| 0–100 km/h, asphalt | 11 ± 1 s | 10.5 ± 1 s | 7 ± 1 s |
| 100–0 km/h, asphalt, ABS | 40 ± 5 m | 45 ± 5 m | 42 ± 5 m |
| Steady-state lateral grip, asphalt | 0.85 ± 0.1 g | 0.75 ± 0.1 g | 0.8 ± 0.1 g |
| Climbs a 25° dirt slope from rest | Yes | Yes | Yes |
| Climbs a 30° mud slope, stock tyres | No | Yes (lockers on) | Struggles |
| Climbs a 40° rock step | No | Yes (4L + lockers) | No |
| Climbs a 30° dune, 0.8 bar | No | Struggles | Yes |
| Wades a 60 cm ford | No | Yes (snorkel: 90 cm) | No |
| Rests on a 20° slope, handbrake on, for 30 s | Drift < 5 cm | Drift < 5 cm | Drift < 5 cm |

"No" is a requirement too. Soft gating only works if the wrong setup visibly struggles.

## Vehicle update order (per fixed step)

```ts
for (const car of activeVehicles) {
  readInputs(car);              // filtered steering, throttle, brake, handbrake
  applyAssists(car);            // TC, ABS, stability → modify commands
  for (const w of car.wheels) castSuspension(car, w);  // hit, compression, Fz
  updateDrivetrain(car, dt);    // engine RPM, gearbox, diffs → drive torque per wheel
  for (const w of car.wheels) solveTyre(car, w, dt);   // κ, α, μ, Fx, Fy, ω integration
  applyChassisImpulses(car, dt);// suspension + tyre + aero + water
}
physicsWorld.step();            // Rapier integrates the chassis
```
