import R from '@dimforge/rapier3d-compat';
import { beforeAll, expect, it } from 'vitest';
import { defaultBuild, resolveSpec } from '../src/customization/build';
import { Vehicle } from '../src/vehicle/vehicle';
import { scatter } from '../src/world/scatter';
import { S } from '../src/world/surfaces';
import { generateWorld, heightAt, surfaceAt, waterLevelAt } from '../src/world/terrainGen';
import { TerrainPhysics } from '../src/world/terrainPhysics';
import { DT, initRapier } from './sim';

beforeAll(initRapier);
const w = generateWorld(7), sc = scatter(w);

function drive(carType: string, x: number, z: number, yaw: number) {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  const tp = new TerrainPhysics(R, world, w, sc);
  tp.update(x, z, 260, 999);
  world.step();
  const car = new Vehicle(R, world, resolveSpec(defaultBuild(carType)), { x, y: heightAt(w, x, z) + 1.6, z }, yaw, {
    surfaceAt: (px, pz) => surfaceAt(w, px, pz), waterLevelAt: (px, pz) => waterLevelAt(w, px, pz),
  });
  const run = (sec: number, throttle: number) => {
    for (let i = 0; i < sec / DT; i++) {
      car.step(DT, { throttle, brake: 0, steer: 0, handbrake: 0 }); world.step(); car.capture();
      if (i % 30 === 0) { const p = car.body.translation(); tp.update(p.x, p.z); }
    }
  };
  return { car, run, tp };
}

it('the car settles on the streamed terrain at spawn and can drive off', () => {
  const { x, z, yaw } = w.spawn;
  const { car, run, tp } = drive('pip', x, z, yaw);
  expect(tp.active.size).toBeGreaterThan(9);
  run(3, 0);
  const p = car.body.translation();
  expect(car.wheels.every((wh) => wh.contact)).toBe(true);
  expect(car.mainSurface).toBe(S.Cobble);
  expect(Math.abs(p.y - heightAt(w, p.x, p.z))).toBeLessThan(1.5);
  run(5, 1);
  const q = car.body.translation();
  expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeGreaterThan(20);
}, 60000);

it('the coastal highway is smooth enough to cruise on', () => {
  const r = w.roads.find((x) => x.def.name === 'Coastal Highway')!;
  const i = 40, yaw = Math.atan2(r.xs[i + 1] - r.xs[i], r.zs[i + 1] - r.zs[i]);
  const { car, run } = drive('comet', r.xs[i], r.zs[i], yaw);
  run(2, 0);
  expect(car.mainSurface).toBe(S.Asphalt);
  run(4, 1);
  expect(car.speed * 3.6).toBeGreaterThan(60);
  expect(car.wheels.filter((wh) => wh.contact).length).toBeGreaterThanOrEqual(3);
}, 60000);
