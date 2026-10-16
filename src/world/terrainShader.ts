/** GLSL for the terrain: GPU height displacement (vertex) and per-surface procedural detail (fragment). */
export const TERRAIN_VERTEX_PARS = /* glsl */`
uniform sampler2D uHeight; uniform float uCell; uniform float uHalf; uniform int uN; uniform float uSkirtDepth;
attribute float aSkirt;
varying vec3 vWorld;
varying vec3 vTerrainN;
float hAt(ivec2 c) { c = clamp(c, ivec2(0), ivec2(uN)); return texelFetch(uHeight, c, 0).r; }
float terrainH(vec2 p) {
  vec2 g = clamp((p + uHalf) / uCell, vec2(0.0), vec2(float(uN) - 0.001));
  vec2 f = floor(g); vec2 t = g - f; ivec2 i = ivec2(f);
  return mix(mix(hAt(i), hAt(i + ivec2(1, 0)), t.x), mix(hAt(i + ivec2(0, 1)), hAt(i + ivec2(1, 1)), t.x), t.y);
}
`;

export const TERRAIN_BEGINNORMAL = /* glsl */`
vec2 tWorld = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xz;
float tE = uCell;
vec3 objectNormal = normalize(vec3(terrainH(tWorld - vec2(tE, 0.0)) - terrainH(tWorld + vec2(tE, 0.0)), 2.0 * tE,
  terrainH(tWorld - vec2(0.0, tE)) - terrainH(tWorld + vec2(0.0, tE))));
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(1.0, 0.0, 0.0);
#endif
`;

export const TERRAIN_BEGIN_VERTEX = /* glsl */`
vec3 transformed = vec3(position);
transformed.y = terrainH(tWorld) - aSkirt * uSkirtDepth;
vWorld = vec3(tWorld.x, transformed.y, tWorld.y);
vTerrainN = objectNormal;
`;

export const TERRAIN_FRAGMENT_PARS = /* glsl */`
uniform sampler2D uSurf; uniform float uCell; uniform float uHalf; uniform int uN;
uniform vec3 uSurfColor[12]; uniform float uRough[12];
varying vec3 vWorld;
varying vec3 vTerrainN;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
uniform sampler2D uNoise;
// Smooth (hermite) value noise from one fetch; textureGrad keeps mip selection continuous.
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return textureGrad(uNoise, (i + f + 0.5) * 0.00390625, dFdx(p) * 0.00390625, dFdy(p) * 0.00390625).r; }
float fbm2(vec2 p) { return vnoise(p) * 0.6 + vnoise(p * 2.13 + 37.0) * 0.3 + vnoise(p * 4.7 + 71.0) * 0.1; }
int surfAt(ivec2 c) { c = clamp(c, ivec2(0), ivec2(uN)); return int(texelFetch(uSurf, c, 0).r * 255.0 + 0.5); }

// Per-surface look. Returns colour; writes bump height (m) and roughness.
vec3 surfLook(int id, vec3 w, float detail, float n, float f, out float bump, out float rough) {
  vec3 c = uSurfColor[id]; rough = uRough[id]; bump = 0.0;
  if (id == 4) {            // grass: meadow patches, blades
    float patchy = fbm2(w.xz * 0.035);
    c *= mix(vec3(0.8, 0.9, 0.68), vec3(1.15, 1.08, 0.82), patchy) * (0.86 + 0.28 * f); bump = f * 0.04;
  } else if (id == 2) {     // gravel: grain
    float g = mix(0.5, vnoise(w.xz * 9.0), detail); c *= 0.72 + 0.56 * g; bump = g * 0.035;
  } else if (id == 3) {     // dirt: mottled
    c *= 0.78 + 0.42 * n * (0.8 + 0.4 * f); bump = n * 0.05;
  } else if (id == 5) {     // mud: dark, wet sheen
    c *= 0.68 + 0.38 * n; rough = 0.3 + 0.35 * f; bump = n * 0.05;
  } else if (id == 6) {     // sand: wind ripples
    float rip = sin(w.x * 1.25 + w.z * 0.55 + n * 7.0) * 0.5 + 0.5; c *= 0.9 + 0.14 * mix(0.5, rip, detail); bump = rip * 0.04 * detail;
  } else if (id == 7) {     // snow
    c *= 0.95 + 0.07 * n; bump = n * 0.03;
  } else if (id == 8) {     // ice: cracks
    float iv = vnoise(w.xz * 0.7) - 0.5, iw = max(0.035, fwidth(iv) * 1.5);
    float crack = (1.0 - smoothstep(0.0, iw, abs(iv))) * detail * clamp(0.035 / iw, 0.0, 1.0);
    c = mix(c, vec3(0.92, 0.98, 1.0), crack * 0.7); bump = -crack * 0.02;
  } else if (id == 9) {     // rock: strata and cracks
    // Anti-aliased: patterns fade out before they get finer than a pixel.
    float sv = w.y * 0.9 + n * 3.0, sAA = clamp(1.0 - fwidth(sv) * 0.5, 0.0, 1.0);
    float strata = mix(0.5, sin(sv) * 0.5 + 0.5, sAA);
    float cv = fbm2(w.xz * 0.55 + w.y * 0.3) - 0.5, cw = max(0.04, fwidth(cv) * 1.5);
    float crack = (1.0 - smoothstep(0.0, cw, abs(cv))) * detail * clamp(0.04 / cw, 0.0, 1.0);
    c *= (0.74 + 0.34 * strata) * (1.0 - crack * 0.4); bump = (strata * 0.1 - crack * 0.04) * sAA;
  } else if (id == 1) {     // cobble: offset stones
    vec2 q = w.xz * 1.6; q.x += floor(q.y) * 0.5;
    vec2 cell = fract(q) - 0.5;
    float stone = smoothstep(0.5, 0.36, max(abs(cell.x), abs(cell.y)));
    c *= 0.62 + 0.42 * stone * (0.8 + 0.4 * hash12(floor(q))); bump = stone * 0.05;
  } else if (id == 0) {     // asphalt
    c *= 0.86 + 0.22 * mix(0.5, vnoise(w.xz * 6.0), detail);
  } else {
    c *= 0.9 + 0.2 * n;
  }
  return c;
}

vec3 perturbN(vec3 pos, vec3 nrm, float h) {
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, nrm), r2 = cross(nrm, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * nrm - grad);
}
`;

export const TERRAIN_COLOR = /* glsl */`
float tDist = length(vViewPosition);
// Fade fine detail by its on-screen footprint (grazing walls, distance) so nothing aliases.
float tFoot = length(fwidth(vWorld));
float tDetail = smoothstep(260.0, 40.0, tDist) * smoothstep(0.55, 0.12, tFoot);
vec4 tj = texture(uNoise, vWorld.xz * 0.0018);
vec2 tg = (vWorld.xz + uHalf) / uCell + (tj.ba - 0.5) * 1.4;
vec2 tf = floor(tg); vec2 tt = smoothstep(0.3, 0.7, tg - tf); ivec2 ti = ivec2(tf);
int s00 = surfAt(ti), s10 = surfAt(ti + ivec2(1, 0)), s01 = surfAt(ti + ivec2(0, 1)), s11 = surfAt(ti + ivec2(1, 1));
float tBump, tRough, b1, r1;
// On steep faces, project patterns along the face instead of from above (no vertical streaks).
vec3 tN = normalize(vTerrainN);
float tSteepP = smoothstep(0.3, 0.6, 1.0 - abs(tN.y));
vec2 tq = mix(vWorld.xz, vec2(abs(tN.x) > abs(tN.z) ? vWorld.z : vWorld.x, vWorld.y * 1.3), tSteepP);
vec3 tW = vec3(tq.x, vWorld.y, tq.y);
float tn = fbm2(tq * 0.35), tfn = mix(0.5, vnoise(tq * 3.7), tDetail);
vec3 tCol = surfLook(s00, tW, tDetail, tn, tfn, tBump, tRough);
if (s10 != s00 || s01 != s00 || s11 != s00) {
  vec3 c10 = surfLook(s10, tW, tDetail, tn, tfn, b1, r1); float w10 = tt.x * (1.0 - tt.y);
  float w00 = (1.0 - tt.x) * (1.0 - tt.y);
  vec3 acc = tCol * w00 + c10 * w10; float bAcc = tBump * w00 + b1 * w10; float rAcc = tRough * w00 + r1 * w10;
  vec3 c01 = surfLook(s01, tW, tDetail, tn, tfn, b1, r1); float w01 = (1.0 - tt.x) * tt.y; acc += c01 * w01; bAcc += b1 * w01; rAcc += r1 * w01;
  vec3 c11 = surfLook(s11, tW, tDetail, tn, tfn, b1, r1); float w11 = tt.x * tt.y; acc += c11 * w11; bAcc += b1 * w11; rAcc += r1 * w11;
  tCol = acc; tBump = bAcc; tRough = rAcc;
}
// Steep faces read as rock even between rock cells.
float tSteep = smoothstep(0.38, 0.62, 1.0 - abs(tN.y));
if (tSteep > 0.0) { float bR, rR; vec3 rc = surfLook(9, tW, tDetail, tn, tfn, bR, rR); tCol = mix(tCol, rc, tSteep); tBump = mix(tBump, bR, tSteep); tRough = mix(tRough, rR, tSteep); }
diffuseColor.rgb = tCol;
`;
