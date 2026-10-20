import * as THREE from 'three';
import { mulberry32 } from './noise';
import { SURFACES } from './surfaces';
import type { WorldData } from './terrainGen';
import { TERRAIN_BEGIN_VERTEX, TERRAIN_BEGINNORMAL, TERRAIN_COLOR, TERRAIN_FRAGMENT_PARS, TERRAIN_VERTEX_PARS } from './terrainShader';

const CHUNK = 128;
/** Vertex spacing and the distance (from chunk centre) up to which each level is used. */
const LODS = [{ spacing: 2, dist: 240 }, { spacing: 4, dist: 560 }, { spacing: 8, dist: 1300 }, { spacing: 16, dist: Infinity }];

/** Flat CHUNK×CHUNK grid with a skirt ring (aSkirt = 1) that hangs down to hide LOD cracks. */
function chunkGeometry(spacing: number): THREE.BufferGeometry {
  const m = CHUNK / spacing + 1;
  const pos: number[] = [], skirt: number[] = [], idx: number[] = [];
  for (let z = 0; z < m; z++) for (let x = 0; x < m; x++) { pos.push(x * spacing, 0, z * spacing); skirt.push(0); }
  for (let z = 0; z < m - 1; z++) for (let x = 0; x < m - 1; x++) {
    const a = z * m + x, b = a + 1, c = a + m, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const edge: number[] = [];
  for (let x = 0; x < m; x++) edge.push(x);
  for (let z = 1; z < m; z++) edge.push(z * m + m - 1);
  for (let x = m - 2; x >= 0; x--) edge.push((m - 1) * m + x);
  for (let z = m - 2; z > 0; z--) edge.push(z * m);
  edge.push(0);
  const base = pos.length / 3;
  edge.forEach((v) => { pos.push(pos[v * 3], 0, pos[v * 3 + 2]); skirt.push(1); });
  for (let k = 0; k < edge.length - 1; k++) {
    const a = edge[k], b = edge[k + 1], as = base + k, bs = base + k + 1;
    idx.push(a, b, as, b, bs, as);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSkirt', new THREE.Float32BufferAttribute(skirt, 1));
  g.setIndex(idx);
  return g;
}

export class TerrainRenderer {
  readonly group = new THREE.Group();
  /** Shared with water, grass and anything else that needs the ground height or surface on the GPU. */
  readonly heightTex: THREE.DataTexture;
  readonly surfTex: THREE.DataTexture;
  private meshes: THREE.InstancedMesh[] = [];
  private lastX = Infinity; private lastZ = Infinity;
  private per: number; private half: number;

  constructor(w: WorldData) {
    const V = w.n + 1;
    this.per = w.size / CHUNK; this.half = w.size / 2;
    const heightTex = new THREE.DataTexture(w.heights, V, V, THREE.RedFormat, THREE.FloatType);
    const surfTex = new THREE.DataTexture(w.surface, V, V, THREE.RedFormat, THREE.UnsignedByteType);
    this.heightTex = heightTex; this.surfTex = surfTex;
    for (const t of [heightTex, surfTex]) { t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true; }
    // Tiling 256² RGBA noise; value noise becomes one filtered texture fetch.
    const rnd = mulberry32(99), noise = new Uint8Array(256 * 256 * 4);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.floor(rnd() * 256);
    const noiseTex = new THREE.DataTexture(noise, 256, 256, THREE.RGBAFormat);
    noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
    noiseTex.magFilter = THREE.LinearFilter; noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
    noiseTex.generateMipmaps = true; noiseTex.needsUpdate = true;
    const uniforms = {
      uNoise: { value: noiseTex },
      uHeight: { value: heightTex }, uSurf: { value: surfTex }, uCell: { value: w.cell }, uHalf: { value: this.half }, uN: { value: w.n },
      uSkirtDepth: { value: 6 },
      uSurfColor: { value: SURFACES.map((s) => new THREE.Color().setRGB(s.color[0], s.color[1], s.color[2], THREE.SRGBColorSpace)) },
      uRough: { value: SURFACES.map((s) => (s.name === 'Ice' ? 0.15 : s.name === 'Snow' ? 0.7 : s.name === 'Mud' ? 0.45 : 0.95)) },
    };
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${TERRAIN_VERTEX_PARS}`)
        .replace('#include <beginnormal_vertex>', TERRAIN_BEGINNORMAL)
        .replace('#include <begin_vertex>', TERRAIN_BEGIN_VERTEX);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${TERRAIN_FRAGMENT_PARS}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${TERRAIN_COLOR}`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = perturbN(-vViewPosition, normal, tBump * tDetail * (1.0 - tSteepP) * smoothstep(90.0, 15.0, tDist));');
    };
    mat.customProgramCacheKey = () => 'terrain-v7';
    const total = this.per * this.per;
    for (const lod of LODS) {
      const mesh = new THREE.InstancedMesh(chunkGeometry(lod.spacing), mat, total);
      mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false;
      this.meshes.push(mesh); this.group.add(mesh);
    }
    this.group.name = 'terrain';
  }

  /** Re-pick each chunk's level of detail when the camera has moved a little. */
  update(cam: THREE.Vector3): void {
    if (Math.hypot(cam.x - this.lastX, cam.z - this.lastZ) < 12) return;
    this.lastX = cam.x; this.lastZ = cam.z;
    const counts = this.meshes.map(() => 0), m4 = new THREE.Matrix4();
    for (let cz = 0; cz < this.per; cz++) for (let cx = 0; cx < this.per; cx++) {
      const x0 = cx * CHUNK - this.half, z0 = cz * CHUNK - this.half;
      const d = Math.hypot(x0 + CHUNK / 2 - cam.x, z0 + CHUNK / 2 - cam.z);
      const l = LODS.findIndex((lod) => d < lod.dist);
      m4.makeTranslation(x0, 0, z0);
      this.meshes[l].setMatrixAt(counts[l]++, m4);
    }
    this.meshes.forEach((m, i) => { m.count = counts[i]; m.instanceMatrix.needsUpdate = true; });
  }
}
