import type RAPIER from '@dimforge/rapier3d-compat';
import type * as THREE from 'three';
import type { FlightControls } from '../core/input';
import { rotate, set, v3 } from '../core/math';
import { along, type AirPlace, type Spot } from '../world/airports';
import { heightAt, surfaceAt, waterLevelAt, type WorldData } from '../world/terrainGen';
import { Aircraft, restRotation, type FlightAssist, type FlightEnv, type FlightInput } from './aircraft';
import { AircraftVisual } from './aircraftVisual';
import { Wind } from './atmosphere';
import type { AircraftSpec } from './specs';

/** After a crash, an aeroplane is lined up this far (m) in from the end of its runway: the nose clear of the end. */
const LINE_UP = 30;

/**
 * Relaxed assist on the runway, hands off the steering: rudder (-1..1, + = nose right) to hold heading `hold`.
 * The yaw-rate term (rad/s) catches a swing before it builds: a taildragger (centre of gravity behind the main
 * wheels) would otherwise ground-loop once its tail lifts and the tailwheel stops steering.
 */
export function runwayHeadingHold(heading: number, hold: number, yawRate: number): number {
  const err = Math.atan2(Math.sin(heading - hold), Math.cos(heading - hold));
  return Math.max(-1, Math.min(1, err * 4 + yawRate * 4));
}

/** Seconds over which the take-off heading hold lets go after lift-off. */
const RELEASE = 4;

/**
 * Relaxed assist, hands off the steering: holds the heading you're rolling on down the runway, and after lift-off
 * lets go gradually, so in a crosswind the nose eases round into the wind (the crab that keeps you tracking
 * straight) instead of snapping round the moment the wheels leave the ground.
 */
export class TakeoffHold {
  private hold = 0;
  private airborne = 0;
  /** Rudder (-1..1) to fly, or null when you're steering or it isn't holding. */
  update(a: Aircraft, steering: boolean, dt: number): number | null {
    this.airborne = a.onGround ? 0 : this.airborne + dt;
    const weight = a.onGround ? 1 : Math.max(0, 1 - this.airborne / RELEASE);
    if (steering || weight === 0 || a.groundSpeed < 2) { this.hold = a.heading; return null; }
    return runwayHeadingHold(a.heading, this.hold, a.body.angvel().y) * weight;
  }
}

/** The aircraft you are flying (at most one), its visual, and where it is based. */
export class FlightSession {
  aircraft: Aircraft | null = null;
  visual: AircraftVisual | null = null;
  /** Where this flight started: crashes bring you back here. */
  home: AirPlace | null = null;
  readonly wind = new Wind();
  private input: FlightInput = { pitch: 0, roll: 0, yaw: 0, lift: 0, brake: 0 };
  private takeoffHold = new TakeoffHold();
  private env: FlightEnv;

  constructor(private R: typeof RAPIER, private physics: RAPIER.World, private scene: THREE.Scene, private world: WorldData) {
    this.env = { surfaceAt: (x, z) => surfaceAt(world, x, z), waterLevelAt: (x, z) => waterLevelAt(world, x, z), groundAt: (x, z) => heightAt(world, x, z), wind: this.wind };
  }

  get active(): boolean { return this.aircraft !== null; }

  /** A resting pose at a spot: wheels (or floats, skids, basket) just touching the ground or water. */
  pose(spec: AircraftSpec, spot: Spot, onWater: boolean): { x: number; y: number; z: number } {
    const q = restRotation(spec, spot.yaw), o = v3();
    let lowest = Infinity;
    for (const g of spec.gear) { rotate(o, q, set(v3(), ...g.pos)); lowest = Math.min(lowest, o.y); }
    if (spec.floats) for (const f of spec.floats) { rotate(o, q, set(v3(), f.pos[0], f.pos[1] - f.half[1], f.pos[2])); lowest = Math.min(lowest, o.y); }
    const surface = onWater ? waterLevelAt(this.world, spot.x, spot.z) - 0.25 : heightAt(this.world, spot.x, spot.z);
    return { x: spot.x, y: surface - lowest + (onWater ? 0 : 0.06), z: spot.z };
  }

  start(spec: AircraftSpec, place: AirPlace): void {
    this.stop();
    const onWater = place.kind === 'dock';
    this.home = place;
    this.aircraft = new Aircraft(this.R, this.physics, spec, this.pose(spec, place.spawn, onWater), place.spawn.yaw, this.env);
    this.visual = new AircraftVisual(this.scene, spec);
  }

  /**
   * Back home, unhurt ("the mechanics patched it up"). An aeroplane whose base has a runway is put at the start of
   * it, on the centreline and facing into the wind, engine running and take-off flap set: ready to go again.
   * Returns the runway's number when it does that.
   */
  respawn(): string | null {
    const a = this.aircraft, home = this.home, rw = home?.runway;
    if (!a || !home) return null;
    if (!rw || a.spec.kind !== 'plane') { a.reset(this.pose(a.spec, home.spawn, home.kind === 'dock'), home.spawn.yaw); return null; }
    // Take off the way that puts the wind on the nose (the wind's heading is where it blows towards).
    const upwind = Math.cos(rw.dir - this.wind.heading) <= 0, yaw = upwind ? rw.dir : rw.dir + Math.PI;
    const [x, z] = along(rw, (upwind ? -1 : 1) * (rw.halfLen - LINE_UP), 0);
    a.reset(this.pose(a.spec, { x, z, yaw }, false), yaw, true);
    if (a.spec.engine?.maxFlaps) a.flapsTarget = a.flaps = 1 / 3;
    return rw.designators[upwind ? 0 : 1];
  }

  stop(): void {
    this.aircraft?.dispose(); this.visual?.dispose(this.scene);
    this.aircraft = null; this.visual = null;
  }

  /** Flaps: up, 10, 20, 30-ish (a third of travel per press), then back up. */
  cycleFlaps(): number {
    const a = this.aircraft;
    if (!a || !a.spec.engine?.maxFlaps) return 0;
    a.flapsTarget = a.flapsTarget >= 0.99 ? 0 : Math.min(1, Math.round(a.flapsTarget * 3 + 1) / 3);
    return a.flapsTarget;
  }

  step(dt: number, c: FlightControls, assist: FlightAssist): void {
    const a = this.aircraft;
    if (!a) return;
    const i = this.input;
    // On the ground, A/D steer too (nosewheel, tailwheel or skids), so taxiing feels like driving.
    i.pitch = c.pitch; i.roll = c.roll; i.lift = c.lift; i.brake = c.brake;
    i.yaw = Math.max(-1, Math.min(1, c.yaw + (a.onGround && a.airspeed < 25 ? c.roll : 0)));
    // Relaxed: hands off the steering holds your heading down the runway (and lets go gently once you're flying).
    const steering = Math.abs(c.yaw) > 0.05 || Math.abs(c.roll) > 0.05 || assist !== 'relaxed' || a.spec.kind !== 'plane';
    const hold = this.takeoffHold.update(a, steering, dt);
    if (hold !== null) i.yaw = hold;
    a.step(dt, i, assist);
  }

  capture(): void { this.aircraft?.capture(); }
  update(dt: number, alpha: number): void { if (this.aircraft && this.visual) this.visual.update(this.aircraft, alpha, dt); }
}
