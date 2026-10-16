import * as THREE from 'three';
import { BUSH, ROCK, type Scatter } from './scatter';

/** Instanced meshes per 1 km tile and prop part, so whole tiles are culled when off screen. */
export function buildPropMeshes(sc: Scatter, size: number, tile = 1024): THREE.Group {
  const group = new THREE.Group();
  const parts = propParts();
  const per = size / tile, half = size / 2, buckets = new Map<number, number[]>();
  for (let i = 0; i < sc.count; i++) {
    const key = (Math.floor((sc.z[i] + half) / tile) * per + Math.floor((sc.x[i] + half) / tile)) * 4 + sc.kind[i];
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(i);
  }
  const m4 = new THREE.Matrix4(), c = new THREE.Color(), c2 = new THREE.Color();
  for (const [key, list] of buckets) {
    const k = key % 4;
    for (const part of parts[k]) {
      const mesh = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      list.forEach((i, j) => {
        mesh.setMatrixAt(j, placement(sc, i, part.y, m4));
        if (part.tint[0]) mesh.setColorAt(j, c.setHex(part.tint[0], THREE.SRGBColorSpace).lerp(c2.setHex(part.tint[1], THREE.SRGBColorSpace), sc.tint[i]));
      });
      mesh.computeBoundingSphere();
      mesh.userData.tile = key >> 2;
      mesh.castShadow = false; mesh.receiveShadow = true; // shadows come from NearShadowCasters
      group.add(mesh);
    }
  }
  return group;
}

/** Hide tree tiles whose nearest edge is beyond the fog, so far forests cost nothing. */
export function updatePropVisibility(group: THREE.Group, cam: THREE.Vector3, size: number, maxDist = 2200, tile = 1024): void {
  const per = size / tile, half = size / 2;
  for (const m of group.children) {
    const key = m.userData.tile as number, tx = key % per, tz = Math.floor(key / per);
    const x0 = tx * tile - half, z0 = tz * tile - half;
    const dx = Math.max(x0 - cam.x, 0, cam.x - (x0 + tile)), dz = Math.max(z0 - cam.z, 0, cam.z - (z0 + tile));
    m.visible = Math.hypot(dx, dz) < maxDist;
  }
}

type Part = { geo: THREE.BufferGeometry; mat: THREE.Material; y: number; tint: [number, number] };
function propParts(): Part[][] {
  const flat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true });
  return [
    [{ geo: new THREE.CylinderGeometry(0.22, 0.32, 2.2, 6), mat: flat(0x7a5134), y: 1.1, tint: [0, 0] },
     { geo: new THREE.ConeGeometry(2.1, 5.5, 7), mat: flat(0xffffff), y: 4.6, tint: [0x2f6b4f, 0x4f8a5a] }],
    [{ geo: new THREE.CylinderGeometry(0.25, 0.35, 2.6, 6), mat: flat(0x7a5134), y: 1.3, tint: [0, 0] },
     { geo: new THREE.IcosahedronGeometry(2.4, 0), mat: flat(0xffffff), y: 4.0, tint: [0x6f9f4a, 0xb6b44e] }],
    [{ geo: new THREE.IcosahedronGeometry(0.9, 0), mat: flat(0xffffff), y: 0.5, tint: [0x5f8f45, 0x8fae55] }],
    [{ geo: new THREE.DodecahedronGeometry(1.2, 0), mat: flat(0xffffff), y: 0.4, tint: [0x9a5a42, 0xb9a48f] }],
  ];
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function placement(sc: Scatter, i: number, partY: number, out: THREE.Matrix4): THREE.Matrix4 {
  const k = sc.kind[i];
  _e.set(k === ROCK ? sc.rot[i] : 0, sc.rot[i], 0); _q.setFromEuler(_e);
  const sy = k === ROCK ? sc.s[i] * 0.7 : sc.s[i];
  return out.compose(_p.set(sc.x[i], sc.y[i] + partY * sy - (k === ROCK ? 0.2 : 0.1), sc.z[i]), _q, _s.set(sc.s[i], sy, sc.s[i]));
}

/** Only trees and rocks near the car cast shadows (the shadow map covers ~60 m anyway). Invisible in the colour pass. */
export class NearShadowCasters {
  readonly group = new THREE.Group();
  private meshes: { mesh: THREE.InstancedMesh; kind: number; y: number }[] = [];
  private lastX = Infinity; private lastZ = Infinity;
  constructor(private sc: Scatter, private radius = 130, capacity = 4000) {
    const shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    propParts().forEach((list, kind) => {
      if (kind === BUSH) return;
      for (const part of list) {
        const mesh = new THREE.InstancedMesh(part.geo, shadowOnly, capacity);
        mesh.castShadow = true; mesh.frustumCulled = false; mesh.count = 0;
        this.meshes.push({ mesh, kind, y: part.y }); this.group.add(mesh);
      }
    });
  }
  update(x: number, z: number): void {
    if (Math.hypot(x - this.lastX, z - this.lastZ) < 15) return;
    this.lastX = x; this.lastZ = z;
    const m4 = new THREE.Matrix4(), r2 = this.radius * this.radius, sc = this.sc;
    for (const m of this.meshes) m.mesh.count = 0;
    for (let i = 0; i < sc.count; i++) {
      const dx = sc.x[i] - x, dz = sc.z[i] - z;
      if (dx * dx + dz * dz > r2) continue;
      for (const m of this.meshes) {
        if (m.kind !== sc.kind[i] || m.mesh.count >= m.mesh.instanceMatrix.count) continue;
        m.mesh.setMatrixAt(m.mesh.count++, placement(sc, i, m.y, m4));
      }
    }
    for (const m of this.meshes) m.mesh.instanceMatrix.needsUpdate = true;
  }
}
