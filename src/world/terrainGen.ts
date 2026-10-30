import { Perlin2 } from './noise';
import { AIRPORTS, along, inFillet, local, onPaving, type Rect } from './airports';
import { placeLots, type Lot } from './lots';
import { NETWORK } from './network';
import { limitGrade, MAX_GRADE, pinJunctions, sampleRoad, segDist, SMOOTHING, smoothProfile, type RoadPath } from './roads';
import { S, type SurfaceId } from './surfaces';

/** Bump when generation changes so cached worlds are rebuilt. */
export const WORLD_VERSION = 12;

export interface Water { x: number; z: number; r: number; level: number }
export interface WorldData {
  size: number; n: number; cell: number;            // n cells per side, (n+1)^2 samples
  heights: Float32Array; surface: Uint8Array;        // row-major: idx = iz * (n + 1) + ix
  roads: RoadPath[]; waters: Water[];
  spawn: { x: number; z: number; yaw: number };
  /** Homes and businesses (see lots.ts). */
  lots: Lot[];
  /** Keep-clear mask at CLEAR_CELL metres: runways, aprons, pads and gardens get no trees or rocks. */
  clear: Uint8Array;
}
export const CLEAR_CELL = 8;
export interface Regions { mountain: number; canyon: number; dunes: number; marsh: number; forest: number }

const ss = (e0: number, e1: number, v: number) => { const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const near = (x: number, z: number, cx: number, cz: number, inner: number, outer: number) => ss(outer, inner, Math.hypot(x - cx, z - cz));

// Layout of the 4 × 4 km island (+z north). See docs/02 for the regions.
export const PLAZA = { x: 0, z: -350, r: 24 };
export const POND = { x: 320, z: 1000, r: 55 }; // alpine tarn on the plateau east of the pass, seen from the summit
export const LAKE = { x: -1250, z: 540, r: 150 };
export const ISLAND_RADIUS = 1750;
/** Flat pad at the top of the Summit Road: the island's highest drivable point. */
export const SUMMIT = { r: 9, cut: 4 };

export function regionsAt(x: number, z: number): Regions {
  return {
    mountain: near(x, z, 200, 950, 220, 600), canyon: near(x, z, 1080, 230, 220, 560),
    dunes: near(x, z, 830, -1050, 180, 520), marsh: near(x, z, -950, -900, 180, 520), forest: near(x, z, -1150, 380, 280, 760),
  };
}

/** Natural terrain height before roads and flattening. */
export function makeBaseHeight(P: Perlin2): (x: number, z: number, lakeLevels?: Map<object, number>) => number {
  return (x, z, lakeLevels) => {
    const r = Math.hypot(x, z);
    if (r > ISLAND_RADIUS + 250) return -7;
    let land = 1;
    if (r > ISLAND_RADIUS - 420) {
      const coast = ISLAND_RADIUS + 150 * P.fbm(x * 0.0012 + 9, z * 0.0012 - 3, 3);
      land = ss(coast, coast - 300, r);
      if (land <= 0) return -7;
    }
    const R = regionsAt(x, z);
    let h = 9 + 16 * P.fbm(x * 0.0016, z * 0.0016, 4) + 3 * P.fbm(x * 0.009, z * 0.009, 2);
    if (R.forest > 0) h += R.forest * 22 * (0.5 + 0.5 * P.fbm(x * 0.004, z * 0.004, 3));
    if (R.mountain > 0) h += R.mountain * (40 + 230 * P.ridged(x * 0.0021 + 3, z * 0.0021, 5));
    if (h > 250) h = 250 + (h - 250) * 0.35; // round the highest peaks into domes the Summit Road can reach
    if (R.canyon > 0) {
      const t = (0.5 + 0.5 * P.fbm(x * 0.0028 + 40, z * 0.0028, 3)) * 4.5;
      const terr = Math.floor(t) + ss(0.82, 1, t - Math.floor(t));
      h += R.canyon * (terr * 15 + 2.5 * P.fbm(x * 0.03, z * 0.03, 2));
    }
    if (R.dunes > 0) h = h * (1 - R.dunes) + R.dunes * (4 + 12 * P.ridged(x * 0.009 + z * 0.003, z * 0.0055, 3));
    if (R.marsh > 0) h = h * (1 - R.marsh * 0.95) + R.marsh * 0.95 * (1.6 + 0.9 * P.fbm(x * 0.02, z * 0.02, 2));
    if (lakeLevels) for (const b of [POND, LAKE]) {
      const d = Math.hypot(x - b.x, z - b.z) / b.r;
      if (d < 1.6) { const w = ss(0.9, 1.6, d), lvl = lakeLevels.get(b) ?? 0; h = h * w + (1 - w) * (lvl - (d < 1 ? 3.5 * (1 - d * d) : 0)); }
    }
    return h * land + (1 - land) * -7;
  };
}

function classify(P: Perlin2, h: Float32Array, V: number, ix: number, iz: number, cell: number, x: number, z: number): SurfaceId {
  const i = iz * V + ix;
  const hx = h[Math.min(i + 1, h.length - 1)] - h[Math.max(i - 1, 0)];
  const hz = h[Math.min(i + V, h.length - 1)] - h[Math.max(i - V, 0)];
  const slope = Math.hypot(hx, hz) / (2 * cell);
  const y = h[i];
  if (y < 0.4) return S.Sand;
  if (slope > 0.75) return S.Rock;
  const n1 = P.fbm(x * 0.012 + 100, z * 0.012, 3);
  if (y > 165 + 18 * n1) return S.Snow;
  const R = regionsAt(x, z);
  if (y < 2.6 + 1.4 * n1 && R.marsh < 0.3) return S.Sand;
  if (R.dunes > 0.45) return S.Sand;
  if (R.canyon > 0.35) return slope > 0.35 || n1 > 0.15 ? S.Rock : S.Dirt;
  if (R.marsh > 0.35) return n1 > -0.12 ? S.Mud : S.Grass;
  if (R.mountain > 0.25 && y > 70) return n1 > 0.2 || slope > 0.55 ? S.Rock : slope > 0.4 ? S.Gravel : S.Grass;
  if (R.forest > 0.4 && n1 > 0.3) return S.Mud;
  return n1 > 0.4 ? S.Dirt : S.Grass;
}

export function generateWorld(seed = 7, size = 4096, cell = 2, onProgress?: (stage: string) => void): WorldData {
  const P = new Perlin2(seed), base = makeBaseHeight(P);
  const n = Math.round(size / cell), V = n + 1, half = size / 2;
  const heights = new Float32Array(V * V), surface = new Uint8Array(V * V);
  // Lake levels follow the surrounding terrain so the bowls sit naturally.
  const levels = new Map<object, number>();
  for (const b of [POND, LAKE]) { let s = 0; for (let a = 0; a < 8; a++) s += base(b.x + Math.cos(a) * b.r * 2, b.z + Math.sin(a) * b.r * 2); levels.set(b, s / 8 - 2); }

  onProgress?.('Shaping hills and mountains');
  for (let iz = 0; iz < V; iz++) for (let ix = 0; ix < V; ix++) heights[iz * V + ix] = base(ix * cell - half, iz * cell - half, levels);

  const plazaH = sampleGrid(heights, V, cell, half, PLAZA.x, PLAZA.z);
  forCells(n, cell, half, PLAZA.x, PLAZA.z, PLAZA.r + 14, (i, x, z) => {
    const w = ss(PLAZA.r + 14, PLAZA.r, Math.hypot(x - PLAZA.x, z - PLAZA.z));
    heights[i] = heights[i] * (1 - w) + plazaH * w;
  });

  onProgress?.('Levelling the airfields');
  const clear = new Uint8Array((size / CLEAR_CELL) ** 2);
  const markClear = (x: number, z: number) => { const cx = Math.floor((x + half) / CLEAR_CELL), cz = Math.floor((z + half) / CLEAR_CELL), N = size / CLEAR_CELL; if (cx >= 0 && cz >= 0 && cx < N && cz < N) clear[cz * N + cx] = 1; };
  const waterLevel = (x: number, z: number) => (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.2 ? levels.get(LAKE)! : Math.hypot(x - POND.x, z - POND.z) < POND.r * 1.2 ? levels.get(POND)! : 0);
  for (const ap of AIRPORTS) {
    if (ap.level.length) {
      // Fit a gentle plane (at most 0.8 % along the runway) to the ground under the levelled areas.
      const ref = ap.level[0];
      let n0 = 0, sa = 0, sh = 0, saa = 0, sah = 0;
      for (const r of ap.level) for (let a = -r.halfLen; a <= r.halfLen; a += 10) for (let c = -r.halfWid; c <= r.halfWid; c += 10) {
        const [x, z] = along(r, a, c), h = sampleGrid(heights, V, cell, half, x, z), la = local(ref, x, z)[0];
        n0++; sa += la; sh += h; saa += la * la; sah += la * h;
      }
      const ma = sa / n0, mh = sh / n0, k = Math.max(-0.008, Math.min(0.008, (sah - n0 * ma * mh) / Math.max(1, saa - n0 * ma * ma)));
      const plane = (x: number, z: number) => Math.max(2.5, mh + k * (local(ref, x, z)[0] - ma));
      const reach = Math.max(...ap.level.map((r) => Math.hypot(r.halfLen, r.halfWid))) + 60;
      forCells(n, cell, half, ref.cx, ref.cz, reach, (i, x, z) => {
        let w = 0;
        for (const r of ap.level) {
          const [a, c] = local(r, x, z), d = Math.hypot(Math.max(0, Math.abs(a) - r.halfLen), Math.max(0, Math.abs(c) - r.halfWid));
          w = Math.max(w, ss(50, 0, d));
          if (d < 8) markClear(x, z);
        }
        if (w > 0) heights[i] = heights[i] * (1 - w) + plane(x, z) * w;
      });
    }
    if (ap.pier) {
      // The pier's root sits on a little levelled landing just clear of the water.
      const { x0, z0 } = ap.pier, top = Math.max(sampleGrid(heights, V, cell, half, x0, z0), waterLevel(x0, z0) + 1.3);
      forCells(n, cell, half, x0, z0, 30, (i, x, z) => { const d = Math.hypot(x - x0, z - z0), w = ss(28, 12, d); if (w > 0) heights[i] = heights[i] * (1 - w) + top * w; if (d < 16) markClear(x, z); });
    }
  }

  onProgress?.('Laying roads and highways');
  const roads: RoadPath[] = [], rawProfiles: Float32Array[] = [];
  for (const def of NETWORK) {
    const { xs, zs } = sampleRoad(def);
    const raw = new Float32Array(xs.length);
    // Roads skirting the lake stay above its water (the water disc reaches 1.15 r); the margin leaves room to ramp up.
    const lakeFloor = (i: number) => (Math.hypot(xs[i] - LAKE.x, zs[i] - LAKE.z) < LAKE.r * 1.15 + def.width + 40 ? levels.get(LAKE)! + 0.7 : -Infinity);
    for (let i = 0; i < xs.length; i++) raw[i] = Math.max(sampleGrid(heights, V, cell, half, xs[i], zs[i]), def.kind === 'boardwalk' ? 1.9 : 2.2, lakeFloor(i));
    let hs = smoothProfile(raw, def.smoothing ?? SMOOTHING[def.kind], !!def.closed);
    for (let i = 0; i < hs.length; i++) hs[i] = Math.max(hs[i], lakeFloor(i));
    const pinned = pinJunctions(hs, xs, zs, roads, 60);
    // A summit road ends just below the peak (which becomes a small flat pad), however much it must climb.
    if (def.summit) {
      const last = hs.length - 1, top = raw[last] - SUMMIT.cut;
      // The last metres lie on the flat summit pad, so they are level too.
      for (let i = last; i >= 0 && Math.hypot(xs[i] - xs[last], zs[i] - zs[last]) < SUMMIT.r + 2; i--) { hs[i] = top; pinned.push(i); }
    }
    hs = limitGrade(hs, xs, zs, def.maxGrade ?? MAX_GRADE[def.kind], !!def.closed, pinned);
    roads.push({ def, xs, zs, hs });
    rawProfiles.push(raw);
  }
  // Paved cells take the closest road's height exactly. Bank cells blend every road that reaches them, weighted
  // towards the nearest, so stacked hairpin legs meet in one continuous slope instead of a stepped wall.
  const roadW = new Float32Array(V * V), roadD = new Float32Array(V * V).fill(Infinity), roadS = new Int8Array(V * V).fill(-1);
  const blendW = new Float32Array(V * V), blendH = new Float32Array(V * V);
  const verge = new Uint8Array(V * V); // a few metres either side of every road
  const carved = heights.slice();
  roads.forEach((r, ri) => {
    const hw = r.def.width / 2, base = r.def.kind === 'highway' ? 12 : 6, raw = rawProfiles[ri], bankMax = r.def.bankMax ?? 40;
    for (let i = 0; i < r.xs.length - 1; i++) {
      const ax = r.xs[i], az = r.zs[i], bx = r.xs[i + 1], bz = r.zs[i + 1];
      // Only visit as far as this segment's banks can reach: cut/fill depth at the centreline, plus margin for side slopes.
      const depth = Math.max(Math.abs(raw[i] - r.hs[i]), Math.abs(raw[i + 1] - r.hs[i + 1]));
      const reach = hw + 1.5 + Math.min(bankMax, base + (depth + 8) * 1.3);
      forCells(n, cell, half, (ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az) / 2 + reach, (k, x, z) => {
        const [d, t] = segDist(x, z, ax, az, bx, bz);
        if (d > reach) return;
        const hr = r.hs[i] + (r.hs[i + 1] - r.hs[i]) * t - 0.02;
        // Cuts and fills get banks of about 37°: the deeper the cut, the wider the blend.
        const bank = Math.min(bankMax, base + Math.abs(heights[k] - hr) * 1.3);
        if (d > hw + 1.5 + bank) return;
        // Open road ends don't carve a round cap past the end, so the road they join keeps its own profile.
        if (!r.def.closed && d > hw && ((i === 0 && t <= 0) || (i === r.xs.length - 2 && t >= 1))) return;
        if (d <= hw + 1.5) {
          // On a steep road the closest segment gives the height of the right spot.
          if (d < roadD[k]) { roadD[k] = d; carved[k] = hr; }
        } else {
          const w = ss(hw + 1.5 + bank, hw + 1.5, d), p = w * w * w * w;
          roadW[k] = Math.max(roadW[k], w); blendW[k] += p; blendH[k] += p * hr;
        }
        if (d <= hw + 0.5 && roadS[k] < 0) roadS[k] = r.def.surface;
        if (d <= hw + 3) verge[k] = 1;
      });
    }
  });
  for (let k = 0; k < V * V; k++) {
    if (roadD[k] === Infinity && blendW[k] > 0) carved[k] = heights[k] * (1 - roadW[k]) + (blendH[k] / blendW[k]) * roadW[k];
  }
  heights.set(carved);
  for (const r of roads) if (r.def.summit) {
    const last = r.xs.length - 1, cx = r.xs[last], cz = r.zs[last], top = r.hs[last];
    forCells(n, cell, half, cx, cz, SUMMIT.r + 10, (i, x, z) => {
      const w = ss(SUMMIT.r + 10, SUMMIT.r, Math.hypot(x - cx, z - cz));
      heights[i] = heights[i] * (1 - w) + top * w;
      if (w > 0.95) roadS[i] = S.Gravel;
    });
  }

  onProgress?.('Building homes and shops');
  const lots = placeLots(roads, { height: (x, z) => sampleGrid(heights, V, cell, half, x, z), water: waterLevel }, PLAZA);
  for (const l of lots) {
    const r = { cx: l.x, cz: l.z, dir: l.yaw };
    forCells(n, cell, half, l.x, l.z, Math.hypot(l.w, l.d) / 2 + 10, (i, x, z) => {
      const [a, c] = local(r, x, z), d = Math.hypot(Math.max(0, Math.abs(a) - (l.d / 2 + 2.5)), Math.max(0, Math.abs(c) - (l.w / 2 + 2.5)));
      if (d < 5) markClear(x, z);
      if (roadD[i] !== Infinity) return; // never lift or sink a road
      const w = ss(7, 0, d);
      if (w > 0) heights[i] = heights[i] * (1 - w) + l.y * w;
    });
  }

  onProgress?.('Painting grass, sand, rock and snow');
  for (let iz = 0; iz < V; iz++) for (let ix = 0; ix < V; ix++) {
    const i = iz * V + ix;
    surface[i] = roadS[i] >= 0 ? roadS[i] : classify(P, heights, V, ix, iz, cell, ix * cell - half, iz * cell - half);
    if (verge[i] && surface[i] === S.Snow) surface[i] = S.Gravel; // plowed, gritted verges on mountain roads
  }
  forCells(n, cell, half, PLAZA.x, PLAZA.z, PLAZA.r, (i, x, z) => { if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r) surface[i] = S.Cobble; });
  forCells(n, cell, half, POND.x, POND.z, POND.r, (i, x, z) => {
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r && roadS[i] < 0) { surface[i] = S.Ice; heights[i] = levels.get(POND)!; }
  });
  // Runways, aprons, taxiways and helipads.
  for (const ap of AIRPORTS) {
    const paint = (r: Rect, s: SurfaceId) =>
      forCells(n, cell, half, r.cx, r.cz, Math.hypot(r.halfLen, r.halfWid) + 2, (i, x, z) => { if (onPaving(r, x, z)) surface[i] = s; });
    if (ap.runway) paint(ap.runway, ap.runway.surface);
    for (const p of ap.paved) paint(p, S.Asphalt);
    for (const f of ap.fillets) {
      const [x0, z0] = along(f.frame, f.a + (f.ua * f.r) / 2, f.c + (f.vc * f.r) / 2);
      forCells(n, cell, half, x0, z0, f.r, (i, x, z) => { if (inFillet(f, x, z)) surface[i] = S.Asphalt; });
    }
  }
  const waters: Water[] = [{ ...LAKE, level: levels.get(LAKE)! }];
  return { size, n, cell, heights, surface, roads, waters, lots, clear, spawn: { x: PLAZA.x + 4, z: PLAZA.z - 12, yaw: Math.PI } };
}

function sampleGrid(h: Float32Array, V: number, cell: number, half: number, x: number, z: number): number {
  const fx = Math.max(0, Math.min(V - 1.001, (x + half) / cell)), fz = Math.max(0, Math.min(V - 1.001, (z + half) / cell));
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, i = iz * V + ix;
  return (h[i] * (1 - tx) + h[i + 1] * tx) * (1 - tz) + (h[i + V] * (1 - tx) + h[i + V + 1] * tx) * tz;
}

/** Visit every grid sample within radius r of (cx, cz). */
function forCells(n: number, cell: number, half: number, cx: number, cz: number, r: number, fn: (i: number, x: number, z: number) => void): void {
  const V = n + 1;
  const x0 = Math.max(0, Math.floor((cx - r + half) / cell)), x1 = Math.min(n, Math.ceil((cx + r + half) / cell));
  const z0 = Math.max(0, Math.floor((cz - r + half) / cell)), z1 = Math.min(n, Math.ceil((cz + r + half) / cell));
  for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) fn(iz * V + ix, ix * cell - half, iz * cell - half);
}

// ---- Runtime queries (physics, gameplay, rendering) ----
export const heightAt = (w: WorldData, x: number, z: number): number => sampleGrid(w.heights, w.n + 1, w.cell, w.size / 2, x, z);

export function surfaceAt(w: WorldData, x: number, z: number): SurfaceId {
  const V = w.n + 1, half = w.size / 2;
  const ix = Math.max(0, Math.min(w.n, Math.round((x + half) / w.cell))), iz = Math.max(0, Math.min(w.n, Math.round((z + half) / w.cell)));
  return w.surface[iz * V + ix] as SurfaceId;
}

/** Water surface height at (x, z): inland lakes, otherwise the sea at 0. */
export function waterLevelAt(w: WorldData, x: number, z: number): number {
  for (const b of w.waters) if (Math.hypot(x - b.x, z - b.z) < b.r * 1.15) return b.level;
  return 0;
}

/** Inside a runway, apron, pad or garden: no trees or rocks there. */
export function isClear(w: WorldData, x: number, z: number): boolean {
  const N = w.size / CLEAR_CELL, cx = Math.floor((x + w.size / 2) / CLEAR_CELL), cz = Math.floor((z + w.size / 2) / CLEAR_CELL);
  return cx >= 0 && cz >= 0 && cx < N && cz < N && w.clear[cz * N + cx] === 1;
}

export const isDry = (w: WorldData, x: number, z: number, margin = 0.3): boolean => heightAt(w, x, z) > waterLevelAt(w, x, z) + margin;
