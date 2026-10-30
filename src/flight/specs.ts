/**
 * Aircraft specifications. Body frame: +z forward, +y up, +x left (as the cars). Origin = centre of gravity.
 * Numbers follow the real aircraft each one is modelled on (see docs/decisions/0007): mass, wing area and span,
 * power, inertia and tail volume, so take-off runs, stall and cruise speeds and handling come out realistic.
 */
export type AircraftKind = 'plane' | 'heli' | 'balloon';
export type ControlRole = 'aileronL' | 'aileronR' | 'elevator' | 'rudder' | null;
type V = [number, number, number];

/** One lifting surface: a wing half, the tailplane or the fin. */
export interface SurfaceSpec {
  pos: V; area: number; aspect: number;
  /** 'h' = horizontal (lift along up, tilted by dihedral), 'v' = vertical fin (lift sideways). */
  orient: 'h' | 'v';
  dihedral?: number;         // radians, positive tips up (sign of the side handled by pos.x)
  incidence?: number;        // radians
  alpha0?: number;           // zero-lift angle (negative for cambered sections)
  clMax: number;
  cd0: number;
  e?: number;                // span efficiency
  control: ControlRole;
  /** Fraction of a control deflection that acts as extra angle of attack (flap-effectiveness τ). */
  tau?: number;
  flaps?: boolean;           // trailing-edge flaps on this surface
  /** Sits in the propeller slipstream (tail surfaces): gains authority from engine power at low speed. */
  slipstream?: boolean;
  /** Tail surface: sees wing downwash (dε/dα ≈ 0.4). */
  downwash?: boolean;
}

export type GearType = 'wheel' | 'skid' | 'basket';
export interface GearSpec { pos: V; travel: number; type: GearType; steer?: number; brake?: boolean }
export interface FloatSpec { pos: V; half: V; volume: number }

/**
 * The propeller as drawn, fitted to the model's nose (body frame). Its radius is the engine's `propRadius`.
 * The models' own propellers are single static meshes, so they are cut out (`strip`) and this one is built instead.
 */
export interface PropVisual {
  hub: V; blades: number;
  /** Geometric pitch, m per turn: sets the blade twist. */
  pitch: number;
  /** Widest chord, as a fraction of the radius. */
  chord: number;
  /** `base`: z of the spinner's back plate. */
  spinner: { base: number; length: number; radius: number; color: number } | null;
  /** `front` faces forward (polished), `rear` faces the pilot (anti-glare); tip bands from the tip inwards. */
  colors: { front: number; rear: number; tips: number[] };
  /** Boxes (body frame, [min, max]): model parts lying wholly inside one are removed. */
  strip: [V, V][];
  /** A twin: a second propeller at the hub mirrored across the centreline. */
  mirror?: boolean;
}

/**
 * The engine(s). `propPos` is where the (total) thrust acts; a twin's engines sit symmetrically about it.
 * `thrustFade`: airspeed (m/s) at which static thrust would fade to nothing (a fixed-pitch prop ~120, a
 * constant-speed one holds its bite much longer). `idle`: propeller speed at idle as a share of `rpm`.
 * A `turbine` spools slowly: it takes a few seconds to light, and its power lags the lever.
 */
export interface EngineSpec {
  power: number; staticThrust: number; propPos: V; propRadius: number; rpm: number; maxFlaps: number;
  props?: number; thrustFade?: number; idle?: number; turbine?: boolean;
}

/** Landing gear for a model drawn without any: sprung legs (from `legRoot`, mirrored) and spats to the braked wheels, a tailwheel. */
export interface FittedGear { legRoot: V; wheelRadius: number; legColor: number; spatColor: number }

export interface AircraftSpec {
  id: string; name: string; kind: AircraftKind; blurb: string; realType: string;
  model: string; credit: string;
  /** Visual: uniform scale, rotation about y to bring the nose to +z, and an offset after centring. */
  modelScale: number; modelYaw: number; modelOffset: V;
  mass: number;
  /** Principal inertia about the body axes: pitch (x), yaw (y), roll (z), kg·m². */
  inertia: V;
  hull: { half: V; pos: V }[];
  surfaces: SurfaceSpec[];
  /** Fuselage, gear and struts: equivalent flat-plate drag area (m²), per axis [side, vertical, forward]. */
  bodyCdA: V;
  engine?: EngineSpec;
  prop?: PropVisual;
  /** Relaxed assist: pitch and roll rate (rad/s) at full stick (a light aircraft: 0.45 and 1.2). */
  handling?: { pitchRate: number; rollRate: number };
  /** Shortest runway (m) it can be flown from; a base without one won't have it in the hangar. */
  minRunway?: number;
  fittedGear?: FittedGear;
  rotor?: { radius: number; hub: V; power: number; rpm: number; maxTilt: number; tailArm: number };
  balloon?: { volume: number; envelopeY: number; radius: number; burner: number };
  gear: GearSpec[];
  floats?: FloatSpec[];
  /** Parcels it can carry on a delivery job. */
  capacity: number;
  price: number;
  /** Where a pilot's eye sits, for the cockpit camera. */
  eye: V;
}

const deg = Math.PI / 180;

/**
 * A wing as four panels: inner (flaps) and outer (ailerons) on each side, so roll damping and aileron leverage
 * come from where the lift really acts. `aileronSpan` is the outboard fraction of each half-wing with ailerons.
 */
function wing(o: { y: number; z: number; area: number; span: number; dihedral: number; incidence: number; alpha0: number; clMax: number; cd0: number; e: number; tau: number; flaps?: boolean; aileronSpan?: number }): SurfaceSpec[] {
  const aspect = (o.span * o.span) / o.area, half = o.span / 2, f = o.aileronSpan ?? 0.45, out: SurfaceSpec[] = [];
  for (const side of [1, -1]) {
    const common = { aspect, orient: 'h' as const, dihedral: o.dihedral, incidence: o.incidence, alpha0: o.alpha0, clMax: o.clMax, cd0: o.cd0, e: o.e };
    if (f < 1) out.push({ ...common, pos: [side * half * (1 - f) / 2, o.y, o.z], area: (o.area / 2) * (1 - f), control: null, flaps: o.flaps });
    out.push({ ...common, pos: [side * half * (1 - f / 2), o.y, o.z], area: (o.area / 2) * f, control: side > 0 ? 'aileronL' : 'aileronR', tau: o.tau, flaps: f >= 1 ? o.flaps : false });
  }
  return out;
}

export const AIRCRAFT: Record<string, AircraftSpec> = {
  // Cessna 172-class trainer: forgiving, stable, the island's flying-club plane.
  wren: {
    id: 'wren', name: 'Wren', kind: 'plane', realType: 'High-wing trainer (Cessna 172 class)',
    blurb: 'Steady, forgiving and roomy. Lifts off at about 100 km/h and cruises at 210.',
    model: 'trainer', credit: '"Small Airplane" by Vojtěch Balák (CC BY 3.0)',
    modelScale: 1, modelYaw: Math.PI, modelOffset: [0, 0, 0],
    mass: 1000, inertia: [1825, 2667, 1285],
    hull: [{ half: [0.6, 0.65, 1.6], pos: [0, 0.2, 0.9] }, { half: [0.35, 0.35, 1.9], pos: [0, 0.55, -2.5] }, { half: [5.5, 0.08, 0.72], pos: [0, 1.6, 0.2] }, { half: [1.6, 0.05, 0.45], pos: [0, 0.75, -4.5] }],
    surfaces: [
      ...wing({ y: 1.6, z: 0.15, area: 16.2, span: 11, dihedral: 1.7 * deg, incidence: 1.5 * deg, alpha0: -2.2 * deg, clMax: 1.55, cd0: 0.009, e: 0.75, tau: 0.26, flaps: true }),
      { pos: [0, 0.75, -4.5], area: 3.4, aspect: 3.7, orient: 'h', incidence: -2.5 * deg, clMax: 1.1, cd0: 0.009, control: 'elevator', tau: 0.5, slipstream: true, downwash: true },
      { pos: [0, 1.35, -4.75], area: 1.7, aspect: 1.6, orient: 'v', clMax: 1.0, cd0: 0.009, control: 'rudder', tau: 0.5, slipstream: true },
    ],
    bodyCdA: [2.6, 3.4, 0.3],
    engine: { power: 119_000, staticThrust: 2700, propPos: [0, 0.05, 2.5], propRadius: 0.95, rpm: 2400, maxFlaps: 30 * deg },
    // McCauley-style two-blade fixed-pitch: 75 in diameter, ~53 in pitch.
    prop: {
      hub: [-0.03, 0.38, 4.53], blades: 2, pitch: 1.35, chord: 0.15,
      spinner: { base: 4.44, length: 0.42, radius: 0.19, color: 0xe4e4e4 },
      colors: { front: 0xc9ced3, rear: 0x1e1e1e, tips: [0xf2f2f2, 0xcf3a2e] },
      strip: [[[-1.4, -0.5, 4.455], [1.4, 1.25, 4.9]]],
    },
    gear: [
      { pos: [0, -0.75, 1.85], travel: 0.25, type: 'wheel', steer: 12 * deg },
      { pos: [1.25, -0.8, -0.55], travel: 0.18, type: 'wheel', brake: true },
      { pos: [-1.25, -0.8, -0.55], travel: 0.18, type: 'wheel', brake: true },
    ],
    capacity: 4, price: 0, eye: [0.3, 1.05, 0.6],
  },
  // Super Cub on amphibious floats: lands on the sea, the lake, or (on the float wheels) a runway.
  puffin: {
    id: 'puffin', name: 'Puffin', kind: 'plane', realType: 'Amphibious floatplane (Super Cub on floats)',
    blurb: 'Lands on the sea and the lake as well as runways. Short take-off, slow and draggy.',
    model: 'seaplane', credit: '"Sea Plane" by Neil M (CC BY 3.0)',
    modelScale: 7, modelYaw: Math.PI / 2, modelOffset: [0, 0, 0],
    mass: 820, inertia: [1450, 2250, 1150],
    hull: [{ half: [0.55, 0.6, 1.5], pos: [0, 0.3, 0.8] }, { half: [0.35, 0.35, 1.6], pos: [0, 0.6, -2.2] }, { half: [5.3, 0.08, 0.8], pos: [0, 1.55, 0.3] }, { half: [1.5, 0.05, 0.45], pos: [0, 0.9, -3.6] }],
    surfaces: [
      ...wing({ y: 1.55, z: 0.25, area: 16.6, span: 10.7, dihedral: 1.5 * deg, incidence: 2 * deg, alpha0: -2.5 * deg, clMax: 1.65, cd0: 0.010, e: 0.72, tau: 0.28, flaps: true }),
      { pos: [0, 0.9, -3.6], area: 3.0, aspect: 3.5, orient: 'h', incidence: -2 * deg, clMax: 1.1, cd0: 0.01, control: 'elevator', tau: 0.5, slipstream: true, downwash: true },
      { pos: [0, 1.4, -3.8], area: 1.6, aspect: 1.5, orient: 'v', clMax: 1.0, cd0: 0.01, control: 'rudder', tau: 0.5, slipstream: true },
    ],
    bodyCdA: [4.2, 4.8, 0.62],
    engine: { power: 112_000, staticThrust: 2650, propPos: [0, 0.35, 2.4], propRadius: 0.95, rpm: 2500, maxFlaps: 35 * deg },
    // Float Cubs swing a fine-pitch climb prop.
    prop: {
      hub: [0, 0.615, 5.19], blades: 2, pitch: 1.05, chord: 0.14,
      spinner: { base: 4.72, length: 0.72, radius: 0.36, color: 0xf0f0f0 },
      colors: { front: 0xc9ced3, rear: 0x1e1e1e, tips: [0xf2c230] },
      strip: [[[-2.1, -1.2, 4.7], [2.1, 2.45, 5.5]]],
    },
    gear: [
      { pos: [1.3, -1.75, 1.6], travel: 0.15, type: 'wheel', steer: 12 * deg },
      { pos: [-1.3, -1.75, 1.6], travel: 0.15, type: 'wheel', steer: 12 * deg },
      { pos: [1.3, -1.8, -0.4], travel: 0.15, type: 'wheel', brake: true },
      { pos: [-1.3, -1.8, -0.4], travel: 0.15, type: 'wheel', brake: true },
    ],
    floats: [
      { pos: [1.3, -1.35, 0.3], half: [0.38, 0.32, 2.6], volume: 1.15 },
      { pos: [-1.3, -1.35, 0.3], half: [0.38, 0.32, 2.6], volume: 1.15 },
    ],
    capacity: 3, price: 900, eye: [0.25, 0.95, 0.5],
  },
  // Stearman-style biplane: big wings, lots of drag, lifts off almost at walking pace... well, at 80 km/h.
  poppy: {
    id: 'poppy', name: 'Poppy', kind: 'plane', realType: 'Open-cockpit biplane (Stearman class)',
    blurb: 'Two big wings and a tailwheel. Floats off short grass strips; slow, loud and lovely.',
    model: 'biplane', credit: '"Airplane" by Poly by Google (CC BY 3.0)',
    modelScale: 2.6, modelYaw: -Math.PI / 2, modelOffset: [0, 0, 0],
    mass: 1150, inertia: [2100, 3300, 1650],
    hull: [{ half: [0.5, 0.6, 1.6], pos: [0, 0, 0.6] }, { half: [0.3, 0.35, 1.8], pos: [0, 0.25, -2.6] }, { half: [4.9, 0.08, 0.75], pos: [0, 1.3, 0.4] }, { half: [4.5, 0.08, 0.7], pos: [0, -0.35, 0.2] }],
    surfaces: [
      ...wing({ y: 1.3, z: 0.1, area: 15, span: 9.8, dihedral: 1 * deg, incidence: 2 * deg, alpha0: -2.5 * deg, clMax: 1.45, cd0: 0.012, e: 0.65, tau: 0.3, aileronSpan: 0.5 }),
      ...wing({ y: -0.35, z: -0.4, area: 13, span: 9.0, dihedral: 3 * deg, incidence: 2 * deg, alpha0: -2.5 * deg, clMax: 1.4, cd0: 0.012, e: 0.65, tau: 0.3, aileronSpan: 0.5 }),
      { pos: [0, 0.35, -4.4], area: 4.2, aspect: 3.4, orient: 'h', incidence: -2 * deg, clMax: 1.1, cd0: 0.012, control: 'elevator', tau: 0.5, slipstream: true, downwash: true },
      { pos: [0, 0.95, -4.6], area: 1.6, aspect: 1.5, orient: 'v', clMax: 1.0, cd0: 0.012, control: 'rudder', tau: 0.5, slipstream: true },
    ],
    bodyCdA: [3.6, 4.4, 0.85],
    engine: { power: 164_000, staticThrust: 3500, propPos: [0, 0.1, 2.4], propRadius: 1.25, rpm: 2100, maxFlaps: 0 },
    // Sensenich-style metal two-blade, 8 ft 2 in.
    prop: {
      hub: [0, 0.8, 2.9], blades: 2, pitch: 1.55, chord: 0.16,
      spinner: { base: 2.6, length: 0.5, radius: 0.25, color: 0xd8dde2 },
      colors: { front: 0xc9ced3, rear: 0x2a2a2a, tips: [0xf2c230] },
      strip: [[[-1.6, -0.2, 2.42], [1.6, 1.8, 3.2]]],
    },
    gear: [
      { pos: [1.05, -1.35, 0.75], travel: 0.18, type: 'wheel', brake: true },
      { pos: [-1.05, -1.35, 0.75], travel: 0.18, type: 'wheel', brake: true },
      { pos: [0, -0.35, -4.5], travel: 0.12, type: 'wheel', steer: 20 * deg },
    ],
    capacity: 2, price: 700, eye: [0, 0.8, -1.0],
  },
  // Extra 300-style aerobatic monoplane: quick, light on the controls, less forgiving near the stall.
  kestrel: {
    id: 'kestrel', name: 'Kestrel', kind: 'plane', realType: 'Aerobatic monoplane (Extra 300 class)',
    blurb: 'Light, fast and twitchy: rolls quickly and cruises at 300 km/h. Not for beginners.',
    model: 'sport', credit: '"Aeroplane" by Gilang Romadhan (CC BY 3.0)',
    // The model has no landing gear (it sat on its belly): lift it onto fitted gear, nose at the propeller station.
    modelScale: 1, modelYaw: 0, modelOffset: [0, 0.72, -0.6],
    mass: 820, inertia: [1350, 2100, 950],
    hull: [{ half: [0.5, 0.55, 1.5], pos: [0, 0.3, 0.6] }, { half: [0.3, 0.3, 1.8], pos: [0, 0.5, -2.5] }, { half: [3.9, 0.08, 0.8], pos: [0, 0.05, 0.4] }, { half: [1.4, 0.05, 0.4], pos: [0, 0.55, -3.5] }],
    surfaces: [
      ...wing({ y: 0.05, z: 0.0, area: 10.7, span: 8.0, dihedral: 0, incidence: 0.5 * deg, alpha0: 0, clMax: 1.4, cd0: 0.008, e: 0.8, tau: 0.5, aileronSpan: 1 }),
      { pos: [0, 0.55, -3.5], area: 2.6, aspect: 3.8, orient: 'h', incidence: -0.5 * deg, clMax: 1.1, cd0: 0.008, control: 'elevator', tau: 0.55, slipstream: true, downwash: true },
      { pos: [0, 1.0, -3.7], area: 1.3, aspect: 1.6, orient: 'v', clMax: 1.0, cd0: 0.008, control: 'rudder', tau: 0.55, slipstream: true },
    ],
    bodyCdA: [2.2, 2.8, 0.22],
    engine: { power: 220_000, staticThrust: 4600, propPos: [0, 0.4, 2.45], propRadius: 1.0, rpm: 2700, maxFlaps: 0 },
    // MT-style three-blade composite with wide paddle blades.
    prop: {
      hub: [0, 0.28, 2.45], blades: 3, pitch: 1.9, chord: 0.17,
      spinner: { base: 2.31, length: 0.52, radius: 0.3, color: 0xe9c22a },
      colors: { front: 0x2b2b2b, rear: 0x1a1a1a, tips: [0xf2f2f2, 0xcf3a2e] },
      strip: [[[-0.9, -0.28, 1.9], [0.9, 1.22, 2.7]]],
    },
    fittedGear: { legRoot: [0.28, -0.12, 0.82], wheelRadius: 0.19, legColor: 0x333536, spatColor: 0x2f6b2c },
    gear: [
      { pos: [0.95, -0.95, 0.75], travel: 0.15, type: 'wheel', brake: true },
      { pos: [-0.95, -0.95, 0.75], travel: 0.15, type: 'wheel', brake: true },
      { pos: [0, -0.05, -3.55], travel: 0.1, type: 'wheel', steer: 20 * deg },
    ],
    capacity: 1, price: 1400, eye: [0, 0.85, -0.4],
  },
  // Dash 8-100-class regional turboprop: two 2,000 shp turboprops on a high wing, room for a planeload. The model
  // is an An-24-style twin turboprop (converted from its .blend by tools/blend2glb.mjs, in the Heron's livery),
  // scaled to the Dash 8's 25.9 m span and seated so its wheels sit on the gear below.
  heron: {
    id: 'heron', name: 'Heron', kind: 'plane', realType: 'Regional airliner (Dash 8-100 class)',
    blurb: 'Two turboprops and room for a planeload. Needs the long runway; slow to spool, steady as a rock.',
    model: 'turboprop', credit: '"Twin turboprop rigged airplane" by mfonasd (CC0)',
    modelScale: 0.886, modelYaw: 0, modelOffset: [0, 0, -1.517],
    mass: 14_000, inertia: [250_000, 308_000, 147_000],
    hull: [
      { half: [1.3, 1.25, 9.0], pos: [0, 0.21, -0.6] }, { half: [0.6, 0.55, 1.6], pos: [0, 0.95, -10.9] },
      { half: [12.9, 0.2, 1.3], pos: [0, 1.35, -1.2] }, { half: [4.9, 0.1, 0.9], pos: [0, 1.45, -10.2] },
      { half: [0.15, 2.0, 1.4], pos: [0, 3.6, -10.5] },
      { half: [0.55, 0.6, 3.4], pos: [4.17, 1.15, -0.3] }, { half: [0.55, 0.6, 3.4], pos: [-4.17, 1.15, -0.3] },
    ],
    surfaces: [
      // The centre of gravity sits near the wing's quarter chord, as an airliner's does: the tail does the stabilising.
      ...wing({ y: 1.35, z: 0.15, area: 54.4, span: 25.9, dihedral: 1 * deg, incidence: 3 * deg, alpha0: -3 * deg, clMax: 1.7, cd0: 0.008, e: 0.8, tau: 0.32, flaps: true, aileronSpan: 0.3 }),
      // A conventional tail: the tailplane low on the tail cone (it sees the wing's downwash), a tall fin above.
      { pos: [0, 1.5, -10.1], area: 12, aspect: 7, orient: 'h', incidence: 0, clMax: 1.1, cd0: 0.008, control: 'elevator', tau: 0.45, downwash: true },
      { pos: [0, 3.5, -10.5], area: 12, aspect: 1.8, orient: 'v', clMax: 1.0, cd0: 0.008, control: 'rudder', tau: 0.45 },
    ],
    bodyCdA: [30, 40, 1.2],
    // A 14-tonne airliner answers the stick at an airliner's pace.
    handling: { pitchRate: 0.12, rollRate: 0.4 },
    // Two PW120-class turboprops (1,490 kW each), 4-blade 3.96 m constant-speed props governed near 1,200 rpm.
    engine: { power: 2_980_000, staticThrust: 50_000, propPos: [0, 1.15, 3.45], propRadius: 1.98, rpm: 1200, maxFlaps: 35 * deg, props: 2, thrustFade: 220, idle: 0.6, turbine: true },
    prop: {
      hub: [4.17, 1.15, 3.45], blades: 4, pitch: 4.5, chord: 0.15, mirror: true,
      spinner: { base: 3.15, length: 0.7, radius: 0.36, color: 0xf2f2f2 },
      colors: { front: 0x3b3f43, rear: 0x1c1c1c, tips: [0xf2c230] },
      strip: [],
    },
    minRunway: 800,
    gear: [
      { pos: [0, -2.1, 6.65], travel: 0.3, type: 'wheel', steer: 30 * deg },
      { pos: [4.16, -2.1, -0.55], travel: 0.32, type: 'wheel', brake: true },
      { pos: [-4.16, -2.1, -0.55], travel: 0.32, type: 'wheel', brake: true },
    ],
    capacity: 10, price: 2600, eye: [0.55, 0.98, 6.4],
  },
  // Bell 206-class light helicopter: lands anywhere flat, including the summit pad and village helipad.
  hummingbird: {
    id: 'hummingbird', name: 'Hummingbird', kind: 'heli', realType: 'Light helicopter (Bell 206 class)',
    blurb: 'Hovers, turns on the spot and lands on any flat patch: helipads, the summit, a garden.',
    model: 'helicopter', credit: '"Helicopter" by Poly by Google (CC BY 3.0)',
    modelScale: 0.0107, modelYaw: Math.PI, modelOffset: [0, 0, 0],
    mass: 1250, inertia: [3600, 3100, 1300],
    hull: [{ half: [0.8, 0.75, 1.7], pos: [0, 0.1, 0.4] }, { half: [0.18, 0.18, 2.4], pos: [0, 0.45, -3.4] }],
    surfaces: [
      { pos: [0, 0.4, -4.8], area: 0.9, aspect: 3, orient: 'h', clMax: 1.0, cd0: 0.01, control: null },
      { pos: [0, 0.9, -5.6], area: 1.1, aspect: 1.5, orient: 'v', clMax: 1.0, cd0: 0.01, control: null },
    ],
    bodyCdA: [5.5, 7.5, 1.3],
    rotor: { radius: 5.08, hub: [0, 2.15, 0], power: 236_000, rpm: 394, maxTilt: 9 * deg, tailArm: 6.2 },
    gear: [
      { pos: [1.15, -1.0, 1.25], travel: 0.12, type: 'skid' }, { pos: [-1.15, -1.0, 1.25], travel: 0.12, type: 'skid' },
      { pos: [1.15, -1.0, -1.05], travel: 0.12, type: 'skid' }, { pos: [-1.15, -1.0, -1.05], travel: 0.12, type: 'skid' },
    ],
    capacity: 3, price: 2200, eye: [0.35, 0.6, 1.15],
  },
  // Cameron O-77-class hot-air balloon: heat to rise, vent to sink, steer by finding the wind you want.
  dandelion: {
    id: 'dandelion', name: 'Dandelion', kind: 'balloon', realType: 'Hot-air balloon (2,200 m³ envelope)',
    blurb: 'No steering wheel: climb or sink to find a breeze going your way. The wind turns with height.',
    model: 'balloon', credit: '"Hot air balloon" by Poly by Google (CC BY 3.0)',
    modelScale: 0.25, modelYaw: 0, modelOffset: [0, -0.6, 0],
    mass: 450, inertia: [3000, 3000, 3000],
    hull: [{ half: [0.75, 0.55, 0.75], pos: [0, 0, 0] }],
    surfaces: [],
    bodyCdA: [1.3, 1.3, 1.3],
    balloon: { volume: 2200, envelopeY: 12.5, radius: 8.5, burner: 3_000_000 },
    gear: [
      { pos: [0.7, -0.55, 0.7], travel: 0.08, type: 'basket' }, { pos: [-0.7, -0.55, 0.7], travel: 0.08, type: 'basket' },
      { pos: [0.7, -0.55, -0.7], travel: 0.08, type: 'basket' }, { pos: [-0.7, -0.55, -0.7], travel: 0.08, type: 'basket' },
    ],
    capacity: 1, price: 500, eye: [0, 0.9, 0],
  },
};

export const AIRCRAFT_ORDER = ['wren', 'poppy', 'puffin', 'hummingbird', 'dandelion', 'kestrel', 'heron'];
