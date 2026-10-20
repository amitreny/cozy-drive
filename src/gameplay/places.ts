import { mulberry32 } from '../world/noise';
import { S } from '../world/surfaces';
import { heightAt, isDry, PLAZA, regionsAt, surfaceAt, type WorldData } from '../world/terrainGen';
import type { RoadPath } from '../world/roads';

export interface Place { id: string; x: number; y: number; z: number }
export interface Viewpoint extends Place { name: string; yaw: number }

const PAVED = new Set<number>([S.Asphalt, S.Gravel, S.Wood, S.Cobble]);

/** ~60 garden gnomes tucked 12–40 m off the roads, spread out, on dry, gentle ground. Deterministic. */
export function placeGnomes(w: WorldData, count = 60, seed = 21): Place[] {
  const rnd = mulberry32(seed), out: Place[] = [];
  const candidates: { x: number; z: number }[] = [];
  for (const r of w.roads) {
    for (let i = 10; i < r.xs.length - 10; i += 23) {
      const dx = r.xs[i + 1] - r.xs[i - 1], dz = r.zs[i + 1] - r.zs[i - 1], l = Math.hypot(dx, dz) || 1;
      const side = rnd() < 0.5 ? 1 : -1, off = 12 + rnd() * 28;
      candidates.push({ x: r.xs[i] - (dz / l) * off * side, z: r.zs[i] + (dx / l) * off * side });
    }
  }
  // Shuffle, then greedily keep well-spaced, sensible spots.
  for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
  for (const c of candidates) {
    if (out.length >= count) break;
    if (!isDry(w, c.x, c.z, 0.8) || PAVED.has(surfaceAt(w, c.x, c.z))) continue;
    if (Math.hypot(c.x - PLAZA.x, c.z - PLAZA.z) < 60) continue;
    const slope = Math.abs(heightAt(w, c.x + 2, c.z) - heightAt(w, c.x - 2, c.z)) / 4 + Math.abs(heightAt(w, c.x, c.z + 2) - heightAt(w, c.x, c.z - 2)) / 4;
    if (slope > 0.35) continue;
    if (out.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 140)) continue;
    out.push({ id: `gnome-${out.length}`, x: c.x, y: heightAt(w, c.x, c.z), z: c.z });
  }
  return out;
}

const roadByName = (w: WorldData, name: string): RoadPath => w.roads.find((r) => r.def.name === name)!;

/** Scenic viewpoints, derived from the road network so they always sit beside a road with a view. */
export function placeViewpoints(w: WorldData): Viewpoint[] {
  /** Best open view from (x, z): direction and how much the land drops away (metres, summed). */
  // A real vista is wide (neighbouring directions open too) and not just looking along the road.
  const vista = (x: number, z: number, roadYaw?: number): [number, number] => {
    const y = heightAt(w, x, z), K = 24, drops: number[] = [];
    for (let k = 0; k < K; k++) {
      const a = (k / K) * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
      let drop = 0, blocked = false;
      for (const d of [40, 80, 150, 250, 400]) { const h = heightAt(w, x + sx * d, z + sz * d); drop += y - h; if (h > y + d * 0.12) blocked = true; }
      drops.push(blocked ? -Infinity : drop);
    }
    let best = -Infinity, yaw = 0;
    for (let k = 0; k < K; k++) {
      const a = (k / K) * Math.PI * 2;
      if (roadYaw !== undefined && Math.abs(Math.sin(a - roadYaw)) < 0.55) continue; // along the road: not a view
      const wide = Math.min(drops[k], drops[(k + 1) % K], drops[(k + K - 1) % K]);
      if (wide > best) { best = wide; yaw = a; }
    }
    return [yaw, best];
  };
  const pick = (id: string, name: string, road: string | ((x: number, z: number) => boolean), score: (x: number, z: number, h: number) => number): Viewpoint => {
    // A road name, or a filter over every road (pick the best spot in a whole region).
    if (typeof road !== 'string') {
      let bestVp: Viewpoint | null = null, bestS = -Infinity;
      for (const r of w.roads) {
        const ok = r.xs.some((x, i) => road(x, r.zs[i]));
        if (!ok) continue;
        if (!r.xs.some((x, i) => road(x, r.zs[i]) && far(x, r.zs[i]))) continue;
        const vp = pickOn(r, id, name, (x, z, h) => (road(x, z) ? score(x, z, h) : -1e9));
        const s2 = score(vp.x, vp.z, vp.y) * 0.5 + Math.min(600, Math.max(0, vista(vp.x, vp.z)[1]));
        if (road(vp.x, vp.z) && s2 > bestS) { bestS = s2; bestVp = vp; }
      }
      placed.push(bestVp!);
      return bestVp!;
    }
    const vp = pickOn(roadByName(w, road), id, name, score);
    placed.push(vp);
    return vp;
  };
  const placed: Viewpoint[] = [];
  const far = (x: number, z: number) => placed.every((p) => Math.hypot(p.x - x, p.z - z) > 500);
  const pickOn = (r: RoadPath, id: string, name: string, score0: (x: number, z: number, h: number) => number): Viewpoint => {
    const score = (x: number, z: number, h: number) => (far(x, z) ? score0(x, z, h) : -1e9);
    // Prefer spots that score well *and* have an open vista (no point in a viewpoint inside a cutting).
    const raw: number[] = [];
    for (let i = 0; i < r.xs.length; i++) raw.push(score(r.xs[i], r.zs[i], r.hs[i]));
    const valid = raw.filter((v) => v > -1e8), lo = Math.min(...valid), hi = Math.max(...valid);
    let best = 2, bestS = -Infinity, bestYaw = 0;
    for (let i = 2; i < r.xs.length - 2; i += 3) {
      const [yaw, drop] = vista(r.xs[i], r.zs[i], Math.atan2(r.xs[i + 1] - r.xs[i - 1], r.zs[i + 1] - r.zs[i - 1]));
      if (drop === -Infinity || raw[i] < -1e8) continue;
      const s = (raw[i] - lo) / (hi - lo || 1) + Math.min(1, drop / 400);
      if (s > bestS) { bestS = s; best = i; bestYaw = yaw; }
    }
    const rx = r.xs[best], rz = r.zs[best], ry = heightAt(w, rx, rz);
    // Marker on the road shoulder, on the vista side.
    const off = r.def.width / 2 + 2.5, x = rx + Math.sin(bestYaw) * off, z = rz + Math.cos(bestYaw) * off;
    return { id, name, x, y: Math.max(heightAt(w, x, z), ry - 0.5), z, yaw: bestYaw };
  };
  // Coast first (most constrained), then inland spots, each keeping 500 m from the others.
  const north = pick('vp-north', 'Northern Shore', 'Coastal Highway', (_x, z) => z);
  const east = pick('vp-east', 'Lighthouse Point', 'Coastal Highway', (x) => x);
  const west = pick('vp-west', 'Sunset Cliffs', 'Coastal Highway', (x) => -x);
  const mountain = pick('vp-mountain', 'Valley Lookout', (x, z) => regionsAt(x, z).mountain > 0.15, (_x, _z, h) => h);
  const canyon = pick('vp-canyon', 'Canyon Rim', 'Canyon Track', (_x, _z, h) => h);
  const dunes = pick('vp-dunes', 'Dune Crest', 'Dune Trail', (_x, _z, h) => h);
  const lake = pick('vp-lake', 'Lakeside', 'Forest Track', (x, z) => -Math.hypot(x - w.waters[0].x, z - w.waters[0].z));
  const marsh = pick('vp-marsh', 'Boardwalk End', 'Boardwalk', (x) => -x);
  // Off-road reward: a high, fairly gentle spot in the mountains with a wide view. Needs a capable 4×4.
  let summit: Viewpoint | null = null, bestS = -Infinity;
  for (let x = -600; x <= 1000; x += 16) for (let z = 500; z <= 1500; z += 16) {
    if (regionsAt(x, z).mountain < 0.5 || !far(x, z) || !isDry(w, x, z, 1)) continue;
    const h = heightAt(w, x, z), slope = Math.hypot(heightAt(w, x + 3, z) - heightAt(w, x - 3, z), heightAt(w, x, z + 3) - heightAt(w, x, z - 3)) / 6;
    if (slope > 0.3) continue;
    const [yaw, drop] = vista(x, z);
    if (drop === -Infinity) continue;
    const s = h + Math.min(600, drop) * 0.3;
    if (s > bestS) { bestS = s; summit = { id: 'vp-summit', name: 'Summit Cairn', x, y: h, z, yaw }; }
  }
  if (summit) placed.push(summit);
  return [mountain, canyon, dunes, lake, marsh, east, west, north, ...(summit ? [summit] : [])];
}
