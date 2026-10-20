import { S, type SurfaceId } from './surfaces';

/**
 * Airfields, grass strips, helipads and seaplane docks. Pure data plus derived geometry, shared by the world
 * generator (flattening, surfaces, access roads), the renderer (markings, hangars) and gameplay (spawns, jobs).
 * Angles: a direction `dir` is measured from +z towards +x, so the unit vector is (sin dir, cos dir).
 */
export type PlaceKind = 'airfield' | 'strip' | 'helipad' | 'dock';
export interface Rect { cx: number; cz: number; dir: number; halfLen: number; halfWid: number }
export interface Spot { x: number; z: number; yaw: number }
export interface AirPlace {
  id: string; name: string; kind: PlaceKind;
  /** Where aircraft are parked and where air-cargo jobs start and end. */
  spawn: Spot;
  /** Where your car waits while you fly. */
  car: Spot;
  runway?: Rect & { surface: SurfaceId; designators: [string, string] };
  /** Flat paved areas: apron, taxiway, helipad. */
  paved: Rect[];
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

/** Runway numbers from the compass heading (our +z is north, +x is west). */
function designators(dir: number): [string, string] {
  const compass = ((360 - dir / deg) % 360 + 360) % 360, a = Math.round(compass / 10) || 36, b = ((a + 17) % 36) + 1;
  const f = (n: number) => String(n).padStart(2, '0');
  return [f(a), f(b)];
}

/**
 * A runway airport: runway, a taxiway off its middle to an apron on side `side` (+1 = the runway's left),
 * hangars and a small tower beyond the apron, the gate behind them.
 */
function airport(o: { id: string; name: string; kind: 'airfield' | 'strip'; cx: number; cz: number; dirDeg: number; length: number; width: number; surface: SurfaceId; side: 1 | -1; apronLen: number; apronWid: number; hangars: number }): AirPlace {
  const dir = o.dirDeg * deg, runway = { cx: o.cx, cz: o.cz, dir, halfLen: o.length / 2, halfWid: o.width / 2, surface: o.surface, designators: designators(dir) };
  const off = o.width / 2 + 28 + o.apronWid / 2;
  const [ax, az] = along(runway, 0, o.side * off);
  const apron: Rect = { cx: ax, cz: az, dir, halfLen: o.apronLen / 2, halfWid: o.apronWid / 2 };
  const [tx, tz] = along(runway, 0, o.side * (o.width / 2 + 14));
  const taxiway: Rect = { cx: tx, cz: tz, dir: dir + Math.PI / 2, halfLen: 16, halfWid: 7.5 };
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
    id: o.id, name: o.name, kind: o.kind, runway, paved: [apron, taxiway, carPark], level, buildings, gate: { x: gx, z: gz },
    spawn: { x: sx, z: sz, yaw: dir - (Math.PI / 2) * o.side },
    car: { x: cx, z: cz, yaw: dir },
  };
}

export function helipad(id: string, name: string, x: number, z: number, r = 12, gateDir = 0): AirPlace {
  const pad = { cx: x, cz: z, dir: 0, halfLen: r, halfWid: r };
  const [gx, gz] = along({ cx: x, cz: z, dir: gateDir }, r + 10, 0);
  return { id, name, kind: 'helipad', pad: { x, z, r }, paved: [pad], level: [{ ...pad, halfLen: r + 6, halfWid: r + 6 }], buildings: [],
    spawn: { x, z, yaw: gateDir + Math.PI }, car: { x: gx, z: gz, yaw: gateDir }, gate: { x: gx, z: gz } };
}

/** A pier from (x0, z0) on the shore straight out to (x1, z1) over water. */
function dock(id: string, name: string, x0: number, z0: number, x1: number, z1: number, withGate: boolean): AirPlace {
  const dir = Math.atan2(x1 - x0, z1 - z0);
  const [sx, sz] = along({ cx: x1, cz: z1, dir }, 14, 6);
  const [cx, cz] = along({ cx: x0, cz: z0, dir }, -12, 0);
  return { id, name, kind: 'dock', pier: { x0, z0, x1, z1, width: 3.2 }, paved: [], level: [], buildings: [],
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
