import { CAR_TYPES, type VehicleSpec } from '../vehicle/spec';
import { TYRE_TYPES, type TyreType } from '../world/surfaces';

export type Finish = 'gloss' | 'satin' | 'matte' | 'metallic' | 'pearl';
export type DiffKind = 'open' | 'lsd' | 'locker';
export type WheelStyle = 'default' | 'dark' | 'racing' | 'truck';
export const WHEEL_STYLES: WheelStyle[] = ['default', 'dark', 'racing', 'truck'];
export const WHEEL_NAMES: Record<WheelStyle, string> = { default: 'Classic', dark: 'Black', racing: 'Sport', truck: 'Off-road' };

/** Everything the player chose. Saved as-is; physics values are always derived via resolveSpec. */
export interface Build {
  version: 1;
  carType: string;
  tyre: TyreType;
  lift: 0 | 1 | 2;
  engineStage: 0 | 1 | 2 | 3;
  diff: DiffKind;
  snorkel: boolean;
  wheels: WheelStyle;
  paint: string;   // #rrggbb
  accent: string;  // #rrggbb (roof / trim)
  finish: Finish;
}

export const FINISHES: Finish[] = ['gloss', 'satin', 'matte', 'metallic', 'pearl'];
export const COZY_SWATCHES = ['#d9704f', '#e9b44c', '#7fa37a', '#6c9bc4', '#f2e3c6', '#b5838d', '#4f6d7a', '#c96f8e', '#e07a5f', '#3d405b'];

export function defaultBuild(carType: string): Build {
  const base = CAR_TYPES[carType];
  if (!base) throw new Error(`Unknown car type ${carType}`);
  const paint: Record<string, string> = { pip: '#d9704f', badger: '#7fa37a', biscuit: '#6c9bc4', skipper: '#e9b44c', maple: '#b5838d', bramble: '#4f6d7a', comet: '#c94c4c' };
  const wheels: Record<string, WheelStyle> = { badger: 'truck', bramble: 'truck', pip: 'racing', comet: 'racing' };
  return { version: 1, carType, tyre: base.tyre, lift: 0, engineStage: 0, diff: base.lockable ? 'locker' : 'open', snorkel: false, wheels: wheels[carType] ?? 'default',
    paint: paint[carType] ?? '#d9704f', accent: '#f2e3c6', finish: 'gloss' };
}

/** Which options are allowed on which car type (compatibility rules). */
export function allowed(carType: string) {
  const base = CAR_TYPES[carType];
  return {
    tyres: TYRE_TYPES.filter((t) => t !== 'sand' || ['skipper', 'badger', 'bramble'].includes(carType)),
    lifts: (carType === 'comet' ? [0] : ['biscuit', 'maple'].includes(carType) ? [0, 1] : [0, 1, 2]) as Build['lift'][],
    wheels: carType === 'skipper' ? [] : WHEEL_STYLES,
    diffs: (base.lockable ? ['open', 'lsd', 'locker'] : ['open', 'lsd']) as DiffKind[],
    snorkel: ['badger', 'biscuit', 'bramble'].includes(carType),
  };
}

/** Repair a build so every choice is valid for its car type (old saves, build codes). */
export function sanitize(b: Build): Build {
  const ok = allowed(b.carType);
  return {
    ...b,
    tyre: ok.tyres.includes(b.tyre) ? b.tyre : CAR_TYPES[b.carType].tyre,
    lift: ok.lifts.includes(b.lift) ? b.lift : 0,
    diff: ok.diffs.includes(b.diff) ? b.diff : 'open',
    snorkel: ok.snorkel && b.snorkel,
    wheels: WHEEL_STYLES.includes(b.wheels) ? b.wheels : defaultBuild(b.carType).wheels,
    engineStage: Math.max(0, Math.min(3, b.engineStage | 0)) as Build['engineStage'],
  };
}

const TYRE_MODS: Record<TyreType, { radius: number; grip: number; mass: number; pressure: number }> = {
  road: { radius: 0, grip: 1.0, mass: 0, pressure: 2.0 },
  allTerrain: { radius: 0.015, grip: 1.0, mass: 10, pressure: 1.9 },
  mud: { radius: 0.03, grip: 1.0, mass: 20, pressure: 1.7 },
  snow: { radius: 0.0, grip: 1.0, mass: 8, pressure: 2.0 },
  sand: { radius: 0.04, grip: 1.0, mass: 6, pressure: 1.2 },
  rally: { radius: 0.0, grip: 1.03, mass: 4, pressure: 2.0 },
};

/** Pure: build → physics spec. Used by the garage stats, the vehicle and tests. */
export function resolveSpec(input: Build): VehicleSpec {
  const b = sanitize(input);
  const s: VehicleSpec = structuredClone(CAR_TYPES[b.carType]);
  const t = TYRE_MODS[b.tyre];
  s.tyre = b.tyre;
  s.wheelRadius += t.radius * (s.wheelRadius / 0.35);
  s.baseGrip *= t.grip;
  s.pressure = t.pressure;
  s.mass += t.mass;

  s.restLength += 0.07 * b.lift;
  s.comY += 0.04 * b.lift;
  s.wadingDepth += 0.12 * b.lift;
  s.front.freq *= 1 - 0.04 * b.lift;
  s.rear.freq *= 1 - 0.04 * b.lift;
  s.mass += 15 * b.lift;

  const boost = 1 + 0.13 * b.engineStage;
  s.torqueCurve = s.torqueCurve.map(([rpm, nm]) => [rpm, nm * boost]);
  s.maxRpm += 150 * b.engineStage;
  s.mass += 6 * b.engineStage;

  s.diffLock = b.diff === 'lsd' ? Math.max(s.diffLock, 0.35) : b.diff === 'open' ? Math.min(s.diffLock, 0.2) : s.diffLock;
  s.lockable = b.diff === 'locker';
  if (b.snorkel) { s.wadingDepth += 0.35; s.mass += 5; }
  return s;
}

/** Garage stat bars, 0..1. Heuristics calibrated against the proving ground later. */
export function stats(s: VehicleSpec) {
  const peak = Math.max(...s.torqueCurve.map(([rpm, nm]) => (nm * rpm) / 9549)); // kW
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return {
    power: clamp(peak / 200),
    acceleration: clamp((peak / s.mass) * 6),
    clearance: clamp((s.restLength + s.wheelRadius - 0.55) / 0.5),
    comfort: clamp(1.6 - (s.front.freq + s.rear.freq) / 2.5),
    offroad: clamp(((s.layout === 'AWD' ? 0.35 : 0.1) + (s.restLength - 0.3) + (s.tyre === 'road' ? 0 : 0.2) + (s.lockable ? 0.15 : 0) + s.diffLock * 0.1)),
  };
}
