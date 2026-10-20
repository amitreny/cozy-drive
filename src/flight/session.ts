import type RAPIER from '@dimforge/rapier3d-compat';
import type * as THREE from 'three';
import type { FlightControls } from '../core/input';
import { rotate, set, v3 } from '../core/math';
import type { AirPlace, Spot } from '../world/airports';
import { heightAt, surfaceAt, waterLevelAt, type WorldData } from '../world/terrainGen';
import { Aircraft, restRotation, type FlightAssist, type FlightEnv, type FlightInput } from './aircraft';
import { AircraftVisual } from './aircraftVisual';
import { Wind } from './atmosphere';
import type { AircraftSpec } from './specs';

/** The aircraft you are flying (at most one), its visual, and where it is based. */
export class FlightSession {
  aircraft: Aircraft | null = null;
  visual: AircraftVisual | null = null;
  /** Where this flight started: crashes bring you back here. */
  home: AirPlace | null = null;
  readonly wind = new Wind();
  private input: FlightInput = { pitch: 0, roll: 0, yaw: 0, lift: 0, brake: 0 };
  private holdHeading = 0;
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

  /** Back to the home spot, unhurt ("the mechanics patched it up"). */
  respawn(): void {
    if (!this.aircraft || !this.home) return;
    this.aircraft.reset(this.pose(this.aircraft.spec, this.home.spawn, this.home.kind === 'dock'), this.home.spawn.yaw);
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
    // Relaxed: on the ground, hands off the steering holds your heading (the take-off roll stays on the centreline).
    const steering = Math.abs(c.yaw) > 0.05 || (a.onGround && Math.abs(c.roll) > 0.05);
    if (steering || !a.onGround || a.groundSpeed < 2) this.holdHeading = a.heading;
    else if (assist === 'relaxed' && a.spec.kind === 'plane') {
      const err = Math.atan2(Math.sin(a.heading - this.holdHeading), Math.cos(a.heading - this.holdHeading));
      i.yaw = Math.max(-1, Math.min(1, err * 4));
    }
    a.step(dt, i, assist);
  }

  capture(): void { this.aircraft?.capture(); }
  update(dt: number, alpha: number): void { if (this.aircraft && this.visual) this.visual.update(this.aircraft, alpha, dt); }
}
