import { describe, expect, it } from 'vitest';
import { projectToMini } from '../src/ui/minimap';

// Car basis in this world: forward = (sin yaw, cos yaw), right = (-cos yaw, sin yaw) in (x, z).
const right = (yaw: number) => [-Math.cos(yaw), Math.sin(yaw)] as const;
const fwd = (yaw: number) => [Math.sin(yaw), Math.cos(yaw)] as const;
const yaws = [0, 0.7, Math.PI / 2, 2.4, Math.PI, -1.2, -Math.PI / 2];

describe('mini-map orientation', () => {
  it('heading-up: things ahead are up, things on the right are on the right', () => {
    for (const yaw of yaws) {
      const [rx, ry] = projectToMini(...right(yaw).map((v) => v * 50) as [number, number], yaw, true);
      const [fx, fy] = projectToMini(...fwd(yaw).map((v) => v * 50) as [number, number], yaw, true);
      expect(rx, `right @${yaw}`).toBeCloseTo(50); expect(ry).toBeCloseTo(0);
      expect(fy, `ahead @${yaw}`).toBeCloseTo(-50); expect(fx).toBeCloseTo(0);
    }
  });
  it('north-up: north is up, and a north-facing driver sees their right on the right', () => {
    const [, ny] = projectToMini(0, 50, 1.3, false);
    expect(ny).toBeCloseTo(-50);
    const [rx] = projectToMini(...right(0).map((v) => v * 50) as [number, number], 0, false);
    expect(rx).toBeCloseTo(50);
    // Facing south, the driver's right (west of them) is on the map's left.
    const [sx] = projectToMini(...right(Math.PI).map((v) => v * 50) as [number, number], Math.PI, false);
    expect(sx).toBeCloseTo(-50);
  });
});
