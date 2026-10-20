import * as THREE from 'three';
import type { WorldData } from './terrainGen';

const WATER_PARS = /* glsl */`
uniform sampler2D uHeight; uniform float uCell; uniform float uHalf; uniform int uN; uniform float uTime;
varying vec3 vWaterW;
float wHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float wNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y); }
float groundH(vec2 p) {
  vec2 g = clamp((p + uHalf) / uCell, vec2(0.0), vec2(float(uN) - 0.001)); vec2 f = floor(g); vec2 t = g - f; ivec2 i = ivec2(f);
  float a = texelFetch(uHeight, i, 0).r, b = texelFetch(uHeight, i + ivec2(1, 0), 0).r, c = texelFetch(uHeight, i + ivec2(0, 1), 0).r, d = texelFetch(uHeight, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}
float waves(vec2 p) {
  return 0.5 * sin(p.x * 0.35 + uTime * 0.9) * sin(p.y * 0.28 + uTime * 0.7) + 0.35 * wNoise(p * 0.6 + uTime * 0.35) + 0.15 * wNoise(p * 2.1 - uTime * 0.6);
}
vec3 wPerturb(vec3 pos, vec3 nrm, float h) {
  vec3 sx = dFdx(pos), sy = dFdy(pos); vec3 r1 = cross(sy, nrm), r2 = cross(nrm, sx);
  float det = dot(sx, r1); vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * nrm - grad);
}
`;

/** Sea and lakes: depth-tinted from the terrain height texture, shoreline foam, gentle animated waves. */
export class Water {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  private uTime = { value: 0 };

  constructor(w: WorldData, heightTex: THREE.Texture) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2f7f99, roughness: 0.05, metalness: 0, transparent: true });
    mat.userData.envIntensity = 0.9;
    const uniforms = { uHeight: { value: heightTex }, uCell: { value: w.cell }, uHalf: { value: w.size / 2 }, uN: { value: w.n }, uTime: this.uTime };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWaterW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWaterW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${WATER_PARS}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float wDepth = vWaterW.y - groundH(vWaterW.xz);
          float wn = wNoise(vWaterW.xz * 0.35 + uTime * 0.2);
          vec3 shallow = vec3(0.28, 0.72, 0.68), deep = vec3(0.04, 0.22, 0.34);
          diffuseColor.rgb = mix(shallow, deep, smoothstep(0.2, 7.0, wDepth));
          float foamEdge = 1.0 - smoothstep(0.0, 0.5 + 0.35 * wn, wDepth);
          float foamRipple = smoothstep(0.55, 0.9, sin(wDepth * 9.0 - uTime * 1.4 + wn * 5.0) * 0.5 + 0.5) * (1.0 - smoothstep(0.3, 1.4, wDepth));
          float foam = clamp(foamEdge * 0.9 + foamRipple * 0.5, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.97, 0.96), foam);
          diffuseColor.a = clamp(0.35 + smoothstep(0.0, 2.5, wDepth) * 0.6 + foam * 0.5, 0.0, 0.96);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.04, 0.6, foam);')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          float wFade = 1.0 - smoothstep(60.0, 400.0, length(vViewPosition));
          normal = wPerturb(-vViewPosition, normal, waves(vWaterW.xz) * 0.08 * wFade);`);
    };
    mat.customProgramCacheKey = () => 'water-v1';
    this.material = mat;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), mat);
    sea.rotation.x = -Math.PI / 2;
    sea.receiveShadow = true;
    this.group.add(sea);
    for (const lake of w.waters) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(lake.r * 1.15, 96), mat);
      m.rotation.x = -Math.PI / 2; m.position.set(lake.x, lake.level, lake.z);
      this.group.add(m);
    }
  }

  update(dt: number, env: THREE.Texture | null): void {
    this.uTime.value += dt;
    if (env && this.material.envMap !== env) { this.material.envMap = env; this.material.envMapIntensity = 0.9; this.material.needsUpdate = true; }
  }
}
