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
  it('places 9 named viewpoints, including an off-road summit high in the mountains', () => {
    const vps = placeViewpoints(world);
    expect(vps.map((v) => v.name)).toHaveLength(9);
    expect(new Set(vps.map((v) => v.id)).size).toBe(9);
    expect(vps.find((v) => v.id === 'vp-summit')!.y).toBeGreaterThan(120);
    for (const v of vps) expect(isDry(world, v.x, v.z, 0.2)).toBe(true);
    for (const a of vps) for (const b of vps) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.name}–${b.name}`).toBeGreaterThan(400);
  });
});
