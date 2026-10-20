import { AIRPORTS } from './airports';
import { ROADS, sampleRoad, type RoadDef } from './roads';
import { S } from './surfaces';

/** Access roads: from each airport, helipad or dock gate to the nearest point of the main road network. */
function accessRoads(): RoadDef[] {
  const pts: [number, number][] = [];
  for (const d of ROADS) { const s = sampleRoad(d); for (let i = 0; i < s.xs.length; i++) pts.push([s.xs[i], s.zs[i]]); }
  const out: RoadDef[] = [];
  for (const a of AIRPORTS) {
    if (!a.gate) continue;
    let best = Infinity, to: [number, number] = [0, 0];
    for (const p of pts) { const d = Math.hypot(p[0] - a.gate.x, p[1] - a.gate.z); if (d < best) { best = d; to = p; } }
    if (best < 8) continue; // already on a road
    // A gentle midpoint so the road doesn't meet the main road at a hard angle.
    const mx = (a.gate.x + to[0]) / 2, mz = (a.gate.z + to[1]) / 2;
    out.push({ name: `${a.name} Road`, kind: 'road', surface: S.Asphalt, width: 6, points: [[a.gate.x, a.gate.z], [mx, mz], to] });
  }
  return out;
}

/** Every road on the island: the main network, then airport access roads (which join it). */
export const NETWORK: RoadDef[] = [...ROADS, ...accessRoads()];
