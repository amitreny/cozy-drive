import * as THREE from 'three';
import { damp } from '../core/math';

export type CamMode = 'chase' | 'far' | 'hood';

/** Spring-damped chase camera with look-ahead, mouse orbit and terrain avoidance. */
export class ChaseCamera {
  mode: CamMode = 'chase';
  orbit = 0;                 // extra yaw from mouse drag
  turntable = false;         // garage mode: slow orbit around the car
  private yaw = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private idle = 0;
  private dragging = false;
  private first = true;

  constructor(public cam: THREE.PerspectiveCamera, canvas: HTMLElement, private groundAt: (x: number, z: number) => number) {
    canvas.addEventListener('pointerdown', () => { this.dragging = true; });
    window.addEventListener('pointerup', () => { this.dragging = false; });
    window.addEventListener('pointermove', (e) => { if (this.dragging) { this.orbit -= e.movementX * 0.006; this.idle = 0; } });
  }

  cycle(): void { this.mode = this.mode === 'chase' ? 'far' : this.mode === 'far' ? 'hood' : 'chase'; }

  update(dt: number, target: THREE.Vector3, q: THREE.Quaternion, speed: number, size: number): void {
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const carYaw = Math.atan2(fwd.x, fwd.z);
    let diff = carYaw - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += this.first ? diff : diff * (1 - Math.exp(-3.2 * dt));
    this.idle += dt;
    if (this.turntable) this.orbit += dt * 0.25;
    else if (this.idle > 2.5 && !this.dragging) this.orbit = damp(this.orbit, 0, 1.5, dt);

    if (this.mode === 'hood') {
      const eye = new THREE.Vector3(0, size * 0.55, size * 0.35).applyQuaternion(q).add(target);
      this.cam.position.copy(eye);
      this.cam.lookAt(eye.clone().add(fwd.multiplyScalar(10)));
      this.cam.fov = damp(this.cam.fov, 70, 4, dt); this.cam.updateProjectionMatrix();
      this.first = false;
      return;
    }
    const far = this.mode === 'far' || this.turntable;
    const dist = (far ? 9.5 : 6.2) * (size / 2) + Math.min(Math.abs(speed), 40) * 0.05;
    const height = (far ? 3.6 : 2.2) * (size / 2);
    const a = this.yaw + Math.PI + this.orbit;
    const desired = new THREE.Vector3(target.x + Math.sin(a) * dist, target.y + height, target.z + Math.cos(a) * dist);
    const floor = this.groundAt(desired.x, desired.z) + 1.0;
    if (desired.y < floor) desired.y = floor;
    if (this.first) { this.pos.copy(desired); this.look.copy(target); this.first = false; }
    this.pos.x = damp(this.pos.x, desired.x, 6, dt);
    this.pos.z = damp(this.pos.z, desired.z, 6, dt);
    this.pos.y = damp(this.pos.y, desired.y, 4, dt);
    const ahead = this.turntable ? 0 : Math.min(Math.max(speed, 0), 30) * 0.12;
    const lookT = new THREE.Vector3(target.x + Math.sin(this.yaw) * ahead, target.y + 0.8 * (size / 2), target.z + Math.cos(this.yaw) * ahead);
    this.look.lerp(lookT, 1 - Math.exp(-8 * dt));
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
    this.cam.fov = damp(this.cam.fov, 58 + Math.min(Math.abs(speed), 40) * 0.15, 3, dt);
    this.cam.updateProjectionMatrix();
  }

  snap(): void { this.first = true; }
}
