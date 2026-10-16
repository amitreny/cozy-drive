# 0002 · Vehicle model: force-based tyres with static-friction anchors

**Status:** accepted

**Context.** [03](../03-vehicles-and-physics.md) describes a slip-ratio tyre model with integrated wheel spin. Explicit integration of wheel spin is stiff at 120 Hz and needs implicit solving or sub-stepping. The game is cozy and arcade-leaning.

**Decision.**
- Longitudinal: drive and brake torques become forces, clamped by grip (μ × load). Wheel spin and lock are derived from demand versus grip, for visuals, audio and particles.
- Lateral: slip angle through a simplified Pacejka curve, combined with longitudinal force on a friction ellipse.
- Differentials: open diffs are limited by the weaker wheel; lockers and LSD blend toward using both wheels. AWD moves surplus torque to the axle with grip.
- Rest: a stopped car with no throttle holds its spot with a per-wheel spring anchor, limited by grip. This removed a slow creep that velocity-only friction could not cancel.

**Consequences.** Stable at 60 and 120 Hz, easy to tune, and the acceptance tests in `tests/physics.test.ts` pass. A true slip-ratio model can still replace the longitudinal part later without changing the vehicle's interface.
