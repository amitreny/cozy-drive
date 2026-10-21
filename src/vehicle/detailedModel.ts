import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Build } from '../customization/build';
import type { CarModel } from './carModel';
import { paintMaterial } from './paint';
import { CAR_TYPES, restGroundY, type VehicleSpec } from './spec';

/**
 * Detailed low-poly car models (Poly Pizza, CC BY 3.0, see CREDITS.md), one per car type. The physics in spec.ts
 * is fitted to each model's real proportions; this adapter finds the wheels (by name or by shape), hands them to
 * the physics wheels so they spin and steer, and repaints the body in the player's colour.
 */
export type LightKind = 'head' | 'fog' | 'amber' | 'tail' | 'brake' | 'reverse';
/**
 * Which body triangles are a lamp. A triangle matches when it is at the right end of the car, has the material
 * (by name) or the exact texture colour listed, and sits inside the optional bands. `y` is height across the body
 * (0 bottom, 1 top); `side` is distance from the centre line (0 middle, 1 the body's side).
 */
export interface LightRule { kind: LightKind; end?: 'front' | 'rear'; mat?: RegExp; colors?: string[]; red?: boolean; y?: [number, number]; side?: [number, number] }
/** Pop-up headlights: where the lids are (side as above; width as a share of the body width; u along the body, 0 rear, 1 nose). */
export interface PopUps { side: number; width: number; u: [number, number] }
export interface DetailedDef { file: string; credit: string; yaw: number; hide?: RegExp; lights: LightRule[]; popups?: PopUps; headLens?: number }
export const DETAILED: Record<string, DetailedDef> = {
  // The AE86 Trueno has pop-up headlights; its fixed lamps are amber corner and bumper lamps. The tail-light strip
  // is red, with amber indicators and white reversing lamps.
  pip: { file: 'hatchback', credit: '"Toyota AE86" by IvOfficial', yaw: 0, popups: { side: 0.58, width: 0.15, u: [0.934, 0.982] }, lights: [
    { kind: 'amber', end: 'front', colors: ['#c44b26', '#df5e2f', '#ab6c4b', '#bc7752', '#7f5038', '#623a26'], y: [0.35, 0.53] },
    { kind: 'tail', end: 'rear', colors: ['#b64221', '#992d17', '#99200b', '#5c3724', '#7d4b31'], y: [0.48, 0.62] },
    { kind: 'amber', end: 'rear', colors: ['#d26900'], y: [0.48, 0.62] },
    { kind: 'reverse', end: 'rear', colors: ['#a7a7a7'], y: [0.48, 0.62] },
  ] },
  // Quad rectangular headlights; wide tail lamps, red over a lower band with amber outside and reversing lamps inside.
  maple: { file: 'sedan', credit: '"Car" by iloem', yaw: Math.PI, lights: [
    { kind: 'head', end: 'front', mat: /^Material\.00[57]$/ },
    { kind: 'tail', end: 'rear', mat: /^Material\.006$/ },
    { kind: 'amber', end: 'rear', mat: /^Material\.005$/, side: [0.55, 1] },
    { kind: 'reverse', end: 'rear', mat: /^Material\.005$/, side: [0, 0.55] },
  ] },
  // Round headlights behind the grille guard, white side lamps and amber indicators beside them, lamps in the bumper.
  badger: { file: 'offroader', credit: '"Range Rover" by IvOfficial', yaw: 0, lights: [
    { kind: 'head', end: 'front', colors: ['#9d9d9d', '#a6a6a6', '#afafaf'], y: [0.3, 0.5], side: [0.44, 0.82] },
    { kind: 'fog', end: 'front', colors: ['#dbdbdb'], y: [0.34, 0.5], side: [0.8, 1] },
    { kind: 'amber', end: 'front', colors: ['#d76f00', '#dc7700', '#bf4b00'] },
    { kind: 'fog', end: 'front', colors: ['#c8c8c8', '#e1e1e1', '#bbbbbb'], y: [0.2, 0.32] },
    { kind: 'tail', end: 'rear', colors: ['#a03219', '#b64221', '#bd4723', '#c44b26', '#cb5028', '#df5e2f'] },
    { kind: 'amber', end: 'rear', colors: ['#e98b00'] },
    { kind: 'reverse', end: 'rear', colors: ['#c8c8c8'], y: [0.38, 0.47] },
  ] },
  biscuit: { file: 'van', credit: '"Generic Van" by PuKkBuMXDD', yaw: Math.PI / 2, lights: [
    { kind: 'head', end: 'front', mat: /^front_lights$/ },
    { kind: 'amber', end: 'front', mat: /^front_lights_down$/ },
    { kind: 'tail', end: 'rear', mat: /^back_lights$/ },
  ] },
  bramble: { file: 'pickup', credit: '"Mitsubishi L200" by Muhammad Reyhan', yaw: 0, lights: [
    { kind: 'head', end: 'front', mat: /Gainsboro/ },
    { kind: 'fog', end: 'front', mat: /^Color_M00$/ },
    { kind: 'tail', end: 'rear', mat: /^Color_A05$/ },
    { kind: 'reverse', end: 'rear', mat: /^M_0010_Snow$/ },
  ] },
  // The FC RX-7 is modelled with its pop-up headlights raised; the clear lamps below them are fog lamps. A
  // high-level brake light sits on the hatch.
  comet: { file: 'coupe', credit: '"Mazda RX-7" by IvOfficial', yaw: 0, lights: [
    { kind: 'head', end: 'front', mat: /^Emission/ },
    { kind: 'fog', end: 'front', colors: ['#a7a7a7'], y: [0.3, 0.42] },
    { kind: 'amber', colors: ['#c87643'] },
    { kind: 'tail', end: 'rear', colors: ['#77160b', '#841f10'], y: [0.45, 0.6] },
    { kind: 'brake', end: 'rear', red: true, y: [0.6, 1] },
    { kind: 'reverse', end: 'rear', colors: ['#898989'], y: [0.38, 0.5] },
  ] },
  // Four yellow spot lamps (two on the bumper, two on the roll bar); no tail lights.
  skipper: { file: 'buggy', credit: '"Buggy" by Nick Slough', yaw: Math.PI / 2, headLens: 0xffe46a, lights: [{ kind: 'head', mat: /^mat12$/ }] },
};
const BASE = `${import.meta.env.BASE_URL}models/cars/`;
const WHEEL_NAME = /wheel|tire|tyre|rim/i, NOT_WHEEL = /spare|bag|mirror|steer/i;

export interface CarAnalysis {
  /** The model, rotated to face +z, in its own units. */
  scene: THREE.Group;
  /** Wheels in physics order: front-left (+x), front-right, rear-left, rear-right. `axis` is the true axle (with the
   * model's own toe and camber), so the wheel can be turned to spin about +x without wobbling. */
  wheels: { parts: THREE.Mesh[]; center: THREE.Vector3; axis: THREE.Vector3; radius: number; width: number; spinGeos: THREE.BufferGeometry[] }[];
  /** Body bounds without the wheels, and the height of the tyres' bottom (the ground). */
  body: THREE.Box3; ground: number;
}

const templates = new Map<string, CarAnalysis>();

/** Find the four wheels: named parts first, otherwise round parts low in each corner. */
export function analyzeCar(src: THREE.Group, def: DetailedDef): CarAnalysis | null {
  const scene = new THREE.Group(), inner = src.clone(true);
  inner.rotation.y = def.yaw; scene.add(inner); scene.updateMatrixWorld(true);
  const all = new THREE.Box3().setFromObject(scene), size = all.getSize(new THREE.Vector3());
  const meshes: THREE.Mesh[] = [];
  scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const named = (m: THREE.Mesh) => { let o: THREE.Object3D | null = m; for (let k = 0; o && k < 3; k++, o = o.parent) if (WHEEL_NAME.test(o.name) && !NOT_WHEEL.test(o.name)) return true; return false; };
  const boxOf = (m: THREE.Mesh) => new THREE.Box3().setFromObject(m);
  const roundLow = (b: THREE.Box3) => {
    const s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const ratio = s.y / Math.max(1e-6, s.z);
    return ratio > 0.75 && ratio < 1.33 && s.x < Math.max(s.y, s.z) * 0.95 && s.y > size.y * 0.12 && s.y < size.y * 0.7
      && c.y < all.min.y + size.y * 0.45 && Math.abs(c.x - (all.min.x + all.max.x) / 2) > size.x * 0.15 && Math.abs(c.z - (all.min.z + all.max.z) / 2) > size.z * 0.08;
  };
  let cands = meshes.filter((m) => named(m) && !NOT_WHEEL.test(m.name));
  const cornersOf = (list: THREE.Mesh[]) => {
    const cx = (all.min.x + all.max.x) / 2, cz = (all.min.z + all.max.z) / 2, groups: THREE.Mesh[][] = [[], [], [], []];
    for (const m of list) { const c = boxOf(m).getCenter(new THREE.Vector3()); if (Math.abs(c.z - cz) < size.z * 0.1) continue; groups[(c.z > cz ? 0 : 2) + (c.x > cx ? 0 : 1)].push(m); }
    return groups;
  };
  let groups = cornersOf(cands);
  if (groups.some((g) => !g.length)) {
    // No named wheels: in each corner, the biggest round part low down is the tyre (rims and hubs get added below).
    cands = meshes.filter((m) => !NOT_WHEEL.test(m.name) && roundLow(boxOf(m)));
    groups = cornersOf(cands).map((g) => g.length ? [g.reduce((a, b) => (boxOf(a).getSize(new THREE.Vector3()).y >= boxOf(b).getSize(new THREE.Vector3()).y ? a : b))] : []);
  }
  if (groups.some((g) => !g.length)) return null;
  // A wheel can be several parts (tyre, rim, hub, a wider tread): add every part centred on the found wheel's
  // hub and no bigger than it. Off-centre parts (brake callipers, arches) stay with the body.
  const wheelSet = new Set(groups.flat());
  const wheels = groups.map((g) => {
    const b = new THREE.Box3(); for (const m of g) b.expandByObject(m);
    const c = b.getCenter(new THREE.Vector3()), r = Math.max(b.max.y - b.min.y, b.max.z - b.min.z) / 2;
    for (const m of meshes) {
      if (wheelSet.has(m) || NOT_WHEEL.test(m.name)) continue;
      const mb = boxOf(m), mc = mb.getCenter(new THREE.Vector3()), ms = mb.getSize(new THREE.Vector3());
      if (Math.hypot(mc.y - c.y, mc.z - c.z) < r * 0.08 && Math.abs(mc.x - c.x) < r * 0.7 && Math.max(ms.y, ms.z) < r * 2.15 && ms.x < r * 1.2) { g.push(m); wheelSet.add(m); b.expandByObject(m); }
    }
    return { parts: g, ...wheelAxle(g, b.getCenter(new THREE.Vector3())), width: b.max.x - b.min.x };
  });
  const body = new THREE.Box3(); for (const m of meshes) if (!wheelSet.has(m) && !(def.hide && def.hide.test(m.name))) body.expandByObject(m);
  const ground = Math.min(...wheels.map((w) => w.center.y - w.radius));
  return { scene, wheels, body, ground };
}

/**
 * Axle and hub of a set of wheel parts in the frame `frameOf` gives. The tread's faces all point straight out from
 * the axle, so the axle is the one direction they never point along (the least-spread direction of the tread
 * normals); the hub is a circle fitted to the tread in the wheel's plane.
 */
function fitAxle(parts: THREE.Mesh[], frameOf: (m: THREE.Mesh) => THREE.Matrix4, guess: THREE.Vector3, start: THREE.Vector3): { center: THREE.Vector3; axis: THREE.Vector3; radius: number } {
  const tris: { c: THREE.Vector3; n: THREE.Vector3; area: number; v: THREE.Vector3[] }[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const m of parts) {
    const M = frameOf(m), geo = m.geometry, pos = geo.getAttribute('position'), idx = geo.index;
    const count = idx ? idx.count : pos.count, at = (k: number) => (idx ? idx.getX(k) : k);
    for (let k = 0; k + 2 < count; k += 3) {
      a.fromBufferAttribute(pos, at(k)).applyMatrix4(M); b.fromBufferAttribute(pos, at(k + 1)).applyMatrix4(M); c.fromBufferAttribute(pos, at(k + 2)).applyMatrix4(M);
      const n = c.clone().sub(b).cross(a.clone().sub(b)), area = n.length() / 2;
      if (area > 1e-12) tris.push({ c: a.clone().add(b).add(c).divideScalar(3), n: n.normalize(), area, v: [a.clone(), b.clone(), c.clone()] });
    }
  }
  let axis = start.clone().normalize(), center = guess.clone(), radius = 0;
  const plane = (ax: THREE.Vector3) => { const ref = Math.abs(ax.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0); const e1 = ref.addScaledVector(ax, -ref.dot(ax)).normalize(); return [e1, ax.clone().cross(e1)]; };
  const radial = (p: THREE.Vector3, ax: THREE.Vector3, ctr: THREE.Vector3) => { const d = p.clone().sub(ctr); return d.addScaledVector(ax, -d.dot(ax)).length(); };
  for (let iter = 0; iter < 16; iter++) {
    const before = axis.clone();
    const rMax = Math.max(...tris.map((t) => radial(t.c, axis, center)));
    const tread = tris.filter((t) => radial(t.c, axis, center) > rMax * 0.8 && Math.abs(t.n.dot(axis)) < 0.5);
    if (tread.length < 8) break;
    // Least-spread direction of the tread normals: the top eigenvector of (trace·I − Σ area·n·nᵀ).
    const M = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const t of tread) { const n = [t.n.x, t.n.y, t.n.z]; for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) M[r * 3 + k] += t.area * n[r] * n[k]; }
    const tr = M[0] + M[4] + M[8];
    const B = new THREE.Matrix3().set(tr - M[0], -M[1], -M[2], -M[3], tr - M[4], -M[5], -M[6], -M[7], tr - M[8]);
    const next = axis.clone(); for (let k = 0; k < 60; k++) next.applyMatrix3(B).normalize();
    if (next.dot(start) < 0) next.negate();
    if (next.dot(start) > 0.9 * start.length()) axis = next;
    // Least-squares circle through the tread's vertices, in the wheel's plane.
    const [e1, e2] = plane(axis), m = [0, 0, 0, 0, 0, 0, 0, 0, 0], rhs = new THREE.Vector3(), flat: number[][] = [];
    for (const t of tread) for (const p of t.v) { const d = p.clone().sub(center); flat.push([d.dot(e1), d.dot(e2)]); }
    for (const [u, v] of flat) {
      const row = [u, v, 1], q = -(u * u + v * v);
      for (let r = 0; r < 3; r++) { for (let k = 0; k < 3; k++) m[r * 3 + k] += row[r] * row[k]; rhs.setComponent(r, rhs.getComponent(r) + row[r] * q); }
    }
    const A = new THREE.Matrix3().set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]);
    if (Math.abs(A.determinant()) < 1e-24) break;
    const sol = rhs.applyMatrix3(A.invert()), u0 = -sol.x / 2, v0 = -sol.y / 2;
    if (Math.hypot(u0, v0) > rMax * 0.2) break;
    center.addScaledVector(e1, u0).addScaledVector(e2, v0);
    radius = Math.sqrt(Math.max(0, u0 * u0 + v0 * v0 - sol.z));
    if (axis.angleTo(before) < 1e-5 && Math.hypot(u0, v0) < rMax * 1e-5) break;
  }
  const verts = tris.flatMap((t) => t.v);
  // The outermost tread point sets the size.
  radius = Math.max(radius, ...verts.map((p) => radial(p, axis, center)));
  return { center, axis, radius };
}

/**
 * Axle and hub of a round part, found by removing what would show as wobble. Spun about a slightly wrong axle the
 * tread sways sideways once per turn (by its radius times the error); about an off-centre hub it hops once per
 * turn. With the tread's vertices chosen once (the outer tenth of the radius), both are linear least-squares fits
 * on [1, cos, sin] of the turn: correct the axle and hub by them until they vanish.
 */
function spinFit(pts: THREE.Vector3[], start: THREE.Vector3, startAxis: THREE.Vector3): { center: THREE.Vector3; axis: THREE.Vector3; radius: number } {
  const center = start.clone(); let axis = startAxis.clone().normalize();
  const radial = (p: THREE.Vector3) => { const d = p.clone().sub(center); return d.addScaledVector(axis, -d.dot(axis)).length(); };
  const rMax = Math.max(...pts.map(radial)), tread = pts.filter((p) => radial(p) > rMax * 0.9);
  const solve = (m: number[], rhs: THREE.Vector3) => { const A = new THREE.Matrix3().set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]); return Math.abs(A.determinant()) < 1e-30 ? null : rhs.applyMatrix3(A.invert()); };
  for (let iter = 0; iter < 40 && tread.length >= 6; iter++) {
    const ref = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const e1 = ref.addScaledVector(axis, -ref.dot(axis)).normalize(), e2 = axis.clone().cross(e1);
    const ms = [0, 0, 0, 0, 0, 0, 0, 0, 0], mh = [0, 0, 0, 0, 0, 0, 0, 0, 0], rs = new THREE.Vector3(), rh = new THREE.Vector3();
    for (const p of tread) {
      const d = p.clone().sub(center), u = d.dot(e1), v = d.dot(e2), r = Math.hypot(u, v), x = d.dot(axis);
      const a = [1, u, v], b = [1, u / r, v / r];
      for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) { ms[i * 3 + j] += a[i] * a[j]; mh[i * 3 + j] += b[i] * b[j]; } rs.setComponent(i, rs.getComponent(i) + a[i] * x); rh.setComponent(i, rh.getComponent(i) + b[i] * r); }
    }
    const tilt = solve(ms, rs), off = solve(mh, rh);
    if (!tilt || !off) break;
    axis = axis.clone().addScaledVector(e1, -tilt.y).addScaledVector(e2, -tilt.z).normalize();
    center.addScaledVector(e1, off.y).addScaledVector(e2, off.z);
    if (Math.hypot(tilt.y, tilt.z) < 1e-9 && Math.hypot(off.y, off.z) < rMax * 1e-9) break;
  }
  (globalThis as { __spinFitLog?: unknown[] }).__spinFitLog?.push({ n: tread.length });
  return { center, axis, radius: rMax };
}

/**
 * A wheel's real axle and hub, and its parts shaped to spin about +x without wobbling. A wheel modelled with a
 * little toe or camber, on a rotated or even skewed node, or with a tread set slightly crooked on its carcass,
 * would wobble about any single axle. So each round part (tyre, tread, rim, hub) is placed without skew (rotation,
 * uniform scale, position and any mirror: a skewed node would turn its circles into tilted ellipses), its own
 * axle and hub fitted (spinFit), and set squarely on the wheel's axle, keeping its place along it and its own turn.
 * The wheel's axle comes from the simplest part at full size (a plain carcass reads truer than a knobbly tread).
 * Small parts (caps, bolts) follow as modelled.
 */
function wheelAxle(parts: THREE.Mesh[], guess: THREE.Vector3): { center: THREE.Vector3; axis: THREE.Vector3; radius: number; spinGeos: THREE.BufferGeometry[] } {
  for (const m of parts) m.updateWorldMatrix(true, false);
  const placed = parts.map((m) => {
    // The node's placement without skew: its position, the nearest true rotation (polar decomposition), uniform
    // scale, and its mirror if it has one.
    const e = m.matrixWorld.elements, det = m.matrixWorld.determinant(), s = Math.cbrt(Math.abs(det)), sign = det < 0 ? -1 : 1;
    let R = new THREE.Matrix3().set(e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]).multiplyScalar(sign / s);
    for (let k = 0; k < 30; k++) { const inv = R.clone().invert().transpose(), a = R.elements, b = inv.elements; R = new THREE.Matrix3().fromArray(a.map((v, i) => (v + b[i]) / 2)); }
    const r = R.elements, f = sign * s;
    const unskewed = new THREE.Matrix4().set(r[0] * f, r[3] * f, r[6] * f, e[12], r[1] * f, r[4] * f, r[7] * f, e[13], r[2] * f, r[5] * f, r[8] * f, e[14], 0, 0, 0, 1);
    const p = m.geometry.getAttribute('position'), pts: THREE.Vector3[] = [];
    for (let k = 0; k < p.count; k++) pts.push(new THREE.Vector3().fromBufferAttribute(p, k).applyMatrix4(unskewed));
    return { unskewed, pts };
  });
  const sizeOf = (pts: THREE.Vector3[]) => { const b = new THREE.Box3().setFromPoints(pts); return Math.max(b.max.y - b.min.y, b.max.z - b.min.z) / 2; };
  const sizes = placed.map((q) => sizeOf(q.pts)), big = Math.max(...sizes);
  const fits = placed.map((q, k) => (sizes[k] > big * 0.3 ? spinFit(q.pts, guess, new THREE.Vector3(1, 0, 0)) : null));
  const refs = parts.map((_, k) => k).filter((k) => fits[k] && sizes[k] >= big * 0.97);
  const verts = (k: number) => parts[k].geometry.getAttribute('position').count;
  const ref = fits[refs.reduce((a, b) => (verts(b) < verts(a) ? b : a))]!;
  const center = ref.center.clone(), axis = ref.axis.clone();
  if (axis.x < 0) axis.negate();
  // Model space → spin frame: hub at the origin, axle along +x.
  const toSpin = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(axis, new THREE.Vector3(1, 0, 0)))
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  const spinGeos = parts.map((m, k) => {
    const f = fits[k];
    let place = placed[k].unskewed;
    if (f) {
      // Square onto the wheel's axle (the smallest turn that lines its own axle up), keeping its place along it.
      const along = f.center.clone().sub(center).dot(axis), dir = f.axis.clone().multiplyScalar(Math.sign(f.axis.dot(axis)) || 1);
      const hub = center.clone().addScaledVector(axis, along);
      place = new THREE.Matrix4().makeTranslation(hub.x, hub.y, hub.z)
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(dir, axis)))
        .multiply(new THREE.Matrix4().makeTranslation(-f.center.x, -f.center.y, -f.center.z)).multiply(place);
    }
    const t = toSpin.clone().multiply(place), g = m.geometry.clone().applyMatrix4(t);
    if (t.determinant() < 0) flipWinding(g);
    return g;
  });
  let radius = 0;
  for (const g of spinGeos) { const pos = g.getAttribute('position'); for (let k = 0; k < pos.count; k++) radius = Math.max(radius, Math.hypot(pos.getY(k), pos.getZ(k))); }
  return { center, axis, radius, spinGeos };
}

/** A mirrored transform turns triangles inside out; swap their winding back. */
function flipWinding(g: THREE.BufferGeometry): void {
  const idx = g.index;
  if (idx) { for (let k = 0; k + 2 < idx.count; k += 3) { const t = idx.getX(k + 1); idx.setX(k + 1, idx.getX(k + 2)); idx.setX(k + 2, t); } idx.needsUpdate = true; return; }
  for (const name of Object.keys(g.attributes)) {
    const at = g.getAttribute(name) as THREE.BufferAttribute;
    for (let k = 0; k + 2 < at.count; k += 3) for (let c = 0; c < at.itemSize; c++) { const t = at.getComponent(k + 1, c); at.setComponent(k + 1, c, at.getComponent(k + 2, c)); at.setComponent(k + 2, c, t); }
    at.needsUpdate = true;
  }
}

export async function loadDetailedModels(): Promise<void> {
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(DETAILED).map(async ([id, def]) => {
    const g = (await loader.loadAsync(`${BASE}${def.file}.glb`)).scene;
    const a = analyzeCar(g, def);
    if (a) templates.set(id, a); else console.warn(`No wheels found in ${def.file}; using the built-in model`);
  }));
}
export const hasDetailed = (id: string): boolean => templates.has(id);
export const detailedTemplate = (id: string): CarAnalysis | undefined => templates.get(id);

// ------------------------------------------------------------------ paint and lights
/** Material slots on every body mesh. */
enum G { Keep, Paint, Glass, Head, Fog, Amber, Tail, Brake, Reverse }
const SLOT: Record<LightKind, G> = { head: G.Head, fog: G.Fog, amber: G.Amber, tail: G.Tail, brake: G.Brake, reverse: G.Reverse };
const hsl = (c: THREE.Color, space: THREE.ColorSpace = THREE.LinearSRGBColorSpace) => { const o = { h: 0, s: 0, l: 0 }; c.getHSL(o, space); return o; };

/** Read a texture's pixels once (to find which triangles are body paint). */
const pixelCache = new WeakMap<object, { data: Uint8ClampedArray; w: number; h: number }>();
function pixels(tex: THREE.Texture): { data: Uint8ClampedArray; w: number; h: number } | null {
  const img = tex.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img || !img.width) return null;
  const hit = pixelCache.get(img as object); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0);
  const out = { data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
  pixelCache.set(img as object, out); return out;
}

interface Tri { mesh: THREE.Mesh; geo: THREE.BufferGeometry; i: number; color: THREE.Color; area: number; glass: boolean; light: G | null }
type BodyClass = Map<THREE.Mesh, { geo: THREE.BufferGeometry; groups: number[]; shade: Float32Array }>;

/** Does a triangle (colour in sRGB 0–255, position normalised to the body) match a lamp rule? */
function matchLight(rules: LightRule[], mat: string, rgb: number[], col: THREE.Color, u: number, y: number, side: number): G | null {
  for (const r of rules) {
    if (r.end === 'front' && u < 0.75) continue;
    if (r.end === 'rear' && u > 0.25) continue;
    if (r.mat && !r.mat.test(mat)) continue;
    if (r.colors && !r.colors.some((hex) => { const v = parseInt(hex.slice(1), 16); return Math.abs((v >> 16) - rgb[0]) <= 10 && Math.abs(((v >> 8) & 255) - rgb[1]) <= 10 && Math.abs((v & 255) - rgb[2]) <= 10; })) continue;
    if (r.red) { const { h, s, l } = hsl(col, THREE.SRGBColorSpace); if (!((h < 0.05 || h > 0.94) && s > 0.5 && l > 0.15)) continue; }
    if (r.y && (y < r.y[0] || y > r.y[1])) continue;
    if (r.side && (side < r.side[0] || side > r.side[1])) continue;
    return SLOT[r.kind];
  }
  return null;
}

/** Sort every body triangle into a slot: the car's lamps (by its light rules), then glass, then paint (the
 * biggest colour family), and everything else keeps the model's own material. */
function classifyBody(meshes: THREE.Mesh[], tpl: CarAnalysis, def: DetailedDef): BodyClass {
  const tris: Tri[] = [], B = tpl.body;
  const cx = (B.min.x + B.max.x) / 2, halfW = (B.max.x - B.min.x) / 2, H = B.max.y - B.min.y, len = B.max.z - B.min.z;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const mesh of meshes) {
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const pos = geo.getAttribute('position'), uv = geo.getAttribute('uv'), vc = geo.getAttribute('color');
    const groupOf = (i: number) => { for (const gr of geo.groups) if (i * 3 >= gr.start && i * 3 < gr.start + gr.count) return gr.materialIndex ?? 0; return 0; };
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < pos.count / 3; i++) {
      const mat = mats[groupOf(i)] as THREE.MeshStandardMaterial;
      const col = mat.color ? mat.color.clone() : new THREE.Color(1, 1, 1);
      if (mat.map && uv) {
        const px = pixels(mat.map);
        if (px) {
          const u = (uv.getX(i * 3) + uv.getX(i * 3 + 1) + uv.getX(i * 3 + 2)) / 3, v = (uv.getY(i * 3) + uv.getY(i * 3 + 1) + uv.getY(i * 3 + 2)) / 3;
          const x = Math.min(px.w - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * px.w))), y = Math.min(px.h - 1, Math.max(0, Math.floor((((v % 1) + 1) % 1) * px.h)));
          const k = (y * px.w + x) * 4;
          col.multiply(new THREE.Color().setRGB(px.data[k] / 255, px.data[k + 1] / 255, px.data[k + 2] / 255, THREE.SRGBColorSpace));
        }
      }
      if (vc) col.multiply(new THREE.Color(vc.getX(i * 3), vc.getY(i * 3), vc.getZ(i * 3)));
      a.fromBufferAttribute(pos, i * 3).applyMatrix4(mesh.matrixWorld); b.fromBufferAttribute(pos, i * 3 + 1).applyMatrix4(mesh.matrixWorld); c.fromBufferAttribute(pos, i * 3 + 2).applyMatrix4(mesh.matrixWorld);
      const area = c.clone().sub(b).cross(a.clone().sub(b)).length() / 2;
      const glass = /glass|window|windshield/i.test(mat.name) || (mat.transparent && mat.opacity < 0.95);
      const srgb = col.clone().convertLinearToSRGB(), rgb = [srgb.r, srgb.g, srgb.b].map((v) => Math.round(v * 255));
      const light = matchLight(def.lights, mat.name, rgb, col, ((a.z + b.z + c.z) / 3 - B.min.z) / len, ((a.y + b.y + c.y) / 3 - B.min.y) / H, Math.abs((a.x + b.x + c.x) / 3 - cx) / halfW);
      tris.push({ mesh, geo, i, color: col, area, glass, light });
    }
  }
  // Colour families: group by hue (or by lightness for greys), weighted by area; the paint is the biggest family
  // that isn't glass, a lamp, near-black (tyres, trim) or the interior.
  const fam: { key: string; area: number; l: number }[] = [];
  const keyOf = (t: Tri) => { const { h, s, l } = hsl(t.color); return s < 0.18 ? `g${Math.round(l * 6)}` : `h${Math.round(h * 24) % 24}`; };
  for (const t of tris) {
    if (t.glass || t.light !== null) continue;
    const { l } = hsl(t.color); if (l < 0.09) continue;
    const k = keyOf(t); let f = fam.find((x) => x.key === k);
    if (!f) { f = { key: k, area: 0, l: 0 }; fam.push(f); }
    f.l = (f.l * f.area + l * t.area) / (f.area + t.area || 1); f.area += t.area;
  }
  fam.sort((x, y) => y.area - x.area);
  const paint = fam[0];
  const out: BodyClass = new Map();
  for (const t of tris) {
    let e = out.get(t.mesh);
    if (!e) { e = { geo: t.geo, groups: [], shade: new Float32Array(t.geo.getAttribute('position').count * 3).fill(1) }; out.set(t.mesh, e); }
    const { l } = hsl(t.color);
    let g = G.Keep;
    if (t.light !== null) g = t.light;
    else if (t.glass) g = G.Glass;
    else if (paint && keyOf(t) === paint.key && l >= 0.09) {
      g = G.Paint;
      const ratio = Math.min(1.35, Math.max(0.45, l / Math.max(0.05, paint.l)));
      for (let v = 0; v < 9; v++) e.shade[t.i * 9 + v] = ratio;
    }
    e.groups.push(g);
  }
  return out;
}

const cache = new Map<string, BodyClass>();
/** Lamp lenses: [colour when off, glow colour]. */
const LENS: Record<LightKind, [number, number]> = {
  head: [0xe9ecec, 0xfff0cf], fog: [0xeeeadf, 0xfff3d6], amber: [0xd0741c, 0xff9a2a],
  tail: [0x8a1610, 0xff1000], brake: [0x8a1610, 0xff1000], reverse: [0xdcdcdc, 0xffffff],
};
export interface LightState { night: boolean; brake: number; reverse: boolean }

/** Pop-up headlight pods, hinged at the back of each lid; returns the hinges. */
function popUpPods(tpl: CarAnalysis, def: DetailedDef, bodyMeshes: THREE.Mesh[], parent: THREE.Object3D, paint: THREE.Material, lamp: THREE.Material, created: { dispose(): void }[]): THREE.Group[] {
  const p = def.popups!, B = tpl.body, cx = (B.min.x + B.max.x) / 2, halfW = (B.max.x - B.min.x) / 2, len = B.max.z - B.min.z;
  const w = p.width * halfW * 2, L = (p.u[1] - p.u[0]) * len, t = L * 0.5;
  const z0 = B.min.z + p.u[0] * len, ray = new THREE.Raycaster();
  const shell = new THREE.BoxGeometry(w, t, L).translate(0, -t / 2, L / 2);
  const face = new THREE.BoxGeometry(w * 0.8, t * 0.06, L * 0.72).translate(0, -t - t * 0.02, L / 2);
  created.push(shell, face);
  return [1, -1].map((side) => {
    const x = cx + side * p.side * halfW;
    // The pod's hinge sits on the bonnet surface at the back of the lid.
    ray.set(new THREE.Vector3(x, B.max.y + 1, z0 + L * 0.5), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(bodyMeshes, false)[0];
    const hinge = new THREE.Group(); hinge.position.set(x, (hit ? hit.point.y : B.max.y * 0.6) + t * 0.05, z0);
    const pod = new THREE.Mesh(shell, paint), glow = new THREE.Mesh(face, lamp);
    pod.castShadow = true; hinge.add(pod, glow); hinge.visible = false; parent.add(hinge);
    return hinge;
  });
}

/** A detailed car, scaled so its wheelbase matches the physics (fitted to it in spec.ts). */
export function buildDetailedModel(spec: VehicleSpec, build: Build): CarModel {
  const tpl = templates.get(spec.id)!, def = DETAILED[spec.id], stock = CAR_TYPES[spec.id] ?? spec;
  const root = new THREE.Group(), body = new THREE.Group(), shell = new THREE.Group();
  root.add(body); body.add(shell);
  const created: { dispose(): void }[] = [];
  const [fl, , rl] = tpl.wheels, modelBase = fl.center.z - rl.center.z, physBase = spec.front.z - spec.rear.z;
  const s = physBase / modelBase, cx = tpl.wheels.reduce((a, w) => a + w.center.x, 0) / 4, meanR = tpl.wheels.reduce((a, w) => a + w.radius, 0) / 4;
  shell.scale.setScalar(s);
  // Centre the car on its wheel track, axles on the physics axles, tyres on the resting ground.
  shell.position.set(-cx * s, restGroundY(stock) - tpl.ground * s, spec.rear.z - rl.center.z * s);

  const paint = paintMaterial(build.paint, build.finish); paint.vertexColors = true;
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x6f8794, roughness: 0.05, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
  glass.userData.envIntensity = 1;
  const kinds: LightKind[] = ['head', 'fog', 'amber', 'tail', 'brake', 'reverse'];
  const lens = Object.fromEntries(kinds.map((k) => {
    const [base, glow] = LENS[k], m = new THREE.MeshStandardMaterial({ color: k === 'head' && def.headLens ? def.headLens : base, emissive: k === 'head' && def.headLens ? def.headLens : glow, emissiveIntensity: 0, roughness: 0.12 });
    return [k, m];
  })) as Record<LightKind, THREE.MeshStandardMaterial>;
  created.push(paint, glass, ...Object.values(lens));

  const model = tpl.scene.clone(true);
  // Map template meshes to the clone's (same traversal order).
  const tplMeshes: THREE.Mesh[] = [], meshes: THREE.Mesh[] = [];
  tpl.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) tplMeshes.push(o as THREE.Mesh); });
  model.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const wheelOf = new Map<THREE.Mesh, number>();
  tpl.wheels.forEach((w, i) => w.parts.forEach((p) => wheelOf.set(p, i)));
  const bodyTpl = tplMeshes.filter((m) => !wheelOf.has(m));
  let cls = cache.get(spec.id);
  if (!cls) { cls = classifyBody(bodyTpl, tpl, def); cache.set(spec.id, cls); }
  const wheelParts: THREE.Mesh[][] = [[], [], [], []];
  tplMeshes.forEach((tm, k) => {
    const m = meshes[k];
    m.castShadow = true; m.receiveShadow = true;
    const wi = wheelOf.get(tm);
    if (wi !== undefined) { wheelParts[wi].push(m); return; }
    if (def.hide?.test(tm.name)) { m.visible = false; return; }
    const e = cls!.get(tm);
    if (!e) return;
    // Re-index the triangles into the material slots (see G).
    const geo = e.geo.clone(), buckets: number[][] = Array.from({ length: 9 }, () => []);
    e.groups.forEach((g, i) => buckets[g].push(i * 3, i * 3 + 1, i * 3 + 2));
    geo.setAttribute('color', new THREE.BufferAttribute(e.shade, 3));
    geo.setIndex(buckets.flat()); geo.clearGroups();
    let start = 0; buckets.forEach((bk, i) => { geo.addGroup(start, bk.length, i); start += bk.length; });
    const own = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    const keep = own.clone(); keep.vertexColors = false; if (keep.transparent && keep.opacity < 0.95) { keep.transparent = false; keep.opacity = 1; }
    m.geometry = geo; m.material = [keep, paint, glass, lens.head, lens.fog, lens.amber, lens.tail, lens.brake, lens.reverse];
    created.push(geo, keep);
  });
  shell.add(model);

  // Pop-up headlights rise when the lights come on.
  let pods: THREE.Group[] = [], podPaint: THREE.MeshPhysicalMaterial | null = null, popAngle = 0;
  if (def.popups) {
    podPaint = paintMaterial(build.paint, build.finish); created.push(podPaint);
    pods = popUpPods(tpl, def, bodyTpl, model, podPaint, lens.head, created);
  }

  // Snorkel up the right front pillar when fitted.
  if (build.snorkel) {
    const [hx, hy, hz] = spec.half;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, hy * 1.7, 10), new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.6 }));
    pipe.position.set(-hx - 0.04, hy * 0.15, hz * 0.45); pipe.castShadow = true; body.add(pipe); created.push(pipe.geometry, pipe.material as THREE.Material);
  }

  // Wheels: the model's own, shaped to spin true about their hubs (see wheelAxle), scaled to the physics radius.
  const dark = build.wheels === 'dark', racing = build.wheels === 'racing', truck = build.wheels === 'truck';
  const wheels = tpl.wheels.map((w, i) => {
    const group = new THREE.Group(), spin = new THREE.Group(), holder = new THREE.Group(), align = new THREE.Group();
    w.parts.forEach((part, pi) => {
      // Shaped once (in the analysis) to spin about +x round its hub; shared by every build of the car.
      const clone = part.clone(); clone.geometry = w.spinGeos[pi];
      clone.position.set(0, 0, 0); clone.quaternion.identity(); clone.scale.set(1, 1, 1);
      clone.castShadow = true; clone.receiveShadow = true;
      if (dark || racing) {
        const mats = (Array.isArray(clone.material) ? clone.material : [clone.material]).map((mm) => {
          const c = (mm as THREE.MeshStandardMaterial).clone(), l = hsl(c.color).l;
          if (l > 0.3) { if (dark) c.color.multiplyScalar(0.3); else { c.color.setHex(0xc9a24a); c.metalness = 0.8; c.roughness = 0.3; } }
          created.push(c); return c;
        });
        clone.material = Array.isArray(clone.material) ? mats : mats[0];
      }
      align.add(clone);
    });
    // Each axle keeps its own size (a buggy's fronts are smaller), both sides alike.
    const axleR = (tpl.wheels[i & 2].radius + tpl.wheels[(i & 2) + 1].radius) / 2;
    align.scale.setScalar(axleR / w.radius);
    const k = spec.wheelRadius / meanR;
    holder.scale.set(k * (build.tyre === 'sand' ? 1.3 : truck ? 1.2 : 1), k, k);
    holder.add(align); spin.add(holder); group.add(spin); root.add(group);
    for (const p of wheelParts[i]) p.visible = false; // the originals stay in the shell, hidden
    return group;
  });

  const glow: Record<LightKind, number> = { head: 0, fog: 0, amber: 0, tail: 0, brake: 0, reverse: 0 };
  return {
    root, body, wheels, headlights: [lens.head], reflective: [paint, glass, ...Object.values(lens), ...(podPaint ? [podPaint] : [])],
    wheelX: tpl.wheels.map((w) => (w.center.x - cx) * s),
    setLights: (st: LightState, dt: number) => {
      // Headlights and the lamps that come on with them at night; brake and reversing lamps on demand. Bulbs
      // take a moment to light; pop-ups take most of a second to rise.
      const brake = Math.min(1, Math.max(0, st.brake));
      const target: Record<LightKind, number> = {
        head: st.night ? 3.2 : 0.1, fog: st.night ? 1.6 : 0.06, amber: st.night ? 0.55 : 0.06,
        tail: (st.night ? 0.9 : 0.06) + brake * 1.1, brake: brake * 2, reverse: st.reverse ? 2.4 : 0.03,
      };
      const k = Math.min(1, dt * 20);
      for (const kind of kinds) { glow[kind] += (target[kind] - glow[kind]) * k; lens[kind].emissiveIntensity = glow[kind]; }
      if (pods.length) {
        popAngle += Math.max(-dt * 2.6, Math.min(dt * 2.6, (st.night ? Math.PI / 2 : 0) - popAngle));
        for (const h of pods) { h.rotation.x = -popAngle; h.visible = popAngle > 0.01; }
      }
    },
    dispose: () => created.forEach((x) => x.dispose()),
  };
}
