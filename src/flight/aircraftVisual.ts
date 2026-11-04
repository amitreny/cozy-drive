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
 * the frame `root` is drawn in. Used to cut a model's static propeller out so a working one can go in its place,
 * or to lift its rotor out so it can spin: the parts cut out come back as meshes of their own, beside the ones
 * they came from (same material, same place).
 */
function stripParts(root: THREE.Object3D, boxes: [number, number, number][][]): THREE.Mesh[] {
  root.updateMatrixWorld(true);
  const inside = (b: number[]) => boxes.some(([lo, hi]) => b[0] >= lo[0] && b[1] >= lo[1] && b[2] >= lo[2] && b[3] <= hi[0] && b[4] <= hi[1] && b[5] <= hi[2]);
  const meshes: THREE.Mesh[] = [], cutOut: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  for (const mesh of meshes) {
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
    if (!cut.size) continue;
    const keep: number[] = [], gone: number[] = [];
    for (let t = 0; t < tris; t++) (cut.has(find(rep[vert(t, 0)])) ? gone : keep).push(vert(t, 0), vert(t, 1), vert(t, 2));
    // New geometry for both halves: the source model's is shared by every clone of it.
    const piece = (index: number[]) => { const g = geo.clone(); g.setIndex(index); g.clearGroups(); return g; };
    const part = new THREE.Mesh(piece(gone), mesh.material);
    part.position.copy(mesh.position); part.quaternion.copy(mesh.quaternion); part.scale.copy(mesh.scale);
    part.castShadow = mesh.castShadow;
    mesh.parent?.add(part); cutOut.push(part);
    if (!keep.length) { mesh.visible = false; continue; }
    mesh.geometry = piece(keep);
  }
  return cutOut;
}

/** A fitted gear leg: its pivot (at the leg's root), and the angle it folds through about `axis` to retract. */
interface GearLeg { pivot: THREE.Group; axis: 'x' | 'z'; fold: number }

/**
 * Landing gear for a model drawn without any: sprung main legs to the braked wheels (spatted if the spec says so),
 * and a nosewheel leg or a small tailwheel. Each leg hangs from a pivot at its root, so retractable gear can fold
 * away: the mains inwards under the fuselage, the nose leg forwards.
 */
function fittedGear(spec: AircraftSpec, f: FittedGear): { group: THREE.Group; legs: GearLeg[] } {
  const out = new THREE.Group(), legs: GearLeg[] = [], legMat = new THREE.MeshStandardMaterial({ color: f.legColor, roughness: 0.5, metalness: 0.4 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.9 });
  const leg = (root: THREE.Vector3, axis: 'x' | 'z', fold: number) => {
    const pivot = new THREE.Group(); pivot.position.copy(root); out.add(pivot); legs.push({ pivot, axis, fold }); return pivot;
  };
  // Parts are placed in the body frame, then hung in their leg's pivot.
  const rod = (to: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, w: number, t: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, a.distanceTo(b), t), legMat);
    m.position.addVectors(a, b).multiplyScalar(0.5).sub(to.position);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    to.add(m);
  };
  const wheel = (to: THREE.Group, at: THREE.Vector3, r: number, w: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2), tyre);
    m.position.copy(at).sub(to.position); to.add(m);
  };
  const spats = f.spatColor !== undefined;
  for (const g of spec.gear) {
    if (g.brake) {
      const axle = new THREE.Vector3(g.pos[0], g.pos[1] + f.wheelRadius, g.pos[2]), side = Math.sign(g.pos[0]);
      const root = new THREE.Vector3(side * f.legRoot[0], f.legRoot[1], f.legRoot[2]), p = leg(root, 'z', -side * Math.PI / 2);
      rod(p, root, axle, 0.14, spats ? 0.035 : 0.14);
      wheel(p, axle, f.wheelRadius, spats ? 0.11 : f.wheelRadius * 0.6);
      if (spats) {
        const spat = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ color: f.spatColor, roughness: 0.45 }));
        spat.scale.set(0.11, 0.17, 0.4); spat.position.set(axle.x, axle.y + 0.05, axle.z - 0.06).sub(p.position); p.add(spat);
      }
    } else if (g.pos[2] > 0) {
      const r = f.noseWheelRadius ?? f.wheelRadius * 0.8, axle = new THREE.Vector3(g.pos[0], g.pos[1] + r, g.pos[2]);
      const root = new THREE.Vector3(0, f.legRoot[1], g.pos[2] - 0.15), p = leg(root, 'x', -Math.PI / 2);
      rod(p, root, axle, 0.12, 0.12);
      wheel(p, axle, r, r * 0.6);
    } else {
      const r = 0.075, axle = new THREE.Vector3(g.pos[0], g.pos[1] + r, g.pos[2]), p = leg(new THREE.Vector3(0, axle.y + 0.12, axle.z + 0.28), 'x', 0);
      rod(p, p.position.clone(), axle, 0.05, 0.03);
      wheel(p, axle, r, 0.05);
    }
  }
  out.traverse((o) => { o.castShadow = true; });
  return { group: out, legs };
}

/** A strip fading in along its length: transparent at the top (v = 1 in a cone: its tip), bright at the bottom. */
function fadeMap(stops: [number, number][]): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 8; c.height = 64;
  const g = c.getContext('2d')!, grad = g.createLinearGradient(0, 0, 0, 64);
  for (const [at, a] of stops) grad.addColorStop(at, `rgba(255,255,255,${a})`);
  g.fillStyle = grad; g.fillRect(0, 0, 8, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * A jet's afterburner flames, one per nozzle: an orange plume around a hot blue-white core, growing with the burn;
 * and the vapour cone that can flash round the airframe as it goes through the sound barrier in damp air.
 */
class JetEffects {
  private plumes: { outer: THREE.Mesh; core: THREE.Mesh }[] = [];
  private outerMat: THREE.MeshBasicMaterial; private coreMat: THREE.MeshBasicMaterial;
  private cone: THREE.Mesh; private coneMat: THREE.MeshBasicMaterial;

  constructor(root: THREE.Group, jet: { nozzles: [number, number, number][]; nozzleRadius: number }, size: number) {
    const blend = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: fadeMap([[0, 0], [0.5, 0.7], [1, 1]]), fog: false };
    this.outerMat = new THREE.MeshBasicMaterial({ color: 0xff8a3c, ...blend });
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xbfd8ff, ...blend });
    // Cones pointing back along -z, their base at the nozzle; scaled in z by the flame's length.
    const geo = (r: number) => new THREE.ConeGeometry(r, 1, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
    for (const n of jet.nozzles) {
      const outer = new THREE.Mesh(geo(jet.nozzleRadius), this.outerMat), core = new THREE.Mesh(geo(jet.nozzleRadius * 0.6), this.coreMat);
      for (const m of [outer, core]) { m.position.set(...n); m.visible = false; m.renderOrder = 2; root.add(m); }
      this.plumes.push({ outer, core });
    }
    // The vapour cone: a white shroud opening back from just behind the cockpit, fading out at both ends.
    this.coneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: fadeMap([[0, 0], [0.75, 0.9], [1, 0]]), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const len = size * 0.7;
    this.cone = new THREE.Mesh(new THREE.ConeGeometry(size * 0.55, len, 28, 1, true).rotateX(-Math.PI / 2).translate(0, 0, size * 0.25 - len / 2), this.coneMat);
    this.cone.visible = false; this.cone.renderOrder = 3; root.add(this.cone);
  }

  update(a: Aircraft): void {
    const burn = a.reheat;
    for (const { outer, core } of this.plumes) {
      const on = burn > 0.03, flick = 0.9 + Math.random() * 0.2;
      outer.visible = core.visible = on;
      if (!on) continue;
      outer.scale.set(flick, flick, (1.6 + 3.4 * burn) * flick); core.scale.set(1, 1, (0.9 + 1.6 * burn) * flick);
    }
    this.outerMat.opacity = 0.35 + 0.4 * burn; this.coreMat.opacity = 0.55 + 0.4 * burn;
    // Strongest right at Mach 1, in the moist air low down; it flickers as the shock wobbles.
    const vapour = Math.max(0, 1 - Math.abs(a.mach - 0.99) / 0.05) * Math.max(0, 1 - a.altitude / 6000);
    this.cone.visible = vapour > 0.02;
    this.coneMat.opacity = vapour * (0.4 + Math.random() * 0.15);
  }
}

/** The aircraft's model, scaled to real size and seated on its gear, with spinning props and rotors. */
export class AircraftVisual {
  readonly root = new THREE.Group();
  private model = new THREE.Group();
  private props: { obj: THREE.Object3D; axis: THREE.Vector3; spin: number }[] = [];
  private discs: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  private flame: THREE.Mesh | null = null;
  private gearLegs: GearLeg[] = [];
  /** Airbrake or spoiler panels: pivots at their hinges, and how far each opens. */
  private brakePanels: { pivot: THREE.Group; angle: number }[] = [];
  private jet: JetEffects | null = null;
  private propellers: Propeller[] = [];
  /** Flaps split out of the model: each turns down about its hinge (along the wing, at its leading edge). */
  private flaps: THREE.Object3D[] = [];
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
      const strip = [...(spec.prop?.strip ?? []), ...(spec.strip ?? [])];
      if (strip.length) for (const old of stripParts(this.model, strip)) old.removeFromParent();
      // A rotor modelled into the airframe: lift it out and spin it about its hub.
      if (spec.rotorParts) this.pivotGroup(stripParts(this.model, spec.rotorParts), new THREE.Vector3(0, 1, 0));
      // A model with its flaps as separate parts (FlapL, FlapR): hinge them at their leading edges.
      const flapParts: THREE.Object3D[] = []; m.traverse((o) => { if (/^Flap[LR]$/.test(o.name)) flapParts.push(o); });
      for (const f of flapParts) {
        this.model.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(f), pivot = new THREE.Group();
        this.model.add(pivot); pivot.position.copy(this.model.worldToLocal(new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, b.max.z)));
        pivot.updateMatrixWorld(true); pivot.attach(f); this.flaps.push(pivot);
      }
      if (spec.model === 'helicopter') {
        const blades: THREE.Object3D[] = [];
        m.traverse((o) => { if (o.name === 'Box04_Box014' || o.name === 'Box20183' || o.name === 'Cylinder005') blades.push(o); });
        this.pivotGroup(blades, new THREE.Vector3(0, 1, 0));
      }
    }
    this.root.add(this.model);
    if (spec.airbrake) this.addBrakePanels(spec.airbrake);
    const box = new THREE.Box3().setFromObject(this.model);
    this.size = box.isEmpty() ? 8 : box.getSize(new THREE.Vector3()).length() / 2;
    if (spec.prop && spec.engine) {
      for (const side of spec.prop.mirror ? [1, -1] : [1]) {
        const p = new Propeller({ ...spec.prop, hub: [side * spec.prop.hub[0], spec.prop.hub[1], spec.prop.hub[2]] }, spec.engine.propRadius);
        this.propellers.push(p); this.root.add(p.group);
      }
    }
    if (spec.fittedGear) { const g = fittedGear(spec, spec.fittedGear); this.root.add(g.group); this.gearLegs = g.legs; }
    if (spec.engine?.jet) this.jet = new JetEffects(this.root, spec.engine.jet, this.size);
    if (spec.rotor) {
      this.addDisc(spec.rotor.hub, spec.rotor.radius, new THREE.Vector3(0, 1, 0), 0.12);
      const tail = spec.rotor.tail ?? { pos: [0.25, 0.95, -spec.rotor.tailArm] as [number, number, number], radius: 0.85 };
      this.addDisc(tail.pos, tail.radius, new THREE.Vector3(1, 0, 0), 0.3);
    }
    if (spec.balloon) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.6, 10), new THREE.MeshBasicMaterial({ color: 0xffa340, transparent: true, opacity: 0.85 }));
      f.position.set(0, 2.6, 0); f.visible = false; this.root.add(f); this.flame = f;
    }
    this.eye.set(...spec.eye);
    scene.add(this.root);
  }

  /**
   * Airbrake or spoiler panels lying flush on the airframe, hinged at their front edge. They belong to the model, so
   * the cockpit view hides them with it.
   */
  private addBrakePanels(ab: NonNullable<AircraftSpec['airbrake']>): void {
    const mat = new THREE.MeshStandardMaterial({ color: ab.color, roughness: 0.6, metalness: 0.2 });
    for (const p of ab.panels) for (const side of ab.mirror ? [1, -1] : [1]) {
      const pivot = new THREE.Group(), [w, len] = p.size;
      pivot.position.set(side * p.pos[0], p.pos[1], p.pos[2]);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, len).translate(0, 0.02, -len / 2), mat);
      panel.castShadow = true; pivot.add(panel);
      this.model.add(pivot); this.brakePanels.push({ pivot, angle: p.angle });
    }
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
    for (const p of this.propellers) p.update(a.rpm, dt);
    for (const f of this.flaps) f.rotation.x = -a.flaps * (a.spec.engine?.maxFlaps ?? 0); // trailing edge down
    const fast = Math.min(1, a.rpm / ((a.spec.engine?.rpm ?? a.spec.rotor?.rpm ?? 1) * 0.5));
    for (const d of this.discs) { d.mesh.visible = fast > 0.15; d.mat.opacity = (a.spec.rotor ? 0.14 : 0.3) * fast; }
    if (this.flame) { this.flame.visible = a.burner; this.flame.scale.setScalar(0.85 + Math.random() * 0.3); }
    for (const l of this.gearLegs) { l.pivot.rotation[l.axis] = l.fold * (1 - a.gearPos); l.pivot.visible = a.gearPos > 0.03; }
    this.jet?.update(a);
    for (const b of this.brakePanels) b.pivot.rotation.x = b.angle * a.airbrakePos; // trailing edge up
  }

  /**
   * Cockpit view: the models have no interiors, so from the pilot's seat you'd see the insides of the fuselage and
   * wings. Hide the airframe there; the propellers and rotor discs stay, turning in front of you.
   */
  setCockpit(on: boolean): void { this.model.visible = !on; }

  dispose(scene: THREE.Scene): void { scene.remove(this.root); }
}
