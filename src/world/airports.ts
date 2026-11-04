import { islandById, onIsland } from './islands';
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
  /** Where your car waits while you fly, and where it is when you park there (at an airfield: by the hangar). */
  car: Spot;
  /** The air-cargo office's job board, by the office and car park (airfields and strips). */
  cargo?: { x: number; z: number };
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
  /**
   * Footprints for buildings, each drawn with a model fitted to it (airportsRender.ts, models in CREDITS.md). A
   * building's `dir` is the way its front (hangar doors, terminal frontage) faces.
   */
  buildings: Building[];
  /** Aircraft and ground vehicles standing about as scenery (not flyable): airliners at the stands, buses, trucks, boats. */
  props: Prop[];
  /** Runway and taxiway geometry class: 'B' for light aircraft, 'E' for wide-bodies (a 787's 60 m span). */
  code: CodeLetter;
}
export type BuildingType = 'barn' | 'office' | 'terminal' | 'fire' | 'cargo' | 'lighthouse';
export interface Building extends Rect { type: BuildingType; height: number }
export type PropModel = 'widebody' | 'narrowbody' | 'bus' | 'truck' | 'firetruck' | 'container' | 'sailboat' | 'palm';
/** A scenery model at (x, z) facing `yaw`, scaled to `length` metres nose to tail (bow to stern). */
export interface Prop { model: PropModel; x: number; z: number; yaw: number; length: number }

/**
 * Aerodrome geometry by ICAO code letter, as the real reference tables size it by wingspan. B: up to 24 m (light
 * aircraft, turboprops, the jet). E: up to 65 m (787, A350): 45 m runway, 23 m taxiways, a parallel taxiway 95 m from
 * the runway's centreline so a taxiing wide-body's wingtips stay clear of it, and gentle turns its long wheelbase
 * can follow.
 */
export type CodeLetter = 'B' | 'E';
export interface AirportCode {
  /** Parallel taxiway centreline beyond the runway's edge, and its half-width (m). */
  taxiOffset: number; taxiHalf: number;
  /** Apron edge beyond the runway's edge. */
  apronGap: number;
  /** Taxiway centreline turn radii: onto the end stubs, onto the runway, and from the apron. */
  r1: number; r2: number; rLead: number;
  /** End stubs' half-width; corner fillet radii at the apron and the runway. */
  stubHalf: number; filletApron: number; filletRunway: number;
  /** Hangar (a big barn) footprint: half the door's width, half the depth; and the height. A barn keeps its proportions, so a wide-body one is tall. */
  hangar: [number, number, number];
  /** Hold-short line beyond the runway's edge. */
  hold: number;
  /** Levelled ground beyond the runway's ends and sides, and beyond the apron's back. */
  levelEnd: number; levelSide: number; levelApron: number;
}
export const CODES: Record<CodeLetter, AirportCode> = {
  B: { taxiOffset: 14, taxiHalf: 7.5, apronGap: 28, r1: 7, r2: 12, rLead: 12, stubHalf: 9, filletApron: 6, filletRunway: 10, hangar: [9, 13, 17.5], hold: 4, levelEnd: 70, levelSide: 22, levelApron: 30 },
  E: { taxiOffset: 72.5, taxiHalf: 11.5, apronGap: 124, r1: 30, r2: 45, rLead: 45, stubHalf: 25, filletApron: 20, filletRunway: 30, hangar: [33, 48, 64], hold: 40, levelEnd: 150, levelSide: 90, levelApron: 90 },
};

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

/** How far a light-aircraft parallel taxiway's centreline sits outside the runway's edge, and its half-width (m). */
export const TAXI_OFFSET = CODES.B.taxiOffset, TAXI_HALF = CODES.B.taxiHalf;

interface AirportOpts {
  id: string; name: string; kind: 'airfield' | 'strip'; cx: number; cz: number; dirDeg: number; length: number; width: number; surface: SurfaceId;
  side: 1 | -1; apronLen: number; apronWid: number; hangars: number;
  /** Geometry class (default B). */
  code?: CodeLetter;
  /** An airliner airport: a terminal with airliners at its stands, a fire station and an air-cargo depot. */
  international?: boolean;
}

/**
 * A runway airport: runway, a taxiway off its middle to an apron on side `side` (+1 = the runway's left), hangars
 * and a tower beyond the apron, the gate behind them. An airfield also has a parallel taxiway the length of the
 * runway, joined to it at both ends, so you can taxi to the threshold and use it all. Sizes follow the code letter.
 */
function airport(o: AirportOpts): AirPlace {
  const code = o.code ?? 'B', G = CODES[code];
  const dir = o.dirDeg * deg, runway = { cx: o.cx, cz: o.cz, dir, halfLen: o.length / 2, halfWid: o.width / 2, surface: o.surface, designators: designators(dir) };
  const W = o.width / 2, s = o.side, P = W + G.taxiOffset, apronEdge = W + G.apronGap, off = apronEdge + o.apronWid / 2;
  const [ax, az] = along(runway, 0, s * off);
  const apron: Rect = { cx: ax, cz: az, dir, halfLen: o.apronLen / 2, halfWid: o.apronWid / 2 };
  // The taxiway from the runway's edge to the apron (across the parallel taxiway, at an airfield).
  const [tx, tz] = along(runway, 0, (s * (W + apronEdge)) / 2);
  const taxiway: Rect = { cx: tx, cz: tz, dir: dir + Math.PI / 2, halfLen: (apronEdge - W) / 2 + 2, halfWid: G.taxiHalf };
  const taxiways = [taxiway], fillets: Fillet[] = [];
  /** Points of a polyline in the runway's axes (a along, c across), as world x, z. */
  const line = (pts: [number, number][]) => pts.map(([a, c]) => along(runway, a, c));
  const arc = (ca: number, cc: number, r: number, f: (t: number) => [number, number]) => Array.from({ length: 9 }, (_, i) => { const [da, dc] = f((i / 8) * (Math.PI / 2)); return [ca + da * r, cc + dc * r] as [number, number]; });
  const taxiLines: [number, number][][] = [];
  const corner = (a: number, c: number, ua: number, vc: number, r: number) => fillets.push({ frame: runway, a, c: s * c, ua, vc: s * vc, r });
  const TH = G.taxiHalf;
  if (o.kind === 'airfield') {
    // Parallel taxiway, and a stub at each end from the runway's edge to its centreline (wide enough to turn in).
    const end = o.length / 2 - G.stubHalf - 1, mid = W + G.taxiOffset / 2 - 1, strip = P - TH; // strip: the grass strip's far edge
    const [px, pz] = along(runway, 0, s * P);
    const parallel: Rect = { cx: px, cz: pz, dir, halfLen: end + G.stubHalf, halfWid: TH, round: TH };
    const stubs = [-1, 1].map((e): Rect => { const [x, z] = along(runway, e * end, s * mid); return { cx: x, cz: z, dir: dir + Math.PI / 2, halfLen: G.taxiOffset / 2 + 1, halfWid: G.stubHalf }; });
    taxiways.unshift(parallel, ...stubs);
    // The grass strip between runway and taxiway ends in a semicircle wherever a taxiway cuts across it.
    const tip = (strip - W) / 2;
    for (const e of [-1, 1]) { corner(e * (end - G.stubHalf), W, -e, 1, tip); corner(e * (end - G.stubHalf), strip, -e, -1, tip); }
    for (const e of [-1, 1]) { corner(e * TH, W, e, 1, tip); corner(e * TH, strip, e, -1, tip); corner(e * TH, P + TH, e, 1, G.filletApron); }
    // Centrelines: along the parallel taxiway; at each end, a sweeping turn into the stub, across the hold line,
    // and a lead-in curve onto the runway centreline facing down the runway.
    const R1 = G.r1, R2 = G.r2;
    taxiLines.push(line([[-(end - R1), s * P], [end - R1, s * P]]));
    for (const e of [-1, 1]) taxiLines.push(line([
      ...arc(e * (end - R1), s * (P - R1), R1, (t) => [e * Math.sin(t), s * Math.cos(t)]),
      ...arc(e * (end - R2), s * R2, R2, (t) => [e * Math.cos(t), -s * Math.sin(t)]),
    ]));
  }
  // The taxiway from the apron: rounded where it meets the apron and the runway. At an airfield its centreline
  // branches both ways onto the parallel taxiway, and leads onto the runway centreline either way.
  for (const e of [-1, 1]) { corner(e * TH, apronEdge, e, -1, G.filletApron); if (o.kind !== 'airfield') corner(e * TH, W, e, 1, G.filletRunway); }
  if (o.kind === 'airfield') {
    const R = G.rLead;
    taxiLines.push(line([[0, s * R], [0, s * (apronEdge + 2)]]));
    for (const e of [-1, 1]) {
      taxiLines.push(line(arc(e * R, s * R, R, (t) => [-e * Math.cos(t), -s * Math.sin(t)])));
      taxiLines.push(line(arc(e * G.r1, s * (P + G.r1), G.r1, (t) => [-e * Math.cos(t), -s * Math.sin(t)])));
    }
  } else taxiLines.push(line([[0, s * W], [0, s * (apronEdge + 2)]]));

  // Buildings beyond the apron, fronts facing the runway.
  const back = off + o.apronWid / 2, face = dir - s * (Math.PI / 2), L2 = o.apronLen / 2;
  const buildings: Building[] = [], props: Prop[] = [];
  const put = (type: BuildingType, a: number, c: number, depth: number, frontage: number, height: number, d = face) => {
    const [x, z] = along(runway, a, s * c);
    buildings.push({ cx: x, cz: z, dir: d, halfLen: depth / 2, halfWid: frontage / 2, type, height });
  };
  const prop = (model: PropModel, a: number, c: number, yaw: number, length: number) => { const [x, z] = along(runway, a, s * c); props.push({ model, x, z, yaw, length }); };
  const [hDoor, hDepth, hHeight] = G.hangar;
  // Hangars are big barns for now (no open hangar model exists yet); the airfields have no control towers.
  for (let i = 0; i < o.hangars; i++) put('barn', -L2 + hDoor + 7 + i * (2 * hDoor + 8), back + hDepth + 1, hDepth * 2, hDoor * 2, hHeight);
  put('office', L2 - 14, back + 9, 12, 16, 7);
  if (o.international) {
    // The terminal along the apron's back, with an A320-size airliner, a 787-size wide-body and another A320 nose-in
    // at its stands; an apron bus and a catering truck; the airport fire station (with its engine out front) beyond
    // the apron's end by the tower, and the air-cargo depot at the other end.
    const tA = o.apronLen * 0.15, tW = o.apronLen * 0.6;
    put('terminal', tA, back + 22, 40, tW, 18);
    const nose = face + Math.PI; // pointing away from the runway, into the stand
    for (const [a, model, len] of [[tA - tW / 3, 'narrowbody', 38], [tA, 'widebody', 57], [tA + tW / 3, 'narrowbody', 38]] as const) prop(model, a, back - len / 2 - 6, nose, len);
    prop('bus', tA - tW / 2 - 30, back - 14, dir, 12);
    prop('truck', tA + tW / 2 + 20, back - 12, dir + Math.PI, 7);
    put('fire', L2 + 55, back + 28, 26, 36, 10);
    prop('firetruck', L2 + 55, back + 6, face, 11);
    put('cargo', -L2 - 50, back - 45, 50, 50, 14);
    // Palms along the terminal's landside forecourt (`length` is a palm's height).
    for (let a = tA - tW / 2 + 15; a <= tA + tW / 2 - 15; a += 30) prop('palm', a, back + 52, dir, 9);
    for (let k = 0; k < 4; k++) prop('container', -L2 - 50 + (k - 1.5) * 14, back - 82, dir + Math.PI / 2, 6);
  }
  // Aircraft wait at the holding point on the taxiway, facing the runway: roll forward and turn onto it.
  const [sx, sz] = along(runway, 0, s * (apronEdge - 2));
  const [cx, cz] = along(runway, L2 - 14, s * (back + 24));
  const [gx, gz] = along(runway, L2 - 14, s * (back + 34));
  const level: Rect[] = [
    { ...runway, halfLen: runway.halfLen + G.levelEnd, halfWid: runway.halfWid + G.levelSide },
    { ...apron, halfLen: apron.halfLen + (code === 'E' ? 110 : 10), halfWid: apron.halfWid + G.levelApron },
  ];
  // A small paved car park by the office (the air-cargo board), where the access road comes in.
  const carPark: Rect = { cx, cz, dir, halfLen: 11, halfWid: 8 };
  level.push({ ...carPark, halfLen: carPark.halfLen + 4, halfWid: carPark.halfWid + 4 });
  // Your car waits on the apron in front of the first hangar, nose to its doors.
  const [hx, hz] = along(runway, -L2 + hDoor + 7, s * (back - 9));
  return {
    id: o.id, name: o.name, kind: o.kind, code, runway, paved: [apron, ...taxiways, carPark], taxiways, fillets, taxiLines, level, buildings, props, gate: { x: gx, z: gz },
    spawn: { x: sx, z: sz, yaw: face },
    car: { x: hx, z: hz, yaw: face + Math.PI },
    cargo: { x: cx, z: cz },
  };
}

/** A helipad of radius r, its gate (and the car's spot) towards `gateDir`; `extra` buildings beside it (a lighthouse). */
export function helipad(id: string, name: string, x: number, z: number, r = 12, gateDir = 0, extra: Building[] = []): AirPlace {
  const pad = { cx: x, cz: z, dir: 0, halfLen: r, halfWid: r };
  const [gx, gz] = along({ cx: x, cz: z, dir: gateDir }, r + 10, 0);
  return { id, name, kind: 'helipad', code: 'B', pad: { x, z, r }, paved: [pad], taxiways: [], fillets: [], taxiLines: [], level: [{ ...pad, halfLen: r + 6, halfWid: r + 6 }], buildings: extra, props: [],
    spawn: { x, z, yaw: gateDir + Math.PI }, car: { x: gx, z: gz, yaw: gateDir }, gate: { x: gx, z: gz } };
}

/** A pier from (x0, z0) on the shore straight out to (x1, z1) over water, a sailing boat moored alongside. */
function dock(id: string, name: string, x0: number, z0: number, x1: number, z1: number, withGate: boolean): AirPlace {
  const dir = Math.atan2(x1 - x0, z1 - z0), len = Math.hypot(x1 - x0, z1 - z0);
  const [sx, sz] = along({ cx: x1, cz: z1, dir }, 14, 6);
  const [cx, cz] = along({ cx: x0, cz: z0, dir }, -12, 0);
  const [bx, bz] = along({ cx: x0, cz: z0, dir }, len * 0.6, -5.5);
  return { id, name, kind: 'dock', code: 'B', pier: { x0, z0, x1, z1, width: 3.2 }, paved: [], taxiways: [], fillets: [], taxiLines: [], level: [], buildings: [],
    props: [{ model: 'sailboat', x: bx, z: bz, yaw: dir, length: 8 }],
    spawn: { x: sx, z: sz, yaw: dir }, car: { x: cx, z: cz, yaw: dir + Math.PI }, ...(withGate ? { gate: { x: cx, z: cz } } : {}) };
}

const GULL = islandById('gull');
const [gullX, gullZ] = onIsland(GULL, -50, 60);
/** Lantern Rock's lighthouse, on the seaward brow of the rock beside the helipad. */
const LIGHTHOUSE: Building = { cx: -2535, cz: -2885, dir: 110 * deg, halfLen: 4, halfWid: 6, type: 'lighthouse', height: 22 };

export const AIRPORTS: AirPlace[] = [
  // The main island's airfield, lengthened to 1.2 km north-westwards from its old southern threshold.
  airport({ id: 'airfield', name: 'Island Airfield', kind: 'airfield', cx: -575, cz: 330, dirDeg: 150, length: 1200, width: 30, surface: S.Asphalt, side: -1, apronLen: 140, apronWid: 70, hangars: 3 }),
  airport({ id: 'strip', name: 'Dune Strip', kind: 'strip', cx: 900, cz: -650, dirDeg: 130, length: 550, width: 24, surface: S.Grass, side: 1, apronLen: 70, apronWid: 40, hangars: 1 }),
  // Longreach International: a 3.2 km × 45 m code E runway (18/36), long enough for a 787 at its heaviest.
  airport({ id: 'longreach', name: 'Longreach International', kind: 'airfield', cx: 3200, cz: -300, dirDeg: 0, length: 3200, width: 45, surface: S.Asphalt, side: -1, apronLen: 600, apronWid: 160, hangars: 2, code: 'E', international: true }),
  airport({ id: 'gull-strip', name: 'Gull Isle Strip', kind: 'strip', cx: gullX, cz: gullZ, dirDeg: 70, length: 800, width: 24, surface: S.Grass, side: 1, apronLen: 70, apronWid: 40, hangars: 1 }),
  helipad('heli-village', 'Hearthwick Helipad', 95, -330, 12, -Math.PI / 2),
  helipad('heli-pine', 'Pine Holm Helipad', 1449, 2809, 12, Math.PI),
  helipad('heli-lantern', 'Lantern Rock Helipad', -2590, -2820, 12, Math.PI / 2, [LIGHTHOUSE]),
  dock('dock-north', 'Northshore Pier', -200, 1550, -200, 1584, true),
  dock('dock-harbour', 'Harbour Pier', 0, -1592, 0, -1624, true),
  dock('dock-longreach', 'Longreach Pier', 2420, -900, 2376, -900, true),
  dock('dock-gull', 'Gull Haven Pier', -2526, 2354, -2511, 2313, true),
  dock('dock-pine', 'Pine Holm Pier', 1362, 2570, 1347, 2529, false),
];

/** Every place an aircraft can be based: the fixed list plus the summit pad (at the Summit Road's end). */
export function allPlaces(summit: { x: number; z: number } | null): AirPlace[] {
  return summit ? [...AIRPORTS, helipad('heli-summit', 'Summit Helipad', summit.x, summit.z, 9, 0)] : AIRPORTS;
}

/** How close (m) you need to be to use a place's hangar or to park there. */
export function nearPlace(p: AirPlace, x: number, z: number): number {
  let d = Math.min(Math.hypot(p.spawn.x - x, p.spawn.z - z), Math.hypot(p.car.x - x, p.car.z - z));
  if (p.cargo) d = Math.min(d, Math.hypot(p.cargo.x - x, p.cargo.z - z));
  for (const r of p.paved) d = Math.min(d, inRect(r, x, z, 0) ? 0 : d);
  return d;
}

/** Anywhere on a place's runway (with its overruns and shoulders), taxiways or apron, give or take 20 m. */
export const onAirfield = (p: AirPlace, x: number, z: number): boolean =>
  (!!p.runway && inRect(p.runway, x, z, 20)) || p.level.some((r) => inRect(r, x, z, 20)) || p.paved.some((r) => inRect(r, x, z, 20));

export const airportById = (id: string): AirPlace | undefined => AIRPORTS.find((a) => a.id === id);
