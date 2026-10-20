import type RAPIER from '@dimforge/rapier3d-compat';
import { add, addScaled, clamp, cross, dot, normalize, rotate, scale, set, v3, type Q4, type V3 } from '../core/math';
import { gripFor, pressureEffect, S, SURFACES, type SurfaceId } from '../world/surfaces';
import { CAR_TYPES, restGroundY, type AxleSpec, type VehicleSpec } from './spec';

type Rapier = typeof RAPIER;
export interface VehicleEnv { surfaceAt(x: number, z: number): SurfaceId; waterLevelAt(x: number, z: number): number }
export interface DriveInput { throttle: number; brake: number; steer: number; handbrake: number }
export type AssistLevel = 'relaxed' | 'standard' | 'simlite';

export interface Wheel {
  local: V3; front: boolean; left: boolean; axle: AxleSpec;
  compression: number; prevCompression: number; length: number;
  contact: boolean; point: V3; normal: V3; surface: SurfaceId; inWater: boolean;
  load: number; steer: number; spin: number; omega: number; slip: number; sink: number;
  driveForce: number; cap: number; skid: number; anchored: boolean; anchor: V3;
}

const G = 9.81;
/** Simplified Pacejka lateral curve: peak near 7.5°, gentle falloff to ~76 % (cozy, catchable slides). */
export const lateralCurve = (alpha: number): number => Math.sin(1.45 * Math.atan(14 * alpha));

export function torqueAt(curve: [number, number][], rpm: number): number {
  if (rpm <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [r1, t1] = curve[i];
    if (rpm <= r1) { const [r0, t0] = curve[i - 1]; return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0); }
  }
  return curve[curve.length - 1][1];
}

/** Split an axle's drive force between left/right wheels: open diff limited by the weaker wheel, locked uses both. */
export function splitAxle(demand: number, capL: number, capR: number, lock: number): [number, number] {
  const half = demand / 2, sgn = Math.sign(demand), mag = Math.abs(half);
  const cmin = Math.min(capL, capR);
  const open = Math.min(mag, cmin);
  let lockL: number, lockR: number;
  if (capL < capR) { lockL = Math.min(capL, mag); lockR = Math.min(capR, Math.abs(demand) - lockL); }
  else { lockR = Math.min(capR, mag); lockL = Math.min(capL, Math.abs(demand) - lockR); }
  return [sgn * (open + (lockL - open) * lock), sgn * (open + (lockR - open) * lock)];
}

export class Vehicle {
  body: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  private extraColliders: RAPIER.Collider[] = [];
  spec!: VehicleSpec;
  wheels: Wheel[] = [];
  gear = 1;
  rpm = 800;
  lowRange = false;
  lockersOn = false;
  pressure = 2;
  assists: AssistLevel = 'relaxed';
  speed = 0;               // signed forward speed m/s
  /** Throttle actually applied last step (player, cruise or autopilot), for engine sound. */
  appliedThrottle = 0;
  airborne = false;
  upsideTime = 0;
  submergedTime = 0;
  needsRescue = false;
  waterDepth = 0;
  prevPos = v3(); curPos = v3();
  prevRot: Q4 = { x: 0, y: 0, z: 0, w: 1 }; curRot: Q4 = { x: 0, y: 0, z: 0, w: 1 };
  private shiftTimer = 0;
  private shiftUp = false;
  /** Smoothed chassis acceleration (m/s²), measured per physics step so visuals don't depend on frame pacing. */
  accLong = 0; accLat = 0;
  private lastVel = v3(); private hasLastVel = false;
  // scratch vectors (no per-step allocation)
  private t = { pos: v3(), up: v3(), fwd: v3(), right: v3(), a: v3(), b: v3(), c: v3(), wf: v3(), ws: v3(), vel: v3(), mount: v3() };

  constructor(private R: Rapier, private world: RAPIER.World, spec: VehicleSpec, pos: V3, yaw: number, private env: VehicleEnv) {
    const desc = R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setCanSleep(false).setCcdEnabled(true)
      .setLinearDamping(0.02).setAngularDamping(0.25);
    this.body = world.createRigidBody(desc);
    this.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.setSpec(spec);
    this.capture(); this.capture();
  }

  /** Apply a new spec (after customization) without moving the car. */
  setSpec(spec: VehicleSpec): void {
    this.spec = spec;
    this.pressure = spec.pressure;
    if (this.collider) this.world.removeCollider(this.collider, false);
    const [hx, hy, hz] = spec.half, m = spec.mass, [ix, iy, iz] = spec.inertiaScale;
    const inertia = { x: (m / 3) * (hy * hy + hz * hz) * ix, y: (m / 3) * (hx * hx + hz * hz) * iy, z: (m / 3) * (hx * hx + hy * hy) * iz };
    const cd = this.bodyHull(spec)
      .setMassProperties(m, { x: 0, y: spec.comY, z: 0 }, inertia, { x: 0, y: 0, z: 0, w: 1 })
      .setFriction(0.35).setRestitution(0.05);
    this.collider = this.world.createCollider(cd, this.body);
    for (const c of this.extraColliders) this.world.removeCollider(c, false);
    this.extraColliders = [];
    if (spec.cabin) {
      // Roof / cage: no mass, just keeps a rolled car resting on its roof instead of sinking into the ground.
      const g = restGroundY(CAR_TYPES[spec.id] ?? spec), c = spec.cabin;
      const desc = this.R.ColliderDesc.roundCuboid(c.hx - 0.06, (c.y1 - c.y0) / 2 - 0.06, (c.z1 - c.z0) / 2 - 0.06, 0.06)
        .setTranslation(0, g + (c.y0 + c.y1) / 2, (c.z0 + c.z1) / 2).setDensity(0).setFriction(0.35);
      this.extraColliders.push(this.world.createCollider(desc, this.body));
    }
    this.wheels = [];
    for (const [ax, front] of [[spec.front, true], [spec.rear, false]] as [AxleSpec, boolean][]) {
      for (const left of [true, false]) {
        this.wheels.push({
          local: v3(left ? ax.halfTrack : -ax.halfTrack, spec.mountY, ax.z), front, left, axle: ax,
          compression: 0, prevCompression: 0, length: spec.restLength, contact: false, point: v3(), normal: v3(0, 1, 0),
          surface: S.Grass, inWater: false, load: 0, steer: 0, spin: 0, omega: 0, slip: 0, sink: 0, driveForce: 0, cap: 0, skid: 0, anchored: false, anchor: v3(),
        });
      }
    }
    if (!spec.lowRange) this.lowRange = false;
    if (!spec.lockable) this.lockersOn = false;
  }

  /**
   * Collision shape: full-length top, belly at sill height between the axles, and ends that rise at the
   * car's approach/departure angle, so bumpers clear slope changes the way a real car's do.
   */
  private bodyHull(spec: VehicleSpec): RAPIER.ColliderDesc {
    const [hx, hy, hz] = spec.half, r = 0.06;
    const ground = restGroundY(spec), tanA = Math.tan(((spec.approachDeg ?? 25) * Math.PI) / 180);
    const pts: number[] = [];
    const zs = [-hz, spec.rear.z - (spec.rear.z + hz) * 0.5, spec.rear.z, spec.front.z, spec.front.z + (hz - spec.front.z) * 0.5, hz];
    for (const z of zs) {
      const d = z > spec.front.z ? z - spec.front.z : z < spec.rear.z ? spec.rear.z - z : 0;
      const bottom = Math.min(hy * 0.6, Math.max(-hy, ground + 0.06 + d * tanA)) + r;
      for (const x of [-(hx - r), hx - r]) pts.push(x, bottom, z, x, hy - r, z);
    }
    return this.R.ColliderDesc.roundConvexHull(new Float32Array(pts), r) ?? this.R.ColliderDesc.roundCuboid(hx - r, hy - r, hz - r, r);
  }

  /** Teleport, keep upright, zero velocity. */
  reset(pos: V3, yaw: number): void {
    this.body.setTranslation(pos, true);
    this.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.gear = 1; this.upsideTime = 0; this.submergedTime = 0; this.needsRescue = false;
    this.hasLastVel = false; this.accLong = 0; this.accLat = 0;
    this.capture(); this.capture();
  }

  /** Copy body state for render interpolation. Call after each world.step(). */
  capture(): void {
    const p = this.body.translation(), r = this.body.rotation();
    set(this.prevPos, this.curPos.x, this.curPos.y, this.curPos.z);
    Object.assign(this.prevRot, this.curRot);
    set(this.curPos, p.x, p.y, p.z);
    this.curRot.x = r.x; this.curRot.y = r.y; this.curRot.z = r.z; this.curRot.w = r.w;
  }

  get yaw(): number { const f = rotate(v3(), this.curRot, v3(0, 0, 1)); return Math.atan2(f.x, f.z); }
  get canFlip(): boolean { return this.upsideTime > 1.0; }

  /** One fixed physics step, before world.step(). */
  step(dt: number, input: DriveInput): void {
    const s = this.spec, t = this.t, body = this.body;
    const p = body.translation(), q = body.rotation();
    set(t.pos, p.x, p.y, p.z);
    rotate(t.up, q, set(t.a, 0, 1, 0));
    rotate(t.fwd, q, set(t.a, 0, 0, 1));
    rotate(t.right, q, set(t.a, -1, 0, 0));
    const lv = body.linvel();
    set(t.vel, lv.x, lv.y, lv.z);
    this.speed = dot(t.vel, t.fwd);
    const mCorner = s.mass / 4;
    if (this.hasLastVel) {
      const ax = (t.vel.x - this.lastVel.x) / dt, ay = (t.vel.y - this.lastVel.y) / dt, az = (t.vel.z - this.lastVel.z) / dt;
      const k = 1 - Math.exp(-dt * 8);
      this.accLong += (clamp(ax * t.fwd.x + ay * t.fwd.y + az * t.fwd.z, -15, 15) - this.accLong) * k;
      this.accLat += (clamp(ax * t.right.x + ay * t.right.y + az * t.right.z, -15, 15) - this.accLat) * k;
    }
    set(this.lastVel, t.vel.x, t.vel.y, t.vel.z); this.hasLastVel = true;

    // ---- Suspension ----
    let grounded = 0;
    for (const w of this.wheels) {
      rotate(t.mount, q, w.local); add(t.mount, t.mount, t.pos);
      const maxLen = s.restLength + s.wheelRadius;
      const ray = new this.R.Ray(t.mount, { x: -t.up.x, y: -t.up.y, z: -t.up.z });
      const hit = this.world.castRayAndGetNormal(ray, maxLen, true, undefined, undefined, this.collider, body);
      w.prevCompression = w.compression;
      if (hit) {
        w.contact = true; grounded++;
        addScaled(w.point, t.mount, t.up, -hit.timeOfImpact);
        set(w.normal, hit.normal.x, hit.normal.y, hit.normal.z);
        w.length = Math.max(0, hit.timeOfImpact - s.wheelRadius);
        w.compression = s.restLength - w.length;
        const water = this.env.waterLevelAt(w.point.x, w.point.z);
        w.inWater = w.point.y < water - 0.05;
        w.surface = w.inWater ? S.Water : this.env.surfaceAt(w.point.x, w.point.z);
      } else {
        w.contact = false; w.inWater = false;
        w.length = Math.min(s.restLength, w.length + dt * 2.5);
        w.compression = 0;
      }
    }
    this.airborne = grounded === 0;

    for (const ax of [s.front, s.rear]) {
      const [L, Rw] = [this.wheels.find((w) => w.axle === ax && w.left)!, this.wheels.find((w) => w.axle === ax && !w.left)!];
      const k = mCorner * (2 * Math.PI * ax.freq) ** 2;
      const c = 2 * ax.zeta * Math.sqrt(k * mCorner);
      const arb = k * ax.antiRoll * (L.compression - Rw.compression);
      for (const w of [L, Rw]) {
        if (!w.contact) { w.load = 0; continue; }
        const vel = (w.compression - w.prevCompression) / dt;
        let f = k * w.compression + c * vel + (w.left ? arb : -arb);
        if (w.length < 0.02) f += k * 6 * (0.02 - w.length) + c * Math.max(0, vel); // bump stop
        w.load = Math.max(0, f);
      }
    }

    // ---- Drivetrain ----
    const reverse = this.gear < 0;
    if (input.throttle > 0.1 && reverse && this.speed > -1) this.gear = 1;
    else if (input.brake > 0.1 && input.throttle < 0.05 && !reverse && this.speed < 0.8 && grounded > 0) this.gear = -1;
    const throttle = this.gear > 0 ? input.throttle : input.brake;
    this.appliedThrottle = throttle;
    const brake = this.gear > 0 ? input.brake : input.throttle;
    const low = this.lowRange && s.lowRange ? s.lowRange : 1;
    const ratio = (this.gear > 0 ? s.gears[this.gear - 1] : s.reverse) * s.finalDrive * low;
    const wheelRpm = (Math.abs(this.speed) / s.wheelRadius) * (60 / (2 * Math.PI)) * ratio;
    const launchRpm = s.idleRpm + throttle * (s.maxRpm * 0.42 - s.idleRpm);
    let spinBoost = 0;
    for (const w of this.wheels) if (w.driveForce !== 0 && w.slip > 1) spinBoost = Math.max(spinBoost, (w.slip - 1) * 2500);
    const targetRpm = clamp(Math.max(wheelRpm, launchRpm) + spinBoost * throttle, s.idleRpm, s.maxRpm * 1.02);
    this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 12);

    this.shiftTimer -= dt;
    if (this.gear > 0 && this.shiftTimer <= 0 && grounded > 0) {
      if (wheelRpm > s.maxRpm * 0.9 && this.gear < s.gears.length) { this.gear++; this.shiftTimer = 0.4; this.shiftUp = true; }
      else if (wheelRpm < s.maxRpm * 0.42 && this.gear > 1) { this.gear--; this.shiftTimer = 0.35; this.shiftUp = false; }
    }
    // Upshifts dip torque smoothly over 0.25 s instead of cutting it abruptly (no lurch).
    const shiftP = (0.4 - this.shiftTimer) / 0.25;
    const cut = this.shiftUp && shiftP >= 0 && shiftP < 1 ? 1 - 0.55 * Math.sin(Math.PI * shiftP) : 1;
    let engineTorque = torqueAt(s.torqueCurve, this.rpm) * throttle * cut;
    if (this.rpm >= s.maxRpm) engineTorque = 0;
    if (throttle < 0.05) engineTorque = -0.1 * torqueAt(s.torqueCurve, this.rpm) * (this.rpm / s.maxRpm) * Math.sign(this.speed) * clamp(Math.abs(this.speed) / 2, 0, 1) * (this.gear > 0 ? 1 : -1);
    const totalDrive = ((engineTorque * ratio * 0.85) / s.wheelRadius) * (this.gear > 0 ? 1 : -1);
    const frontShare = s.layout === 'FWD' ? 1 : s.layout === 'RWD' ? 0 : s.frontSplit;
    const lock = this.lockersOn ? 1 : s.diffLock;

    // Grip capacity per wheel (needed by the differential).
    for (const w of this.wheels) {
      const mu = gripFor(s.tyre, s.baseGrip, w.surface, this.pressure);
      w.cap = w.contact ? mu * w.load : 0;
    }
    // AWD centre coupling: torque an axle cannot use flows to the other axle (viscous-style).
    const axleCap = (ax: AxleSpec) => this.wheels.reduce((sum, w) => sum + (w.axle === ax ? w.cap * 1.15 : 0), 0);
    let fShare = frontShare;
    if (s.layout === "AWD" && totalDrive !== 0) {
      const fCap = axleCap(s.front), rCap = axleCap(s.rear), D = Math.abs(totalDrive);
      const fOver = Math.max(0, D * fShare - fCap), rOver = Math.max(0, D * (1 - fShare) - rCap);
      fShare = clamp((D * fShare - fOver + Math.min(rOver, Math.max(0, fCap - D * fShare))) / D, 0, 1);
    }
    for (const ax of [s.front, s.rear]) {
      const share = ax === s.front ? fShare : 1 - fShare;
      const [L, Rw] = [this.wheels.find((w) => w.axle === ax && w.left)!, this.wheels.find((w) => w.axle === ax && !w.left)!];
      const [fl, fr] = splitAxle(totalDrive * share, L.cap * 1.15, Rw.cap * 1.15, lock);
      // Wheels that would be limited spin up visually (slip > 1).
      L.driveForce = share > 0 ? fl : 0; Rw.driveForce = share > 0 ? fr : 0;
      const want = Math.abs(totalDrive * share) / 2;
      L.slip = share > 0 && L.cap > 0 ? want / L.cap : share > 0 && want > 0 ? 3 : 0;
      Rw.slip = share > 0 && Rw.cap > 0 ? want / Rw.cap : share > 0 && want > 0 ? 3 : 0;
    }

    // ---- Tyres ----
    const mu0 = this.assists === 'simlite' ? 1 : 1.04;
    let steerSum = 0, steerN = 0, groundY = 0;
    for (const w of this.wheels) {
      if (w.axle.maxSteer > 0) {
        const base = input.steer * w.axle.maxSteer / (1 + (this.speed / 24) ** 2);
        w.steer = base * (base > 0 === !w.left ? 1.08 : 0.94);
        steerSum += w.steer; steerN++;
      } else w.steer = 0;
      if (!w.contact) { w.omega *= 0.995; w.spin += w.omega * dt; w.skid = 0; w.sink = 0; continue; }
      groundY += w.point.y;
      const cs = Math.cos(w.steer), sn = Math.sin(w.steer);
      set(t.wf, t.fwd.x * cs + t.right.x * sn, t.fwd.y * cs + t.right.y * sn, t.fwd.z * cs + t.right.z * sn);
      addScaled(t.wf, t.wf, w.normal, -dot(t.wf, w.normal)); normalize(t.wf, t.wf);
      normalize(t.ws, cross(t.ws, t.wf, w.normal));
      const pv = body.velocityAtPoint(w.point);
      set(t.b, pv.x, pv.y, pv.z);
      const vLong = dot(t.b, t.wf), vLat = dot(t.b, t.ws);
      const surf = SURFACES[w.surface], pe = pressureEffect(w.surface, this.pressure);
      const hand = input.handbrake > 0.5 && !w.front;
      const mu = gripFor(s.tyre, s.baseGrip, w.surface, this.pressure) * mu0;
      const cap = mu * w.load;

      let fx = w.driveForce;
      const brakeF = brake * w.axle.brake + (hand ? w.axle.brake * 1.5 : 0);
      const stopF = (Math.abs(vLong) * mCorner) / dt;
      if (brakeF > 0) fx += -Math.sign(vLong) * Math.min(brakeF, stopF);
      fx += -clamp(vLong / 0.4, -1, 1) * surf.crr * pe.crr * w.load * (w.inWater ? 2 : 1);
      const latMu = mu * (hand ? 0.45 : 1);
      const alpha = Math.atan2(vLat, Math.max(Math.abs(vLong), 2.5));
      let fy = -latMu * w.load * lateralCurve(alpha);
      // A spinning tyre grips less than a gripping one. Low range (4L) meters torque like a crawl gear, and
      // the Relaxed assist acts as traction control, so they keep (most of) the peak grip.
      const spinScale = this.lowRange ? 0 : this.assists === 'relaxed' ? 0.4 : this.assists === 'standard' ? 0.8 : 1;
      const spinLoss = w.driveForce !== 0 && w.slip > 1 ? 1 - 0.3 * spinScale * Math.min(1, (w.slip - 1) * 2) : 1;
      fx = clamp(fx, -cap * spinLoss, cap * spinLoss);
      const fyMax = Math.sqrt(Math.max(0, (latMu * w.load) ** 2 - 0.6 * fx * fx));
      fy = clamp(fy, -fyMax, fyMax);

      // Static friction: a stopped car with no throttle holds its spot (spring to an anchor, limited by grip).
      // Stopped with no throttle: hold the spot. In 4L the hold engages earlier (hill hold for crawling).
      const parked = throttle < 0.05 && Math.abs(this.speed) < (this.lowRange ? 1.2 : 0.4) && grounded > 2;
      if (!parked) w.anchored = false;
      else {
        if (!w.anchored) { set(w.anchor, w.point.x, w.point.y, w.point.z); w.anchored = true; }
        const dx = w.point.x - w.anchor.x, dy = w.point.y - w.anchor.y, dz = w.point.z - w.anchor.z;
        const eL = dx * t.wf.x + dy * t.wf.y + dz * t.wf.z, eS = dx * t.ws.x + dy * t.ws.y + dz * t.ws.z;
        if (Math.abs(eL) > 0.3 || Math.abs(eS) > 0.3) w.anchored = false;
        else {
          const k = mCorner * 350, c = mCorner * 26;
          fx = clamp(-(k * eL + c * vLong), -cap, cap);
          fy = clamp(-(k * eS + c * vLat), -latMu * w.load, latMu * w.load);
        }
      }

      // Impulse: tyre forces at the contact patch lifted toward the roll centre, suspension along chassis up.
      scale(t.c, t.wf, fx); addScaled(t.c, t.c, t.ws, fy); addScaled(t.c, t.c, t.up, w.load);
      scale(t.c, t.c, dt);
      addScaled(t.a, w.point, t.up, 0.4 * (w.length + s.wheelRadius));
      body.applyImpulseAtPoint(t.c, t.a, true);

      const spinning = w.driveForce !== 0 && w.slip > 1.05;
      const locked = brakeF > cap * 1.1 && Math.abs(vLong) > 0.5;
      const roll = vLong / s.wheelRadius;
      w.omega = locked ? 0 : spinning ? roll + Math.sign(w.driveForce) * Math.min(45, (w.slip - 1) * 30) : roll;
      w.spin += w.omega * dt;
      w.skid = Math.abs(vLat) * (Math.abs(alpha) > 0.12 ? 1 : 0.3) + (spinning ? (w.slip - 1) * 6 : 0) + (locked ? Math.abs(vLong) : 0);
      w.sink = surf.sink * pe.sink * (w.inWater ? 0.5 : 1);
    }

    // ---- Aero, water, assists ----
    const sp = Math.hypot(t.vel.x, t.vel.y, t.vel.z);
    body.applyImpulse({ x: -s.drag * sp * t.vel.x * dt, y: -s.drag * sp * t.vel.y * dt, z: -s.drag * sp * t.vel.z * dt }, true);

    const level = this.env.waterLevelAt(t.pos.x, t.pos.z);
    const bottom = t.pos.y - s.half[1] * Math.abs(t.up.y);
    const depth = level - bottom;
    if (depth > 0) {
      const frac = clamp(depth / (2 * s.half[1]), 0, 1);
      body.applyImpulse({ x: -t.vel.x * s.mass * 0.9 * frac * dt, y: (s.mass * G * 0.7 * frac - t.vel.y * s.mass * 0.6 * frac) * dt, z: -t.vel.z * s.mass * 0.9 * frac * dt }, true);
    }
    const ground = grounded > 0 ? groundY / grounded : bottom;
    this.waterDepth = Math.max(0, level - ground);
    this.submergedTime = this.waterDepth > s.wadingDepth ? this.submergedTime + dt : 0;
    if (this.submergedTime > 1.5) this.needsRescue = true;

    const av = body.angvel();
    const yawRate = av.x * t.up.x + av.y * t.up.y + av.z * t.up.z;
    const rollRate = av.x * t.fwd.x + av.y * t.fwd.y + av.z * t.fwd.z;
    const Iy = (s.mass / 3) * (s.half[0] ** 2 + s.half[2] ** 2) * s.inertiaScale[1];
    const Ix = (s.mass / 3) * (s.half[1] ** 2 + s.half[2] ** 2) * s.inertiaScale[0];
    const assist = this.assists === 'relaxed' ? 1 : this.assists === 'standard' ? 0.45 : 0;
    if (assist > 0 && grounded >= 2) {
      const wheelbase = s.front.z - s.rear.z;
      const target = (this.speed * Math.tan(steerN ? steerSum / steerN : 0)) / wheelbase;
      if (Math.abs(yawRate) > Math.abs(target) + 0.15) {
        const k = 4 * assist * (yawRate - target) * Iy * dt;
        body.applyTorqueImpulse({ x: -t.up.x * k, y: -t.up.y * k, z: -t.up.z * k }, true);
      }
    }
    if (assist > 0 && Math.abs(rollRate) > 1.5) {
      const k = 3 * assist * (rollRate - Math.sign(rollRate) * 1.5) * Ix * dt;
      body.applyTorqueImpulse({ x: -t.fwd.x * k, y: -t.fwd.y * k, z: -t.fwd.z * k }, true);
    }
    if (this.airborne && assist > 0) {
      const pitch = (input.throttle - input.brake) * 1.2 * Ix * dt * assist, yaw = input.steer * 1.0 * Iy * dt * assist;
      body.applyTorqueImpulse({ x: -t.right.x * pitch - t.up.x * yaw, y: -t.right.y * pitch - t.up.y * yaw, z: -t.right.z * pitch - t.up.z * yaw }, true);
    }
    this.upsideTime = t.up.y < 0.3 && Math.abs(this.speed) < 3 ? this.upsideTime + dt : 0;
  }

  /** Gentle "flip back": lift and set upright, keeping heading. */
  flip(): void {
    const p = this.body.translation(), yaw = this.yaw;
    this.reset({ x: p.x, y: p.y + 1.6, z: p.z }, yaw);
  }

  /** Surface under the most loaded wheel, for HUD and audio. */
  get mainSurface(): SurfaceId {
    let best = -1, s: SurfaceId = S.Grass;
    for (const w of this.wheels) if (w.contact && w.load > best) { best = w.load; s = w.surface; }
    return s;
  }

  /** Nose-up angle of the chassis in degrees (positive = climbing). */
  get pitchDeg(): number { return (Math.asin(clamp(rotate(v3(), this.curRot, v3(0, 0, 1)).y, -1, 1)) * 180) / Math.PI; }

  get gearLabel(): string { return this.gear < 0 ? 'R' : String(this.gear) + (this.lowRange ? 'L' : ''); }
}
