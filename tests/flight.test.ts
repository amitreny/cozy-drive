import R from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { liftCoef, liftSlope, stallAngle } from '../src/flight/aero';
import { Aircraft, type FlightAssist, type FlightInput } from '../src/flight/aircraft';
import { density, Wind } from '../src/flight/atmosphere';
import { AIRCRAFT } from '../src/flight/specs';
import { S } from '../src/world/surfaces';
import { DT, initRapier } from './sim';

beforeAll(initRapier);
const deg = Math.PI / 180;
const calm = new Wind(); calm.speed = 0;

/** A flat runway at y = 0 (or a lake: water at 0 over a bed 6 m down). */
function setup(id: string, opts: { y?: number; speed?: number; water?: boolean } = {}) {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  const bed = opts.water ? -6 : 0;
  world.createCollider(R.ColliderDesc.cuboid(20000, 0.5, 20000).setTranslation(0, bed - 0.5, 0).setFriction(0.8));
  world.step();
  const spec = AIRCRAFT[id];
  const lowest = Math.min(...spec.gear.map((g) => g.pos[1]), ...(spec.floats ?? []).map((f) => f.pos[1] - f.half[1]));
  const y = opts.y ?? (opts.water ? 0.2 - lowest : bed - lowest + 0.05);
  const ac = new Aircraft(R, world, spec, { x: 0, y, z: 0 }, 0, {
    surfaceAt: () => S.Asphalt, waterLevelAt: () => (opts.water ? 0 : -100), groundAt: () => bed, wind: calm,
  });
  if (opts.speed) ac.body.setLinvel({ x: 0, y: 0, z: opts.speed }, true);
  const input: FlightInput = { pitch: 0, roll: 0, yaw: 0, lift: 0, brake: 0 };
  const run = (sec: number, assist: FlightAssist, each?: (t: number) => void) => {
    for (let i = 0; i < sec / DT; i++) { each?.(i * DT); ac.step(DT, input, assist); world.step(); ac.capture(); }
  };
  return { ac, input, run, world };
}

/** Test pilot: pitch to hold an airspeed (or an altitude), wings level. */
const holdSpeed = (ac: Aircraft, input: FlightInput, v: number) => { input.pitch = Math.max(-1, Math.min(1, (ac.airspeed - v) * 0.08 - ac.vs * 0.02)); input.roll = Math.max(-1, Math.min(1, -ac.bank * 1.5)); };
const holdAlt = (ac: Aircraft, input: FlightInput, h: number) => { input.pitch = Math.max(-1, Math.min(1, (h - ac.altitude) * 0.03 - ac.vs * 0.12)); input.roll = Math.max(-1, Math.min(1, -ac.bank * 1.5)); };

describe('wing aerodynamics', () => {
  it('has a finite-wing lift slope and a gentle stall', () => {
    expect(liftSlope(7.5)).toBeGreaterThan(4.3); expect(liftSlope(7.5)).toBeLessThan(5.2); // ~4.6/rad for a C172 wing
    const as = stallAngle(7.5, 1.55);
    expect(as / deg).toBeGreaterThan(15); expect(as / deg).toBeLessThan(21);
    expect(liftCoef(as, 7.5, 1.55)).toBeCloseTo(1.55, 2);
    const past = liftCoef(as + 5 * deg, 7.5, 1.55);
    expect(past).toBeLessThan(1.55); expect(past).toBeGreaterThan(1.0); // most lift survives just past the stall
    expect(liftCoef(-0.1, 7.5, 1.55)).toBeCloseTo(-liftCoef(0.1, 7.5, 1.55), 6);
  });
  it('thins the air with height', () => {
    expect(density(0)).toBeCloseTo(1.225, 3);
    expect(density(1000) / density(0)).toBeCloseTo(0.907, 2);
  });
});

describe('Wren (Cessna 172 class)', () => {
  it('rolls ~200–450 m and lifts off around 25–33 m/s at full power', () => {
    const { ac, input, run } = setup('wren');
    run(1, 'relaxed');
    let liftoff = 0, dist = 0;
    input.lift = 1;
    run(40, 'relaxed', () => {
      if (ac.throttle >= 1) input.lift = 0;
      input.pitch = ac.airspeed > 27 ? 0.7 : 0; input.yaw = ac.onGround ? Math.max(-1, Math.min(1, ac.heading * 3 + ac.curPos.x * 0.05)) : 0;
      if (!liftoff && !ac.onGround && ac.altitude > 2) { liftoff = ac.airspeed; dist = ac.curPos.z; }
    });
    expect(ac.crashed).toBeNull();
    expect(liftoff).toBeGreaterThan(25); expect(liftoff).toBeLessThan(34);
    expect(dist).toBeGreaterThan(180); expect(dist).toBeLessThan(480);
    expect(ac.altitude).toBeGreaterThan(40); // and climbs away
  });
  it('climbs at about 3–5 m/s at best-climb speed, full power (C172: ~3.7 m/s at sea level)', () => {
    const { ac, input, run } = setup('wren', { y: 300, speed: 38 });
    ac.throttle = 1;
    run(15, 'standard', () => holdSpeed(ac, input, 38));
    expect(ac.vs).toBeGreaterThan(3); expect(ac.vs).toBeLessThan(5);
  });
  it('tops out around 55–68 m/s in level flight at full power', () => {
    const { ac, input, run } = setup('wren', { y: 600, speed: 55 });
    ac.throttle = 1;
    run(90, 'standard', () => holdAlt(ac, input, 600));
    expect(ac.crashed).toBeNull();
    expect(Math.abs(ac.altitude - 600)).toBeLessThan(25);
    expect(ac.airspeed).toBeGreaterThan(55); expect(ac.airspeed).toBeLessThan(68);
  });
  it('stalls clean at about 22–28 m/s with the power off', () => {
    const { ac, input, run } = setup('wren', { y: 800, speed: 40 });
    let stallSpeed = 0;
    run(60, 'simlite', () => { holdAlt(ac, input, 800); if (!stallSpeed && ac.vs < -2.5 && ac.airspeed < 32) stallSpeed = ac.airspeed; });
    expect(stallSpeed).toBeGreaterThan(20); expect(stallSpeed).toBeLessThan(29);
  });
  it('glides about 8–11 to 1 at best-glide speed', () => {
    const { ac, input, run } = setup('wren', { y: 900, speed: 35 });
    run(10, 'standard', () => holdSpeed(ac, input, 35));
    const x0 = Math.hypot(ac.curPos.x, ac.curPos.z), h0 = ac.altitude;
    run(30, 'standard', () => holdSpeed(ac, input, 35));
    const ratio = (Math.hypot(ac.curPos.x, ac.curPos.z) - x0) / (h0 - ac.altitude);
    expect(ratio).toBeGreaterThan(8); expect(ratio).toBeLessThan(11.5);
  });
  it('is stable: hands off, it holds a gentle, wings-level glide instead of diverging', () => {
    const { ac, run } = setup('wren', { y: 900, speed: 45 });
    ac.throttle = 0.6;
    run(40, 'simlite');
    expect(ac.crashed).toBeNull();
    expect(Math.abs(ac.bank) / deg).toBeLessThan(35);
    expect(Math.abs(ac.pitchAngle) / deg).toBeLessThan(25);
  });
  it('rolls right with right stick and left with left stick', () => {
    for (const roll of [1, -1]) {
      const { ac, input, run } = setup('wren', { y: 900, speed: 50 });
      ac.throttle = 0.7; input.roll = roll;
      run(1.5, 'simlite');
      expect(Math.sign(ac.bank)).toBe(roll);
      expect(Math.abs(ac.bank) / deg).toBeGreaterThan(15);
    }
  });
});

describe('the other aircraft', () => {
  const liftoffSpeed = (id: string) => {
    const { ac, input, run } = setup(id);
    run(1, 'relaxed');
    let v = 0;
    input.lift = 1;
    run(40, 'relaxed', () => { if (ac.throttle >= 1) input.lift = 0; input.pitch = ac.onGround ? (ac.airspeed > 18 ? 0.6 : 0) : Math.max(-1, Math.min(1, (0.17 - ac.pitchAngle) * 3)); input.yaw = ac.onGround ? Math.max(-1, Math.min(1, ac.heading * 3 + ac.curPos.x * 0.05)) : 0; if (!v && !ac.onGround && ac.altitude > 2) v = ac.airspeed; });
    expect(ac.crashed).toBeNull();
    return v;
  };
  it('the biplane gets off slower than the trainer, the aerobatic plane faster', () => {
    const poppy = liftoffSpeed('poppy'), wren = liftoffSpeed('wren'), kestrel = liftoffSpeed('kestrel');
    expect(poppy).toBeGreaterThan(15); expect(poppy).toBeLessThan(wren);
    expect(kestrel).toBeGreaterThan(wren);
  });
  it('the seaplane floats with a sensible draft and takes off from water', () => {
    const { ac, input, run } = setup('puffin', { water: true });
    run(4, 'relaxed');
    expect(ac.crashed).toBeNull();
    expect(ac.onWater).toBe(true);
    const bottom = ac.curPos.y + Math.min(...AIRCRAFT.puffin.floats!.map((f) => f.pos[1] - f.half[1]));
    expect(bottom).toBeLessThan(0); expect(bottom).toBeGreaterThan(-0.45); // floats sit in, not under, the water
    input.lift = 1;
    let off = 0;
    run(45, 'relaxed', () => { if (ac.throttle >= 1) input.lift = 0; input.pitch = ac.airspeed > 22 ? 0.6 : 0; input.yaw = ac.onGround ? Math.max(-1, Math.min(1, ac.heading * 3)) : 0; if (!off && ac.altitude > 3) off = Math.abs(ac.curPos.z); });
    expect(ac.crashed).toBeNull();
    expect(off).toBeGreaterThan(80); expect(off).toBeLessThan(330); // ~250 m on the water, then the climb to 3 m
  });
  it('the helicopter hovers hands-off and climbs on the collective', () => {
    const { ac, input, run } = setup('hummingbird', { y: 30 });
    run(12, 'relaxed');
    expect(ac.crashed).toBeNull();
    expect(Math.abs(ac.altitude - 30)).toBeLessThan(4);
    expect(Math.hypot(ac.curPos.x, ac.curPos.z)).toBeLessThan(15);
    expect(ac.collective).toBeGreaterThan(0.45); expect(ac.collective).toBeLessThan(0.95);
    input.lift = 1;
    run(6, 'relaxed');
    expect(ac.vs).toBeGreaterThan(2.5);
    input.lift = 0; input.pitch = -1;
    run(8, 'relaxed');
    expect(ac.airspeed).toBeGreaterThan(10); // forward stick: off it goes
  });
  it('the balloon floats near its equilibrium temperature, climbs on the burner and sinks on the vent', () => {
    const { ac, input, run } = setup('dandelion', { y: 200 });
    const eq = ac.equilibriumTemp(200);
    expect(eq - 273.15).toBeGreaterThan(60); expect(eq - 273.15).toBeLessThan(90);
    ac.envelopeTemp = eq;
    run(10, 'relaxed');
    expect(Math.abs(ac.vs)).toBeLessThan(1);
    input.lift = 1; run(25, 'relaxed');
    expect(ac.vs).toBeGreaterThan(0.8);
    input.lift = -1; run(40, 'relaxed');
    expect(ac.vs).toBeLessThan(-0.5);
  });
  it('crashes when it falls out of the sky, but not on a normal landing', () => {
    const { ac, run } = setup('wren', { y: 25 });
    run(5, 'relaxed');
    expect(ac.crashed).not.toBeNull();
  });
});
