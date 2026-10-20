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
export interface DetailedDef { file: string; credit: string; yaw: number; hide?: RegExp }
export const DETAILED: Record<string, DetailedDef> = {
  pip: { file: 'hatchback', credit: '"Toyota AE86" by IvOfficial', yaw: 0 },
  maple: { file: 'sedan', credit: '"Car" by iloem', yaw: Math.PI },
  badger: { file: 'offroader', credit: '"Range Rover" by IvOfficial', yaw: 0 },
  biscuit: { file: 'van', credit: '"Generic Van" by PuKkBuMXDD', yaw: Math.PI / 2 },
  bramble: { file: 'pickup', credit: '"Mitsubishi L200" by Muhammad Reyhan', yaw: 0 },
  comet: { file: 'coupe', credit: '"Mazda RX-7" by IvOfficial', yaw: 0 },
  skipper: { file: 'buggy', credit: '"Buggy" by Nick Slough', yaw: Math.PI / 2 },
};
const BASE = `${import.meta.env.BASE_URL}models/cars/`;
const WHEEL_NAME = /wheel|tire|tyre|rim/i, NOT_WHEEL = /spare|bag|mirror|steer/i;

export interface CarAnalysis {
  /** The model, rotated to face +z, in its own units. */
  scene: THREE.Group;
  /** Wheels in physics order: front-left (+x), front-right, rear-left, rear-right. */
  wheels: { parts: THREE.Mesh[]; center: THREE.Vector3; radius: number; width: number }[];
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
  // A wheel can be several parts (tyre, rim, hub); add any small part sitting inside a found wheel.
  const wheelSet = new Set(groups.flat());
  const wheels = groups.map((g) => {
    const b = new THREE.Box3(); for (const m of g) b.expandByObject(m);
    for (const m of meshes) if (!wheelSet.has(m)) { const mb = boxOf(m); if (b.containsBox(mb.clone().expandByScalar(-1e-4))) { g.push(m); wheelSet.add(m); } }
    const s = b.getSize(new THREE.Vector3());
    return { parts: g, center: b.getCenter(new THREE.Vector3()), radius: Math.max(s.y, s.z) / 2, width: s.x };
  });
  const body = new THREE.Box3(); for (const m of meshes) if (!wheelSet.has(m) && !(def.hide && def.hide.test(m.name))) body.expandByObject(m);
  const ground = Math.min(...wheels.map((w) => w.center.y - w.radius));
  return { scene, wheels, body, ground };
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
enum G { Keep, Paint, Glass, Head, Tail }
const hsl = (c: THREE.Color) => { const o = { h: 0, s: 0, l: 0 }; c.getHSL(o); return o; };

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

interface Tri { mesh: THREE.Mesh; geo: THREE.BufferGeometry; i: number; color: THREE.Color; area: number; glass: boolean; z: number; y: number }

/** Colour of every body triangle (texture or material colour), then the biggest colour family is the paint. */
function classifyBody(meshes: THREE.Mesh[], frontZ: number, rearZ: number): Map<THREE.Mesh, { geo: THREE.BufferGeometry; groups: number[]; shade: Float32Array }> {
  const tris: Tri[] = [];
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
      tris.push({ mesh, geo, i, color: col, area, glass, z: (a.z + b.z + c.z) / 3, y: (a.y + b.y + c.y) / 3 });
    }
  }
  // Colour families: group by hue (or by lightness for greys), weighted by area; the paint is the biggest family
  // that isn't glass, near-black (tyres, trim) or the interior.
  const fam: { key: string; area: number; l: number }[] = [];
  const keyOf = (t: Tri) => { const { h, s, l } = hsl(t.color); return s < 0.18 ? `g${Math.round(l * 6)}` : `h${Math.round(h * 24) % 24}`; };
  for (const t of tris) {
    if (t.glass) continue;
    const { l } = hsl(t.color); if (l < 0.09) continue;
    const k = keyOf(t); let f = fam.find((x) => x.key === k);
    if (!f) { f = { key: k, area: 0, l: 0 }; fam.push(f); }
    f.l = (f.l * f.area + l * t.area) / (f.area + t.area || 1); f.area += t.area;
  }
  fam.sort((x, y) => y.area - x.area);
  const paint = fam[0];
  const out = new Map<THREE.Mesh, { geo: THREE.BufferGeometry; groups: number[]; shade: Float32Array }>();
  for (const t of tris) {
    let e = out.get(t.mesh);
    if (!e) { e = { geo: t.geo, groups: [], shade: new Float32Array(t.geo.getAttribute('position').count * 3).fill(1) }; out.set(t.mesh, e); }
    const { h, s, l } = hsl(t.color), span = frontZ - rearZ;
    let g = G.Keep;
    if (t.glass) g = G.Glass;
    else if (paint && keyOf(t) === paint.key && l >= 0.09) {
      g = G.Paint;
      const ratio = Math.min(1.35, Math.max(0.45, l / Math.max(0.05, paint.l)));
      for (let v = 0; v < 9; v++) e.shade[t.i * 9 + v] = ratio;
    } else if (l > 0.82 && t.z > frontZ + span * 0.2 && t.area < 0.05 * span * span) g = G.Head;
    else if ((h < 0.04 || h > 0.96) && s > 0.5 && l > 0.25 && t.z < rearZ - span * 0.2) g = G.Tail;
    e.groups.push(g);
  }
  return out;
}

const cache = new Map<string, Map<THREE.Mesh, { geo: THREE.BufferGeometry; groups: number[]; shade: Float32Array }>>();

/** A detailed car, scaled so its wheelbase matches the physics (fitted to it in spec.ts). */
export function buildDetailedModel(spec: VehicleSpec, build: Build): CarModel {
  const tpl = templates.get(spec.id)!, stock = CAR_TYPES[spec.id] ?? spec;
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
  const head = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe6b0, emissiveIntensity: 0.4, roughness: 0.15 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x9a1a14, emissive: 0xff2a1a, emissiveIntensity: 0.35, roughness: 0.2 });
  created.push(paint, glass, head, tail);

  const model = tpl.scene.clone(true);
  // Map template meshes to the clone's (same traversal order).
  const tplMeshes: THREE.Mesh[] = [], meshes: THREE.Mesh[] = [];
  tpl.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) tplMeshes.push(o as THREE.Mesh); });
  model.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const wheelOf = new Map<THREE.Mesh, number>();
  tpl.wheels.forEach((w, i) => w.parts.forEach((p) => wheelOf.set(p, i)));
  const bodyTpl = tplMeshes.filter((m) => !wheelOf.has(m));
  let cls = cache.get(spec.id);
  if (!cls) { cls = classifyBody(bodyTpl, fl.center.z, rl.center.z); cache.set(spec.id, cls); }
  const wheelParts: THREE.Mesh[][] = [[], [], [], []];
  tplMeshes.forEach((tm, k) => {
    const m = meshes[k];
    m.castShadow = true; m.receiveShadow = true;
    const wi = wheelOf.get(tm);
    if (wi !== undefined) { wheelParts[wi].push(m); return; }
    if (tpl && (DETAILED[spec.id].hide?.test(tm.name))) { m.visible = false; return; }
    const e = cls!.get(tm);
    if (!e) return;
    // Re-index the triangles into material groups: [model's own, paint, glass, headlight, tail light].
    const geo = e.geo.clone(), buckets: number[][] = [[], [], [], [], []];
    e.groups.forEach((g, i) => buckets[g].push(i * 3, i * 3 + 1, i * 3 + 2));
    geo.setAttribute('color', new THREE.BufferAttribute(e.shade, 3));
    geo.setIndex(buckets.flat()); geo.clearGroups();
    let start = 0; buckets.forEach((bk, i) => { geo.addGroup(start, bk.length, i); start += bk.length; });
    const own = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    const keep = own.clone(); keep.vertexColors = false; if (keep.transparent && keep.opacity < 0.95) { keep.transparent = false; keep.opacity = 1; }
    m.geometry = geo; m.material = [keep, paint, glass, head, tail];
    created.push(geo, keep);
  });
  shell.add(model);

  // Snorkel up the right front pillar when fitted.
  if (build.snorkel) {
    const [hx, hy, hz] = spec.half;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, hy * 1.7, 10), new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.6 }));
    pipe.position.set(-hx - 0.04, hy * 0.15, hz * 0.45); pipe.castShadow = true; body.add(pipe); created.push(pipe.geometry, pipe.material as THREE.Material);
  }

  // Wheels: the model's own, re-centred on their hubs so they spin, scaled to the physics radius.
  const dark = build.wheels === 'dark', racing = build.wheels === 'racing', truck = build.wheels === 'truck';
  const wheels = tpl.wheels.map((w, i) => {
    const group = new THREE.Group(), spin = new THREE.Group(), holder = new THREE.Group();
    for (const part of w.parts) {
      // The template part's pose in model space, re-centred on the hub so the wheel spins about its axle.
      const clone = part.clone();
      part.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
      clone.position.sub(w.center);
      clone.castShadow = true; clone.receiveShadow = true;
      if (dark || racing) {
        const mats = (Array.isArray(clone.material) ? clone.material : [clone.material]).map((mm) => {
          const c = (mm as THREE.MeshStandardMaterial).clone(), l = hsl(c.color).l;
          if (l > 0.3) { if (dark) c.color.multiplyScalar(0.3); else { c.color.setHex(0xc9a24a); c.metalness = 0.8; c.roughness = 0.3; } }
          created.push(c); return c;
        });
        clone.material = Array.isArray(clone.material) ? mats : mats[0];
      }
      holder.add(clone);
    }
    const k = spec.wheelRadius / meanR; // each wheel keeps its own size (a buggy's fronts are smaller)
    holder.scale.set(k * (build.tyre === 'sand' ? 1.3 : truck ? 1.2 : 1), k, k);
    spin.add(holder); group.add(spin); root.add(group);
    for (const p of wheelParts[i]) p.visible = false; // the originals stay in the shell, hidden
    return group;
  });

  return {
    root, body, wheels, headlights: [head], reflective: [paint, glass, head, tail],
    wheelX: tpl.wheels.map((w) => (w.center.x - cx) * s),
    dispose: () => created.forEach((x) => x.dispose()),
  };
}
