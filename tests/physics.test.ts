import { beforeAll, describe, expect, it } from 'vitest';
import { lateralCurve, splitAxle, torqueAt } from '../src/vehicle/vehicle';
import { S } from '../src/world/surfaces';
import { initRapier, makeSim } from './sim';

beforeAll(initRapier);

describe('tyre and drivetrain helpers', () => {
  it('lateral curve peaks near 7.5° and falls off gently', () => {
    const peakAt = [...Array(400).keys()].map((i) => i / 1000).reduce((a, b) => (lateralCurve(b) > lateralCurve(a) ? b : a));
    expect(peakAt * 180 / Math.PI).toBeGreaterThan(5);
    expect(peakAt * 180 / Math.PI).toBeLessThan(10);
    expect(lateralCurve(1.2)).toBeGreaterThan(0.7);
  });
  it('interpolates the torque curve', () => {
    expect(torqueAt([[1000, 100], [3000, 200]], 2000)).toBe(150);
    expect(torqueAt([[1000, 100], [3000, 200]], 9000)).toBe(200);
  });
  it('open diff is limited by the weaker wheel, a locker is not', () => {
    expect(splitAxle(2000, 0, 3000, 0)).toEqual([0, 0]);
    const [l, r] = splitAxle(2000, 0, 3000, 1);
    expect(l).toBe(0); expect(r).toBe(2000);
  });
});

describe('vehicle acceptance (docs/03 targets)', () => {
  it('settles at rest without creeping', () => {
    const sim = makeSim({ carType: 'pip' });
    sim.run(2, {});
    const a = sim.pos();
    sim.run(4, {});
    const b = sim.pos();
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.05);
  });

  for (const [carType, lo, hi] of [['pip', 9.5, 13], ['badger', 9, 13], ['skipper', 5.5, 9], ['maple', 8.5, 12.5], ['bramble', 7.5, 12], ['comet', 4.5, 7]] as const) {
    it(`${carType} 0-100 km/h on asphalt within ${lo}-${hi} s`, () => {
      const sim = makeSim({ carType });
      sim.run(1.5, {});
      const t = sim.run(30, { throttle: 1 }, () => sim.kmh() >= 100);
      console.log(carType, '0-100', t.toFixed(2), 's');
      expect(t).toBeGreaterThan(lo); expect(t).toBeLessThan(hi);
    });
  }

  it('pip brakes from 100 km/h within 35-50 m', () => {
    const sim = makeSim({ carType: 'pip' });
    sim.run(1.5, {});
    sim.run(30, { throttle: 1 }, () => sim.kmh() >= 100);
    const z0 = sim.pos().z;
    sim.run(10, { brake: 1 }, () => sim.kmh() < 0.5);
    const d = sim.pos().z - z0;
    console.log('pip 100-0 distance', d.toFixed(1), 'm');
    expect(d).toBeGreaterThan(35); expect(d).toBeLessThan(50);
  });

  it('terrain gates: road tyres fail a 20° mud slope, the 4x4 on all-terrains climbs it', () => {
    const climb = (carType: string, tyre?: 'road' | 'allTerrain') => {
      const sim = makeSim({ carType, ...(tyre ? { tyre } : {}) }, { surface: S.Mud, slopeDeg: 20 });
      sim.run(1.5, {});
      let maxZ = -Infinity;
      sim.run(25, { throttle: 1 }, () => { maxZ = Math.max(maxZ, sim.pos().z); return maxZ > 70; });
      return maxZ;
    };
    const pip = climb('pip'), badger = climb('badger');
    console.log('mud 20°: pip reached z', pip.toFixed(1), 'badger reached z', badger.toFixed(1));
    expect(pip).toBeLessThan(40);
    expect(badger).toBeGreaterThan(60);
  });
});
