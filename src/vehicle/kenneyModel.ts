import * as THREE from 'three';
import type { Build } from '../customization/build';
import type { CarModel } from './carModel';
import { carScene, MODEL_DEFS, samplePalette, wheelScene } from './modelLibrary';
import { paintMaterial } from './paint';
import { CAR_TYPES, restGroundY, type VehicleSpec } from './spec';

const WHEEL_NODES = new Set(['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right']);
enum G { Base, Paint, Accent, Glass, Head, Tail }

const hsl = (rgb: [number, number, number]) => { const c = new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace); const o = { h: 0, s: 0, l: 0 }; c.getHSL(o); return o; };

/** Split a palette-textured body mesh into material groups by the palette colour each triangle uses. */
function classify(mesh: THREE.Mesh): THREE.BufferGeometry {
  const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const pos = src.getAttribute('position'), uv = src.getAttribute('uv');
  const map = (mesh.material as THREE.MeshStandardMaterial).map;
  map?.updateMatrix();
  const tris = pos.count / 3, keys: number[] = [], areas = new Map<number, number>(), colors = new Map<number, [number, number, number]>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), t = new THREE.Vector2();
  let zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < pos.count; i++) { zMin = Math.min(zMin, pos.getZ(i)); zMax = Math.max(zMax, pos.getZ(i)); }
  for (let i = 0; i < tris; i++) {
    t.set((uv.getX(i * 3) + uv.getX(i * 3 + 1) + uv.getX(i * 3 + 2)) / 3, (uv.getY(i * 3) + uv.getY(i * 3 + 1) + uv.getY(i * 3 + 2)) / 3);
    if (map) t.applyMatrix3(map.matrix);
    const rgb = samplePalette(t.x, t.y), key = (Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255);
    a.fromBufferAttribute(pos, i * 3); b.fromBufferAttribute(pos, i * 3 + 1); c.fromBufferAttribute(pos, i * 3 + 2);
    const area = c.clone().sub(b).cross(a.clone().sub(b)).length() / 2;
    keys.push(key); colors.set(key, rgb); areas.set(key, (areas.get(key) ?? 0) + area);
  }
  const isGlass = (k: number) => { const [r, , bl] = colors.get(k)!, l = hsl(colors.get(k)!).l; return l < 0.42 && bl >= r && hsl(colors.get(k)!).s < 0.5; };
  const saturated = [...areas.entries()].filter(([k]) => !isGlass(k) && hsl(colors.get(k)!).s > 0.3 && hsl(colors.get(k)!).l > 0.12 && hsl(colors.get(k)!).l < 0.85).sort((x, y) => y[1] - x[1]);
  // Kenney shades each panel with several tones of one colour: cluster tones by hue, biggest cluster = paint.
  const clusters: { hue: number; light: number; area: number; keys: Set<number> }[] = [];
  for (const [k, area] of saturated) {
    const { h, l } = hsl(colors.get(k)!);
    const near = clusters.find((c) => Math.min(Math.abs(c.hue - h), 1 - Math.abs(c.hue - h)) < 0.045);
    if (near) { near.area += area; near.keys.add(k); } else clusters.push({ hue: h, light: l, area, keys: new Set([k]) });
  }
  clusters.sort((x, y) => y.area - x.area);
  const paintC = clusters[0], accentC = clusters[1] && clusters[1].area > clusters[0].area * 0.12 ? clusters[1] : undefined;
  const shade = new Float32Array(pos.count * 3).fill(1);
  const buckets: number[][] = [[], [], [], [], [], []];
  for (let i = 0; i < tris; i++) {
    const k = keys[i], rgb = colors.get(k)!, { h, s, l } = hsl(rgb);
    const z = (pos.getZ(i * 3) + pos.getZ(i * 3 + 1) + pos.getZ(i * 3 + 2)) / 3;
    let g = G.Base;
    const cl = paintC?.keys.has(k) ? paintC : accentC?.keys.has(k) ? accentC : undefined;
    if (cl) {
      g = cl === paintC ? G.Paint : G.Accent;
      const ratio = Math.min(1.3, Math.max(0.45, l / cl.light)); // keep the model's baked panel shading
      for (let v = 0; v < 9; v++) shade[i * 9 + v] = ratio;
    }
    else if (isGlass(k)) g = G.Glass;
    else if (l > 0.8 && z > zMax - (zMax - zMin) * 0.2) g = G.Head;
    else if ((h < 0.05 || h > 0.95) && s > 0.5 && l > 0.3 && z < zMin + (zMax - zMin) * 0.2) g = G.Tail;
    buckets[g].push(i * 3, i * 3 + 1, i * 3 + 2);
  }
  src.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  src.clearGroups();
  src.setIndex(buckets.flat());
  let start = 0;
  buckets.forEach((bk, i) => { src.addGroup(start, bk.length, i); start += bk.length; });
  return src;
}

export function buildKenneyModel(spec: VehicleSpec, build: Build): CarModel {
  const def = MODEL_DEFS[spec.id], stock = CAR_TYPES[spec.id] ?? spec;
  const root = new THREE.Group(), body = new THREE.Group(), shell = new THREE.Group();
  root.add(body); body.add(shell);
  shell.scale.setScalar(def.scale);
  shell.position.y = restGroundY(stock);
  const created: { dispose(): void }[] = [];

  const paint = paintMaterial(build.paint, build.finish), accent = paintMaterial(build.accent, build.finish);
  paint.vertexColors = true; accent.vertexColors = true;
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1a2630, roughness: 0.05, metalness: 0.1, clearcoat: 1 });
  glass.userData.envIntensity = 0.9;
  const head = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe6b0, emissiveIntensity: 0.4, roughness: 0.15 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x9a1a14, emissive: 0xff2a1a, emissiveIntensity: 0.35, roughness: 0.2 });
  created.push(paint, accent, glass, head, tail);
  let baseMat: THREE.MeshStandardMaterial | null = null;

  const scene = carScene(spec.id).clone(true);
  const drop: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (WHEEL_NODES.has(o.name)) { drop.push(o); return; }
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = true; o.receiveShadow = true;
    if (!baseMat) { baseMat = (o.material as THREE.MeshStandardMaterial).clone(); baseMat.roughness = 0.65; baseMat.metalness = 0; baseMat.vertexColors = false; created.push(baseMat); }
    if (o.name === 'body' || o.parent?.name === 'body' && o.name !== 'wheel-back') {
      o.geometry = classify(o); created.push(o.geometry);
      o.material = [baseMat, paint, accent, glass, head, tail];
    } else o.material = baseMat;
  });
  drop.forEach((o) => o.removeFromParent());
  shell.add(scene);

  // Snorkel (a functional part) runs up the right front pillar.
  if (build.snorkel) {
    const [hx, hy, hz] = spec.half;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, hy * 1.7, 10), new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.6 }));
    pipe.position.set(-hx - 0.04, hy * 0.15, hz * 0.45); pipe.castShadow = true;
    body.add(pipe); created.push(pipe.geometry, pipe.material as THREE.Material);
  }

  // Wheels follow the physics; content is the chosen Kenney wheel scaled to the physics radius and width.
  const wheelSrc = wheelScene(build.wheels);
  const wheels = [1, -1, 1, -1].map((side) => {
    const group = new THREE.Group(), spin = new THREE.Group(), content = wheelSrc.clone(true);
    content.scale.set((spec.wheelWidth * (build.tyre === 'sand' ? 1.3 : 1)) / 0.4, spec.wheelRadius / 0.3, spec.wheelRadius / 0.3);
    if (side < 0) content.rotation.y = Math.PI;
    content.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    spin.add(content); group.add(spin); root.add(group);
    return group;
  });

  return {
    root, body, wheels, headlights: [head],
    reflective: [paint, accent, glass, head, tail],
    dispose: () => created.forEach((x) => x.dispose()),
  };
}
