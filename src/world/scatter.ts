import type RAPIER from '@dimforge/rapier3d-compat';
import { hash2 } from './noise';
import { S, type SurfaceId } from './surfaces';
import { heightAt, isDry, PLAZA, regionsAt, surfaceAt, type WorldData } from './terrainGen';

export const KINDS = ['pine', 'round', 'bush', 'rock'] as const;
export const PINE = 0, ROUND = 1, BUSH = 2, ROCK = 3;
/** Struct-of-arrays so it can cross a worker boundary and be cached. */
export interface Scatter { count: number; kind: Uint8Array; x: Float32Array; y: Float32Array; z: Float32Array; s: Float32Array; rot: Float32Array; tint: Float32Array }
const PAVED = new Set<SurfaceId>([S.Asphalt, S.Gravel, S.Wood, S.Cobble, S.Ice]);

/** Deterministic vegetation and rocks from rules (docs/05: generated, never downloaded). */
export function scatter(w: WorldData, spacing = 6): Scatter {
  const kind: number[] = [], x: number[] = [], y: number[] = [], z: number[] = [], s: number[] = [], rot: number[] = [], tint: number[] = [];
  const half = w.size / 2 - 20;
  for (let gz = -half; gz < half; gz += spacing) for (let gx = -half; gx < half; gx += spacing) {
    const ix = Math.round(gx / spacing), iz = Math.round(gz / spacing);
    const r3 = hash2(ix, iz, 13);
    if (r3 > 0.6) continue; // cheap early-out: no rule places anything above 0.56
    const px = gx + (hash2(ix, iz, 11) - 0.5) * spacing * 0.9, pz = gz + (hash2(ix, iz, 12) - 0.5) * spacing * 0.9;
    if (!isDry(w, px, pz, 0.8) || Math.hypot(px - PLAZA.x, pz - PLAZA.z) < PLAZA.r + 12) continue;
    const su = surfaceAt(w, px, pz);
    if (PAVED.has(su)) continue;
    let nearRoad = false;
    for (const [ox, oz] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) if (PAVED.has(surfaceAt(w, px + ox, pz + oz))) { nearRoad = true; break; }
    if (nearRoad) continue;
    const h = heightAt(w, px, pz), R = regionsAt(px, pz);
    let k = -1;
    if (su === S.Rock || (R.canyon > 0.4 && su === S.Dirt)) k = r3 < 0.05 ? ROCK : -1;
    else if (su === S.Snow) k = r3 < 0.05 ? PINE : r3 < 0.07 ? ROCK : -1;
    else if (su === S.Grass || su === S.Mud || su === S.Dirt) {
      if (R.forest > 0.35 || (R.mountain > 0.25 && h > 50)) k = r3 < 0.42 ? PINE : r3 < 0.5 ? ROUND : r3 < 0.56 ? BUSH : -1;
      else if (R.marsh > 0.4) k = r3 < 0.04 ? ROUND : r3 < 0.12 ? BUSH : -1;
      else k = r3 < 0.03 ? ROUND : r3 < 0.042 ? PINE : r3 < 0.07 ? BUSH : -1;
    } else if (su === S.Sand && R.dunes < 0.3 && h > 1.5) k = r3 < 0.012 ? BUSH : -1;
    if (k < 0) continue;
    kind.push(k); x.push(px); y.push(h); z.push(pz);
    s.push(0.75 + 0.6 * hash2(ix, iz, 14)); rot.push(hash2(ix, iz, 15) * Math.PI * 2); tint.push(hash2(ix, iz, 16));
  }
  return { count: kind.length, kind: Uint8Array.from(kind), x: Float32Array.from(x), y: Float32Array.from(y), z: Float32Array.from(z), s: Float32Array.from(s), rot: Float32Array.from(rot), tint: Float32Array.from(tint) };
}

/** Index props by 128 m physics chunk so colliders can stream in and out. */
export function propsByChunk(sc: Scatter, size: number, chunk = 128): Map<number, number[]> {
  const m = new Map<number, number[]>(), per = size / chunk, half = size / 2;
  for (let i = 0; i < sc.count; i++) {
    if (sc.kind[i] === BUSH) continue; // bushes are soft
    const key = Math.floor((sc.z[i] + half) / chunk) * per + Math.floor((sc.x[i] + half) / chunk);
    (m.get(key) ?? m.set(key, []).get(key)!).push(i);
  }
  return m;
}

export function propCollider(R: typeof RAPIER, sc: Scatter, i: number): RAPIER.ColliderDesc {
  const s = sc.s[i];
  return (sc.kind[i] === ROCK ? R.ColliderDesc.ball(1.0 * s).setTranslation(sc.x[i], sc.y[i] + 0.15, sc.z[i])
    : R.ColliderDesc.cylinder(1.5 * s, 0.3 * s).setTranslation(sc.x[i], sc.y[i] + 1.4 * s, sc.z[i])).setFriction(0.6);
}

