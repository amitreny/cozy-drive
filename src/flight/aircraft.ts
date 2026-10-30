import type RAPIER from '@dimforge/rapier3d-compat';
import { addScaled, clamp, cross, dot, normalize, rotate, set, v3, type Q4, type V3 } from '../core/math';
import { S, SURFACES, type SurfaceId } from '../world/surfaces';
import { dragCoef, groundEffect, liftCoef, stallAngle } from './aero';
import { density, G, T0, type Wind } from './atmosphere';
import type { AircraftSpec, GearSpec, SurfaceSpec } from './specs';

type Rapier = typeof RAPIER;
export interface FlightEnv { surfaceAt(x: number, z: number): SurfaceId; waterLevelAt(x: number, z: number): number; groundAt(x: number, z: number): number; wind: Wind }
/**
 * Pilot inputs, -1..1 unless noted. pitch > 0 = nose up, roll > 0 = roll right, yaw > 0 = nose right.
 * `lift` is the throttle/collective/burner lever as a rate (R = +1, F = -1); the craft keeps its own lever positions.
 * Flaps are a position (`flapsTarget`, 0..1) the session steps through.
 */
export interface FlightInput { pitch: number; roll: number; yaw: number; lift: number; brake: number }
export type FlightAssist = 'relaxed' | 'standard' | 'simlite';

interface GearState { spec: GearSpec; share: number; k: number; c: number; comp: number; prev: number; contact: boolean; point: V3; surface: SurfaceId; inWater: boolean; load: number; anchored: boolean; anchor: V3 }

const deg = Math.PI / 180;
/** Main-wing panels: horizontal surfaces that are not the tailplane. */
const isWing = (x: SurfaceSpec): boolean => x.orient === 'h' && x.control !== 'elevator' && !x.downwash;
const WATER_RHO = 1000;
/** Control throws and servo speed (rad, rad/s). */
const MAX_AILERON = 20 * deg, MAX_ELEVATOR = 24 * deg, MAX_RUDDER = 25 * deg, SERVO = 2.2;
/** Full wheel braking, as a share of the load on a braked wheel. */
const BRAKE = 0.55;

/** Nose-up angle a taildragger rests at on its three wheels (0 for tricycle gear, skids and baskets). */
export function restPitch(spec: AircraftSpec): number {
  const mains = spec.gear.filter((g) => g.pos[2] > 0 && g.type === 'wheel'), tail = spec.gear.find((g) => g.pos[2] < -2 && g.type === 'wheel');
  if (!mains.length || !tail || spec.gear.some((g) => g.pos[2] > 1.2 && g.steer)) return 0;
  return Math.atan2(tail.pos[1] - mains[0].pos[1], mains[0].pos[2] - tail.pos[2]);
}

/** Heading `yaw`, pitched to the resting attitude. */
export function restRotation(spec: AircraftSpec, yaw: number): Q4 {
  const p = -restPitch(spec) / 2, cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(p), sp = Math.sin(p);
  // q = yaw(about y) * pitch(about x; negative x-rotation lifts the nose)
  return { x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp };
}

export class Aircraft {
  body: RAPIER.RigidBody;
  private colliders: RAPIER.Collider[] = [];
  readonly spec: AircraftSpec;
  gear: GearState[] = [];
  // Levers and state
  throttle = 0; flaps = 0; flapsTarget = 0; collective = 0; envelopeTemp = T0 + 40; burner = false; vent = false;
  private trim = 0; private da = 0; private de = 0; private dr = 0;
  private cyclicF = 0; private cyclicR = 0; private heliHeading = 0; private groundPitch = 0; private groundTrim = 0; private rollTrim = 0;
  rpm = 0;
  /** Seconds since the engine was started (a flight begins with the starter cranking it). */
  private engineTime = 0;
  /** Share of the brakes the relaxed assist lets through (1 = all). */
  private brakeEase = 1; private brakePitch = 0;
  /** Power the engine is making, 0..1 (lags the throttle in a turbine). */
  power = 0;
  // Telemetry
  airspeed = 0; groundSpeed = 0; alpha = 0; beta = 0; vs = 0; altitude = 0; agl = 0; heading = 0; pitchAngle = 0; bank = 0;
  onGround = false; onWater = false; stall = 0; thrust = 0;
  /** Set when the airframe hits something too hard (or a landplane touches water): the session resets. */
  crashed: string | null = null;
  prevPos = v3(); curPos = v3();
  prevRot: Q4 = { x: 0, y: 0, z: 0, w: 1 }; curRot: Q4 = { x: 0, y: 0, z: 0, w: 1 };
  private lastV = v3(); private hasLastV = false;
  private s = { p: v3(), v: v3(), w: v3(), air: v3(), wind: v3(), fx: v3(), up: v3(), fw: v3(), lf: v3(), a: v3(), b: v3(), c: v3(), r: v3(), pv: v3(), n: v3(), sp: v3(), ld: v3() };

  constructor(private R: Rapier, private world: RAPIER.World, spec: AircraftSpec, pos: V3, yaw: number, private env: FlightEnv) {
    this.spec = spec;
    const desc = R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setCanSleep(false).setCcdEnabled(true)
      .setLinearDamping(0).setAngularDamping(spec.kind === 'balloon' ? 0.5 : 0.02);
    this.body = world.createRigidBody(desc);
    if (spec.kind === 'balloon') this.body.setEnabledRotations(false, true, false, true); // basket hangs plumb under the envelope
    this.body.setRotation(restRotation(spec, yaw), true);
    const [ip, iy, ir] = spec.inertia;
    const air = spec.balloon ? density(0) * spec.balloon.volume * (1 + 0.5) : 0; // enclosed air plus added mass move with it
    spec.hull.forEach((h, i) => {
      const cd = R.ColliderDesc.cuboid(...h.half).setTranslation(...h.pos).setFriction(0.5).setRestitution(0.05);
      // Mass properties are in the collider's own frame: offset them so the CG sits at the body origin.
      if (i === 0) cd.setMassProperties(spec.mass + air, { x: -h.pos[0], y: -h.pos[1], z: -h.pos[2] }, { x: ip, y: iy, z: ir }, { x: 0, y: 0, z: 0, w: 1 });
      else cd.setDensity(0);
      this.colliders.push(world.createCollider(cd, this.body));
    });
    if (spec.balloon) this.colliders.push(world.createCollider(R.ColliderDesc.ball(spec.balloon.radius).setTranslation(0, spec.balloon.envelopeY, 0).setDensity(0).setFriction(0.3), this.body));
    this.setupGear();
    if (spec.kind === 'balloon') this.envelopeTemp = this.equilibriumTemp() - 3; // warm but resting
    this.capture(); this.capture();
  }

  /**
   * Static load share per gear point (from where they sit fore and aft of the CG), springs sized to 40 % travel.
   * The front gear must also take the weight braking throws onto it (deceleration × CG height / wheelbase): its
   * spring is stiff enough to carry that at 85 % travel, so a nosewheel doesn't bottom out and dip the nose.
   */
  private setupGear(): void {
    const g = this.spec.gear, front = g.filter((x) => x.pos[2] > 0), rear = g.filter((x) => x.pos[2] <= 0);
    const zf = front.reduce((s, x) => s + x.pos[2], 0) / (front.length || 1), zr = rear.reduce((s, x) => s + x.pos[2], 0) / (rear.length || 1);
    const frontShare = front.length && rear.length ? -zr / (zf - zr) : front.length ? 1 : 0;
    const W = this.spec.mass * G, cgHeight = -Math.min(...g.map((x) => x.pos[1]));
    const transfer = front.length && rear.length ? (BRAKE * W * cgHeight) / (zf - zr) / front.length : 0;
    this.gear = g.map((spec) => {
      const share = spec.pos[2] > 0 ? frontShare / front.length : (1 - frontShare) / rear.length;
      const load = Math.max(0.05, share) * W, m = load / G;
      const k = Math.max(load / (0.4 * spec.travel), spec.pos[2] > 0 ? (load + transfer) / (0.85 * spec.travel) : 0);
      return { spec, share, k, c: 2 * 0.65 * Math.sqrt(k * m), comp: 0, prev: 0, contact: false, point: v3(), surface: S.Grass, inWater: false, load: 0, anchored: false, anchor: v3() };
    });
  }

  /** Put it at rest at `pos`, heading `yaw`, levers closed. `running`: the engine is already started, ticking over. */
  reset(pos: V3, yaw: number, running = false): void {
    this.body.setTranslation(pos, true);
    this.body.setRotation(restRotation(this.spec, yaw), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.throttle = 0; this.collective = 0; this.trim = 0; this.rollTrim = 0; this.crashed = null; this.hasLastV = false; this.power = 0;
    this.groundPitch = restPitch(this.spec); this.groundTrim = 0;
    const eng = this.spec.engine;
    this.engineTime = running ? 60 : 0; this.rpm = running && eng ? eng.rpm * (eng.idle ?? 0.3) : 0;
    if (this.spec.kind === 'balloon') this.envelopeTemp = this.equilibriumTemp() - 3;
    for (const g of this.gear) { g.anchored = false; g.comp = g.prev = 0; }
    this.capture(); this.capture();
  }

  dispose(): void { this.world.removeRigidBody(this.body); }

  capture(): void {
    const p = this.body.translation(), r = this.body.rotation();
    set(this.prevPos, this.curPos.x, this.curPos.y, this.curPos.z); Object.assign(this.prevRot, this.curRot);
    set(this.curPos, p.x, p.y, p.z); this.curRot.x = r.x; this.curRot.y = r.y; this.curRot.z = r.z; this.curRot.w = r.w;
  }

  /** Envelope temperature (K) that floats the balloon at sea level. */
  equilibriumTemp(h = 0): number {
    const b = this.spec.balloon!, rho = density(h);
    return T0 / (1 - this.spec.mass / (rho * b.volume));
  }

  // ---------------------------------------------------------------- step
  step(dt: number, input: FlightInput, assist: FlightAssist): void {
    const s = this.s, body = this.body, spec = this.spec;
    const p = body.translation(), q = body.rotation(), lv = body.linvel(), av = body.angvel();
    set(s.p, p.x, p.y, p.z); set(s.v, lv.x, lv.y, lv.z); set(s.w, av.x, av.y, av.z);
    rotate(s.up, q, set(s.a, 0, 1, 0)); rotate(s.fw, q, set(s.a, 0, 0, 1)); rotate(s.lf, q, set(s.a, 1, 0, 0));
    const ground = this.env.groundAt(p.x, p.z), water = this.env.waterLevelAt(p.x, p.z);
    this.altitude = p.y; this.agl = p.y - Math.max(ground, water);
    this.env.wind.at(p.x, p.z, this.agl, s.wind);
    set(s.air, s.v.x - s.wind.x, s.v.y - s.wind.y, s.v.z - s.wind.z);
    const rho = density(p.y);
    this.airspeed = Math.hypot(s.air.x, s.air.y, s.air.z);
    this.groundSpeed = Math.hypot(s.v.x, s.v.z);
    this.vs = s.v.y;
    this.heading = Math.atan2(s.fw.x, s.fw.z);
    this.pitchAngle = Math.asin(clamp(s.fw.y, -1, 1));
    this.bank = Math.atan2(s.lf.y, s.up.y); // + = right wing down (the left wing points up)
    const fwdAir = dot(s.air, s.fw);
    this.alpha = Math.atan2(-dot(s.air, s.up), Math.max(0.1, fwdAir));
    this.beta = Math.atan2(dot(s.air, s.lf), Math.max(1, Math.abs(fwdAir)));

    // Crash checks: a sudden velocity change means the airframe (not the gear) hit something hard.
    // Planes get some slack so a nose-low or bounced landing scrapes through rather than ending the flight.
    if (this.hasLastV) {
      const dv = Math.hypot(s.v.x - this.lastV.x, s.v.y - this.lastV.y, s.v.z - this.lastV.z);
      if (dv > (spec.kind === 'balloon' ? 6 : spec.kind === 'plane' ? 7 : 4.5)) this.crashed = this.crashed ?? 'impact';
    }
    set(this.lastV, s.v.x, s.v.y, s.v.z); this.hasLastV = true;

    // Relaxed: ease the brakes as the nose goes down from where it was when you started braking, as a pilot
    // would, so hard braking can't stand a taildragger on its nose (or bury a nosewheel).
    if (input.brake < 0.05 || !this.onGround) this.brakePitch = this.pitchAngle;
    this.brakeEase = assist === 'relaxed' && spec.kind === 'plane' && this.onGround
      ? clamp(1 - (this.brakePitch - this.pitchAngle - 1.5 * deg) / (3 * deg), 0.2, 1) : 1;
    this.stepGear(dt, input, rho);
    if (spec.floats) this.stepFloats(dt, water);
    if (spec.kind === 'plane') this.stepPlane(dt, input, assist, rho);
    else if (spec.kind === 'heli') this.stepHeli(dt, input, assist, rho);
    else this.stepBalloon(dt, input, rho);

    // Fuselage, gear and strut drag along each body axis.
    const [cx, cy, cz] = spec.bodyCdA, vx = dot(s.air, s.lf), vy = dot(s.air, s.up), vz = fwdAir, half = 0.5 * rho * this.airspeed * dt;
    const fx = -half * cx * vx, fy = -half * cy * vy, fz = -half * cz * vz;
    body.applyImpulse({ x: s.lf.x * fx + s.up.x * fy + s.fw.x * fz, y: s.lf.y * fx + s.up.y * fy + s.fw.y * fz, z: s.lf.z * fx + s.up.z * fy + s.fw.z * fz }, true);

    // A landplane (or a helicopter, or a balloon basket) touching water: down it goes.
    if (!spec.floats && this.gear.some((g) => g.inWater)) this.crashed = this.crashed ?? 'water';
    if (this.onGround && s.up.y < 0.2) this.crashed = this.crashed ?? 'flipped';
  }

  // ---------------------------------------------------------------- gear
  private stepGear(dt: number, input: FlightInput, _rho: number): void {
    const s = this.s, body = this.body, spec = this.spec;
    let contacts = 0;
    const speedFw = dot(s.v, s.fw);
    for (const g of this.gear) {
      const gs = g.spec, travel = gs.travel;
      rotate(s.a, this.curRotOf(), set(s.b, gs.pos[0], gs.pos[1] + travel, gs.pos[2]));
      set(s.b, s.p.x + s.a.x, s.p.y + s.a.y, s.p.z + s.a.z); // ray origin
      const ray = new this.R.Ray(s.b, { x: -s.up.x, y: -s.up.y, z: -s.up.z });
      const hit = this.world.castRayAndGetNormal(ray, travel + 0.03, true, undefined, undefined, undefined, body);
      g.prev = g.comp;
      g.inWater = false;
      if (!hit) { g.contact = false; g.comp = 0; g.load = 0; g.anchored = false; continue; }
      addScaled(g.point, s.b, s.up, -hit.timeOfImpact);
      const level = this.env.waterLevelAt(g.point.x, g.point.z);
      if (g.point.y < level - 0.05) { g.inWater = true; if (spec.floats) { g.contact = false; g.comp = 0; g.load = 0; continue; } }
      g.contact = true; contacts++;
      g.surface = g.inWater ? S.Water : this.env.surfaceAt(g.point.x, g.point.z);
      g.comp = Math.max(0, travel - hit.timeOfImpact);
      const cv = (g.comp - g.prev) / dt;
      let f = g.k * g.comp + g.c * cv;
      if (g.comp > travel * 0.95) f += g.k * 8 * (g.comp - travel * 0.95); // bump stop
      g.load = Math.max(0, f);
      set(s.n, hit.normal.x, hit.normal.y, hit.normal.z);

      // Rolling direction (steerable wheels follow the rudder pedals, fading with speed), side direction.
      // A nosewheel points where you want to go; a tailwheel (behind the CG) turns the other way to do the same.
      const steer = gs.steer ? clamp(input.yaw, -1, 1) * gs.steer * (gs.pos[2] < 0 ? -1 : 1) / (1 + (speedFw / 12) ** 2) : 0;
      const cs = Math.cos(steer), sn = Math.sin(steer);
      set(s.c, s.fw.x * cs - s.lf.x * sn, s.fw.y * cs - s.lf.y * sn, s.fw.z * cs - s.lf.z * sn);
      addScaled(s.c, s.c, s.n, -dot(s.c, s.n)); normalize(s.c, s.c);
      normalize(s.sp, cross(s.sp, s.n, s.c)); // left
      const pv = body.velocityAtPoint(g.point); set(s.pv, pv.x, pv.y, pv.z);
      const vl = dot(s.pv, s.c), vs = dot(s.pv, s.sp);
      const surf = SURFACES[g.surface], mShare = (spec.mass * Math.max(0.05, g.share));
      let fl = 0, fs = 0;
      if (gs.type === 'wheel') {
        const mu = 0.8 * surf.grip / 0.62 * 0.62; // aircraft tyres: about road-tyre grip
        const brake = gs.brake ? input.brake * BRAKE * this.brakeEase : 0;
        const roll = (surf.crr * 1.1 + brake) * g.load;
        fl = -Math.sign(vl) * Math.min(roll, (Math.abs(vl) * mShare) / dt);
        const slip = Math.atan2(vs, Math.max(Math.abs(vl), 1.5));
        fs = -mu * g.load * Math.sin(1.45 * Math.atan(10 * slip));
        // Parked on the brakes: hold the spot.
        if (input.brake > 0.5 && gs.brake && Math.abs(vl) < 0.3) {
          if (!g.anchored) { set(g.anchor, g.point.x, g.point.y, g.point.z); g.anchored = true; }
          const e = (g.point.x - g.anchor.x) * s.c.x + (g.point.y - g.anchor.y) * s.c.y + (g.point.z - g.anchor.z) * s.c.z;
          fl = clamp(-(mShare * 300 * e + mShare * 25 * vl), -mu * g.load, mu * g.load);
        } else g.anchored = false;
      } else {
        // Skids and baskets: plain sliding friction, with a static hold when nearly stopped.
        const mu = (gs.type === 'basket' ? 0.65 : 0.5) * Math.max(0.25, surf.grip / 0.62);
        const vt = Math.hypot(vl, vs);
        if (vt < 0.25 && this.collectiveLift() < 0.9) {
          if (!g.anchored) { set(g.anchor, g.point.x, g.point.y, g.point.z); g.anchored = true; }
          const ex = g.point.x - g.anchor.x, ez = g.point.z - g.anchor.z;
          const el = ex * s.c.x + ez * s.c.z, es = ex * s.sp.x + ez * s.sp.z;
          fl = clamp(-(mShare * 300 * el + mShare * 25 * vl), -mu * g.load, mu * g.load);
          fs = clamp(-(mShare * 300 * es + mShare * 25 * vs), -mu * g.load, mu * g.load);
          if (Math.hypot(ex, ez) > 0.25) g.anchored = false;
        } else {
          g.anchored = false;
          const k = Math.min(1, vt / 0.25);
          fl = -mu * g.load * (vl / (vt || 1)) * k; fs = -mu * g.load * (vs / (vt || 1)) * k;
        }
      }
      // The tyre pushes along the ground normal (a taildragger sits nose-up; its gear load is still vertical).
      const ix = (s.c.x * fl + s.sp.x * fs + s.n.x * g.load) * dt, iy = (s.c.y * fl + s.sp.y * fs + s.n.y * g.load) * dt, iz = (s.c.z * fl + s.sp.z * fs + s.n.z * g.load) * dt;
      body.applyImpulseAtPoint({ x: ix, y: iy, z: iz }, g.point, true);
      // Touching down far too fast (gear bottoms out at a high sink rate) is a crash, not a landing.
      if (g.comp >= travel * 0.95 && cv > (spec.kind === 'plane' ? 5 : 3.5)) this.crashed = this.crashed ?? 'hard landing';
    }
    this.onGround = contacts > 0;
  }

  private curRotOf(): Q4 { const r = this.body.rotation(); return { x: r.x, y: r.y, z: r.z, w: r.w }; }

  /** 0..1: how much of the weight the rotor or envelope is carrying (stops skids 'sticking' while lifting off). */
  private collectiveLift(): number {
    if (this.spec.kind === 'heli') return this.collective * 1.4;
    if (this.spec.kind === 'balloon') return clamp((this.envelopeTemp - T0) / (this.equilibriumTemp() - T0), 0, 2);
    return 0;
  }

  // ---------------------------------------------------------------- floats
  private stepFloats(dt: number, _waterHere: number): void {
    const s = this.s, body = this.body, q = this.curRotOf();
    let wet = 0;
    for (const f of this.spec.floats!) {
      const N = 6, per = f.volume / N;
      for (let i = 0; i < N; i++) {
        const z = f.pos[2] + f.half[2] * (-1 + (2 * (i + 0.5)) / N);
        // Bottom of this float slice; the bow and stern curve up a little.
        const curve = Math.abs((2 * (i + 0.5)) / N - 1) ** 2 * f.half[1] * 0.8;
        rotate(s.a, q, set(s.b, f.pos[0], f.pos[1] - f.half[1] + curve, z));
        const px = s.p.x + s.a.x, py = s.p.y + s.a.y, pz = s.p.z + s.a.z;
        const level = this.env.waterLevelAt(px, pz);
        const depth = level - py;
        if (depth <= 0) continue;
        wet++;
        const frac = clamp(depth / (2 * f.half[1] - curve), 0, 1);
        const pv = body.velocityAtPoint({ x: px, y: py, z: pz }); set(s.pv, pv.x, pv.y, pv.z);
        const vl = dot(s.pv, s.fw), vs = dot(s.pv, s.lf), vy = pv.y;
        // Buoyancy, heave damping, and hull drag: high in the water at low speed (the "hump"), less once planing.
        // Buoyancy plus planing lift on the float bottoms; hull drag peaks at the "hump" (~20 % of weight) then
        // falls once the floats are up on the step.
        const planing = 12 * frac * Math.max(0, vl) * Math.max(0, vl) * Math.min(1, Math.abs(vl) / 8);
        const lift = WATER_RHO * G * per * frac + planing;
        const plane = 1 - 0.6 * Math.min(1, Math.max(0, (Math.abs(vl) - 5) / 7));
        const kl = 5 * frac * plane, ks = 900 * frac;
        const fl = -kl * Math.abs(vl) * vl, fs = -ks * Math.abs(vs) * vs, fy = lift - 1400 * frac * vy;
        body.applyImpulseAtPoint({ x: (s.fw.x * fl + s.lf.x * fs) * dt, y: (fy + s.fw.y * fl + s.lf.y * fs) * dt, z: (s.fw.z * fl + s.lf.z * fs) * dt }, { x: px, y: py, z: pz }, true);
      }
    }
    this.onWater = wet > 0;
    if (this.onWater) this.onGround = true;
  }

  // ---------------------------------------------------------------- aeroplane
  private stepPlane(dt: number, input: FlightInput, assist: FlightAssist, rho: number): void {
    const s = this.s, spec = this.spec, eng = spec.engine!, body = this.body;
    this.throttle = clamp(this.throttle + input.lift * dt * 0.6, 0, 1);
    this.flaps += clamp((eng.maxFlaps ? this.flapsTarget : 0) - this.flaps, -dt * 0.4, dt * 0.4);

    // Body rates: p roll (+ = rolling right, about +forward), q pitch (+ = nose up), r yaw (+ = nose right).
    const p = dot(s.w, s.fw), qr = -dot(s.w, s.lf), r = -dot(s.w, s.up);
    const wings = spec.surfaces.filter(isWing);
    const wingSpan = Math.sqrt(spec.surfaces.filter((x) => x.control === 'aileronL').reduce((a, x) => a + x.area * 2 * x.aspect, 0) || 1);
    const wingRef = wings[0];
    const stallA = stallAngle(wingRef.aspect, wingRef.clMax + 0.45 * this.flaps) - (wingRef.incidence ?? 0) + (wingRef.alpha0 ?? 0);
    this.stall = clamp((this.alpha - (stallA - 4 * deg)) / (4 * deg), 0, 1) * (this.onGround ? 0 : 1);

    // ---- Flight-control computer: what the assists do with the stick (the physics stays the real thing). ----
    let pitchCmd: number, rollCmd: number, yawCmd: number;
    const fast = clamp((this.airspeed - 8) / 20, 0, 1);
    if (assist === 'relaxed' && !this.onGround) {
      // Rate command, attitude hold: release the stick and the aircraft holds its attitude; wings come back level.
      const pitchRate = spec.handling?.pitchRate ?? 0.45, rollRate = spec.handling?.rollRate ?? 1.2;
      let qT = input.pitch * pitchRate;
      if (this.alpha > stallA - 3 * deg) qT = Math.min(qT, -(this.alpha - (stallA - 3 * deg)) * 4); // stall protection
      const level = (0.5 * rollRate) / 1.2;
      const pT = input.roll !== 0 ? input.roll * rollRate : clamp(-this.bank * 0.9, -level, level);
      const bankLimit = 55 * deg;
      const pT2 = Math.abs(this.bank) > bankLimit && Math.sign(pT) === Math.sign(this.bank) ? 0 : pT;
      this.trim = clamp(this.trim + (qT - qr) * dt * 1.5, -1, 1);
      pitchCmd = clamp(this.trim + (qT - qr) * 2.2, -1, 1);
      // Aileron trim (the integral part) cancels the engine's torque roll: without it the wings settle a little
      // left-wing-down and the aircraft slowly turns left. Held while you're rolling.
      if (input.roll === 0) this.rollTrim = clamp(this.rollTrim + (pT2 - p) * dt * 1.2, -0.3, 0.3);
      rollCmd = clamp(this.rollTrim + (pT2 - p) * 1.6, -1, 1);
      yawCmd = clamp(input.yaw - this.beta * 4 - r * 0.6 * fast + rollCmd * 0.15, -1, 1); // turn coordinator + yaw damper
    } else if (assist === 'relaxed') {
      // On the runway or the water: the stick moves a held attitude (up to ~10° nose-up for the rotation, so no tail
      // strikes and no digging the float heels in). Tap S at flying speed and it rotates and flies off; it settles
      // back level as you slow to taxi speed after landing (and a taildragger lifts its tail as speed builds).
      this.groundPitch = clamp(this.groundPitch + input.pitch * 9 * deg * dt, -2 * deg, 10 * deg);
      if (this.airspeed < 14 && input.pitch <= 0) this.groundPitch += (0 - this.groundPitch) * Math.min(1, dt * 1.5);
      // The integral part lets a heavy airliner's tail lever its nose up as surely as a trainer's.
      const err = this.groundPitch - this.pitchAngle;
      this.groundTrim = this.airspeed > 14 ? clamp(this.groundTrim + err * dt * 4, -1, 1) : this.groundTrim * (1 - Math.min(1, dt * 2));
      pitchCmd = clamp(this.groundTrim + err * 5 - qr * 1.2, -1, 1);
      rollCmd = clamp(-this.bank * 2 - p * 0.5 + input.roll * 0.3, -1, 1);
      yawCmd = input.yaw;
    } else if (assist === 'standard' && !this.onGround) {
      if (input.pitch === 0) this.trim = clamp(this.trim - qr * dt * 1.2, -1, 1); // auto-trim holds the attitude when released
      pitchCmd = clamp(input.pitch + this.trim, -1, 1);
      rollCmd = input.roll;
      yawCmd = clamp(input.yaw - this.beta * 3 + rollCmd * 0.15, -1, 1);
    } else {
      if (!this.onGround && input.pitch === 0) this.trim = clamp(this.trim - qr * dt * 0.6, -1, 1);
      pitchCmd = clamp(input.pitch + (this.onGround ? 0 : this.trim), -1, 1);
      rollCmd = input.roll; yawCmd = input.yaw;
    }
    if (this.onGround) { this.trim *= 1 - dt; this.rollTrim = 0; } else { this.groundPitch = clamp(this.pitchAngle, -2 * deg, 10 * deg); this.groundTrim = 0; }
    const servo = (cur: number, want: number) => cur + clamp(want - cur, -SERVO * dt, SERVO * dt);
    this.da = servo(this.da, rollCmd * MAX_AILERON);
    this.de = servo(this.de, -pitchCmd * MAX_ELEVATOR);
    this.dr = servo(this.dr, yawCmd * MAX_RUDDER);

    // ---- Propeller: power-limited thrust, capped by static thrust; slipstream over the tail. ----
    const vf = Math.max(0, dot(s.air, s.fw));
    // Engine speed: a piston engine's starter turns it over (in uneven lurches, cylinder by cylinder) until it
    // catches; a turbine winds up smoothly and takes longer to light. Then the propeller runs up to where throttle
    // and airspeed put it, with its inertia (quicker up than down; a turbine slower still).
    this.engineTime += dt;
    const turbine = !!eng.turbine, lightOff = turbine ? 2.5 : 1.1, cranking = this.engineTime < lightOff, idle = eng.idle ?? 0.3;
    const rpmTarget = cranking ? (turbine ? 300 * this.engineTime / lightOff : 150 * (1 + 0.4 * Math.sin(this.engineTime * 30)))
      : eng.rpm * (idle + (1 - idle) * Math.sqrt(this.throttle)) * (1 + Math.min(0.15, vf / 400)) + (turbine ? 0 : 350 * Math.exp(-(this.engineTime - lightOff) * 3));
    this.rpm += (rpmTarget - this.rpm) * Math.min(1, dt * (cranking ? 12 : (rpmTarget > this.rpm ? 2.8 : 1.6) * (turbine ? 0.45 : 1)));
    // Power follows the lever at once in a piston engine; a turbine's lags it by a second or two.
    const want = cranking ? 0 : this.throttle;
    this.power = turbine ? this.power + (want - this.power) * Math.min(1, dt * 0.8) : want;
    const power = this.power, props = eng.props ?? 1;
    // A windmilling propeller at idle is a big drag brake: it is why a light aircraft glides ~9:1, not 12:1.
    // A fixed-pitch prop loses thrust as speed builds (static thrust falls off), and is power-limited at speed.
    const disc = props * Math.PI * eng.propRadius ** 2;
    const T = power * Math.min(eng.staticThrust * (1 - vf / (eng.thrustFade ?? 120)), (0.8 * eng.power) / Math.max(vf, 1)) - (1 - power) ** 2 * 0.5 * rho * vf * vf * 0.085 * disc;
    this.thrust = T;
    const slip = Math.sqrt(vf * vf + (2 * Math.max(0, T)) / (rho * disc)) - vf;
    rotate(s.a, this.curRotOf(), set(s.b, ...eng.propPos));
    body.applyImpulseAtPoint({ x: s.fw.x * T * dt, y: s.fw.y * T * dt, z: s.fw.z * T * dt }, { x: s.p.x + s.a.x, y: s.p.y + s.a.y, z: s.p.z + s.a.z }, true);
    // Engine torque reaction rolls the aircraft a little to the left at high power and low speed.
    const torque = -(power * eng.power) / ((eng.rpm * 2 * Math.PI) / 60) * 0.25;
    body.applyTorqueImpulse({ x: s.fw.x * torque * dt, y: s.fw.y * torque * dt, z: s.fw.z * torque * dt }, true);

    // ---- Lifting surfaces ----
    let wingAlpha = 0;
    for (const surf of wings) wingAlpha += this.surfaceForce(surf, dt, rho, 0, wingSpan, 0);
    const meanWing = wings.length ? wingAlpha / wings.length : 0;
    for (const surf of spec.surfaces) if (!isWing(surf)) this.surfaceForce(surf, dt, rho, surf.slipstream ? slip * 0.7 : 0, wingSpan, surf.downwash ? meanWing * 0.4 : 0);
  }

  /** Lift and drag of one surface at its own position (rotation adds local flow). Returns its angle of attack. */
  private surfaceForce(surf: SurfaceSpec, dt: number, rho: number, slip: number, wingSpan: number, downwash: number): number {
    const s = this.s, body = this.body, q = this.curRotOf();
    rotate(s.r, q, set(s.a, ...surf.pos));
    const px = s.p.x + s.r.x, py = s.p.y + s.r.y, pz = s.p.z + s.r.z;
    // Local air velocity: body motion + rotation − wind (+ slipstream along the chord).
    cross(s.a, s.w, s.r);
    let vx = s.air.x + s.a.x, vy = s.air.y + s.a.y, vz = s.air.z + s.a.z;
    vx += s.fw.x * slip; vy += s.fw.y * slip; vz += s.fw.z * slip;
    // Surface axes in world space: normal n, chord c (= forward), span.
    const left = surf.pos[0] >= 0 ? 1 : -1, dih = surf.dihedral ?? 0;
    if (surf.orient === 'h') {
      const nx = -left * Math.sin(dih), ny = Math.cos(dih);
      set(s.n, s.lf.x * nx + s.up.x * ny, s.lf.y * nx + s.up.y * ny, s.lf.z * nx + s.up.z * ny);
    } else set(s.n, s.lf.x, s.lf.y, s.lf.z);
    cross(s.sp, s.fw, s.n); normalize(s.sp, s.sp);
    const vSpan = vx * s.sp.x + vy * s.sp.y + vz * s.sp.z;
    vx -= s.sp.x * vSpan; vy -= s.sp.y * vSpan; vz -= s.sp.z * vSpan;
    const V2 = vx * vx + vy * vy + vz * vz;
    if (V2 < 0.25) return 0;
    const V = Math.sqrt(V2), vn = vx * s.n.x + vy * s.n.y + vz * s.n.z, vc = vx * s.fw.x + vy * s.fw.y + vz * s.fw.z;
    const alphaGeo = Math.atan2(-vn, vc);
    let delta = 0;
    if (surf.control === 'aileronL') delta = this.da; else if (surf.control === 'aileronR') delta = -this.da;
    else if (surf.control === 'elevator') delta = this.de; else if (surf.control === 'rudder') delta = this.dr;
    const flap = surf.flaps ? this.flaps * (this.spec.engine?.maxFlaps ?? 0) : 0;
    const alpha = alphaGeo + (surf.incidence ?? 0) - (surf.alpha0 ?? 0) + (surf.tau ?? 0.5) * delta + flap * 0.45 - downwash;
    const clMax = surf.clMax + (surf.flaps ? 0.45 * this.flaps : 0);
    let ge = { drag: 1, lift: 1 };
    if (isWing(surf)) ge = groundEffect(Math.max(0.05, py - Math.max(this.env.groundAt(px, pz), this.env.waterLevelAt(px, pz))) / wingSpan);
    const cl = liftCoef(alpha, surf.aspect, clMax) * ge.lift;
    const cd = dragCoef(alpha, cl, surf.aspect, surf.cd0 + Math.abs(delta) * 0.01 + (surf.flaps ? this.flaps * 0.025 : 0), surf.e ?? 0.75, clMax, ge.drag);
    const Q = 0.5 * rho * V2 * surf.area;
    // Lift ⟂ local flow, in the plane of normal and chord; drag along the flow.
    const ux = vx / V, uy = vy / V, uz = vz / V, nd = s.n.x * ux + s.n.y * uy + s.n.z * uz;
    set(s.ld, s.n.x - ux * nd, s.n.y - uy * nd, s.n.z - uz * nd); normalize(s.ld, s.ld);
    const L = Q * cl, D = Q * cd;
    body.applyImpulseAtPoint({ x: (s.ld.x * L - ux * D) * dt, y: (s.ld.y * L - uy * D) * dt, z: (s.ld.z * L - uz * D) * dt }, { x: px, y: py, z: pz }, true);
    return alphaGeo + (surf.incidence ?? 0);
  }

  // ---------------------------------------------------------------- helicopter
  private stepHeli(dt: number, input: FlightInput, assist: FlightAssist, rho: number): void {
    const s = this.s, spec = this.spec, rot = spec.rotor!, body = this.body;
    const A = Math.PI * rot.radius ** 2, W = spec.mass * G;
    // Momentum theory: the most thrust the engine's power can make in a hover (figure of merit 0.7).
    const Tmax = Math.pow(0.7 * rot.power * Math.sqrt(2 * rho * A), 2 / 3);
    const hubAgl = this.agl + rot.hub[1];
    const ge = clamp(1 / (1 - (rot.radius / (4 * Math.max(hubAgl, rot.radius * 0.3))) ** 2), 1, 1.18);
    const vh = Math.hypot(dot(s.air, s.fw), dot(s.air, s.lf));
    const etl = 1 + 0.16 * clamp((vh - 3) / 12, 0, 1); // translational lift
    const p = dot(s.w, s.fw), qr = -dot(s.w, s.lf), r = -dot(s.w, s.up);

    // ---- Controls (with stability augmentation on the easier settings) ----
    let pitchC = input.pitch, rollC = input.roll, collective: number, pedal = input.yaw;
    if (assist === 'simlite') {
      this.collective = clamp(this.collective + input.lift * dt * 0.45, 0, 1);
      collective = this.collective;
      pitchC = clamp(input.pitch - qr * 0.3, -1, 1); rollC = clamp(input.roll - p * 0.3, -1, 1);
    } else {
      // Collective holds a climb/descent rate: R climbs, F descends, let go to hover.
      // Near the ground with the lever down, it settles onto its skids instead of hovering a hand's width up.
      const vsT = input.lift * 4.5 - (input.lift <= 0 && (this.onGround || this.agl < 1.7) ? 1.2 : 0);
      const hover = W / (Tmax * ge * etl * Math.max(0.5, s.up.y));
      collective = clamp(hover + (vsT - this.vs) * 0.12, 0, 1);
      this.collective = collective;
      if (assist === 'relaxed') {
        // Attitude command: the stick sets a pitch and bank angle; release it and the helicopter levels out.
        const pitchT = input.pitch * 14 * deg, bankT = input.roll * 22 * deg;
        pitchC = clamp((pitchT - this.pitchAngle) * 3.2 - qr * 1.4, -1, 1);
        rollC = clamp((bankT - this.bank) * 3.2 - p * 1.2, -1, 1);
      } else { pitchC = clamp(input.pitch - qr * 0.8, -1, 1); rollC = clamp(input.roll - p * 0.8, -1, 1); }
      // Feet off the pedals: hold the heading (the tail rotor trims out what's left of the main rotor's torque).
      if (Math.abs(input.yaw) > 0.05 || this.onGround) this.heliHeading = this.heading;
      const hErr = Math.atan2(Math.sin(this.heading - this.heliHeading), Math.cos(this.heading - this.heliHeading));
      pedal = clamp(input.yaw * 0.9 - r * 0.9 + (Math.abs(input.yaw) > 0.05 ? 0 : hErr * 2.5), -1, 1);
    }
    if (this.onGround && collective < 0.5) { pitchC *= 0.3; rollC *= 0.3; }
    this.cyclicF += clamp(-pitchC - this.cyclicF, -dt * 4, dt * 4);
    this.cyclicR += clamp(rollC - this.cyclicR, -dt * 4, dt * 4);

    // ---- Main rotor ----
    const tiltF = this.cyclicF * rot.maxTilt, tiltR = this.cyclicR * rot.maxTilt;
    // Rotor axis in the body: tilted forward by tiltF, right (= -x) by tiltR.
    set(s.a, -Math.tan(tiltR), 1, Math.tan(tiltF)); normalize(s.a, s.a);
    set(s.c, s.lf.x * s.a.x + s.up.x * s.a.y + s.fw.x * s.a.z, s.lf.y * s.a.x + s.up.y * s.a.y + s.fw.y * s.a.z, s.lf.z * s.a.x + s.up.z * s.a.y + s.fw.z * s.a.z);
    const vAxial = dot(s.air, s.c);
    const vi = Math.sqrt(Math.max(1, collective * Tmax) / (2 * rho * A));
    let T = collective * Tmax * ge * etl;
    T -= rho * A * vi * vAxial * 0.9; // climbing reduces thrust at a given collective, sinking increases it (heave damping)
    T = Math.max(0, T);
    this.thrust = T;
    rotate(s.b, this.curRotOf(), set(s.r, ...rot.hub));
    const hub = { x: s.p.x + s.b.x, y: s.p.y + s.b.y, z: s.p.z + s.b.z };
    body.applyImpulseAtPoint({ x: s.c.x * T * dt, y: s.c.y * T * dt, z: s.c.z * T * dt }, hub, true);
    // Hub moment from the flapping rotor, and the rotor's pitch/roll damping.
    const Kh = 0.35 * T * rot.hub[1], Ip = spec.inertia[0], Ir = spec.inertia[2];
    const mPitch = -Kh * tiltF - Ip * 1.6 * qr, mRoll = Kh * tiltR - Ir * 1.6 * p; // + pitch = nose up, + roll = right
    body.applyTorqueImpulse({ x: (-s.lf.x * mPitch + s.fw.x * mRoll) * dt, y: (-s.lf.y * mPitch + s.fw.y * mRoll) * dt, z: (-s.lf.z * mPitch + s.fw.z * mRoll) * dt }, true);

    // ---- Torque and tail rotor ----
    const Omega = (rot.rpm * 2 * Math.PI) / 60;
    const power = Math.min(rot.power, (T * (vi + Math.max(0, vAxial))) / 0.7 + 0.1 * rot.power);
    const Q = power / Omega; // main rotor drives the body to yaw nose-right
    const tailMax = 2.2 * (rot.power / Omega);
    const tailT = clamp(Q * 0.92 - pedal * tailMax * 0.6, -tailMax, tailMax); // anti-torque, + = nose left
    const yawNet = -Q + tailT; // about +up
    body.applyTorqueImpulse({ x: s.up.x * yawNet * dt, y: s.up.y * yawNet * dt, z: s.up.z * yawNet * dt }, true);
    this.rpm = rot.rpm * (0.98 + 0.04 * collective);

    // Fin and stabiliser (weathervane in forward flight).
    for (const surf of spec.surfaces) this.surfaceForce(surf, dt, rho, 0, rot.radius * 2, 0);
  }

  // ---------------------------------------------------------------- balloon
  private stepBalloon(dt: number, input: FlightInput, rho: number): void {
    const s = this.s, b = this.spec.balloon!, body = this.body, spec = this.spec;
    this.burner = input.lift > 0.3;
    this.vent = input.lift < -0.3;
    const rhoE = rho * (T0 / this.envelopeTemp);
    const C = rhoE * b.volume * 1005; // heat capacity of the air inside
    const loss = 7000 * (this.envelopeTemp - T0) * (this.vent ? 6 : 1) + 25 * Math.abs(this.vs) * (this.envelopeTemp - T0);
    this.envelopeTemp = clamp(this.envelopeTemp + ((this.burner ? b.burner : 0) - loss) / C * dt, T0, T0 + 120);
    // The body's mass already includes enclosed air and added mass at nominal density; correct to the real weight.
    const nominal = spec.mass + density(0) * b.volume * 1.5;
    const lift = rho * b.volume * G - (spec.mass + rhoE * b.volume) * G + nominal * G;
    body.applyImpulse({ x: 0, y: lift * dt, z: 0 }, true);
    // The envelope is a big sphere in the wind: it moves with the air around it.
    const area = Math.PI * b.radius * b.radius, Va = this.airspeed, k = 0.5 * rho * 0.45 * area * Va * dt;
    body.applyImpulse({ x: -k * s.air.x, y: -k * s.air.y * 1.3, z: -k * s.air.z }, true);
    this.thrust = this.burner ? 1 : 0;
    this.rpm = 0;
  }
}
