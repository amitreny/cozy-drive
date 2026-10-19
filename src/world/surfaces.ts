/** Surface & tyre data. Values come from docs/05-world-and-terrain.md. Pure module. */
export const S = { Asphalt: 0, Cobble: 1, Gravel: 2, Dirt: 3, Grass: 4, Mud: 5, Sand: 6, Snow: 7, Ice: 8, Rock: 9, Wood: 10, Water: 11 } as const;
export type SurfaceId = (typeof S)[keyof typeof S];
type RGB = [number, number, number];

export interface SurfaceDef {
  name: string;
  grip: number;   // base mu for road tyres
  crr: number;    // rolling resistance coefficient
  sink: number;   // metres the wheel visually sinks
  soft: boolean;  // benefits from low tyre pressure
  color: RGB;     // terrain vertex colour
  particle: RGB | null; // dust/spray colour, null = none
  noise: [freq: number, q: number, gain: number]; // rolling-sound band-pass
  bumpy: number;  // camera / audio roughness 0..1
}

const c = (hex: number): RGB => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const def = (name: string, grip: number, crr: number, sink: number, soft: boolean, color: number,
  particle: number | null, noise: [number, number, number], bumpy: number): SurfaceDef =>
  ({ name, grip, crr, sink, soft, color: c(color), particle: particle === null ? null : c(particle), noise, bumpy });

export const SURFACES: SurfaceDef[] = [
  def('Asphalt', 1.0, 0.012, 0, false, 0x5d5f66, null, [300, 0.7, 0.25], 0),
  def('Cobble', 0.85, 0.02, 0, false, 0x9a8f84, null, [160, 1.2, 0.55], 0.6),
  def('Gravel', 0.65, 0.03, 0.01, false, 0x9a9283, 0xc9c0ae, [2400, 0.6, 0.8], 0.35),
  def('Dirt', 0.75, 0.03, 0.015, false, 0xa77a52, 0xc49a70, [900, 0.7, 0.5], 0.25),
  def('Grass', 0.62, 0.05, 0.02, false, 0x8db35f, 0x7fa552, [1800, 0.5, 0.35], 0.2),
  def('Mud', 0.35, 0.08, 0.07, true, 0x5e4630, 0x4e3a28, [260, 1.5, 0.7], 0.15),
  def('Sand', 0.45, 0.15, 0.06, true, 0xe8d3a2, 0xeedcb0, [3800, 0.5, 0.55], 0.1),
  def('Snow', 0.35, 0.08, 0.06, true, 0xf4f7fb, 0xffffff, [1300, 0.9, 0.45], 0.1),
  def('Ice', 0.12, 0.01, 0, false, 0xbfe2f2, 0xe8f6ff, [5200, 2, 0.15], 0),
  def('Rock', 0.8, 0.02, 0, false, 0xa45a3f, 0xb88a72, [120, 1, 0.7], 0.7),
  def('Wood', 0.75, 0.015, 0, false, 0x9b6b43, null, [200, 2, 0.6], 0.4),
  def('Shallow water', 0.5, 0.1, 0.03, true, 0x6aa6b8, 0xd9f1f7, [700, 0.6, 0.8], 0.2),
];

export type TyreType = 'road' | 'allTerrain' | 'mud' | 'snow' | 'sand' | 'rally';
export const TYRE_TYPES: TyreType[] = ['road', 'allTerrain', 'mud', 'snow', 'sand', 'rally'];
export const TYRE_NAMES: Record<TyreType, string> = {
  road: 'Road', allTerrain: 'All-terrain', mud: 'Mud', snow: 'Snow (studded)', sand: 'Sand paddle', rally: 'Rally gravel',
};

// Rows follow S order. Columns: road, allTerrain, mud, snow, sand, rally.
const MATRIX: number[][] = [
  [1.0, 0.92, 0.82, 0.85, 0.7, 0.9],  // Asphalt
  [1.0, 0.95, 0.88, 0.9, 0.75, 0.95], // Cobble
  [1.0, 1.2, 1.2, 1.1, 1.0, 1.35],    // Gravel
  [1.0, 1.2, 1.3, 1.1, 1.05, 1.3],    // Dirt
  [1.0, 1.2, 1.35, 1.1, 1.1, 1.15],   // Grass
  [1.0, 1.4, 1.9, 1.2, 1.1, 1.2],     // Mud
  [1.0, 1.2, 1.2, 1.0, 1.8, 1.1],     // Sand
  [1.0, 1.25, 1.3, 2.0, 1.1, 1.2],    // Snow
  [1.0, 1.1, 1.0, 3.0, 0.9, 1.1],     // Ice
  [1.0, 1.1, 1.15, 0.95, 0.85, 1.0],  // Rock
  [1.0, 0.95, 0.9, 0.9, 0.8, 0.95],   // Wood
  [1.0, 1.15, 1.3, 1.0, 1.2, 1.1],    // Shallow water
];

export function tyreSurfaceFactor(tyre: TyreType, surface: SurfaceId): number {
  return MATRIX[surface][TYRE_TYPES.indexOf(tyre)];
}

/** Pressure in bar (0.8..2.6, nominal 2.0) → grip, rolling-resistance and sinkage multipliers. */
export function pressureEffect(surface: SurfaceId, pressure: number): { grip: number; crr: number; sink: number } {
  const low = Math.max(0, Math.min(1, (2.0 - pressure) / 1.2)); // 0 at 2.0 bar, 1 at 0.8 bar
  const high = Math.max(0, Math.min(1, (pressure - 2.0) / 0.6));
  if (SURFACES[surface].soft) return { grip: 1 + 0.25 * low - 0.1 * high, crr: 1 - 0.35 * low + 0.2 * high, sink: 1 - 0.4 * low };
  // Firm off-road ground: a bigger contact patch still grips better (rock crawlers air down too).
  if (surface === S.Grass || surface === S.Dirt || surface === S.Gravel || surface === S.Rock) return { grip: 1 + 0.14 * low - 0.06 * high, crr: 1 + 0.2 * low - 0.1 * high, sink: 1 };
  return { grip: 1 - 0.1 * low, crr: 1 + 0.5 * low - 0.15 * high, sink: 1 };
}

/** Effective friction coefficient for a tyre on a surface. */
export function gripFor(tyre: TyreType, baseGrip: number, surface: SurfaceId, pressure: number): number {
  return SURFACES[surface].grip * tyreSurfaceFactor(tyre, surface) * baseGrip * pressureEffect(surface, pressure).grip;
}
