import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { heightAt, type WorldData } from './terrainGen';

/**
 * Cliff barriers: wherever a road's edge drops away steeply, a low dry-stone wall runs along it, with warm lanterns
 * that glow at night and red-and-white chevron boards round the outside of hairpins. The walls are solid.
 */
export interface BarrierRun { road: number; side: 1 | -1; from: number; to: number; hairpin: boolean[] }

const PROBE = 7;          // metres beyond the shoulder where we look for a drop
const DROP = 3.2;         // a drop of this much there counts as a cliff edge
const MIN_RUN = 6;        // samples (~18 m): shorter edges are not worth a wall
const GAP = 4;            // samples: bridge small gaps so walls don't stutter
const HAIRPIN_R = 22;     // bends tighter than this get chevrons on the outside
export const WALL_H = 0.8, WALL_T = 0.55, WALL_OFFSET = 0.9, BURY = 2.5; // height, thickness, distance past the paved edge

const tangent = (xs: Float32Array, zs: Float32Array, i: number): [number, number] => {
  const a = Math.max(0, i - 1), b = Math.min(xs.length - 1, i + 1), dx = xs[b] - xs[a], dz = zs[b] - zs[a], l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
};

/** Curvature radius at sample i (signed by turn direction). */
function turnRadius(xs: Float32Array, zs: Float32Array, i: number): number {
  const a = Math.max(0, i - 3), b = Math.min(xs.length - 1, i + 3);
  const ax = xs[i] - xs[a], az = zs[i] - zs[a], bx = xs[b] - xs[i], bz = zs[b] - zs[i];
  const ang = Math.atan2(ax * bz - az * bx, ax * bx + az * bz), arc = (Math.hypot(ax, az) + Math.hypot(bx, bz)) / 2;
  return Math.abs(ang) < 1e-4 ? Infinity : arc / ang;
}

/** Is (x, z) on (or right beside) the pavement of any road, ignoring nearby samples of the asking road itself? */
function pavementTest(w: WorldData): (x: number, z: number, self: number, selfI: number) => boolean {
  // Spatial hash of every road sample, so walls never cross another road's pavement (junctions, bends of the same road).
  const CELL = 16, grid = new Map<number, [number, number][]>(), key = (x: number, z: number) => Math.floor(x / CELL) * 100003 + Math.floor(z / CELL);
  w.roads.forEach((r, ri) => { for (let i = 0; i < r.xs.length; i++) { const k = key(r.xs[i], r.zs[i]); (grid.get(k) ?? grid.set(k, []).get(k)!).push([ri, i]); } });
  return (x: number, z: number, self: number, selfI: number): boolean => {
    for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) for (const [ri, i] of grid.get(key(x + gx * CELL, z + gz * CELL)) ?? []) {
      if (ri === self && Math.abs(i - selfI) < 12) continue;
      const r = w.roads[ri];
      if (Math.hypot(r.xs[i] - x, r.zs[i] - z) < r.def.width / 2 + 2.5) return true;
    }
    return false;
  };
}

/** Find the stretches of road edge that need a barrier. Pure and deterministic, so it is unit-tested. */
export function findBarrierRuns(w: WorldData): BarrierRun[] {
  const onPavement = pavementTest(w);
  const runs: BarrierRun[] = [];
  w.roads.forEach((r, ri) => {
    if (r.def.kind === 'boardwalk') return;
    const hw = r.def.width / 2, n = r.xs.length;
    for (const side of [1, -1] as const) {
      const flag = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const [tx, tz] = tangent(r.xs, r.zs, i), nx = -tz * side, nz = tx * side; // the side's outward normal
        const ex = r.xs[i] + nx * (hw + WALL_OFFSET), ez = r.zs[i] + nz * (hw + WALL_OFFSET);
        const drop = r.hs[i] - heightAt(w, r.xs[i] + nx * (hw + PROBE), r.zs[i] + nz * (hw + PROBE));
        if (drop > DROP && heightAt(w, ex, ez) > -0.5 && !onPavement(ex, ez, ri, i)) flag[i] = 1;
      }
      // Close small gaps, but never across pavement.
      for (let i = 0; i < n; i++) if (!flag[i]) {
        let j = i; while (j < n && !flag[j]) j++;
        if (i > 0 && j < n && j - i <= GAP) for (let k = i; k < j; k++) {
          const [tx, tz] = tangent(r.xs, r.zs, k);
          if (!onPavement(r.xs[k] - tz * side * (hw + WALL_OFFSET), r.zs[k] + tx * side * (hw + WALL_OFFSET), ri, k)) flag[k] = 1;
        }
        i = j;
      }
      for (let i = 0; i < n; i++) if (flag[i]) {
        let j = i; while (j < n && flag[j]) j++;
        if (j - i >= MIN_RUN) {
          const hairpin: boolean[] = [];
          for (let k = i; k < j; k++) {
            // Outside of a bend: the road's direction turns away from this side.
            const [ax, az] = tangent(r.xs, r.zs, Math.max(0, k - 3)), [bx, bz] = tangent(r.xs, r.zs, Math.min(n - 1, k + 3)), [tx, tz] = tangent(r.xs, r.zs, k);
            const outside = (-tz * side) * (bx - ax) + (tx * side) * (bz - az) < 0;
            hairpin.push(Math.abs(turnRadius(r.xs, r.zs, k)) < HAIRPIN_R && outside);
          }
          runs.push({ road: ri, side, from: i, to: j - 1, hairpin });
        }
        i = j;
      }
    }
  });
  return runs;
}

export interface Chevron { road: number; i: number; side: 1 | -1 }

/** Red-and-white chevron boards round the outside of every tight bend, one every ~6 m. */
export function findChevrons(w: WorldData): Chevron[] {
  const onPavement = pavementTest(w), out: Chevron[] = [];
  w.roads.forEach((r, ri) => {
    if (r.def.kind === 'boardwalk') return;
    const n = r.xs.length, off = r.def.width / 2 + WALL_OFFSET + 0.9;
    for (let i = 3; i < n - 3; i += 2) {
      if (Math.abs(turnRadius(r.xs, r.zs, i)) > HAIRPIN_R) continue;
      const [ax, az] = tangent(r.xs, r.zs, i - 3), [bx, bz] = tangent(r.xs, r.zs, i + 3), [tx, tz] = tangent(r.xs, r.zs, i);
      // The outside of the bend: the side the direction turns away from.
      const side: 1 | -1 = -tz * (bx - ax) + tx * (bz - az) < 0 ? 1 : -1;
      const x = r.xs[i] - tz * side * off, z = r.zs[i] + tx * side * off;
      if (!onPavement(x, z, ri, i)) out.push({ road: ri, i, side });
    }
  });
  return out;
}

/** Point on the wall line at sample i of a run, at the road's height. */
function wallPoint(w: WorldData, run: BarrierRun, i: number, extra = 0): THREE.Vector3 {
  const r = w.roads[run.road], [tx, tz] = tangent(r.xs, r.zs, i), off = r.def.width / 2 + WALL_OFFSET + extra;
  return new THREE.Vector3(r.xs[i] - tz * run.side * off, r.hs[i], r.zs[i] + tx * run.side * off);
}

const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

function chevronTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4efe6'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#c8432f';
  for (let k = -1; k < 4; k++) { const x = k * 36 + 10; g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 18, 32); g.lineTo(x, 56); g.lineTo(x + 14, 56); g.lineTo(x + 32, 32); g.lineTo(x + 14, 8); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export interface Barriers { group: THREE.Group; setNight(amount: number): void; runs: BarrierRun[] }

/** Meshes for every run (stone blocks, lantern posts) and the hairpin chevrons, all instanced. */
export function buildBarriers(w: WorldData, runs: BarrierRun[], bends: Chevron[]): Barriers {
  const group = new THREE.Group();
  const blocks: THREE.Matrix4[] = [], blockTint: number[] = [], posts: THREE.Matrix4[] = [], lamps: THREE.Matrix4[] = [], roofs: THREE.Matrix4[] = [], chevrons: THREE.Matrix4[] = [], chevronPosts: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion(), m = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3();
  const along = (a: THREE.Vector3, b: THREE.Vector3) => { const d = b.clone().sub(a); return q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.clone().setY(0).normalize()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(d.y, Math.hypot(d.x, d.z)))).clone(); };
  for (const run of runs) {
    let since = 0;
    for (let i = run.from; i < run.to; i++) {
      const a = wallPoint(w, run, i), b = wallPoint(w, run, i + 1), rot = along(a, b), len = a.distanceTo(b);
      // Two stones per sample, slightly different sizes and colours, so the wall reads as hand-built.
      for (const [t0, t1] of [[0, 0.5], [0.5, 1]] as const) {
        const hv = hash(run.road * 7 + run.side, i * 2 + t0 * 2);
        // Each stone reaches well below the road so the wall stays planted where the bank falls away.
        const c = a.clone().lerp(b, (t0 + t1) / 2), top = WALL_H * (0.86 + 0.24 * hv), h = top + BURY;
        c.y += top - h / 2 - 0.1;
        blocks.push(m.compose(c, rot, s.set(len * (t1 - t0) + 0.08, h, WALL_T * (0.9 + 0.2 * hash(i, run.road)))).clone());
        blockTint.push(hv);
      }
      since += len;
      if (since > 26 && !run.hairpin[i - run.from]) { // lantern post on the wall, every ~26 m
        since = 0;
        const p = a.clone(); p.y += WALL_H + 0.3;
        posts.push(m.compose(p, rot, s.set(1, 1, 1)).clone());
        const l = p.clone(); l.y += 0.44;
        lamps.push(m.compose(l, rot, s.set(1, 1, 1)).clone());
        const roof = l.clone(); roof.y += 0.2;
        roofs.push(m.compose(roof, rot, s.set(1, 1, 1)).clone());
      }
    }
  }
  for (const c of bends) {
    const r = w.roads[c.road], [tx, tz] = tangent(r.xs, r.zs, c.i), off = r.def.width / 2 + WALL_OFFSET + 0.9;
    const p = new THREE.Vector3(r.xs[c.i] - tz * c.side * off, r.hs[c.i], r.zs[c.i] + tx * c.side * off);
    const face = new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(tz * c.side, -tx * c.side)); // board faces the road
    chevronPosts.push(m.compose(p.clone().setY(p.y + 0.55), face, s.set(1, 1, 1)).clone());
    chevrons.push(m.compose(p.clone().setY(p.y + 1.35), face, s.set(c.side, 1, 1)).clone());
  }
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], shadow = true) => {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((mm, k) => mesh.setMatrixAt(k, mm));
    mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  };
  const stone = inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), blocks);
  if (stone) {
    const c = new THREE.Color(), warm = new THREE.Color().setHex(0xb8aa94, THREE.SRGBColorSpace), cool = new THREE.Color().setHex(0x8e8a84, THREE.SRGBColorSpace);
    blockTint.forEach((t, k) => stone.setColorAt(k, c.copy(cool).lerp(warm, t)));
  }
  inst(new THREE.CylinderGeometry(0.07, 0.09, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x3b2f28, roughness: 0.8 }), posts);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffb45a, emissiveIntensity: 0.3, roughness: 0.4 });
  inst(new THREE.CylinderGeometry(0.13, 0.11, 0.26, 6), lampMat, lamps, false);
  inst(new THREE.ConeGeometry(0.2, 0.16, 6), new THREE.MeshStandardMaterial({ color: 0x2c2622, roughness: 0.7, flatShading: true }), roofs);
  const boardGeo = new THREE.PlaneGeometry(1.3, 0.65), chevronTex = chevronTexture();
  // Retro-reflective paint: a little self-light so the boards read from down the road, more under headlights at night.
  const boardMat = new THREE.MeshStandardMaterial({ map: chevronTex, emissiveMap: chevronTex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.6, side: THREE.DoubleSide });
  inst(boardGeo, boardMat, chevrons);
  inst(new THREE.BoxGeometry(0.1, 1.6, 0.1), new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 0.7 }), chevronPosts);
  return { group, runs, setNight: (amount) => { lampMat.emissiveIntensity = 0.3 + amount * 4.5; boardMat.emissiveIntensity = 0.25 + amount * 0.35; } };
}

/** Solid walls: one static box per two samples (~6 m). */
export function barrierColliders(R: typeof RAPIER, world: RAPIER.World, w: WorldData, runs: BarrierRun[]): number {
  let count = 0;
  for (const run of runs) for (let i = run.from; i < run.to; i += 2) {
    const j = Math.min(run.to, i + 2), a = wallPoint(w, run, i), b = wallPoint(w, run, j);
    const d = b.clone().sub(a), len = d.length(), c = a.clone().add(b).multiplyScalar(0.5);
    if (len < 0.5) continue;
    const yaw = Math.atan2(-d.z, d.x), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    const qq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pitch));
    world.createCollider(R.ColliderDesc.cuboid(len / 2 + 0.2, WALL_H / 2 + 0.25, WALL_T / 2)
      .setTranslation(c.x, c.y + WALL_H / 2 - 0.15, c.z).setRotation({ x: qq.x, y: qq.y, z: qq.z, w: qq.w }).setFriction(0.4).setRestitution(0.1));
    count++;
  }
  return count;
}
