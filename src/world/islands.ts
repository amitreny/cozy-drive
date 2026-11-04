/**
 * The archipelago around the main island. Each outlying island is an ellipse (half-axes `halfLen` along `dir` and
 * `halfWid` across it) with a noisy coast, gentle ground and a few hills. Pure data plus geometry, shared by the
 * terrain generator, the airports and roads laid out on the islands, and gameplay (which landmass a spot is on).
 * Angles as in airports.ts: `dir` is measured from +z towards +x. +z is north and +x is WEST (see ui/map.ts).
 */
export interface Island {
  id: string; name: string;
  cx: number; cz: number; dir: number; halfLen: number; halfWid: number;
  /** Ground height inland (m) and how much it rolls. */
  base: number; roll: number;
  hills: { x: number; z: number; r: number; h: number }[];
  /** Woodland cover (0..1): pines underfoot like the main island's forest. */
  forest?: number;
  /** Islands joined by road share a landmass: you can drive between them. The main island's is 'main'. */
  landmass: string;
}

/** The main island: a disc of this radius (plus a noisy coast) at the origin. */
export const MAIN_RADIUS = 1750;
/** Metres from an outlying island's nominal coast to full height inland. The shoreline sits about 120 m inside it. */
export const BEACH = 260;

const deg = Math.PI / 180;

/** Point at `a` metres along an island's axis and `c` metres across it (to the axis's left, +x when dir = 0). */
export function onIsland(isl: Pick<Island, 'cx' | 'cz' | 'dir'>, a: number, c: number): [number, number] {
  const ux = Math.sin(isl.dir), uz = Math.cos(isl.dir);
  return [isl.cx + ux * a + uz * c, isl.cz + uz * a - ux * c];
}

/** Normalised elliptical radius of (x, z): below 1 inside the nominal coast. */
export function islandRadius(isl: Island, x: number, z: number): number {
  const ux = Math.sin(isl.dir), uz = Math.cos(isl.dir), dx = x - isl.cx, dz = z - isl.cz;
  const a = dx * ux + dz * uz, c = dx * uz - dz * ux;
  return Math.hypot(a / isl.halfLen, c / isl.halfWid);
}

/** Metres inland of the nominal coast, measured along the ray from the island's centre (negative out at sea). */
export function inland(isl: Island, x: number, z: number): number {
  const d = islandRadius(isl, x, z), r = Math.hypot(x - isl.cx, z - isl.cz);
  return d < 1e-6 ? Infinity : r * (1 / d - 1);
}

const LONGREACH: Island = {
  id: 'longreach', name: 'Longreach', cx: 3080, cz: -300, dir: 0, halfLen: 2550, halfWid: 800, base: 7, roll: 5, landmass: 'main',
  // Beacon Hill on the far (west) shore and a low rise in the south, both well clear of the runway's approaches.
  hills: [{ x: 3640, z: 950, r: 280, h: 58 }, { x: 2660, z: -2250, r: 300, h: 26 }],
};
const GULL: Island = {
  id: 'gull', name: 'Gull Isle', cx: -2900, cz: 2650, dir: 70 * deg, halfLen: 900, halfWid: 560, base: 6, roll: 9, landmass: 'gull',
  hills: [{ x: -2825, z: 3028, r: 240, h: 55 }],
};
const PINE: Island = {
  id: 'pine', name: 'Pine Holm', cx: 1500, cz: 2950, dir: 20 * deg, halfLen: 520, halfWid: 430, base: 8, roll: 10, forest: 0.9, landmass: 'pine',
  hills: [{ x: 1540, z: 3080, r: 300, h: 62 }],
};
const LANTERN: Island = {
  id: 'lantern', name: 'Lantern Rock', cx: -2600, cz: -2850, dir: 15 * deg, halfLen: 310, halfWid: 260, base: 5, roll: 6, landmass: 'lantern',
  hills: [{ x: -2590, z: -2820, r: 210, h: 36 }],
};
/** Bare rocks off the harbour: scenery for the boats and seaplanes. */
const skerry = (n: number, cx: number, cz: number, dirDeg: number, halfLen: number, halfWid: number, h: number): Island => ({
  id: `skerry-${n}`, name: 'Seal Skerries', cx, cz, dir: dirDeg * deg, halfLen, halfWid, base: 2, roll: 3, landmass: `skerry-${n}`,
  hills: [{ x: cx, z: cz, r: Math.min(halfLen, halfWid) * 1.2, h }],
});

export const ISLANDS: Island[] = [
  LONGREACH, GULL, PINE, LANTERN,
  skerry(1, -1150, -2600, 30, 230, 150, 14), skerry(2, -1500, -2780, 80, 180, 140, 10), skerry(3, -900, -2900, 10, 170, 135, 8),
];
export const islandById = (id: string): Island => ISLANDS.find((i) => i.id === id)!;

/** Which landmass (x, z) is on, or would be if you stood on its beach: 'main', an island's, or null at sea. */
export function landmassAt(x: number, z: number): string | null {
  if (Math.hypot(x, z) < MAIN_RADIUS + 250) return 'main';
  for (const isl of ISLANDS) if (inland(isl, x, z) > -150) return isl.landmass;
  return null;
}
