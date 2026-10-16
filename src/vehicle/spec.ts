import type { TyreType } from '../world/surfaces';

export type DriveLayout = 'FWD' | 'RWD' | 'AWD';

export interface AxleSpec {
  z: number;          // local z of the axle (forward is +z)
  halfTrack: number;  // half the distance between left and right wheels
  freq: number;       // suspension natural frequency (Hz); spring rate is derived from mass
  zeta: number;       // damping ratio
  antiRoll: number;   // anti-roll stiffness as a fraction of the spring rate
  maxSteer: number;   // radians, 0 for a non-steering axle
  brake: number;      // max brake force per wheel (N)
}

export interface VehicleSpec {
  id: string;
  name: string;
  mass: number;
  half: [number, number, number];          // chassis collider half extents
  comY: number;                            // centre-of-mass height offset (negative = lower)
  inertiaScale: [number, number, number];
  mountY: number;                          // suspension mount height in chassis space
  restLength: number;                      // suspension length at full droop
  wheelRadius: number;
  wheelWidth: number;
  tyre: TyreType;
  pressure: number;                        // bar
  baseGrip: number;
  torqueCurve: [rpm: number, nm: number][];
  idleRpm: number;
  maxRpm: number;
  gears: number[];
  reverse: number;
  finalDrive: number;
  lowRange: number | null;                 // multiplier when 4L is engaged, null = no low range
  layout: DriveLayout;
  frontSplit: number;                      // AWD torque share to the front axle
  diffLock: number;                        // 0 open .. 1 locked
  lockable: boolean;                       // driver can toggle the lockers
  front: AxleSpec;
  rear: AxleSpec;
  drag: number;                            // F = drag * v^2
  wadingDepth: number;                     // metres of water before the engine sputters
  sound: { cylinders: number; tone: number };
  /** Optional roof or roll-cage collider, in ground-relative coordinates (see bodyDefs). */
  cabin?: { y0: number; y1: number; z0: number; z1: number; hx: number };
}

/** Chassis-space height of the ground when the car rests on its springs. */
export function restGroundY(s: VehicleSpec): number {
  const f = (s.front.freq + s.rear.freq) / 2;
  const comp = Math.min(9.81 / (2 * Math.PI * f) ** 2, s.restLength);
  return s.mountY - (s.restLength - comp) - s.wheelRadius;
}

const axle = (z: number, halfTrack: number, freq: number, steer: number, brake: number, extra: Partial<AxleSpec> = {}): AxleSpec =>
  ({ z, halfTrack, freq, zeta: 0.38, antiRoll: 0.35, maxSteer: steer, brake, ...extra });

/**
 * Fit a spec to a Kenney Car Kit model (docs/decisions/0003). Model units: ground at y=0, wheel radius 0.3,
 * wheels centred at x=±0.425. `s` scales the model uniformly to metres.
 */
interface ModelFit { s: number; frontZ: number; rearZ: number; body: { x: number; y0: number; y1: number; z0: number; z1: number } }
function fit(base: Omit<VehicleSpec, 'wheelRadius' | 'half' | 'mountY'> & { oldRadius: number }, m: ModelFit): VehicleSpec {
  const { oldRadius, ...rest } = base;
  const r = 0.3 * m.s, groundOffset = ((m.body.y0 + m.body.y1) / 2) * m.s;
  const spec = { ...rest, wheelRadius: r, mountY: 0, half: [m.body.x * m.s * 0.97, ((m.body.y1 - m.body.y0) / 2) * m.s * 0.97, ((m.body.z1 - m.body.z0) / 2) * m.s * 0.97] as [number, number, number] } as VehicleSpec;
  spec.front = { ...spec.front, z: m.frontZ * m.s, halfTrack: 0.425 * m.s };
  spec.rear = { ...spec.rear, z: m.rearZ * m.s, halfTrack: 0.425 * m.s };
  spec.finalDrive = base.finalDrive * (r / oldRadius); // keep the same road speed per gear
  // Put the mount where the resting ground sits at -groundOffset in chassis space.
  spec.mountY = -groundOffset - restGroundY({ ...spec, mountY: 0 });
  return spec;
}

/** Stock car types. Names are placeholders (docs/03-vehicles-and-physics.md). */
export const CAR_TYPES: Record<string, VehicleSpec> = {
  pip: fit({
    id: 'pip', name: 'Pip · compact hatchback', mass: 1000, comY: -0.3, inertiaScale: [1.1, 1.4, 1.1], oldRadius: 0.31,
    restLength: 0.32, wheelWidth: 0.3, tyre: 'road', pressure: 2.0, baseGrip: 1.05,
    torqueCurve: [[800, 102], [2000, 127], [3500, 142], [4500, 138], [5500, 117], [6500, 93]], idleRpm: 850, maxRpm: 6600,
    gears: [3.4, 2.05, 1.42, 1.08, 0.86], reverse: 3.2, finalDrive: 4.1, lowRange: null,
    layout: 'FWD', frontSplit: 1, diffLock: 0, lockable: false,
    front: axle(0, 0, 1.7, 0.6, 3100, { antiRoll: 0.5 }), rear: axle(0, 0, 1.8, 0, 1700, { antiRoll: 0.45 }),
    drag: 0.48, wadingDepth: 0.35, sound: { cylinders: 4, tone: 1.0 },
  }, { s: 1.4, frontZ: 0.81, rearZ: -0.81, body: { x: 0.65, y0: 0.15, y1: 1.1, z0: -1.45, z1: 1.4 } }),
  badger: fit({
    id: 'badger', name: 'Badger · off-roader 4×4', mass: 1800, comY: -0.42, inertiaScale: [1.2, 1.5, 1.2], oldRadius: 0.42,
    restLength: 0.48, wheelWidth: 0.36, tyre: 'allTerrain', pressure: 2.0, baseGrip: 1.0,
    torqueCurve: [[800, 255], [1800, 340], [3000, 355], [4200, 322], [5000, 278]], idleRpm: 750, maxRpm: 5200,
    gears: [3.9, 2.25, 1.48, 1.0, 0.8], reverse: 3.6, finalDrive: 3.9, lowRange: 2.7,
    layout: 'AWD', frontSplit: 0.5, diffLock: 0, lockable: true,
    front: axle(0, 0, 1.35, 0.58, 6500, { zeta: 0.42, antiRoll: 0.35 }), rear: axle(0, 0, 1.45, 0, 4500, { zeta: 0.42, antiRoll: 0.3 }),
    drag: 0.75, wadingDepth: 0.6, sound: { cylinders: 6, tone: 0.75 },
  }, { s: 1.4, frontZ: 0.76, rearZ: -0.56, body: { x: 0.75, y0: 0.2, y1: 1.3, z0: -1.2, z1: 1.35 } }),
  biscuit: fit({
    id: 'biscuit', name: 'Biscuit · camper van', mass: 2100, comY: -0.25, inertiaScale: [1.2, 1.4, 1.2], oldRadius: 0.36,
    restLength: 0.34, wheelWidth: 0.32, tyre: 'road', pressure: 2.2, baseGrip: 1.0,
    torqueCurve: [[800, 185], [2000, 235], [3200, 240], [4200, 205], [4800, 175]], idleRpm: 800, maxRpm: 5000,
    gears: [4.0, 2.3, 1.5, 1.05, 0.8], reverse: 3.8, finalDrive: 4.3, lowRange: null,
    layout: 'RWD', frontSplit: 0, diffLock: 0.2, lockable: false,
    front: axle(0, 0, 1.25, 0.55, 7000, { antiRoll: 0.55 }), rear: axle(0, 0, 1.35, 0, 5000, { antiRoll: 0.5 }),
    drag: 0.95, wadingDepth: 0.45, sound: { cylinders: 4, tone: 0.85 },
  }, { s: 1.35, frontZ: 0.76, rearZ: -0.76, body: { x: 0.75, y0: 0.15, y1: 1.35, z0: -1.4, z1: 1.35 } }),
  maple: fit({
    id: 'maple', name: 'Maple · family sedan', mass: 1250, comY: -0.3, inertiaScale: [1.1, 1.4, 1.1], oldRadius: 0.32,
    restLength: 0.32, wheelWidth: 0.3, tyre: 'road', pressure: 2.1, baseGrip: 1.03,
    torqueCurve: [[800, 130], [2000, 165], [3500, 180], [4500, 172], [5500, 150], [6300, 125]], idleRpm: 800, maxRpm: 6400,
    gears: [3.5, 2.1, 1.45, 1.1, 0.85], reverse: 3.3, finalDrive: 4.0, lowRange: null,
    layout: 'FWD', frontSplit: 1, diffLock: 0, lockable: false,
    front: axle(0, 0, 1.5, 0.58, 3800, { antiRoll: 0.5 }), rear: axle(0, 0, 1.6, 0, 2200, { antiRoll: 0.45 }),
    drag: 0.5, wadingDepth: 0.35, sound: { cylinders: 4, tone: 0.95 },
  }, { s: 1.4, frontZ: 0.66, rearZ: -0.66, body: { x: 0.75, y0: 0.15, y1: 1.3, z0: -1.3, z1: 1.25 } }),
  bramble: fit({
    id: 'bramble', name: 'Bramble · pickup', mass: 1900, comY: -0.35, inertiaScale: [1.2, 1.5, 1.2], oldRadius: 0.42,
    restLength: 0.45, wheelWidth: 0.36, tyre: 'allTerrain', pressure: 2.0, baseGrip: 1.0,
    torqueCurve: [[800, 260], [1800, 340], [3000, 360], [4200, 330], [5200, 280]], idleRpm: 750, maxRpm: 5400,
    gears: [3.8, 2.2, 1.45, 1.0, 0.78], reverse: 3.5, finalDrive: 3.8, lowRange: 2.6,
    layout: 'AWD', frontSplit: 0.4, diffLock: 0.2, lockable: true,
    front: axle(0, 0, 1.35, 0.55, 6800, { zeta: 0.42, antiRoll: 0.35 }), rear: axle(0, 0, 1.5, 0, 4800, { zeta: 0.42, antiRoll: 0.3 }),
    drag: 0.8, wadingDepth: 0.55, sound: { cylinders: 8, tone: 0.7 },
  }, { s: 1.4, frontZ: 0.86, rearZ: -0.76, body: { x: 0.75, y0: 0.15, y1: 1.3, z0: -1.5, z1: 1.45 } }),
  comet: fit({
    id: 'comet', name: 'Comet · sports coupe', mass: 1300, comY: -0.38, inertiaScale: [1.05, 1.25, 1.05], oldRadius: 0.33,
    restLength: 0.24, wheelWidth: 0.34, tyre: 'road', pressure: 2.2, baseGrip: 1.15,
    torqueCurve: [[1000, 250], [2500, 330], [4000, 360], [5500, 350], [6800, 310], [7800, 260]], idleRpm: 900, maxRpm: 7900,
    gears: [3.2, 2.15, 1.6, 1.25, 1.0, 0.82], reverse: 3.1, finalDrive: 3.7, lowRange: null,
    layout: 'RWD', frontSplit: 0, diffLock: 0.45, lockable: false,
    front: axle(0, 0, 2.1, 0.55, 5200, { zeta: 0.45, antiRoll: 0.65 }), rear: axle(0, 0, 2.2, 0, 3600, { zeta: 0.45, antiRoll: 0.55 }),
    drag: 0.6, wadingDepth: 0.25, sound: { cylinders: 8, tone: 1.15 },
  }, { s: 1.45, frontZ: 0.66, rearZ: -0.66, body: { x: 0.65, y0: 0.15, y1: 1.1, z0: -1.3, z1: 1.25 } }),
  skipper: {
    id: 'skipper', name: 'Skipper · dune buggy', mass: 650, half: [0.78, 0.35, 1.6], comY: -0.2, inertiaScale: [1.1, 1.3, 1.1],
    mountY: 0.0, restLength: 0.52, wheelRadius: 0.36, wheelWidth: 0.28, tyre: 'allTerrain', pressure: 1.6, baseGrip: 1.0,
    torqueCurve: [[1000, 100], [3000, 135], [5000, 142], [6500, 122], [7500, 96]], idleRpm: 1000, maxRpm: 7800,
    gears: [3.0, 2.0, 1.45, 1.12, 0.9], reverse: 3.0, finalDrive: 4.2, lowRange: null,
    layout: 'RWD', frontSplit: 0, diffLock: 0.5, lockable: false,
    front: axle(1.2, 0.8, 1.15, 0.6, 2800, { zeta: 0.45 }), rear: axle(-1.15, 0.82, 1.25, 0, 2200, { zeta: 0.45 }),
    drag: 0.42, wadingDepth: 0.35, sound: { cylinders: 2, tone: 1.3 },
    cabin: { y0: 0.95, y1: 1.75, z0: -0.95, z1: 0.25, hx: 0.62 },
  },
};
