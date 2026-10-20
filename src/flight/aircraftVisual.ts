import * as THREE from 'three';
import { modelScene } from '../world/townModels';
import type { Aircraft } from './aircraft';
import type { AircraftSpec } from './specs';

/** Spinning-propeller blur disc: a soft translucent ring. */
function discMaterial(color = 0x222222, opacity = 0.35): THREE.MeshBasicMaterial {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.5)'); grad.addColorStop(0.9, 'rgba(255,255,255,0.8)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return new THREE.MeshBasicMaterial({ color, map: t, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
}

/** The aircraft's model, scaled to real size and seated on its gear, with spinning props and rotors. */
export class AircraftVisual {
  readonly root = new THREE.Group();
  private model = new THREE.Group();
  private props: { obj: THREE.Object3D; axis: THREE.Vector3; spin: number }[] = [];
  private discs: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  private flame: THREE.Mesh | null = null;
  private spin = 0;
  readonly eye = new THREE.Vector3();
  readonly size: number;

  constructor(scene: THREE.Scene, readonly spec: AircraftSpec) {
    const src = modelScene(`aircraft/${spec.model}`);
    if (src) {
      const m = src.clone(true);
      m.rotation.y = spec.modelYaw; m.scale.setScalar(spec.modelScale);
      this.model.add(m);
      this.model.updateMatrixWorld(true);
      // Centre in x/z, and sit the lowest point on the landing gear (or basket) contact height.
      const box = new THREE.Box3().setFromObject(this.model), c = box.getCenter(new THREE.Vector3());
      const groundY = Math.min(...spec.gear.map((g) => g.pos[1]), ...(spec.floats ?? []).map((f) => f.pos[1] - f.half[1]));
      m.position.set(-c.x + spec.modelOffset[0], groundY - box.min.y + spec.modelOffset[1], -c.z + spec.modelOffset[2]);
      m.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
      if (spec.model === 'trainer') { const prop: THREE.Object3D[] = []; m.traverse((o) => { if (/Propeller/.test(o.name) && (o as THREE.Mesh).isMesh) prop.push(o); }); this.pivotGroup(prop, new THREE.Vector3(0, 0, 1)); }
      if (spec.model === 'helicopter') {
        const blades: THREE.Object3D[] = [];
        m.traverse((o) => { if (o.name === 'Box04_Box014' || o.name === 'Box20183' || o.name === 'Cylinder005') blades.push(o); });
        this.pivotGroup(blades, new THREE.Vector3(0, 1, 0));
      }
    }
    this.root.add(this.model);
    const box = new THREE.Box3().setFromObject(this.model);
    this.size = box.isEmpty() ? 8 : box.getSize(new THREE.Vector3()).length() / 2;
    if (spec.engine && spec.model !== 'trainer') this.addDisc(spec.engine.propPos, spec.engine.propRadius, new THREE.Vector3(0, 0, 1));
    if (spec.engine && spec.model === 'trainer') this.addDisc(spec.engine.propPos, spec.engine.propRadius, new THREE.Vector3(0, 0, 1), 0.18);
    if (spec.rotor) {
      this.addDisc(spec.rotor.hub, spec.rotor.radius, new THREE.Vector3(0, 1, 0), 0.12);
      this.addDisc([0.25, 0.95, -spec.rotor.tailArm], 0.85, new THREE.Vector3(1, 0, 0), 0.3);
    }
    if (spec.balloon) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.6, 10), new THREE.MeshBasicMaterial({ color: 0xffa340, transparent: true, opacity: 0.85 }));
      f.position.set(0, 2.6, 0); f.visible = false; this.root.add(f); this.flame = f;
    }
    this.eye.set(...spec.eye);
    scene.add(this.root);
  }

  /** Re-parent parts under a pivot at their bounding-box centre (keeping their pose), so they can spin about `axis`. */
  private pivotGroup(objs: THREE.Object3D[], axis: THREE.Vector3): void {
    if (!objs.length) return;
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3(); for (const o of objs) box.expandByObject(o);
    const pivot = new THREE.Group();
    this.model.add(pivot); pivot.position.copy(this.model.worldToLocal(box.getCenter(new THREE.Vector3()))); pivot.updateMatrixWorld(true);
    for (const o of objs) pivot.attach(o);
    this.props.push({ obj: pivot, axis, spin: 0 });
  }

  private addDisc(pos: [number, number, number], r: number, axis: THREE.Vector3, opacity = 0.32): void {
    const mat = discMaterial(0x1d1d1d, opacity), mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 32), mat);
    mesh.position.set(...pos);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    this.root.add(mesh); this.discs.push({ mesh, mat });
  }

  update(a: Aircraft, alpha: number, dt: number): void {
    const p = this.root.position, pp = a.prevPos, cp = a.curPos;
    p.set(pp.x + (cp.x - pp.x) * alpha, pp.y + (cp.y - pp.y) * alpha, pp.z + (cp.z - pp.z) * alpha);
    this.root.quaternion.set(a.prevRot.x, a.prevRot.y, a.prevRot.z, a.prevRot.w).slerp(new THREE.Quaternion(a.curRot.x, a.curRot.y, a.curRot.z, a.curRot.w), alpha);
    const rate = (a.rpm / 60) * Math.PI * 2;
    this.spin += rate * dt;
    for (const pr of this.props) pr.obj.quaternion.setFromAxisAngle(pr.axis, this.spin * (a.spec.rotor ? 1 : 0.9));
    const fast = Math.min(1, a.rpm / ((a.spec.engine?.rpm ?? a.spec.rotor?.rpm ?? 1) * 0.5));
    for (const d of this.discs) { d.mesh.visible = fast > 0.15; d.mat.opacity = (a.spec.rotor ? 0.14 : 0.3) * fast; }
    if (this.flame) { this.flame.visible = a.burner; this.flame.scale.setScalar(0.85 + Math.random() * 0.3); }
  }

  dispose(scene: THREE.Scene): void { scene.remove(this.root); }
}
