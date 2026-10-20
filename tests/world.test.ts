import { describe, expect, it } from 'vitest';
import { MAX_GRADE } from '../src/world/roads';
import { scatter } from '../src/world/scatter';
import { S, SURFACES } from '../src/world/surfaces';
import { generateWorld, heightAt, isDry, surfaceAt, waterLevelAt } from '../src/world/terrainGen';

const world = generateWorld(7);
const roadLength = (name: string) => {
  const r = world.roads.find((x) => x.def.name === name)!;
  let len = 0;
  for (let i = 1; i < r.xs.length; i++) len += Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]);
  return len;
};

describe('world generation (4 × 4 km)', () => {
  it('is deterministic for a seed', () => {
    // Same generator, smaller area: keeps the suite fast while still checking determinism.
    const a = generateWorld(7, 1024), b = generateWorld(7, 1024);
    expect(b.heights).toEqual(a.heights);
    expect(b.surface).toEqual(a.surface);
  }, 60000);

  it('contains every land surface type', () => {
    const counts = new Array(SURFACES.length).fill(0);
    for (const s of world.surface) counts[s]++;
    for (const id of [S.Asphalt, S.Cobble, S.Gravel, S.Dirt, S.Grass, S.Mud, S.Sand, S.Snow, S.Ice, S.Rock, S.Wood]) {
      expect(counts[id], SURFACES[id].name).toBeGreaterThan(100);
    }
  });

  it('spawns on dry cobble in the village', () => {
    const { x, z } = world.spawn;
    expect(surfaceAt(world, x, z)).toBe(S.Cobble);
    expect(isDry(world, x, z, 1)).toBe(true);
  });

  it('has long open highways', () => {
    expect(roadLength('Coastal Highway')).toBeGreaterThan(8000);
    expect(roadLength('Cross-Island Highway')).toBeGreaterThan(2500);
  });

  it('carves every road to its profile and keeps grades within its kind', () => {
    for (const r of world.roads) {
      let worst = 0, maxGrade = 0;
      for (let i = 1; i < r.xs.length; i++) {
        const d = Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]);
        maxGrade = Math.max(maxGrade, Math.abs(r.hs[i] - r.hs[i - 1]) / d);
        if (i % 5 === 0) worst = Math.max(worst, Math.abs(heightAt(world, r.xs[i], r.zs[i]) - r.hs[i]));
      }
      expect(worst, `${r.def.name} carve`).toBeLessThan(0.6);
      expect(maxGrade, `${r.def.name} grade`).toBeLessThan((r.def.maxGrade ?? MAX_GRADE[r.def.kind]) + 0.005);
    }
  });

  it('has a sea around the island, mountains, and a lake above sea level', () => {
    expect(heightAt(world, 0, 2000)).toBeLessThan(0);
    let max = 0; for (const h of world.heights) max = Math.max(max, h);
    expect(max).toBeGreaterThan(200);
    const lk = world.waters[0];
    expect(lk.level).toBeGreaterThan(1);
    expect(heightAt(world, lk.x, lk.z)).toBeLessThan(waterLevelAt(world, lk.x, lk.z));
  });

  it('scatters trees and rocks, none on roads', () => {
    const sc = scatter(world);
    expect(sc.count).toBeGreaterThan(10000);
    for (let i = 0; i < sc.count; i += 37) expect([S.Asphalt, S.Gravel, S.Wood, S.Cobble]).not.toContain(surfaceAt(world, sc.x[i], sc.z[i]));
  }, 60000);
});
