import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BodyDef } from './bodyDefs';

const ss = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
export type Deform = (x: number, y: number, z: number) => number;
export interface Axles { front: { z: number; r: number }; rear: { z: number; r: number } }
export interface BodyParts { body: THREE.BufferGeometry; glass: THREE.BufferGeometry | null; frames: THREE.BufferGeometry | null; deform: Deform; halfW: number }

/** Tumblehome (narrower roof), rounded nose/tail in plan view, and a slight tuck at the sills. */
export function makeDeform(def: BodyDef, zMin: number, zMax: number): Deform {
  const zc = (zMin + zMax) / 2, half = (zMax - zMin) / 2;
  return (x, y, z) => {
    const taper = 1 - def.tumblehome * ss(def.belt, def.roof, y);
    const plan = 1 - def.roundness * ss(0.7, 1, Math.abs(z - zc) / half) ** 1.6;
    const tuck = 1 - 0.04 * (1 - ss(def.bottom, def.bottom + 0.25, y));
    return x * taper * plan * tuck;
  };
}

function profileShape(def: BodyDef, ax: Axles): THREE.Shape {
  const s = new THREE.Shape();
  for (const op of def.profile) {
    if (op[0] === 'm') s.moveTo(op[1], op[2]);
    else if (op[0] === 'l') s.lineTo(op[1], op[2]);
    else if (op[0] === 'q') s.quadraticCurveTo(op[1], op[2], op[3], op[4]);
    else {
      const { z, r } = ax[op[1]];
      const R = r + def.archClearance, dy = def.bottom - r, dz = Math.sqrt(R * R - dy * dy), a = Math.atan2(dy, dz);
      s.lineTo(z - dz, def.bottom);
      s.absarc(z, r, R, Math.PI - a, a, true);
    }
  }
  s.closePath();
  return s;
}

/** Map a shape-space point (z, y) onto one side of the body surface. */
function onSide(pts: [number, number][], side: 1 | -1, offset: number, deform: Deform, halfW: number): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y))));
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const z = p.getX(i), y = p.getY(i);
    p.setXYZ(i, deform(side * (halfW + offset), y, z), y, z);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

function inflate(poly: [number, number][], by: number): [number, number][] {
  const cz = poly.reduce((a, p) => a + p[0], 0) / poly.length, cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  return poly.map(([z, y]) => { const dz = z - cz, dy = y - cy, l = Math.hypot(dz, dy) || 1; return [z + (dz / l) * by, y + (dy / l) * by]; });
}

export function buildBody(def: BodyDef, ax: Axles): BodyParts {
  const bt = 0.08, bs = 0.06, depth = def.width - 2 * bt, halfW = def.width / 2;
  const shape = profileShape(def, ax);
  const zs = shape.getPoints().map((p) => p.x);
  const deform = makeDeform(def, Math.min(...zs), Math.max(...zs));
  let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelOffset: -bs, bevelSegments: 4, curveSegments: 14, steps: 1,
  });
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = g.index ? g.toNonIndexed() : g;
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const z = p.getX(i), y = p.getY(i), x = -(p.getZ(i) - depth / 2);
    p.setXYZ(i, deform(x, y, z), y, z);
  }
  g = toCreasedNormals(g, Math.PI / 4.5);

  // Sort triangles into material groups: 0 paint, 1 accent, 2 glass.
  const pos = g.getAttribute('position'), tris = pos.count / 3;
  const buckets: number[][] = [[], [], []];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < tris; t++) {
    a.fromBufferAttribute(pos, t * 3); b.fromBufferAttribute(pos, t * 3 + 1); c.fromBufferAttribute(pos, t * 3 + 2);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    const cy = (a.y + b.y + c.y) / 3;
    let m = 0;
    if (!def.open && cy > def.belt + 0.03 && Math.abs(n.y) < 0.93 && Math.abs(n.x) < 0.35) m = 2;
    else if ((def.accentRoof && Math.abs(n.y) > 0.9 && cy > def.roof - 0.12) || (def.twoTone !== undefined && cy > def.twoTone)) m = 1;
    buckets[m].push(t * 3, t * 3 + 1, t * 3 + 2);
  }
  g.clearGroups();
  g.setIndex(buckets.flat());
  let start = 0;
  buckets.forEach((bk, i) => { g.addGroup(start, bk.length, i); start += bk.length; });

  const glass: THREE.BufferGeometry[] = [], frames: THREE.BufferGeometry[] = [];
  for (const side of [1, -1] as const) {
    for (const w of def.windows) { frames.push(onSide(inflate(w, 0.035), side, 0.004, deform, halfW)); glass.push(onSide(w, side, 0.008, deform, halfW)); }
    for (const dz of def.doors) frames.push(onSide([[dz + 0.006, def.bottom + 0.06], [dz + 0.006, def.belt - 0.02], [dz - 0.006, def.belt - 0.02], [dz - 0.006, def.bottom + 0.06]], side, 0.004, deform, halfW));
  }
  return { body: g, glass: glass.length ? mergeGeometries(glass) : null, frames: frames.length ? mergeGeometries(frames) : null, deform, halfW };
}
