import type { DriveInput } from '../vehicle/vehicle';
import type { RoadKind, RoadPath } from '../world/roads';

const KIND_SPEED: Record<RoadKind, number> = { highway: 24, road: 14, track: 9, boardwalk: 4 }; // m/s
const LANE: Record<RoadKind, number> = { highway: 2.6, road: 1.8, track: 0, boardwalk: 0 }; // keep right

/** Relaxing autopilot: follows the road you're on, slows for curves, loops forever on closed roads. */
export class Autopilot {
  active = false;
  road: RoadPath | null = null;
  private i = 0; private dir = 1;

  /** Pick the nearest road within 15 m, heading the way the car already faces. */
  engage(roads: RoadPath[], x: number, z: number, yaw: number): boolean {
    let best = 15, pick: [RoadPath, number] | null = null;
    for (const r of roads) for (let i = 0; i < r.xs.length; i++) {
      const d = Math.hypot(r.xs[i] - x, r.zs[i] - z);
      if (d < best) { best = d; pick = [r, i]; }
    }
    if (!pick) return false;
    const [r, i] = pick, j = Math.min(r.xs.length - 1, i + 1), k = Math.max(0, j - 1);
    const tx = r.xs[j] - r.xs[k], tz = r.zs[j] - r.zs[k];
    this.road = r; this.i = i; this.dir = tx * Math.sin(yaw) + tz * Math.cos(yaw) >= 0 ? 1 : -1;
    this.active = true;
    return true;
  }

  disengage(): void { this.active = false; this.road = null; }

  private step(i: number): number {
    const n = this.road!.xs.length;
    const next = i + this.dir;
    if (this.road!.def.closed) return (next + n - 1) % (n - 1);
    return Math.max(0, Math.min(n - 1, next));
  }

  /** Driving inputs for this physics step, or null once the road runs out. */
  control(x: number, z: number, yaw: number, speed: number, maxSpeed?: number): DriveInput | null {
    const r = this.road;
    if (!this.active || !r) return null;
    // Track the closest sample near the current one.
    let bestD = Infinity, bestI = this.i, k = this.i;
    for (let s = 0; s < 40; s++) { const d = Math.hypot(r.xs[k] - x, r.zs[k] - z); if (d < bestD) { bestD = d; bestI = k; } k = this.step(k); }
    this.i = bestI;
    if (bestD > 25) { this.disengage(); return null; }
    // Pure pursuit on a point ahead; curvature over the next stretch sets a comfortable speed.
    const look = 7 + Math.max(0, speed) * 0.9;
    let acc = 0, j = this.i, tx = r.xs[j], tz = r.zs[j];
    while (acc < look) { const nj = this.step(j); if (nj === j) break; acc += Math.hypot(r.xs[nj] - r.xs[j], r.zs[nj] - r.zs[j]); j = nj; tx = r.xs[j]; tz = r.zs[j]; }
    // Aim at the right-hand lane: offset the target to the right of the travel direction.
    const nj = this.step(j), fx = r.xs[nj] - r.xs[j], fz = r.zs[nj] - r.zs[j], fl = Math.hypot(fx, fz) || 1, lane = LANE[r.def.kind];
    tx += (-fz / fl) * lane; tz += (fx / fl) * lane;
    const atEnd = !r.def.closed && (j === 0 || j === r.xs.length - 1) && acc < look;
    const want = Math.atan2(tx - x, tz - z);
    let err = want - yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
    let turn = 0, a = this.i;
    const h0 = Math.atan2(r.xs[this.step(a)] - r.xs[a], r.zs[this.step(a)] - r.zs[a]);
    for (let s = 0; s < 14; s++) a = this.step(a);
    const h1 = Math.atan2(r.xs[this.step(a)] - r.xs[a], r.zs[this.step(a)] - r.zs[a]);
    turn = Math.abs(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)));
    const radius = turn > 1e-3 ? 40 / turn : 1e4;
    let target = Math.min(KIND_SPEED[r.def.kind], Math.sqrt(2.8 * radius), maxSpeed ?? Infinity);
    if (atEnd) target = Math.min(target, acc * 0.4);
    if (atEnd && Math.abs(speed) < 0.5) { this.disengage(); return null; }
    return {
      steer: Math.max(-1, Math.min(1, -err * 2.4)),
      throttle: Math.max(0, Math.min(1, (target - speed) * 0.35)),
      brake: Math.max(0, Math.min(1, (speed - target - 1) * 0.3)),
      handbrake: 0,
    };
  }
}
