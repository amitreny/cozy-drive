import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { TyreType } from '../world/surfaces';

export type RimStyle = 'alloy5' | 'offroad6' | 'steel' | 'beadlock';
export interface WheelMats { rubber: THREE.Material; rim: THREE.Material; disc: THREE.Material; caliper: THREE.Material }

const lathe = (pts: [number, number][], seg = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/** Tyre cross-section revolved around the axle. Knobbly tyres get tread blocks. */
function tyreGeometry(r: number, w: number, type: TyreType): THREE.BufferGeometry {
  const hw = w / 2, ri = r * 0.64;
  const knobbly = type === 'mud' || type === 'allTerrain' || type === 'sand';
  const ro = knobbly ? r * 0.955 : r;
  const parts: THREE.BufferGeometry[] = [lathe([
    [ri, -hw * 0.82], [ro * 0.86, -hw], [ro * 0.96, -hw * 0.94], [ro, -hw * 0.7], [ro, hw * 0.7], [ro * 0.96, hw * 0.94], [ro * 0.86, hw], [ri, hw * 0.82],
  ])];
  if (knobbly) {
    const n = type === 'sand' ? 14 : 22, depth = r - ro + 0.008;
    for (let i = 0; i < n; i++) for (const row of [-1, 1]) {
      const blockW = type === 'sand' ? w * 0.9 : w * 0.42;
      const box = new THREE.BoxGeometry(depth * 2, blockW, type === "sand" ? 0.035 : 0.075);
      const ang = ((i + (row > 0 ? 0.5 : 0)) / n) * Math.PI * 2;
      box.translate(ro, type === "sand" ? 0 : row * w * 0.24, 0);
      box.rotateY(ang);
      parts.push(box);
      if (type === 'sand') break;
    }
  }
  const g = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p.index ? p.toNonIndexed() : p; }));
  g.rotateZ(-Math.PI / 2); // built around the Y axis; turn the axle to X
  return g;
}

function rimGeometry(r: number, w: number, style: RimStyle): THREE.BufferGeometry {
  const hw = w / 2, ri = r * 0.64;
  const parts: THREE.BufferGeometry[] = [];
  // Barrel and outer lip.
  const barrel = lathe([[ri * 0.97, -hw * 0.75], [ri, -hw * 0.6], [ri * 0.99, hw * 0.55], [ri * 1.04, hw * 0.62], [ri * 0.92, hw * 0.6]], 32);
  barrel.rotateZ(-Math.PI / 2);
  parts.push(barrel);
  const face = hw * 0.45;
  if (style === 'steel') {
    const dish = lathe([[0.001, face + 0.03], [ri * 0.3, face + 0.03], [ri * 0.55, face], [ri * 0.92, face + 0.01], [ri * 0.95, face - 0.03]], 32);
    dish.rotateZ(-Math.PI / 2);
    parts.push(dish);
  } else {
    const spokes = style === 'alloy5' ? 5 : style === 'offroad6' ? 6 : 8;
    const thick = style === 'alloy5' ? 0.045 : 0.07;
    for (let i = 0; i < spokes; i++) {
      const s = new THREE.BoxGeometry(0.035, ri * 0.82, thick);
      s.translate(face, ri * 0.48, 0);
      s.rotateX((i / spokes) * Math.PI * 2);
      parts.push(s);
    }
    const hub = new THREE.CylinderGeometry(ri * 0.24, ri * 0.28, 0.06, 16);
    hub.rotateZ(Math.PI / 2); hub.translate(face, 0, 0);
    parts.push(hub);
    if (style === 'beadlock') {
      const ring = new THREE.TorusGeometry(ri * 0.97, 0.02, 6, 32);
      ring.rotateY(Math.PI / 2); ring.translate(hw * 0.6, 0, 0);
      parts.push(ring);
    }
  }
  return mergeGeometries(parts.map((p) => { if (p.getAttribute('uv')) p.deleteAttribute('uv'); return p.index ? p.toNonIndexed() : p; }));
}

/**
 * A wheel group: children[0] spins (tyre, rim, disc), children[1] is the caliper, which only steers.
 * `side` +1 = left (+x faces outward), -1 = right.
 */
export function buildWheel(r: number, w: number, tyre: TyreType, style: RimStyle, mats: WheelMats, side: 1 | -1): THREE.Group {
  const group = new THREE.Group(), spin = new THREE.Group(), content = new THREE.Group();
  const t = new THREE.Mesh(tyreGeometry(r, w, tyre), mats.rubber);
  const rim = new THREE.Mesh(rimGeometry(r, w, style), mats.rim);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.025, 24), mats.disc);
  disc.rotation.z = Math.PI / 2; disc.position.x = w * 0.05;
  for (const m of [t, rim]) { m.castShadow = true; m.receiveShadow = true; }
  content.add(t, rim, disc);
  if (side < 0) content.rotation.y = Math.PI;
  spin.add(content);
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.1), mats.caliper);
  caliper.position.set(side * w * 0.12, r * 0.18, -r * 0.4);
  group.add(spin, caliper);
  return group;
}
