import R from '@dimforge/rapier3d-compat';
import { resolveSpec, defaultBuild, type Build } from '../src/customization/build';
import { Vehicle, type DriveInput } from '../src/vehicle/vehicle';
import { S, type SurfaceId } from '../src/world/surfaces';

let ready: Promise<void> | null = null;
export const initRapier = () => (ready ??= R.init());
export const DT = 1 / 120;

/** A test world: flat ground, optionally a ramp of `slopeDeg` starting at z = 20. */
export function makeSim(build: Partial<Build> & { carType: string }, opts: { surface?: SurfaceId; slopeDeg?: number } = {}) {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  world.createCollider(R.ColliderDesc.cuboid(500, 0.5, 2000).setTranslation(0, -0.5, 0));
  if (opts.slopeDeg) {
    const a = (opts.slopeDeg * Math.PI) / 180, len = 60;
    const q = { x: -Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) };
    world.createCollider(R.ColliderDesc.cuboid(20, 0.5, len / 2).setRotation(q)
      .setTranslation(0, Math.sin(a) * len / 2 - 0.5 * Math.cos(a), 20 + Math.cos(a) * len / 2));
  }
  const surface = opts.surface ?? S.Asphalt;
  const spec = resolveSpec({ ...defaultBuild(build.carType), ...build });
  const car = new Vehicle(R, world, spec, { x: 0, y: spec.restLength + spec.wheelRadius + 0.6, z: 0 }, 0, {
    surfaceAt: () => surface, waterLevelAt: () => -100,
  });
  const run = (seconds: number, input: Partial<DriveInput>, until?: () => boolean) => {
    const inp: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: 0, ...input };
    for (let i = 0; i < seconds / DT; i++) {
      car.step(DT, inp); world.step(); car.capture();
      if (until?.()) return (i + 1) * DT;
    }
    return Infinity;
  };
  const kmh = () => car.speed * 3.6;
  return { world, car, run, kmh, pos: () => car.body.translation() };
}
