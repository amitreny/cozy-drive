import { describe, expect, it } from 'vitest';
import { findBarrierRuns, findChevrons, WALL_OFFSET } from '../src/world/barriers';
import { generateWorld, heightAt } from '../src/world/terrainGen';

const world = generateWorld(7);
const runs = findBarrierRuns(world), chevrons = findChevrons(world);
const wallPoint = (road: number, i: number, side: number, extra = 0): [number, number] => {
  const r = world.roads[road], a = Math.max(0, i - 1), b = Math.min(r.xs.length - 1, i + 1);
  const dx = r.xs[b] - r.xs[a], dz = r.zs[b] - r.zs[a], l = Math.hypot(dx, dz), off = r.def.width / 2 + WALL_OFFSET + extra;
  return [r.xs[i] - (dz / l) * side * off, r.zs[i] + (dx / l) * side * off];
};

describe('cliff barriers', () => {
  it('walls the Summit Road where its edge drops away', () => {
    const summit = world.roads.findIndex((r) => r.def.name === 'Summit Road');
    const metres = runs.filter((r) => r.road === summit).reduce((s, r) => s + (r.to - r.from) * 3, 0);
    expect(metres).toBeGreaterThan(300);
    // Every walled sample really is above a drop (the gaps bridged between them are short).
    for (const run of runs) {
      const r = world.roads[run.road];
      let drops = 0;
      for (let i = run.from; i <= run.to; i++) { const [x, z] = wallPoint(run.road, i, run.side, 6); if (r.hs[i] - heightAt(world, x, z) > 2) drops++; }
      expect(drops / (run.to - run.from + 1)).toBeGreaterThan(0.7);
    }
  });
  it('never puts a wall or chevron on any road surface', () => {
    const blocked = (x: number, z: number, self: number, selfI: number) => world.roads.some((r, ri) => {
      for (let j = 0; j < r.xs.length; j++) if (!(ri === self && Math.abs(j - selfI) < 12) && Math.hypot(r.xs[j] - x, r.zs[j] - z) < r.def.width / 2 + 0.5) return true;
      return false;
    });
    for (const run of runs) for (let i = run.from; i <= run.to; i += 3) expect(blocked(...wallPoint(run.road, i, run.side), run.road, i)).toBe(false);
    for (const c of chevrons) expect(blocked(...wallPoint(c.road, c.i, c.side, 0.9), c.road, c.i)).toBe(false);
  });
  it('marks the outside of every Summit Road hairpin with chevrons', () => {
    const summit = world.roads.findIndex((r) => r.def.name === 'Summit Road');
    expect(chevrons.filter((c) => c.road === summit).length).toBeGreaterThan(30);
  });
});
