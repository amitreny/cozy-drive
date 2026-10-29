import * as THREE from 'three';
import { modelScene } from '../world/townModels';
import type { Aircraft } from './aircraft';
import { Propeller } from './propeller';
import type { AircraftSpec, FittedGear } from './specs';

/** Spinning-propeller blur disc: a soft translucent ring. */
function discMaterial(color = 0x222222, opacity = 0.35): THREE.MeshBasicMaterial {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.5)'); grad.addColorStop(0.9, 'rgba(255,255,255,0.8)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return new THREE.MeshBasicMaterial({ color, map: t, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
}

/**
 * Remove the parts of a model (connected pieces of each mesh) that lie wholly inside any of the boxes, given in
 * the frame `root` is drawn in. Used to cut a model's static propeller out so a working one can go in its place.
 */
function stripParts(root: THREE.Object3D, boxes: [number, number, number][][]): void {
  root.updateMatrixWorld(true);
  const inside = (b: number[]) => boxes.some(([lo, hi]) => b[0] >= lo[0] && b[1] >= lo[1] && b[2] >= lo[2] && b[3] <= hi[0] && b[4] <= hi[1] && b[5] <= hi[2]);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry, pos = geo.attributes.position, idx = geo.index, e = mesh.matrixWorld.elements;
    const tris = (idx ? idx.count : pos.count) / 3, vert = (t: number, k: number) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
    const P = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      for (let k = 0; k < 3; k++) P[i * 3 + k] = e[k] * x + e[4 + k] * y + e[8 + k] * z + e[12 + k];
    }
    // Pieces: triangles joined through shared (welded-by-position) vertices.
    const weld = new Map<string, number>(), rep = new Int32Array(pos.count), parent: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const key = `${P[i * 3].toFixed(3)},${P[i * 3 + 1].toFixed(3)},${P[i * 3 + 2].toFixed(3)}`;
      let r = weld.get(key);
      if (r === undefined) { r = parent.length; weld.set(key, r); parent.push(r); }
      rep[i] = r;
    }
    const find = (a: number) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
    for (let t = 0; t < tris; t++) { const a = find(rep[vert(t, 0)]); for (let k = 1; k < 3; k++) { const b = find(rep[vert(t, k)]); if (a !== b) parent[b] = a; } }
    const bounds = new Map<number, number[]>();
    for (let t = 0; t < tris; t++) {
      const r = find(rep[vert(t, 0)]);
      let b = bounds.get(r);
      if (!b) bounds.set(r, (b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]));
      for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) { const v = P[vert(t, k) * 3 + a]; b[a] = Math.min(b[a], v); b[a + 3] = Math.max(b[a + 3], v); }
    }
    const cut = new Set([...bounds].filter(([, b]) => inside(b)).map(([r]) => r));
    if (!cut.size) return;
    const keep: number[] = [];
    for (let t = 0; t < tris; t++) if (!cut.has(find(rep[vert(t, 0)]))) keep.push(vert(t, 0), vert(t, 1), vert(t, 2));
    if (!keep.length) { mesh.visible = false; return; }
    const g = geo.clone(); // the source model's geometry is shared by every clone
    g.setIndex(keep); g.clearGroups();
    mesh.geometry = g;
  });
}

/** Sprung main legs with spatted wheels, and a small tailwheel, for a model drawn without gear. */
function fittedGear(spec: AircraftSpec, f: FittedGear): THREE.Group {
  const out = new THREE.Group(), legMat = new THREE.MeshStandardMaterial({ color: f.legColor, roughness: 0.5, metalness: 0.4 });
  const spatMat = new THREE.MeshStandardMaterial({ color: f.spatColor, roughness: 0.45 }), tyre = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.9 });
  const rod = (a: THREE.Vector3, b: THREE.Vector3, w: number, t: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, a.distanceTo(b), t), legMat);
    m.position.addVectors(a, b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    out.add(m);
  };
  const wheel = (at: THREE.Vector3, r: number, w: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2), tyre);
    m.position.copy(at); out.add(m);
  };
  for (const g of spec.gear) {
    if (g.brake) {
      const axle = new THREE.Vector3(g.pos[0], g.pos[1] + f.wheelRadius, g.pos[2]);
      rod(new THREE.Vector3(Math.sign(g.pos[0]) * f.legRoot[0], f.legRoot[1], f.legRoot[2]), axle, 0.14, 0.035);
      wheel(axle, f.wheelRadius, 0.11);
      const spat = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), spatMat);
      spat.scale.set(0.11, 0.17, 0.4); spat.position.set(axle.x, axle.y + 0.05, axle.z - 0.06); out.add(spat);
    } else {
      const r = 0.075, axle = new THREE.Vector3(g.pos[0], g.pos[1] + r, g.pos[2]);
      rod(new THREE.Vector3(0, axle.y + 0.12, axle.z + 0.28), axle, 0.05, 0.03);
      wheel(axle, r, 0.05);
    }
  }
  out.traverse((o) => { o.castShadow = true; });
  return out;
}

/** The aircraft's model, scaled to real size and seated on its gear, with spinning props and rotors. */
export class AircraftVisual {
  readonly root = new THREE.Group();
  private model = new THREE.Group();
  private props: { obj: THREE.Object3D; axis: THREE.Vector3; spin: number }[] = [];
  private discs: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  private flame: THREE.Mesh | null = null;
  private propeller: Propeller | null = null;
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
      if (spec.prop) stripParts(this.model, spec.prop.strip);
      if (spec.model === 'helicopter') {
        const blades: THREE.Object3D[] = [];
        m.traverse((o) => { if (o.name === 'Box04_Box014' || o.name === 'Box20183' || o.name === 'Cylinder005') blades.push(o); });
        this.pivotGroup(blades, new THREE.Vector3(0, 1, 0));
      }
    }
    this.root.add(this.model);
    const box = new THREE.Box3().setFromObject(this.model);
    this.size = box.isEmpty() ? 8 : box.getSize(new THREE.Vector3()).length() / 2;
    if (spec.prop && spec.engine) { this.propeller = new Propeller(spec.prop, spec.engine.propRadius); this.root.add(this.propeller.group); }
    if (spec.fittedGear) this.root.add(fittedGear(spec, spec.fittedGear));
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
    for (const pr of this.props) pr.obj.quaternion.setFromAxisAngle(pr.axis, this.spin);
    this.propeller?.update(a.rpm, dt);
    const fast = Math.min(1, a.rpm / ((a.spec.engine?.rpm ?? a.spec.rotor?.rpm ?? 1) * 0.5));
    for (const d of this.discs) { d.mesh.visible = fast > 0.15; d.mat.opacity = (a.spec.rotor ? 0.14 : 0.3) * fast; }
    if (this.flame) { this.flame.visible = a.burner; this.flame.scale.setScalar(0.85 + Math.random() * 0.3); }
  }

  dispose(scene: THREE.Scene): void { scene.remove(this.root); }
}
