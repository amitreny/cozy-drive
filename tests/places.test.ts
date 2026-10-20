import { describe, expect, it } from 'vitest';
import { placeGnomes, placeViewpoints } from '../src/gameplay/places';
import { generateWorld, isDry } from '../src/world/terrainGen';

const world = generateWorld(7);
describe('collectibles and viewpoints', () => {
  it('places 60 well-spaced gnomes on dry land, deterministically', () => {
    const a = placeGnomes(world), b = placeGnomes(world);
    expect(a.length).toBe(60);
    expect(b).toEqual(a);
    for (const g of a) {
      expect(isDry(world, g.x, g.z, 0.5)).toBe(true);
      for (const o of a) if (o !== g) expect(Math.hypot(o.x - g.x, o.z - g.z)).toBeGreaterThan(139);
    }
  });
  it('places 10 named viewpoints, including the summit and an off-road cairn high in the mountains', () => {
    const vps = placeViewpoints(world);
    expect(vps.map((v) => v.name)).toHaveLength(10);
    expect(new Set(vps.map((v) => v.id)).size).toBe(10);
    const top = Math.max(...vps.map((v) => v.y));
    expect(vps.find((v) => v.id === 'vp-summit')!.y).toBe(top);
    expect(vps.find((v) => v.id === 'vp-cairn')!.y).toBeGreaterThan(120);
    for (const v of vps) expect(isDry(world, v.x, v.z, 0.2)).toBe(true);
    for (const a of vps) for (const b of vps) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.name}–${b.name}`).toBeGreaterThan(400);
  });
  it('climbs the Summit Road to the highest point, never steeper than 12 %, with hairpins a car can turn', () => {
    const r = world.roads.find((r) => r.def.name === 'Summit Road')!;
    const n = r.xs.length - 1;
    let peak = -Infinity; for (let k = 0; k < world.heights.length; k++) peak = Math.max(peak, world.heights[k]);
    expect(r.hs[n]).toBeGreaterThan(peak - 6);
    for (let i = 1; i <= n; i++) expect(Math.abs(r.hs[i] - r.hs[i - 1]) / Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1])).toBeLessThan(0.121);
    for (let i = 3; i < n - 3; i++) {
      const ax = r.xs[i] - r.xs[i - 3], az = r.zs[i] - r.zs[i - 3], bx = r.xs[i + 3] - r.xs[i], bz = r.zs[i + 3] - r.zs[i];
      const turn = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz)), arc = (Math.hypot(ax, az) + Math.hypot(bx, bz)) / 2;
      if (turn > 1e-3) expect(arc / turn).toBeGreaterThan(6.5);
    }
  });
});
