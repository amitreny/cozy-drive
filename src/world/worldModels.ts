import * as THREE from 'three';
import { BUILDING_SCALE } from './lots';
import { modelScene } from './townModels';

/**
 * Buildings and scenery for the airports, docks and islands: published models (see CREDITS.md), each fitted to a
 * footprint in the world. The models come in all sorts of units and orientations; each entry says how to turn
 * it so its front faces +z, which parts to leave off, and how to fit it.
 */
export interface WorldModelSpec {
  /** Path under public/models/, without .glb. */
  file: string;
  /** Turn (rad about +y) that brings the model's front (doors, nose, bow) to +z. */
  yaw0: number;
  /**
   * 'box': stretch to the footprint and height (an arched shelter, a barn). 'uniform': scale evenly to fit inside
   * the footprint and height (never stretched). 'height': scale evenly to the height. 'length': scale evenly to the length along z.
   */
  fit: 'box' | 'uniform' | 'height' | 'length' | 'scale';
  /** 'scale': the model's own scale to metres (Kenney's kits: the same scale as the town's buildings). */
  scale?: number;
  /** Materials whose parts are left off (by name): a tent's guy ropes. */
  drop?: string[];
}
export const WORLD_MODELS: Record<string, WorldModelSpec> = {
  barn: { file: 'world/barn', yaw0: 0, fit: 'uniform' },
  // The air-cargo office and café: one of the town's low Kenney shops, at the town's scale.
  office: { file: 'kenney-commercial/building-e', yaw0: 0, fit: 'scale', scale: BUILDING_SCALE },
  terminal: { file: 'world/terminal', yaw0: 0, fit: 'scale', scale: BUILDING_SCALE },
  fire: { file: 'world/fire-station', yaw0: 0, fit: 'uniform' },
  cargo: { file: 'world/cargo-depot', yaw0: 0, fit: 'uniform' },
  lighthouse: { file: 'world/lighthouse', yaw0: -Math.PI / 2, fit: 'height' },
  widebody: { file: 'world/widebody', yaw0: 0, fit: 'length' },
  narrowbody: { file: 'world/narrowbody', yaw0: 0, fit: 'length' },
  bus: { file: 'world/bus', yaw0: 0, fit: 'length' },
  truck: { file: 'world/truck', yaw0: 0, fit: 'length' },
  firetruck: { file: 'world/fire-truck', yaw0: -Math.PI / 2, fit: 'length' },
  container: { file: 'world/container', yaw0: -Math.PI / 2, fit: 'length' },
  sailboat: { file: 'world/sailboat', yaw0: 0, fit: 'length' },
  palm: { file: 'world/palm', yaw0: 0, fit: 'height' },
};
export const WORLD_MODEL_FILES = [...new Set(Object.values(WORLD_MODELS).map((m) => m.file))];

/** A model's prepared template: turned to face +z, parts dropped, its bottom-centre at the origin; and its size. */
const templates = new Map<string, { root: THREE.Group; size: THREE.Vector3 }>();
function template(key: string): { root: THREE.Group; size: THREE.Vector3 } | null {
  const cached = templates.get(key);
  if (cached) return cached;
  const spec = WORLD_MODELS[key], scene = spec && modelScene(spec.file);
  if (!scene) return null;
  const inner = scene.clone(true);
  if (spec.drop) {
    // Split multi-material meshes are separate primitives (child meshes) in three.js; remove the dropped ones.
    const gone: THREE.Object3D[] = [];
    inner.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && spec.drop!.includes((m.material as THREE.Material).name)) gone.push(m); });
    for (const o of gone) o.removeFromParent();
  }
  inner.rotation.y = spec.yaw0;
  const turned = new THREE.Group(); turned.add(inner); turned.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(turned), c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z);
  const root = new THREE.Group(); root.add(turned);
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const t = { root, size: box.getSize(new THREE.Vector3()) };
  templates.set(key, t);
  return t;
}

export const hasWorldModel = (key: string): boolean => template(key) !== null;

/**
 * A copy of model `key` standing at (x, y, z), its front facing `yaw` (from +z towards +x), fitted to `width`
 * across, `height` up and `length` front to back (each as the spec's fit uses them). Returns the object and the
 * size it came out (width, height, length), or null if the model isn't loaded.
 */
export function placeModel(key: string, at: { x: number; y: number; z: number }, yaw: number, dims: { width?: number; height?: number; length?: number }): { object: THREE.Object3D; size: THREE.Vector3 } | null {
  const t = template(key);
  if (!t) return null;
  const spec = WORLD_MODELS[key], s = t.size, o = t.root.clone(true);
  const sc = new THREE.Vector3(1, 1, 1);
  if (spec.fit === 'box') sc.set((dims.width ?? s.x) / s.x, (dims.height ?? s.y) / s.y, (dims.length ?? s.z) / s.z);
  else {
    const k = spec.fit === 'scale' ? spec.scale ?? 1
      : spec.fit === 'height' ? (dims.height ?? s.y) / s.y
      : spec.fit === 'length' ? (dims.length ?? s.z) / s.z
      : Math.min((dims.width ?? Infinity) / s.x, (dims.height ?? Infinity) / s.y, (dims.length ?? Infinity) / s.z);
    sc.setScalar(Number.isFinite(k) ? k : 1);
  }
  o.scale.copy(sc); o.position.set(at.x, at.y, at.z); o.rotation.y = yaw;
  return { object: o, size: new THREE.Vector3(s.x * sc.x, s.y * sc.y, s.z * sc.z) };
}
