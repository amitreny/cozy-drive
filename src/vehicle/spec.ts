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
  comZ?: number;                           // centre-of-mass fore/aft offset (positive = towards the nose)
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
  /** Approach/departure angle in degrees: how steep a slope change the bumpers clear. */
  approachDeg?: number;
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
 * Fit a spec to a detailed car model (see vehicle/detailedModel.ts and docs/decisions/0008). Measurements are in
 * the model's own units: wheel centres (front/rear z, track centre x, mean half-track), mean tyre radius, body box,
 * and the tyres' bottom (the ground). `wheelbase` is the real car's, in metres; it sets the scale. The collision box
 * keeps the real ground `clearance` (bodies reach the ground with mud flaps and spoilers).
 */
interface ModelFit {
  wheelbase: number; clearance: number;
  wheels: { fz: number; rz: number; cx: number; halfTrack: number; r: number };
  body: { x: number; y1: number; z0: number; z1: number }; ground: number;
}
function fit(base: Omit<VehicleSpec, 'wheelRadius' | 'half' | 'mountY'> & { oldRadius: number }, m: ModelFit): VehicleSpec {
  const { oldRadius, ...rest } = base;
  const s = m.wheelbase / (m.wheels.fz - m.wheels.rz), r = m.wheels.r * s;
  const cz = (m.body.z0 + m.body.z1) / 2;
  const y0 = m.clearance, y1 = (m.body.y1 - m.ground) * s;
  const spec = { ...rest, wheelRadius: r, mountY: 0, half: [m.body.x * s * 0.92, (y1 - y0) / 2 * 0.97, ((m.body.z1 - m.body.z0) / 2) * s * 0.96] as [number, number, number] } as VehicleSpec;
  spec.front = { ...spec.front, z: (m.wheels.fz - cz) * s, halfTrack: m.wheels.halfTrack * s };
  spec.rear = { ...spec.rear, z: (m.wheels.rz - cz) * s, halfTrack: m.wheels.halfTrack * s };
  spec.finalDrive = base.finalDrive * (r / oldRadius); // keep the same road speed per gear
  // Put the mount where the resting ground sits half a body-height below the collision box's centre.
  spec.mountY = -(y0 + y1) / 2 - restGroundY({ ...spec, mountY: 0 });
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
    drag: 0.48, wadingDepth: 0.35, sound: { cylinders: 4, tone: 1.0 }, approachDeg: 20,
  }, { wheelbase: 2.4, clearance: 0.15, wheels: { fz: 5.473, rz: -5.04, cx: 0.231, halfTrack: 3.156, r: 1.315 }, body: { x: 4.05, y1: 5.633, z0: -9.302, z1: 9.308 }, ground: -0.172 }),
  badger: fit({
    id: 'badger', name: 'Badger · off-roader 4×4', mass: 1800, comY: -0.42, inertiaScale: [1.2, 1.5, 1.2], oldRadius: 0.42,
    restLength: 0.48, wheelWidth: 0.36, tyre: 'allTerrain', pressure: 2.0, baseGrip: 1.0,
    torqueCurve: [[800, 255], [1800, 340], [3000, 355], [4200, 322], [5000, 278]], idleRpm: 750, maxRpm: 5200,
    gears: [3.9, 2.25, 1.48, 1.0, 0.8], reverse: 3.6, finalDrive: 3.9, lowRange: 2.7,
    layout: 'AWD', frontSplit: 0.5, diffLock: 0, lockable: true,
    front: axle(0, 0, 1.35, 0.58, 6500, { zeta: 0.42, antiRoll: 0.35 }), rear: axle(0, 0, 1.45, 0, 4500, { zeta: 0.42, antiRoll: 0.3 }),
    drag: 0.75, wadingDepth: 0.6, sound: { cylinders: 6, tone: 0.75 }, approachDeg: 42,
  }, { wheelbase: 2.54, clearance: 0.26, wheels: { fz: 1.286, rz: -2.225, cx: -0.004, halfTrack: 1.012, r: 0.542 }, body: { x: 1.26, y1: 1.588, z0: -4.245, z1: 2.257 }, ground: -1.356 }),
  biscuit: fit({
    id: 'biscuit', name: 'Biscuit · camper van', mass: 2100, comY: -0.25, inertiaScale: [1.2, 1.4, 1.2], oldRadius: 0.36,
    restLength: 0.34, wheelWidth: 0.32, tyre: 'road', pressure: 2.2, baseGrip: 1.0,
    torqueCurve: [[800, 185], [2000, 235], [3200, 240], [4200, 205], [4800, 175]], idleRpm: 800, maxRpm: 5000,
    gears: [4.0, 2.3, 1.5, 1.05, 0.8], reverse: 3.8, finalDrive: 4.3, lowRange: null,
    layout: 'RWD', frontSplit: 0, diffLock: 0.2, lockable: false,
    front: axle(0, 0, 1.25, 0.55, 7000, { antiRoll: 0.55 }), rear: axle(0, 0, 1.35, 0, 5000, { antiRoll: 0.5 }),
    drag: 0.95, wadingDepth: 0.45, sound: { cylinders: 4, tone: 0.85 }, approachDeg: 20,
  }, { wheelbase: 3.0, clearance: 0.18, wheels: { fz: 1.847, rz: -1.563, cx: 0, halfTrack: 1.209, r: 0.523 }, body: { x: 1.592, y1: 3.023, z0: -2.685, z1: 2.997 }, ground: -0.156 }),
  maple: fit({
    id: 'maple', name: 'Maple · family sedan', mass: 1250, comY: -0.3, comZ: 0.3, inertiaScale: [1.1, 1.4, 1.1], oldRadius: 0.32,
    restLength: 0.32, wheelWidth: 0.3, tyre: 'road', pressure: 2.1, baseGrip: 1.03,
    torqueCurve: [[800, 130], [2000, 165], [3500, 180], [4500, 172], [5500, 150], [6300, 125]], idleRpm: 800, maxRpm: 6400,
    gears: [3.5, 2.1, 1.45, 1.1, 0.85], reverse: 3.3, finalDrive: 4.0, lowRange: null,
    layout: 'FWD', frontSplit: 1, diffLock: 0, lockable: false,
    front: axle(0, 0, 1.5, 0.58, 3800, { antiRoll: 0.5 }), rear: axle(0, 0, 1.6, 0, 2200, { antiRoll: 0.45 }),
    drag: 0.5, wadingDepth: 0.35, sound: { cylinders: 4, tone: 0.95 }, approachDeg: 17,
  }, { wheelbase: 2.64, clearance: 0.15, wheels: { fz: 2.398, rz: -1.171, cx: -0.009, halfTrack: 0.998, r: 0.405 }, body: { x: 1.356, y1: 1.506, z0: -2.86, z1: 3.491 }, ground: -0.345 }),
  bramble: fit({
    id: 'bramble', name: 'Bramble · pickup', mass: 1900, comY: -0.35, inertiaScale: [1.2, 1.5, 1.2], oldRadius: 0.42,
    restLength: 0.45, wheelWidth: 0.36, tyre: 'allTerrain', pressure: 2.0, baseGrip: 1.0,
    torqueCurve: [[800, 260], [1800, 340], [3000, 360], [4200, 330], [5200, 280]], idleRpm: 750, maxRpm: 5400,
    gears: [3.8, 2.2, 1.45, 1.0, 0.78], reverse: 3.5, finalDrive: 3.8, lowRange: 2.6,
    layout: 'AWD', frontSplit: 0.4, diffLock: 0.2, lockable: true,
    front: axle(0, 0, 1.35, 0.55, 6800, { zeta: 0.42, antiRoll: 0.35 }), rear: axle(0, 0, 1.5, 0, 4800, { zeta: 0.42, antiRoll: 0.3 }),
    drag: 0.8, wadingDepth: 0.55, sound: { cylinders: 8, tone: 0.7 }, approachDeg: 32,
  }, { wheelbase: 3.0, clearance: 0.24, wheels: { fz: 0.069, rz: -1.179, cx: 0.074, halfTrack: 0.286, r: 0.159 }, body: { x: 0.407, y1: 0.765, z0: -1.689, z1: 0.409 }, ground: 0.003 }),
  comet: fit({
    id: 'comet', name: 'Comet · sports coupe', mass: 1300, comY: -0.38, inertiaScale: [1.05, 1.25, 1.05], oldRadius: 0.33,
    restLength: 0.24, wheelWidth: 0.34, tyre: 'road', pressure: 2.2, baseGrip: 1.15,
    torqueCurve: [[1000, 250], [2500, 330], [4000, 360], [5500, 350], [6800, 310], [7800, 260]], idleRpm: 900, maxRpm: 7900,
    gears: [3.2, 2.15, 1.6, 1.25, 1.0, 0.82], reverse: 3.1, finalDrive: 3.7, lowRange: null,
    layout: 'RWD', frontSplit: 0, diffLock: 0.45, lockable: false,
    front: axle(0, 0, 2.1, 0.55, 5200, { zeta: 0.45, antiRoll: 0.65 }), rear: axle(0, 0, 2.2, 0, 3600, { zeta: 0.45, antiRoll: 0.55 }),
    drag: 0.6, wadingDepth: 0.25, sound: { cylinders: 8, tone: 1.15 }, approachDeg: 13,
  }, { wheelbase: 2.43, clearance: 0.12, wheels: { fz: 1.221, rz: -1.228, cx: 0, halfTrack: 0.748, r: 0.316 }, body: { x: 0.897, y1: 1.264, z0: -2.165, z1: 2.155 }, ground: -0.01 }),
  skipper: fit({
    id: 'skipper', name: 'Skipper · dune buggy', mass: 650, comY: -0.2, inertiaScale: [1.1, 1.3, 1.1], oldRadius: 0.36,
    restLength: 0.52, wheelWidth: 0.28, tyre: 'allTerrain', pressure: 1.6, baseGrip: 1.0,
    torqueCurve: [[1000, 100], [3000, 135], [5000, 142], [6500, 122], [7500, 96]], idleRpm: 1000, maxRpm: 7800,
    gears: [3.0, 2.0, 1.45, 1.12, 0.9], reverse: 3.0, finalDrive: 4.2, lowRange: null,
    layout: 'RWD', frontSplit: 0, diffLock: 0.5, lockable: false,
    front: axle(0, 0, 1.15, 0.6, 2800, { zeta: 0.45 }), rear: axle(0, 0, 1.25, 0, 2200, { zeta: 0.45 }),
    drag: 0.42, wadingDepth: 0.35, sound: { cylinders: 2, tone: 1.3 }, approachDeg: 50,
    cabin: { y0: 0.95, y1: 1.75, z0: -0.95, z1: 0.25, hx: 0.62 },
  }, { wheelbase: 2.1, clearance: 0.3, wheels: { fz: 1.271, rz: -0.783, cx: -0.006, halfTrack: 0.672, r: 0.293 }, body: { x: 0.94, y1: 0.845, z0: -2.037, z1: 1.525 }, ground: -0.554 }),
};
