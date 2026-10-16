import * as THREE from 'three';
import { S, SURFACES } from './surfaces';
import { heightAt, type WorldData } from './terrainGen';
import type { RoadPath } from './roads';

/** Road ribbons with markings: highways get a dashed centre line and solid edge lines. */
export function buildRoads(w: WorldData): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  addGrain(mat);
  const paintMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const ribbon = (r: RoadPath, offset: number, halfW: number, lift: number, colorAt: (i: number) => THREE.Color, m: THREE.Material, skip?: (i: number) => boolean) => {
    const pos: number[] = [], clr: number[] = [], idx: number[] = [], n = r.xs.length;
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      let dx = r.xs[i1] - r.xs[i0], dz = r.zs[i1] - r.zs[i0];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const px = -dz, pz = dx, c = colorAt(i);
      for (const side of [1, -1]) {
        const o = offset + side * halfW, x = r.xs[i] + px * o, z = r.zs[i] + pz * o;
        pos.push(x, Math.max(r.hs[i], heightAt(w, x, z)) + lift, z);
        clr.push(c.r, c.g, c.b);
      }
      if (i < n - 1 && !(skip && skip(i))) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } // faces up
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(clr, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const srgb = (hex: number) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  const white = srgb(0xf2f0e8), yellow = srgb(0xf0c65a);
  for (const r of w.roads) {
    const base = new THREE.Color().setRGB(...SURFACES[r.def.surface].color, THREE.SRGBColorSpace);
    if (r.def.surface === S.Asphalt) base.multiplyScalar(0.8);
    const dark = base.clone().multiplyScalar(0.78), hw = r.def.width / 2;
    ribbon(r, 0, hw, 0.06, (i) => (r.def.surface === S.Wood && i % 2 ? dark : base), mat);
    if (r.def.kind === 'highway') {
      ribbon(r, 0, 0.09, 0.075, () => white, paintMat, (i) => i % 4 > 1);          // dashed centre line
      for (const side of [1, -1]) ribbon(r, side * (hw - 0.45), 0.08, 0.075, () => white, paintMat); // solid edge lines
    } else if (r.def.kind === 'road') {
      ribbon(r, 0, 0.08, 0.075, () => yellow, paintMat, (i) => i % 4 > 1);
    }
  }
  return group;
}

/** Sea plus inland lakes. */
export function buildWater(w: WorldData): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4f9fb8, transparent: true, opacity: 0.82, roughness: 0.1, metalness: 0.05 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), mat);
  sea.rotation.x = -Math.PI / 2;
  g.add(sea);
  for (const lake of w.waters) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(lake.r * 1.15, 64), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(lake.x, lake.level, lake.z);
    g.add(m);
  }
  return g;
}

/** Subtle world-space grain so long road ribbons don't look flat. */
const GRAIN_PARS = `
varying vec2 vRoadXZ;
float rHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float rNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rHash(i), rHash(i + vec2(1, 0)), f.x), mix(rHash(i + vec2(0, 1)), rHash(i + vec2(1, 1)), f.x), f.y); }
`;
function addGrain(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRoadXZ;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRoadXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GRAIN_PARS}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.9 + 0.12 * rNoise(vRoadXZ * 0.35) + 0.08 * rNoise(vRoadXZ * 4.0);');
  };
  mat.customProgramCacheKey = () => 'road-grain-v1';
}
