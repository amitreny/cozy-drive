# 0002 · Vehicle model: force-based tyres with static-friction anchors

**Status:** accepted

**Context.** [03](../03-vehicles-and-physics.md) describes a slip-ratio tyre model with integrated wheel spin. Explicit integration of wheel spin is stiff at 120 Hz and needs implicit solving or sub-stepping. The game is cozy and arcade-leaning.

**Decision.**
- Longitudinal: drive and brake torques become forces, clamped by grip (μ × load). Wheel spin and lock are derived from demand versus grip, for visuals, audio and particles.
- Lateral: slip angle through a simplified Pacejka curve, combined with longitudinal force on a friction ellipse.
- Differentials: open diffs are limited by the weaker wheel; lockers and LSD blend toward using both wheels. AWD moves surplus torque to the axle with grip.
- Rest: a stopped car with no throttle holds its spot with a per-wheel spring anchor, limited by grip. This removed a slow creep that velocity-only friction could not cancel.

**Consequences.** Stable at 60 and 120 Hz, easy to tune, and the acceptance tests in `tests/physics.test.ts` pass. A true slip-ratio model can still replace the longitudinal part later without changing the vehicle's interface.

## Addendum: hill climbing (Oct 2026)

- **Body collision hull** has a belly between the axles and ends that rise at the car's approach/departure angle (`approachDeg` in `spec.ts`: 4×4 42°, pickup 32°, buggy 50°, road cars 13–20°). The old full-length box beached on every slope change.
- **Wheelspin costs grip:** a spinning tyre delivers up to 30 % less force. Low range (4L) meters torque like a crawl gear and keeps full grip; the Relaxed assist acts as traction control and keeps most of it.
- **Airing down** now also helps on grass, dirt, gravel and rock (+14 % at 0.8 bar), not only on sand, snow and mud. Grass and dirt grip were raised to realistic values (0.62, 0.75).
- **Hill hold:** in 4L the car holds its spot below 1.2 m/s with the throttle released.
- **Skill ladder** (tested in `tests/physics.test.ts`): 4×4 in 4H climbs 30° grass; 4L + lockers 35° grass and 40° rock; plus mud tyres at 1.0 bar 40° grass. Road cars stay around 15–20°.
