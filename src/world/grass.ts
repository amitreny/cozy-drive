import * as THREE from 'three';
import { mulberry32 } from './noise';
import { S } from './surfaces';
import type { WorldData } from './terrainGen';

const GRASS_VERTEX_PARS = /* glsl */`
uniform sampler2D uHeight; uniform sampler2D uSurf; uniform float uCell; uniform float uHalf; uniform int uN;
uniform vec2 uCam; uniform float uRadius; uniform float uTime; uniform vec3 uCar;
attribute vec2 aOffset; attribute float aSeed; attribute float aTip;
varying vec3 vGrassColor;
float gH(vec2 p) {
  vec2 g = clamp((p + uHalf) / uCell, vec2(0.0), vec2(float(uN) - 0.001)); vec2 f = floor(g); vec2 t = g - f; ivec2 i = ivec2(f);
  return mix(mix(texelFetch(uHeight, i, 0).r, texelFetch(uHeight, i + ivec2(1, 0), 0).r, t.x), mix(texelFetch(uHeight, i + ivec2(0, 1), 0).r, texelFetch(uHeight, i + ivec2(1, 1), 0).r, t.x), t.y);
}
int gSurf(vec2 p) { ivec2 c = clamp(ivec2(floor((p + uHalf) / uCell + 0.5)), ivec2(0), ivec2(uN)); return int(texelFetch(uSurf, c, 0).r * 255.0 + 0.5); }
float gHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

const GRASS_BEGIN_VERTEX = /* glsl */`
// Each clump wraps around the camera on a torus, so world positions stay put as you drive.
float span = uRadius * 2.0;
vec2 wp = aOffset + floor((uCam - aOffset) / span + 0.5) * span;
float dist = distance(wp, uCam);
bool onGrass = gSurf(wp) == ${S.Grass};
float patchy = gHash(floor(wp / 9.0));
float hgt = (0.32 + 0.5 * aSeed) * (0.55 + 0.7 * patchy) * smoothstep(uRadius, uRadius * 0.6, dist) * (onGrass ? 1.0 : 0.0);
vec3 local = position;
float ang = aSeed * 6.2831;
local.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * local.xz;
local.y *= hgt;
// Wind: gusts travel across the meadow.
float gust = sin(uTime * 1.3 + wp.x * 0.11 + wp.y * 0.07) * 0.5 + 0.5;
vec2 sway = vec2(0.75, 0.35) * (0.08 + 0.18 * gust) * aTip * hgt;
// Bend away from the car.
vec2 away = wp - uCar.xz; float ad = length(away);
sway += (ad < 2.6 ? normalize(away + 0.001) * (2.6 - ad) * 0.35 * aTip : vec2(0.0));
local.y *= 1.0 - (ad < 2.6 ? (2.6 - ad) * 0.25 : 0.0);
vec3 transformed = vec3(wp.x + local.x + sway.x, gH(wp) + local.y - 0.03, wp.y + local.z + sway.y);
// Colours match the terrain's grass so blades melt into the ground.
vec3 base = mix(vec3(0.27, 0.45, 0.11), vec3(0.36, 0.42, 0.1), patchy);
vGrassColor = mix(base * 0.62, base * mix(1.15, 1.35, aSeed), aTip) * (0.9 + 0.2 * gHash(wp));
// A few clumps are wildflowers: coloured tips.
float flower = gHash(wp * 1.7 + 3.1);
if (flower > 0.965 && aTip > 0.9) vGrassColor = flower > 0.988 ? vec3(0.95, 0.92, 0.85) : flower > 0.977 ? vec3(0.95, 0.55, 0.7) : vec3(0.98, 0.8, 0.25);
`;

/** GPU meadow grass and wildflowers around the camera. */
export class Grass {
  readonly mesh: THREE.Mesh;
  private uniforms: Record<string, THREE.IUniform>;

  constructor(w: WorldData, heightTex: THREE.Texture, surfTex: THREE.Texture, radius = 40, spacing = 0.7) {
    // One clump: five tapered blades around a centre. aTip: 0 at the root, 1 at the tip.
    const pos: number[] = [], tip: number[] = [], idx: number[] = [];
    const rnd = mulberry32(5);
    for (let b = 0; b < 6; b++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 0.3, cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const ba = rnd() * Math.PI, wdt = 0.06 + rnd() * 0.04, h = 0.55 + rnd() * 0.45, lean = (rnd() - 0.5) * 0.35;
      const dx = Math.cos(ba) * wdt, dz = Math.sin(ba) * wdt, base = pos.length / 3;
      pos.push(cx - dx, 0, cz - dz, cx + dx, 0, cz + dz, cx + lean, h, cz + lean * 0.5);
      tip.push(0, 0, 1);
      idx.push(base, base + 1, base + 2);
    }
    const blade = new THREE.InstancedBufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    blade.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
    blade.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    blade.setIndex(idx);
    const g = Math.ceil((radius * 2) / spacing), count = g * g;
    const off = new Float32Array(count * 2), seed = new Float32Array(count);
    for (let z = 0, k = 0; z < g; z++) for (let x = 0; x < g; x++, k++) {
      off[k * 2] = (x + rnd() * 0.9) * spacing - radius; off[k * 2 + 1] = (z + rnd() * 0.9) * spacing - radius; seed[k] = rnd();
    }
    blade.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 2));
    blade.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    blade.instanceCount = count;
    this.uniforms = {
      uHeight: { value: heightTex }, uSurf: { value: surfTex }, uCell: { value: w.cell }, uHalf: { value: w.size / 2 }, uN: { value: w.n },
      uCam: { value: new THREE.Vector2() }, uRadius: { value: radius }, uTime: { value: 0 }, uCar: { value: new THREE.Vector3(1e6, 0, 1e6) },
    };
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${GRASS_VERTEX_PARS}`)
        .replace('#include <begin_vertex>', GRASS_BEGIN_VERTEX);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGrassColor;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vGrassColor;')
        // Light every blade like the ground it grows from (no dark back faces).
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);');
    };
    mat.customProgramCacheKey = () => 'grass-v3';
    this.mesh = new THREE.Mesh(blade, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
  }

  update(dt: number, cam: THREE.Vector3, car: THREE.Vector3): void {
    this.uniforms.uTime.value = (this.uniforms.uTime.value as number) + dt;
    (this.uniforms.uCam.value as THREE.Vector2).set(cam.x, cam.z);
    (this.uniforms.uCar.value as THREE.Vector3).copy(car);
  }
}
