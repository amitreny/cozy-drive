import R from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { waveDrag } from '../src/flight/aero';
import { AB_GATE, Aircraft, type FlightAssist, type FlightInput } from '../src/flight/aircraft';
import { approachSpeed } from '../src/flight/approach';
import { speedOfSound, Wind } from '../src/flight/atmosphere';
import { AIRCRAFT } from '../src/flight/specs';
import { S } from '../src/world/surfaces';
import { DT, initRapier } from './sim';

beforeAll(initRapier);
const calm = new Wind(); calm.speed = 0;

/** The Peregrine on a flat runway at y = 0, or in the air at `y` doing `speed`. */
function setup(opts: { y?: number; speed?: number } = {}) {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  world.createCollider(R.ColliderDesc.cuboid(40000, 0.5, 40000).setTranslation(0, -0.5, 0).setFriction(0.8));
  world.step();
  const spec = AIRCRAFT.peregrine, lowest = Math.min(...spec.gear.map((g) => g.pos[1]));
  const ac = new Aircraft(R, world, spec, { x: 0, y: opts.y ?? 0.05 - lowest, z: 0 }, 0, {
    surfaceAt: () => S.Asphalt, waterLevelAt: () => -100, groundAt: () => 0, wind: calm,
  });
  // In the air: engines running, already doing `speed`.
  if (opts.speed) { ac.reset({ x: 0, y: opts.y!, z: 0 }, 0, true); ac.body.setLinvel({ x: 0, y: 0, z: opts.speed }, true); }
  const input: FlightInput = { pitch: 0, roll: 0, yaw: 0, lift: 0, brake: 0 };
  const run = (sec: number, assist: FlightAssist, each?: (t: number) => void) => {
    for (let i = 0; i < sec / DT; i++) { each?.(i * DT); ac.step(DT, input, assist); world.step(); ac.capture(); }
  };
  return { ac, input, run };
}

/** Test pilot: hold an altitude, wings level. */
const holdAlt = (ac: Aircraft, input: FlightInput, h: number) => {
  input.pitch = Math.max(-1, Math.min(1, (h - ac.altitude) * 0.01 - ac.vs * 0.05));
  input.roll = Math.max(-1, Math.min(1, -ac.bank * 1.5));
};

describe('high-speed air', () => {
  it('knows the speed of sound', () => {
    expect(speedOfSound(0)).toBeCloseTo(340.3, 0);
    expect(speedOfSound(11000)).toBeCloseTo(295.1, 0);
    expect(speedOfSound(15000)).toBeCloseTo(295.1, 0); // constant in the stratosphere
  });
  it('has a transonic drag rise that eases off past Mach 1', () => {
    expect(waveDrag(0.5)).toBe(1); expect(waveDrag(0.8)).toBe(1);
    expect(waveDrag(0.95)).toBeGreaterThan(1.5);
    expect(waveDrag(1.05)).toBeCloseTo(2.6, 2);
    expect(waveDrag(2)).toBeGreaterThan(1.6); expect(waveDrag(2)).toBeLessThan(2);
  });
});

describe('Peregrine (Typhoon class)', () => {
  it('lifts off at 280–390 km/h within 300–700 m in afterburner', () => {
    const { ac, input, run } = setup();
    run(4, 'relaxed'); // the engines light
    let liftoff = 0, dist = 0;
    input.lift = 1;
    run(40, 'relaxed', () => {
      if (ac.throttle >= 1) input.lift = 0;
      input.pitch = ac.airspeed > 80 ? 0.8 : 0; input.yaw = ac.onGround ? Math.max(-1, Math.min(1, ac.heading * 3 + ac.curPos.x * 0.05)) : 0;
      if (!liftoff && !ac.onGround && ac.altitude > 3) { liftoff = ac.airspeed * 3.6; dist = ac.curPos.z; }
    });
    expect(ac.crashed).toBeNull();
    expect(liftoff).toBeGreaterThan(280); expect(liftoff).toBeLessThan(390);
    expect(dist).toBeGreaterThan(300); expect(dist).toBeLessThan(700);
    expect(ac.altitude).toBeGreaterThan(300); // and goes up like a rocket
  });

  it('flies subsonic at full dry power at sea level, but goes supersonic in afterburner', () => {
    const dry = setup({ y: 400, speed: 250 });
    dry.ac.throttle = AB_GATE; dry.ac.power = 1; dry.ac.setGear(false); dry.ac.gearPos = 0;
    dry.run(60, 'relaxed', () => holdAlt(dry.ac, dry.input, 400));
    expect(dry.ac.crashed).toBeNull();
    expect(dry.ac.mach).toBeGreaterThan(0.85); expect(dry.ac.mach).toBeLessThan(1);

    const wet = setup({ y: 400, speed: 330 });
    wet.ac.throttle = 1; wet.ac.power = 1; wet.ac.setGear(false); wet.ac.gearPos = 0;
    wet.run(60, 'relaxed', () => holdAlt(wet.ac, wet.input, 400));
    expect(wet.ac.crashed).toBeNull();
    expect(wet.ac.mach).toBeGreaterThan(1.05); expect(wet.ac.mach).toBeLessThan(1.3);
  });

  it('reaches Mach 1.7–2.1 high up in afterburner', () => {
    const { ac, input, run } = setup({ y: 11000, speed: 420 });
    ac.throttle = 1; ac.power = 1; ac.setGear(false); ac.gearPos = 0;
    run(150, 'relaxed', () => holdAlt(ac, input, 11000));
    expect(ac.crashed).toBeNull();
    expect(Math.abs(ac.altitude - 11000)).toBeLessThan(150);
    expect(ac.mach).toBeGreaterThan(1.7); expect(ac.mach).toBeLessThan(2.1);
  });

  it('pulls hard but never past its g limit at high speed', () => {
    const { ac, input, run } = setup({ y: 3000, speed: 300 });
    ac.throttle = 1; ac.power = 1; ac.setGear(false); ac.gearPos = 0;
    run(1, 'relaxed');
    let nMax = 0, last = ac.body.linvel();
    input.pitch = 1;
    run(3, 'relaxed', () => {
      const v = ac.body.linvel(), r = ac.body.rotation();
      // Load factor: acceleration plus gravity, along the aircraft's up axis, in g.
      const ax = (v.x - last.x) / DT, ay = (v.y - last.y) / DT + 9.81, az = (v.z - last.z) / DT;
      const ux = 2 * (r.x * r.y - r.w * r.z), uy = 1 - 2 * (r.x * r.x + r.z * r.z), uz = 2 * (r.y * r.z + r.w * r.x);
      nMax = Math.max(nMax, (ax * ux + ay * uy + az * uz) / 9.81);
      last = v;
    });
    expect(ac.crashed).toBeNull();
    expect(nMax).toBeGreaterThan(5); expect(nMax).toBeLessThan(8.5);
  });

  it('is nimble on the relaxed assist: rolls right round at fighter rates, levels its wings when let go, and the g comes on at once', () => {
    const { ac, input, run } = setup({ y: 3000, speed: 200 });
    ac.throttle = 0.85; ac.power = 1; ac.setGear(false); ac.gearPos = 0;
    run(1, 'relaxed');
    let peak = 0, turned = 0;
    input.roll = 1;
    run(2, 'relaxed', () => { const w = ac.body.angvel(), rate = Math.hypot(w.x, w.y, w.z); peak = Math.max(peak, rate); turned += rate * DT; });
    expect(peak * 180 / Math.PI).toBeGreaterThan(200);  // a Typhoon rolls at ~250°/s
    expect(turned * 180 / Math.PI).toBeGreaterThan(360); // no bank limit: a full roll in under 2 s
    // Rolled steep, or right over onto its back, and let go: the wings come back level.
    for (const secs of [0.5, 0.8]) {
      const lvl = setup({ y: 3000, speed: 200 });
      lvl.ac.throttle = 0.85; lvl.ac.power = 1; lvl.ac.setGear(false); lvl.ac.gearPos = 0;
      lvl.run(1, 'relaxed'); lvl.input.roll = 1; lvl.run(secs, 'relaxed');
      expect(Math.abs(lvl.ac.bank) * 180 / Math.PI).toBeGreaterThan(60);
      lvl.input.roll = 0; lvl.run(4, 'relaxed');
      expect(Math.abs(lvl.ac.bank) * 180 / Math.PI).toBeLessThan(5);
      expect(lvl.ac.crashed).toBeNull();
    }
    // Full back stick at 300 m/s: past 6.5 g within two seconds.
    const pull = setup({ y: 3000, speed: 300 });
    pull.ac.throttle = 0.85; pull.ac.power = 1; pull.ac.setGear(false); pull.ac.gearPos = 0;
    pull.run(1, 'relaxed');
    let nMax = 0, last = pull.ac.body.linvel();
    pull.input.pitch = 1;
    pull.run(2, 'relaxed', () => {
      const v = pull.ac.body.linvel(), r = pull.ac.body.rotation();
      const ax = (v.x - last.x) / DT, ay = (v.y - last.y) / DT + 9.81, az = (v.z - last.z) / DT;
      const ux = 2 * (r.x * r.y - r.w * r.z), uy = 1 - 2 * (r.x * r.x + r.z * r.z), uz = 2 * (r.y * r.z + r.w * r.x);
      nMax = Math.max(nMax, (ax * ux + ay * uy + az * uz) / 9.81); last = v;
    });
    expect(nMax).toBeGreaterThan(6.5);
  });

  it('raises its gear only in the air and below its speed limit; a wheels-up landing is a crash', () => {
    const ground = setup();
    run1(ground);
    expect(ground.ac.setGear(false)).toBe(false);
    const fast = setup({ y: 600, speed: 250 });
    run1(fast);
    expect(fast.ac.setGear(false)).toBe(false); // over the gear's speed limit
    const { ac, input, run } = setup({ y: 60, speed: 120 });
    ac.throttle = 0.5; ac.power = 0.5;
    expect(ac.setGear(false)).toBe(true);
    run(6, 'relaxed', () => holdAlt(ac, input, 60));
    expect(ac.gearPos).toBe(0);
    input.pitch = 0; ac.throttle = 0;
    run(30, 'relaxed', () => { if (!ac.crashed) input.pitch = Math.max(-1, Math.min(1, (-5 - ac.vs) * 0.3)); });
    expect(ac.crashed).toBe('gear up');
  });

  it('approaches at an airliner-like 250–310 km/h', () => {
    const v = approachSpeed(AIRCRAFT.peregrine) * 3.6;
    expect(v).toBeGreaterThan(250); expect(v).toBeLessThan(310);
  });
});

function run1(s: ReturnType<typeof setup>) { s.run(1, 'relaxed'); }
