import { S, type SurfaceId } from './surfaces';

export type RoadKind = 'highway' | 'road' | 'track' | 'boardwalk';
export interface RoadDef {
  name: string; kind: RoadKind; surface: SurfaceId; width: number; closed?: boolean; points: [number, number][];
  /** Overrides for the kind's grade limit and profile smoothing (mountain roads climb harder and follow the hairpins). */
  maxGrade?: number; smoothing?: number;
  /** Widest cut/fill bank in metres (default 40). Wider banks turn deep mountain cuts into broad saddles instead of canyons. */
  bankMax?: number;
  /** The road ends on a summit: its last point is pinned near the peak so the profile has to climb all the way up. */
  summit?: boolean;
}

/** Max grade (rise/run) per road kind: highways are gentle, trails can be steep. */
export const MAX_GRADE: Record<RoadKind, number> = { highway: 0.06, road: 0.1, track: 0.17, boardwalk: 0.02 };
/** Profile smoothing radius in samples (~3 m each). */
export const SMOOTHING: Record<RoadKind, number> = { highway: 30, road: 12, track: 8, boardwalk: 3 };

/**
 * Summit Road: from the Village Road up the south-west flank in a stack of wide hairpins, a second stack up the
 * summit shoulder, then a loop round the summit dome. Laid out with a grade-line solver over the generated terrain
 * (legs follow the contours at ~9.5 %), so it is literal data; regenerate it if the mountain changes.
 */
const SUMMIT_ROAD: [number, number][] = [
  [190, 387], [110, 425], [20, 455], [-60, 480], [-66, 494], [-72, 509], [-79, 523], [-88, 534], [-98, 543], [-109, 552],
  [-119, 562], [-128, 573], [-137, 584], [-147, 595], [-156, 605], [-165, 616], [-170, 624], [-174, 632], [-171, 641], [-163, 645],
  [-154, 642], [-142, 636], [-133, 625], [-123, 614], [-114, 604], [-105, 593], [-96, 582], [-83, 575], [-68, 571], [-55, 565],
  [-42, 558], [-30, 551], [-18, 543], [-5, 537], [7, 530], [21, 524], [30, 522], [38, 526], [40, 535], [36, 543],
  [26, 553], [14, 560], [1, 566], [-11, 574], [-23, 581], [-36, 588], [-47, 597], [-57, 606], [-66, 617], [-77, 625],
  [-89, 633], [-100, 642], [-109, 653], [-118, 664], [-125, 677], [-130, 685], [-127, 694], [-119, 698], [-110, 695], [-98, 687],
  [-90, 676], [-81, 665], [-70, 656], [-58, 648], [-47, 640], [-38, 629], [-27, 620], [-16, 611], [-4, 604], [11, 600],
  [26, 596], [41, 593], [57, 589], [72, 585], [81, 583], [89, 587], [92, 596], [87, 604], [76, 612], [61, 616],
  [46, 619], [30, 623], [17, 629], [4, 636], [-8, 643], [-18, 652], [-28, 663], [-39, 671], [-50, 679], [-60, 690],
  [-67, 703], [-75, 715], [-83, 727], [-90, 740], [-95, 755], [-101, 769], [-109, 781], [-117, 792], [-125, 804], [-126, 806],
  [-130, 814], [-126, 821], [-119, 825], [-111, 821], [-99, 813], [-91, 802], [-82, 790], [-76, 776], [-72, 762], [-65, 748],
  [-60, 734], [-53, 721], [-48, 714], [-40, 711], [-33, 714], [-29, 722], [-33, 730], [-37, 745], [-44, 758], [-49, 772],
  [-56, 786], [-61, 800], [-67, 814], [-75, 826], [-80, 840], [-83, 849], [-86, 857], [-83, 864], [-75, 868], [-68, 864],
  [-56, 856], [-51, 841], [-43, 830], [-37, 816], [-30, 803], [-25, 788], [-20, 773], [-13, 760], [-10, 752], [-3, 749],
  [5, 752], [8, 760], [5, 768], [2, 785], [-3, 799], [-8, 814], [-12, 829], [-17, 844], [-22, 859], [-27, 874],
  [-32, 888], [-35, 897], [-58, 912], [-72, 940], [-68, 975], [-42, 1002], [0, 1012], [40, 1000], [62, 968], [56, 932],
  [30, 912], [8, 922], [0, 940], [4, 956],
];

/** Road network for the 4 × 4 km island (+z is north). Earlier roads in the list win at junctions. */
export const ROADS: RoadDef[] = [
  { name: 'Coastal Highway', kind: 'highway', surface: S.Asphalt, width: 11, closed: true, points: [
    [0, -1420], [600, -1300], [1050, -1000], [1380, -500], [1450, 100], [1350, 650], [1000, 1100], [500, 1380],
    [-150, 1450], [-750, 1300], [-1200, 950], [-1450, 400], [-1400, -250], [-1100, -800], [-600, -1250]] },
  { name: 'Cross-Island Highway', kind: 'highway', surface: S.Asphalt, width: 10, points: [
    [-1400, -250], [-800, -430], [-250, -540], [300, -500], [800, -300], [1150, -380], [1380, -500]] },
  { name: 'Village Road', kind: 'road', surface: S.Asphalt, width: 7, points: [[-250, -540], [-120, -450], [0, -374], [0, -326], [40, -100], [150, 250], [250, 600]] },
  { name: 'Pass Road', kind: 'track', surface: S.Gravel, width: 5.5, points: [[250, 600], [380, 780], [220, 900], [150, 1060], [320, 1180], [500, 1380]] },
  { name: 'Canyon Track', kind: 'track', surface: S.Dirt, width: 5, points: [[800, -300], [980, -20], [1120, 230], [1260, 430], [1350, 650]] },
  { name: 'Dune Trail', kind: 'track', surface: S.Dirt, width: 4.5, points: [[300, -500], [560, -780], [820, -1020], [1050, -1000]] },
  { name: 'Marsh Trail', kind: 'track', surface: S.Dirt, width: 4.5, points: [[-800, -430], [-880, -680], [-950, -880]] },
  { name: 'Boardwalk', kind: 'boardwalk', surface: S.Wood, width: 3.5, points: [[-950, -880], [-1020, -960], [-1100, -1000], [-1180, -985]] },
  { name: 'Summit Road', kind: 'road', surface: S.Asphalt, width: 6.5, maxGrade: 0.12, smoothing: 8, bankMax: 85, summit: true, points: SUMMIT_ROAD },
  { name: 'Forest Track', kind: 'track', surface: S.Gravel, width: 5, points: [[-1450, 400], [-1250, 330], [-1060, 370], [-960, 550], [-1010, 760], [-1200, 950]] },
];

export interface RoadPath { def: RoadDef; xs: Float32Array; zs: Float32Array; hs: Float32Array }

/** Catmull-Rom sample of a road every ~step metres. */
export function sampleRoad(def: RoadDef, step = 3): { xs: Float32Array; zs: Float32Array } {
  const p = def.points;
  const n = p.length;
  const segs = def.closed ? n : n - 1;
  const get = (i: number) => (def.closed ? p[((i % n) + n) % n] : p[Math.max(0, Math.min(n - 1, i))]);
  const xs: number[] = [], zs: number[] = [];
  for (let s = 0; s < segs; s++) {
    const p0 = get(s - 1), p1 = get(s), p2 = get(s + 1), p3 = get(s + 2);
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const count = Math.max(2, Math.ceil(segLen / step));
    for (let k = 0; k < count; k++) {
      const t = k / count, t2 = t * t, t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      xs.push(cr(p0[0], p1[0], p2[0], p3[0]));
      zs.push(cr(p0[1], p1[1], p2[1], p3[1]));
    }
  }
  if (def.closed) { xs.push(xs[0]); zs.push(zs[0]); } else { xs.push(p[n - 1][0]); zs.push(p[n - 1][1]); }
  return { xs: Float32Array.from(xs), zs: Float32Array.from(zs) };
}

/** Moving-average smoothing so roads get gentle grades (cuts and fills happen when carving). */
export function smoothProfile(h: Float32Array, radius: number, closed: boolean): Float32Array {
  const n = h.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let k = -radius; k <= radius; k++) {
      let j = i + k;
      if (closed) j = ((j % (n - 1)) + (n - 1)) % (n - 1);
      else if (j < 0 || j >= n) continue;
      sum += h[j]; cnt++;
    }
    out[i] = sum / cnt;
  }
  return out;
}

/** Distance from point to segment, plus the 0..1 parameter along it. */
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): [number, number] {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [Math.hypot(px - (ax + dx * t), pz - (az + dz * t)), t];
}

/** Clamp the profile so no stretch is steeper than maxGrade (rise/run). Cuts ridges, fills dips. */
/** Locked indices (junctions) keep their height; everything else bends to fit. */
/** Hairpins are flattened (about two thirds of the grade at a 9 m radius), so cars don't spin up the steep inside line. */
export function limitGrade(h: Float32Array, xs: Float32Array, zs: Float32Array, maxGrade: number, closed: boolean, locked: number[] = []): Float32Array {
  const lock = new Set(locked);
  const out = h.slice(), n = out.length;
  const d = (i: number) => Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  const gr = bendGrades(xs, zs, maxGrade);
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 1; i < n; i++) { if (lock.has(i)) continue; const g = gr[i] * d(i); out[i] = Math.min(Math.max(out[i], out[i - 1] - g), out[i - 1] + g); }
    for (let i = n - 2; i >= 0; i--) { if (lock.has(i)) continue; const g = gr[i + 1] * d(i + 1); out[i] = Math.min(Math.max(out[i], out[i + 1] - g), out[i + 1] + g); }
    if (closed) out[n - 1] = out[0];
  }
  return out;
}

/** Grade limit per sample: the full limit on straights and gentle curves, less in tight bends. */
export function bendGrades(xs: Float32Array, zs: Float32Array, maxGrade: number): Float32Array {
  const n = xs.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 3), b = Math.min(n - 1, i + 3);
    const ax = xs[i] - xs[a], az = zs[i] - zs[a], bx = xs[b] - xs[i], bz = zs[b] - zs[i];
    const turn = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz)), arc = (Math.hypot(ax, az) + Math.hypot(bx, bz)) / 2;
    const radius = turn > 1e-4 ? arc / turn : Infinity;
    out[i] = maxGrade * Math.min(1, 0.45 + radius / 40);
  }
  return out;
}

/** If a road starts or ends on an earlier road, blend its profile so the junction heights match. */
export function pinJunctions(h: Float32Array, xs: Float32Array, zs: Float32Array, earlier: RoadPath[], blend = 25): number[] {
  const n = h.length, pinned: number[] = [];
  for (const end of [0, n - 1]) {
    let best = 4, target = NaN;
    for (const r of earlier) for (let j = 0; j < r.xs.length; j++) {
      const dd = Math.hypot(r.xs[j] - xs[end], r.zs[j] - zs[end]);
      if (dd < best) { best = dd; target = r.hs[j]; }
    }
    if (Number.isNaN(target)) continue;
    pinned.push(end);
    const delta = target - h[end];
    for (let k = 0; k < Math.min(blend, n); k++) {
      const i = end === 0 ? k : n - 1 - k;
      h[i] += delta * (1 - k / blend);
    }
  }
  return pinned;
}
