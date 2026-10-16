import * as THREE from 'three';
import type { Build } from '../customization/build';
import { buildCarModel, type CarModel } from './carModel';
import type { VehicleSpec } from './spec';
import type { Vehicle } from './vehicle';

/** Presentation for the player car: interpolation, wheels, and a visual-only soft body roll. */
export class CarVisual {
  model!: CarModel;
  private roll = 0; private rollV = 0; private pitch = 0; private pitchV = 0;
  private prevVel = new THREE.Vector3(); private acc = new THREE.Vector3();
  private qa = new THREE.Quaternion(); private qb = new THREE.Quaternion();
  private fwd = new THREE.Vector3(); private right = new THREE.Vector3();
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

    // Feel layer: exaggerated roll and pitch from acceleration, on a soft spring.
    if (dt > 0) {
      const lv = v.body.linvel();
      this.acc.set(lv.x, lv.y, lv.z).sub(this.prevVel).divideScalar(dt);
      this.prevVel.set(lv.x, lv.y, lv.z);
      this.fwd.set(0, 0, 1).applyQuaternion(root.quaternion);
      this.right.set(-1, 0, 0).applyQuaternion(root.quaternion);
      const grounded = !v.airborne;
      const lat = grounded ? THREE.MathUtils.clamp(this.acc.dot(this.right), -12, 12) : 0;
      const lon = grounded ? THREE.MathUtils.clamp(this.acc.dot(this.fwd), -12, 12) : 0;
      const k = 70, c = 2 * Math.sqrt(k) * 0.45;
      this.rollV += (k * (-lat * 0.0035 - this.roll) - c * this.rollV) * dt;
      this.pitchV += (k * (-lon * 0.003 - this.pitch) - c * this.pitchV) * dt;
      this.roll += this.rollV * dt; this.pitch += this.pitchV * dt;
      this.model.body.rotation.set(this.pitch, 0, this.roll);
    }

    v.wheels.forEach((w, i) => {
      const g = this.model.wheels[i];
      g.position.set(w.local.x, w.local.y - w.length - (w.contact ? w.sink : 0), w.local.z);
      g.rotation.y = -w.steer;
      g.children[0].rotation.x = w.spin;
    });
  }
}
