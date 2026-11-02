import { describe, expect, it } from 'vitest';
import { aimDistance, approachSpeed, findApproach, GLIDE, interceptHeading } from '../src/flight/approach';
import { AIRCRAFT } from '../src/flight/specs';
import { airportById, along, AIRPORTS } from '../src/world/airports';

const deg = Math.PI / 180;
const flat = () => 10; // runway at 10 m
const rw = airportById('airfield')!.runway!;
/** A point `d` m out on the extended centreline before the end you land towards along `end`, `left` m to its left, at height y. */
const out = (end: 1 | -1, d: number, left = 0, y = 10 + (d + aimDistance(rw.halfLen)) * Math.tan(GLIDE)) => {
  const [x, z] = along(rw, -end * (rw.halfLen + d), end * left);
  return { x, y, z, heading: end > 0 ? rw.dir : rw.dir + Math.PI };
};

describe('approach guidance', () => {
  it('picks the runway end ahead, and reads zero on the centreline and the 3° path', () => {
    for (const end of [1, -1] as const) {
      const p = out(end, 4000), ap = findApproach(AIRPORTS, p.x, p.y, p.z, p.heading, flat)!;
      expect(ap.place.id).toBe('airfield');
      expect(ap.runway).toBe(rw.designators[end > 0 ? 0 : 1]);
      expect(ap.dist).toBeCloseTo(4000, 0);
      expect(Math.abs(ap.left)).toBeLessThan(0.01);
      expect(Math.abs(ap.above)).toBeLessThan(0.01);
      expect(Math.abs(ap.gs)).toBeLessThan(1e-4);
    }
  });
  it('says which side and how high: left of the centreline is +, above the path is +', () => {
    const p = out(1, 3000, 200, 400), ap = findApproach(AIRPORTS, p.x, p.y, p.z, p.heading, flat)!;
    expect(ap.left).toBeCloseTo(200, 0);
    expect(ap.loc).toBeGreaterThan(0);
    expect(ap.above).toBeGreaterThan(200);
    expect(ap.gs).toBeGreaterThan(0);
    // Left of the centreline: the intercept turns right (a lower heading), at most 30° off the runway's.
    const h = interceptHeading(ap), off = Math.atan2(Math.sin(h - ap.heading), Math.cos(h - ap.heading));
    expect(off).toBeLessThan(0); expect(off).toBeGreaterThan(-31 * deg);
  });
  it('ignores runways behind you, too far, or far off to the side', () => {
    const p = out(1, 4000);
    expect(findApproach(AIRPORTS, p.x, p.y, p.z, p.heading + Math.PI, flat)?.place.id).not.toBe('airfield'); // flying away
    const far = out(1, 15000);
    expect(findApproach(AIRPORTS, far.x, far.y, far.z, far.heading, flat)?.place.id).not.toBe('airfield');
    const wide = out(1, 2000, 2500);
    expect(findApproach(AIRPORTS, wide.x, wide.y, wide.z, wide.heading, flat)?.place.id).not.toBe('airfield');
  });
  it('gives approach speeds of 1.3 × the stall, as flown', () => {
    const kmh = (id: string) => approachSpeed(AIRCRAFT[id]) * 3.6;
    expect(kmh('wren')).toBeGreaterThan(110); expect(kmh('wren')).toBeLessThan(130);
    expect(kmh('heron')).toBeGreaterThan(215); expect(kmh('heron')).toBeLessThan(245);
    expect(kmh('poppy')).toBeLessThan(kmh('wren'));
  });
});
