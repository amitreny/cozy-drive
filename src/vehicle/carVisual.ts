import * as THREE from 'three';
import type { Build } from '../customization/build';
import { buildCarModel, type CarModel } from './carModel';
import type { VehicleSpec } from './spec';
import type { Vehicle } from './vehicle';

/** Presentation for the player car: interpolation, wheels, and a visual-only soft body roll. */
export class CarVisual {
  model!: CarModel;
  private roll = 0; private rollV = 0; private pitch = 0; private pitchV = 0;
  private qa = new THREE.Quaternion(); private qb = new THREE.Quaternion();
  private env: THREE.Texture | null = null;

  constructor(private scene: THREE.Scene, spec: VehicleSpec, build: Build) { this.rebuild(spec, build); }

  rebuild(spec: VehicleSpec, build: Build): void {
    if (this.model) { this.scene.remove(this.model.root); this.model.dispose(); }
    this.model = buildCarModel(spec, build);
    this.scene.add(this.model.root);
    const env = this.env; this.env = null; this.setEnvironment(env);
  }

  /** Reflections for paint, glass and chrome. */
  setEnvironment(tex: THREE.Texture | null): void {
    if (tex === this.env) return;
    this.env = tex;
    for (const m of this.model.reflective) { m.envMap = tex; m.envMapIntensity = (m.userData.envIntensity as number | undefined) ?? 0.8; m.needsUpdate = true; }
  }

  get position(): THREE.Vector3 { return this.model.root.position; }
  get quaternion(): THREE.Quaternion { return this.model.root.quaternion; }

  update(v: Vehicle, alpha: number, dt: number): void {
    const root = this.model.root;
    root.position.set(
      v.prevPos.x + (v.curPos.x - v.prevPos.x) * alpha,
      v.prevPos.y + (v.curPos.y - v.prevPos.y) * alpha,
      v.prevPos.z + (v.curPos.z - v.prevPos.z) * alpha);
    this.qa.set(v.prevRot.x, v.prevRot.y, v.prevRot.z, v.prevRot.w);
    this.qb.set(v.curRot.x, v.curRot.y, v.curRot.z, v.curRot.w);
    root.quaternion.slerpQuaternions(this.qa, this.qb, alpha);

    // Feel layer: soft roll and pitch from the physics-rate acceleration, integrated in fixed
    // sub-steps so uneven frame times never make the body rock.
    if (dt > 0) {
      const lat = v.airborne ? 0 : v.accLat, lon = v.airborne ? 0 : v.accLong;
      const k = 70, c = 2 * Math.sqrt(k) * 0.6, n = Math.max(1, Math.ceil(dt / (1 / 120))), h = Math.min(dt, 0.1) / n;
      for (let i = 0; i < n; i++) {
        this.rollV += (k * (-lat * 0.0035 - this.roll) - c * this.rollV) * h;
        this.pitchV += (k * (-lon * 0.003 - this.pitch) - c * this.pitchV) * h;
        this.roll += this.rollV * h; this.pitch += this.pitchV * h;
      }
      this.model.body.rotation.set(this.pitch, 0, this.roll);
    }

    v.wheels.forEach((w, i) => {
      const g = this.model.wheels[i];
      g.position.set(this.model.wheelX?.[i] ?? w.local.x, w.local.y - w.length - (w.contact ? w.sink : 0), w.local.z);
      g.rotation.y = -w.steer;
      g.children[0].rotation.x = w.spin;
    });
  }
}
