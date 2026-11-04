import R from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { Aircraft, type FlightAssist, type FlightInput } from '../src/flight/aircraft';
import { Wind } from '../src/flight/atmosphere';
import { AIRCRAFT, type AircraftSpec } from '../src/flight/specs';
import { S } from '../src/world/surfaces';
import { DT, initRapier } from './sim';

beforeAll(initRapier);
const calm = new Wind(); calm.speed = 0;

/** On a flat runway at y = 0 (rolling at `speed`), or in the air at `y`; engines running, throttle closed. */
function setup(spec: AircraftSpec, opts: { y?: number; speed: number }) {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  world.createCollider(R.ColliderDesc.cuboid(40000, 0.5, 40000).setTranslation(0, -0.5, 0).setFriction(0.8));
  world.step();
  const y = opts.y ?? 0.05 - Math.min(...spec.gear.map((g) => g.pos[1]));
  const ac = new Aircraft(R, world, spec, { x: 0, y, z: 0 }, 0, { surfaceAt: () => S.Asphalt, waterLevelAt: () => -100, groundAt: () => 0, wind: calm });
  ac.reset({ x: 0, y, z: 0 }, 0, true);
  ac.body.setLinvel({ x: 0, y: 0, z: opts.speed }, true);
  const input: FlightInput = { pitch: 0, roll: 0, yaw: 0, lift: 0, brake: 0 };
  const run = (sec: number, assist: FlightAssist, each?: () => void) => {
    for (let i = 0; i < sec / DT; i++) { each?.(); ac.step(DT, input, assist); world.step(); ac.capture(); }
  };
  return { ac, input, run };
}

const holdAlt = (ac: Aircraft, input: FlightInput, h: number) => {
  input.pitch = Math.max(-1, Math.min(1, (h - ac.altitude) * 0.01 - ac.vs * 0.05));
  input.roll = Math.max(-1, Math.min(1, -ac.bank * 1.5));
};

describe('airbrakes and spoilers', () => {
  it('only the types that really have them get them', () => {
    expect(AIRCRAFT.peregrine.airbrake?.name).toBe('airbrake');
    expect(AIRCRAFT.heron.airbrake?.name).toBe('spoilers');
    for (const id of ['wren', 'puffin', 'poppy', 'kestrel']) expect(AIRCRAFT[id].airbrake).toBeUndefined();
  });

  it("the jet's airbrake slows it much faster at idle", () => {
    const lost = (brake: number) => {
      const { ac, input, run } = setup(AIRCRAFT.peregrine, { y: 600, speed: 250 });
      ac.setGear(false); ac.gearPos = 0;
      input.brake = brake;
      run(6, 'relaxed', () => holdAlt(ac, input, 600));
      expect(ac.crashed).toBeNull();
      return 250 - ac.airspeed;
    };
    const clean = lost(0), braked = lost(1);
    expect(braked).toBeGreaterThan(clean * 1.4);
  });

  it("the airliner's spoilers spoil lift: with the same stick it sinks", () => {
    const sink = (brake: number) => {
      const { ac, input, run } = setup(AIRCRAFT.heron, { y: 800, speed: 80 });
      ac.throttle = 0.5; ac.power = 0.5;
      input.brake = brake;
      run(3, 'simlite');
      return ac.vs;
    };
    expect(sink(1)).toBeLessThan(sink(0) - 3);
  });

  it('ground spoilers pop up at touchdown on idle power and shorten the landing roll', () => {
    const roll = (spec: AircraftSpec) => {
      const { ac, input, run } = setup(spec, { speed: 45 });
      input.brake = 1;
      let deployed = 0;
      run(25, 'relaxed', () => { deployed = Math.max(deployed, ac.airbrakePos); });
      expect(ac.crashed).toBeNull(); expect(ac.groundSpeed).toBeLessThan(1);
      return { dist: ac.curPos.z, deployed };
    };
    const withSpoilers = roll(AIRCRAFT.heron), without = roll({ ...AIRCRAFT.heron, airbrake: undefined });
    expect(withSpoilers.deployed).toBeGreaterThan(0.95);
    expect(withSpoilers.dist).toBeLessThan(without.dist * 0.95);
  });
});
