import { S, type SurfaceId } from './surfaces';

/**
 * Airfields, grass strips, helipads and seaplane docks. Pure data plus derived geometry, shared by the world
 * generator (flattening, surfaces, access roads), the renderer (markings, hangars) and gameplay (spawns, jobs).
 * Angles: a direction `dir` is measured from +z towards +x, so the unit vector is (sin dir, cos dir).
 */
export type PlaceKind = 'airfield' | 'strip' | 'helipad' | 'dock';
/** A rectangle along `dir`; `round` rounds its corners off (paving only). */
export interface Rect { cx: number; cz: number; dir: number; halfLen: number; halfWid: number; round?: number }
/**
 * A rounded inside corner of paving: the quarter-circle of pavement that fills the corner where two paved edges
 * meet, given in a frame's axes as the corner (a, c), the directions of the two edges away from it (ua along,
 * vc across, each ±1) and the radius.
 */
export interface Fillet { frame: { cx: number; cz: number; dir: number }; a: number; c: number; ua: number; vc: number; r: number }
export interface Spot { x: number; z: number; yaw: number }
export interface AirPlace {
  id: string; name: string; kind: PlaceKind;
  /** Where aircraft are parked and where air-cargo jobs start and end. */
  spawn: Spot;
  /** Where your car waits while you fly. */
  car: Spot;
  runway?: Rect & { surface: SurfaceId; designators: [string, string] };
  /** Flat paved areas: apron, taxiways, car park, helipad. */
  paved: Rect[];
  /** Taxiways (also in `paved`). At an airfield: the parallel taxiway first. */
  taxiways: Rect[];
  /** Rounded inside corners where taxiways meet the runway, each other and the apron (paved too). */
  fillets: Fillet[];
  /** Yellow taxiway centrelines (x, z points), curving into the turns and onto the runway's centreline. */
  taxiLines: [number, number][][];
  /** Areas levelled into the terrain (runway with shoulders and overruns, apron). */
  level: Rect[];
  /** Helipad centre and radius (also the "H"). */
  pad?: { x: number; z: number; r: number };
  /** Wooden pier from the shore out over the water. */
  pier?: { x0: number; z0: number; x1: number; z1: number; width: number };
  /** Road from the gate to the nearest road (computed in network.ts). */
  gate?: { x: number; z: number };
  /** Hangars, tower, office: footprint rects for buildings (rendered in airportsRender.ts). */
  buildings: (Rect & { type: 'hangar' | 'tower' | 'office' | 'shed' })[];
}

const deg = Math.PI / 180;
const unit = (dir: number) => [Math.sin(dir), Math.cos(dir)] as const;
/** Point at `along` metres down the axis and `across` metres to the axis's left (+x when dir = 0). */
export function along(r: { cx: number; cz: number; dir: number }, alongM: number, acrossM: number): [number, number] {
  const [ux, uz] = unit(r.dir);
  return [r.cx + ux * alongM + uz * acrossM, r.cz + uz * alongM - ux * acrossM];
}
/** Signed coordinates of (x, z) in a rect's axes. */
export function local(r: { cx: number; cz: number; dir: number }, x: number, z: number): [number, number] {
  const [ux, uz] = unit(r.dir), dx = x - r.cx, dz = z - r.cz;
  return [dx * ux + dz * uz, dx * uz - dz * ux];
}
export const inRect = (r: Rect, x: number, z: number, margin = 0): boolean => {
  const [a, c] = local(r, x, z);
  return Math.abs(a) <= r.halfLen + margin && Math.abs(c) <= r.halfWid + margin;
};
/** Is (x, z) on this paving, its corners rounded off? */
export function onPaving(r: Rect, x: number, z: number): boolean {
  const [a, c] = local(r, x, z), da = Math.abs(a) - (r.halfLen - (r.round ?? 0)), dc = Math.abs(c) - (r.halfWid - (r.round ?? 0));
  if (Math.abs(a) > r.halfLen || Math.abs(c) > r.halfWid) return false;
  return !r.round || da <= 0 || dc <= 0 || da * da + dc * dc <= r.round * r.round;
}
export function inFillet(f: Fillet, x: number, z: number): boolean {
  const [a, c] = local(f.frame, x, z), u = (a - f.a) * f.ua, v = (c - f.c) * f.vc;
  return u >= 0 && v >= 0 && u <= f.r && v <= f.r && (u - f.r) ** 2 + (v - f.r) ** 2 >= f.r * f.r;
}

/** Runway numbers from the compass heading (our +z is north, +x is west). */
function designators(dir: number): [string, string] {
  const compass = ((360 - dir / deg) % 360 + 360) % 360, a = Math.round(compass / 10) || 36, b = ((a + 17) % 36) + 1;
  const f = (n: number) => String(n).padStart(2, '0');
  return [f(a), f(b)];
}

/** How far a parallel taxiway's centreline sits outside the runway's edge, and its half-width (m). */
export const TAXI_OFFSET = 14, TAXI_HALF = 7.5;

/**
 * A runway airport: runway, a taxiway off its middle to an apron on side `side` (+1 = the runway's left),
 * hangars and a small tower beyond the apron, the gate behind them. An airfield also has a parallel taxiway
 * the length of the runway, joined to it at both ends, so you can taxi to the threshold and use it all.
 */
function airport(o: { id: string; name: string; kind: 'airfield' | 'strip'; cx: number; cz: number; dirDeg: number; length: number; width: number; surface: SurfaceId; side: 1 | -1; apronLen: number; apronWid: number; hangars: number }): AirPlace {
  const dir = o.dirDeg * deg, runway = { cx: o.cx, cz: o.cz, dir, halfLen: o.length / 2, halfWid: o.width / 2, surface: o.surface, designators: designators(dir) };
  const off = o.width / 2 + 28 + o.apronWid / 2;
  const [ax, az] = along(runway, 0, o.side * off);
  const apron: Rect = { cx: ax, cz: az, dir, halfLen: o.apronLen / 2, halfWid: o.apronWid / 2 };
  const W = o.width / 2, s = o.side, P = W + TAXI_OFFSET, apronEdge = W + 28;
  const [tx, tz] = along(runway, 0, s * P);
  const taxiway: Rect = { cx: tx, cz: tz, dir: dir + Math.PI / 2, halfLen: 16, halfWid: TAXI_HALF };
  const taxiways = [taxiway], fillets: Fillet[] = [];
  /** Points of a polyline in the runway's axes (a along, c across), as world x, z. */
  const line = (pts: [number, number][]) => pts.map(([a, c]) => along(runway, a, c));
  const arc = (ca: number, cc: number, r: number, f: (t: number) => [number, number]) => Array.from({ length: 9 }, (_, i) => { const [da, dc] = f((i / 8) * (Math.PI / 2)); return [ca + da * r, cc + dc * r] as [number, number]; });
  const taxiLines: [number, number][][] = [];
  const corner = (a: number, c: number, ua: number, vc: number, r: number) => fillets.push({ frame: runway, a, c: s * c, ua, vc: s * vc, r });
  if (o.kind === 'airfield') {
    // Parallel taxiway, and a stub at each end from the runway's edge to its centreline (wide enough to turn in).
    const end = o.length / 2 - 10, mid = W + TAXI_OFFSET / 2 - 1, strip = P - TAXI_HALF; // strip: the grass strip's far edge
    const parallel: Rect = { cx: tx, cz: tz, dir, halfLen: end + 9, halfWid: TAXI_HALF, round: TAXI_HALF };
    const stubs = [-1, 1].map((e): Rect => { const [x, z] = along(runway, e * end, s * mid); return { cx: x, cz: z, dir: dir + Math.PI / 2, halfLen: TAXI_OFFSET / 2 + 1, halfWid: 9 }; });
    taxiways.unshift(parallel, ...stubs);
    // The grass strip between runway and taxiway ends in a semicircle wherever a taxiway cuts across it.
    const tip = (strip - W) / 2;
    for (const e of [-1, 1]) { corner(e * (end - 9), W, -e, 1, tip); corner(e * (end - 9), strip, -e, -1, tip); }
    for (const e of [-1, 1]) { corner(e * TAXI_HALF, W, e, 1, tip); corner(e * TAXI_HALF, strip, e, -1, tip); corner(e * TAXI_HALF, P + TAXI_HALF, e, 1, 6); }
    // Centrelines: along the parallel taxiway; at each end, a sweeping turn into the stub, across the hold line,
    // and a lead-in curve onto the runway centreline facing down the runway.
    const R1 = 7, R2 = 12;
    taxiLines.push(line([[-(end - R1), s * P], [end - R1, s * P]]));
    for (const e of [-1, 1]) taxiLines.push(line([
      ...arc(e * (end - R1), s * (P - R1), R1, (t) => [e * Math.sin(t), s * Math.cos(t)]),
      ...arc(e * (end - R2), s * R2, R2, (t) => [e * Math.cos(t), -s * Math.sin(t)]),
    ]));
  }
  // The taxiway from the apron: rounded where it meets the apron and the runway. At an airfield its centreline
  // branches both ways onto the parallel taxiway, and leads onto the runway centreline either way.
  for (const e of [-1, 1]) { corner(e * TAXI_HALF, apronEdge, e, -1, 6); if (o.kind !== 'airfield') corner(e * TAXI_HALF, W, e, 1, 10); }
  if (o.kind === 'airfield') {
    const R = 12;
    taxiLines.push(line([[0, s * R], [0, s * (apronEdge + 2)]]));
    for (const e of [-1, 1]) {
      taxiLines.push(line(arc(e * R, s * R, R, (t) => [-e * Math.cos(t), -s * Math.sin(t)])));
      taxiLines.push(line(arc(e * 7, s * (P + 7), 7, (t) => [-e * Math.cos(t), -s * Math.sin(t)])));
    }
  } else taxiLines.push(line([[0, s * W], [0, s * (apronEdge + 2)]]));
  const back = off + o.apronWid / 2;
  const buildings: AirPlace['buildings'] = [];
  for (let i = 0; i < o.hangars; i++) {
    const [hx, hz] = along(runway, -o.apronLen / 2 + 18 + i * 30, o.side * (back + 13));
    buildings.push({ cx: hx, cz: hz, dir: dir + (o.side > 0 ? Math.PI / 2 : -Math.PI / 2), halfLen: 11, halfWid: 12, type: 'hangar' });
  }
  const [ox, oz] = along(runway, o.apronLen / 2 - 14, o.side * (back + 9));
  buildings.push({ cx: ox, cz: oz, dir: dir + (o.side > 0 ? Math.PI / 2 : -Math.PI / 2), halfLen: 6, halfWid: 8, type: o.kind === 'airfield' ? 'office' : 'shed' });
  if (o.kind === 'airfield') {
    const [wx, wz] = along(runway, o.apronLen / 2 + 8, o.side * (back + 6));
    buildings.push({ cx: wx, cz: wz, dir, halfLen: 3, halfWid: 3, type: 'tower' });
  }
  // Aircraft wait at the holding point on the taxiway, facing the runway: roll forward and turn onto it.
  const [sx, sz] = along(runway, 0, o.side * (o.width / 2 + 26));
  const [cx, cz] = along(runway, o.apronLen / 2 - 14, o.side * (back + 24));
  const [gx, gz] = along(runway, o.apronLen / 2 - 14, o.side * (back + 34));
  const level: Rect[] = [
    { ...runway, halfLen: runway.halfLen + 70, halfWid: runway.halfWid + 22 },
    { ...apron, halfLen: apron.halfLen + 10, halfWid: apron.halfWid + 30 },
  ];
  // A small paved car park where your car waits, next to the office.
  const carPark: Rect = { cx, cz, dir, halfLen: 11, halfWid: 8 };
  level.push({ ...carPark, halfLen: carPark.halfLen + 4, halfWid: carPark.halfWid + 4 });
  return {
    id: o.id, name: o.name, kind: o.kind, runway, paved: [apron, ...taxiways, carPark], taxiways, fillets, taxiLines, level, buildings, gate: { x: gx, z: gz },
    spawn: { x: sx, z: sz, yaw: dir - (Math.PI / 2) * o.side },
    car: { x: cx, z: cz, yaw: dir },
  };
}

export function helipad(id: string, name: string, x: number, z: number, r = 12, gateDir = 0): AirPlace {
  const pad = { cx: x, cz: z, dir: 0, halfLen: r, halfWid: r };
  const [gx, gz] = along({ cx: x, cz: z, dir: gateDir }, r + 10, 0);
  return { id, name, kind: 'helipad', pad: { x, z, r }, paved: [pad], taxiways: [], fillets: [], taxiLines: [], level: [{ ...pad, halfLen: r + 6, halfWid: r + 6 }], buildings: [],
    spawn: { x, z, yaw: gateDir + Math.PI }, car: { x: gx, z: gz, yaw: gateDir }, gate: { x: gx, z: gz } };
}

/** A pier from (x0, z0) on the shore straight out to (x1, z1) over water. */
function dock(id: string, name: string, x0: number, z0: number, x1: number, z1: number, withGate: boolean): AirPlace {
  const dir = Math.atan2(x1 - x0, z1 - z0);
  const [sx, sz] = along({ cx: x1, cz: z1, dir }, 14, 6);
  const [cx, cz] = along({ cx: x0, cz: z0, dir }, -12, 0);
  return { id, name, kind: 'dock', pier: { x0, z0, x1, z1, width: 3.2 }, paved: [], taxiways: [], fillets: [], taxiLines: [], level: [], buildings: [],
    spawn: { x: sx, z: sz, yaw: dir }, car: { x: cx, z: cz, yaw: dir + Math.PI }, ...(withGate ? { gate: { x: cx, z: cz } } : {}) };
}

export const AIRPORTS: AirPlace[] = [
  airport({ id: 'airfield', name: 'Island Airfield', kind: 'airfield', cx: -500, cz: 200, dirDeg: 150, length: 900, width: 30, surface: S.Asphalt, side: -1, apronLen: 140, apronWid: 70, hangars: 3 }),
  airport({ id: 'strip', name: 'Dune Strip', kind: 'strip', cx: 900, cz: -650, dirDeg: 130, length: 550, width: 24, surface: S.Grass, side: 1, apronLen: 70, apronWid: 40, hangars: 1 }),
  helipad('heli-village', 'Hearthwick Helipad', 95, -330, 12, -Math.PI / 2),
  dock('dock-north', 'Northshore Pier', -200, 1550, -200, 1584, true),
  dock('dock-harbour', 'Harbour Pier', 0, -1592, 0, -1624, true),
];

/** Every place an aircraft can be based: the fixed list plus the summit pad (at the Summit Road's end). */
export function allPlaces(summit: { x: number; z: number } | null): AirPlace[] {
  return summit ? [...AIRPORTS, helipad('heli-summit', 'Summit Helipad', summit.x, summit.z, 9, 0)] : AIRPORTS;
}

/** How close (m) you need to be to use a place's hangar or to park there. */
export function nearPlace(p: AirPlace, x: number, z: number): number {
  let d = Math.min(Math.hypot(p.spawn.x - x, p.spawn.z - z), Math.hypot(p.car.x - x, p.car.z - z));
  for (const r of p.paved) d = Math.min(d, inRect(r, x, z, 0) ? 0 : d);
  return d;
}

export const airportById = (id: string): AirPlace | undefined => AIRPORTS.find((a) => a.id === id);
