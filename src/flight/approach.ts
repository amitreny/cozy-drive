import { along, local, type AirPlace } from '../world/airports';
import type { AircraftSpec } from './specs';

/**
 * Approach guidance, as an instrument landing system gives it: which runway you're lining up for, how far off its
 * extended centreline you are (the localiser), and how far above or below a 3° glide path (the glideslope).
 * Pure geometry, shared by the HUD instrument, the maps and the gates in the sky.
 */

/** The glide path's angle, as at real airports. */
export const GLIDE = 3 * (Math.PI / 180);
/** How far out (m) an approach is picked up. */
export const APPROACH_RANGE = 12000;

export interface Approach {
  place: AirPlace;
  /** Runway number for this direction, e.g. "03". */
  runway: string;
  /** Landing direction (radians, as Aircraft.heading: from +z towards +x). */
  heading: number;
  /** +1 lands towards the runway's +along end, -1 the other way. */
  end: 1 | -1;
  threshold: [number, number];
  /** Where the glide path meets the runway: a little past the threshold. */
  aim: [number, number];
  /** Runway height (m). */
  elevation: number;
  /** Metres along the centreline to the threshold (negative once you're over the runway). */
  dist: number;
  /** Metres you are to the left of the extended centreline. */
  left: number;
  /** Metres above the glide path (negative: below). */
  above: number;
  /** Height of the glide path above the runway, here (m). */
  pathHeight: number;
  /** Your bearing off the centreline seen from the aim point (rad, + = left of it). */
  loc: number;
  /** Your angle above the aim point, less the glide path's (rad, + = high). */
  gs: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/**
 * Aim point: 150 m past the threshold, or less on a short strip. On an airliner runway (2.4 km and longer) it is
 * the touchdown zone 300 m in, where the big aiming-point bars are painted.
 */
export const aimDistance = (halfLen: number) => (halfLen >= 1200 ? 300 : Math.min(150, halfLen * 0.3));

/**
 * The approach you're flying, if any: the runway end ahead of you, within range, that your heading points
 * roughly along and whose approach funnel you're inside. The closest, best-lined-up one wins.
 */
export function findApproach(places: AirPlace[], x: number, y: number, z: number, heading: number, groundAt: (x: number, z: number) => number): Approach | null {
  let best: Approach | null = null, bestScore = Infinity;
  for (const place of places) {
    const rw = place.runway;
    if (!rw) continue;
    const [a, c] = local(rw, x, z);
    for (const end of [1, -1] as const) {
      const dist = -rw.halfLen - end * a; // m before this end's threshold
      if (dist > APPROACH_RANGE || dist < -rw.halfLen * 1.5) continue;
      const hdg = end > 0 ? rw.dir : rw.dir + Math.PI, herr = Math.abs(wrap(heading - hdg));
      if (herr > Math.PI / 2) continue;
      const left = end * c;
      if (Math.abs(left) > Math.max(500, Math.max(0, dist) * 0.6)) continue; // outside the approach funnel
      const score = Math.max(0, dist) + Math.abs(left) * 2 + herr * 1500;
      if (score >= bestScore) continue;
      const aimD = aimDistance(rw.halfLen), threshold = along(rw, -end * rw.halfLen, 0), aim = along(rw, -end * (rw.halfLen - aimD), 0);
      const elevation = groundAt(threshold[0], threshold[1]), toAim = Math.max(1, dist + aimD), height = y - elevation;
      const pathHeight = Math.max(0, (dist + aimD) * Math.tan(GLIDE));
      bestScore = score;
      best = {
        place, runway: rw.designators[end > 0 ? 0 : 1], heading: hdg, end, threshold, aim, elevation, dist, left,
        above: height - pathHeight, pathHeight, loc: Math.atan2(left, toAim), gs: Math.atan2(height, toAim) - GLIDE,
      };
    }
  }
  return best;
}

/** A sensible final-approach speed (m/s): 1.3 × the clean stall speed, as pilots fly it. */
export function approachSpeed(spec: AircraftSpec): number {
  const wings = spec.surfaces.filter((s) => s.orient === 'h' && s.control !== 'elevator' && !s.downwash);
  const area = wings.reduce((t, s) => t + s.area, 0), clMax = wings[0]?.clMax ?? 1.5;
  return 1.3 * Math.sqrt((2 * spec.mass * 9.81) / (1.225 * Math.max(1, area) * clMax));
}

/** Heading (rad) that brings you back onto the centreline: up to 30° off the runway's, less as you close in. */
export function interceptHeading(ap: Approach): number {
  const correction = Math.max(-0.52, Math.min(0.52, Math.atan2(ap.left, Math.max(600, ap.dist * 0.5))));
  // Left of the centreline: turn right, towards it (a lower heading, as headings grow to the left here).
  return wrap(ap.heading - correction);
}
