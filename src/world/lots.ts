import { AIRPORTS, inRect } from './airports';
import { mulberry32 } from './noise';
import type { RoadPath } from './roads';

/**
 * Homes and businesses: Kenney City Kit buildings on plots beside the roads, generated deterministically in the
 * world worker (they need the final roads and terrain). Each plot knows who lives there and where its letterbox
 * is, so delivery jobs can send you to it.
 */
export type BusinessType = 'post' | 'bakery' | 'cafe' | 'grocer' | 'hardware' | 'florist' | 'fish' | 'woodworks' | 'farm' | 'honey' | 'icecream';
export interface Lot {
  id: string; kind: 'house' | 'shop';
  x: number; y: number; z: number; yaw: number;
  /** Footprint (m) across the front (w) and front-to-back (d), and roof height. */
  w: number; d: number; h: number;
  model: string; variant: number;
  name: string; settlement: string; business?: BusinessType;
  /** Delivery point: the letterbox / shop door by the road. */
  front: [number, number];
  /** Where the driveway meets the road. */
  road: [number, number];
}
export interface Settlement { id: string; name: string; x: number; z: number; r: number; houses: number; shops: BusinessType[] }

/** Building scale: Kenney City Kit units to metres (a two-storey house comes out ~9 m wide, 8 m tall). */
export const BUILDING_SCALE = 7;
/** Footprints in Kenney units (half x, half z, height) measured from the models; +z is the front door. */
export const HOUSE_MODELS: Record<string, [number, number, number]> = {
  'building-type-a': [0.65, 0.51, 0.83], 'building-type-b': [0.91, 0.57, 1.14], 'building-type-c': [0.64, 0.51, 1.03], 'building-type-d': [0.88, 0.51, 1.24],
  'building-type-e': [0.65, 0.51, 1.14], 'building-type-f': [0.71, 0.70, 1.14], 'building-type-g': [0.73, 0.59, 0.77], 'building-type-h': [0.65, 0.46, 0.74],
  'building-type-i': [0.64, 0.51, 0.74], 'building-type-j': [0.69, 0.46, 1.04], 'building-type-k': [0.46, 0.51, 1.15], 'building-type-l': [0.52, 0.51, 1.05],
  'building-type-m': [0.71, 0.71, 0.74], 'building-type-n': [0.89, 0.69, 1.14], 'building-type-o': [0.64, 0.51, 1.14], 'building-type-p': [0.62, 0.50, 0.92],
  'building-type-q': [0.62, 0.46, 0.92], 'building-type-r': [0.51, 0.51, 1.14], 'building-type-s': [0.70, 0.54, 1.14], 'building-type-t': [0.66, 0.70, 1.16],
  'building-type-u': [0.71, 0.54, 1.14],
};
/** Low-rise commercial buildings that read as shops (no tower blocks: this is a small island). */
export const SHOP_MODELS: Record<string, [number, number, number]> = {
  'building-a': [0.44, 0.47, 1.29], 'building-b': [0.49, 0.47, 1.29], 'building-c': [0.44, 0.55, 0.89], 'building-d': [0.42, 0.45, 1.29],
  'building-e': [0.82, 0.50, 0.89], 'building-h': [0.44, 0.50, 1.29], 'building-k': [1.04, 0.47, 1.47],
};

export const SETTLEMENTS: Settlement[] = [
  { id: 'hearthwick', name: 'Hearthwick', x: 0, z: -350, r: 430, houses: 20, shops: [] },
  { id: 'harbour', name: 'Harbour', x: 0, z: -1480, r: 230, houses: 5, shops: ['fish'] },
  { id: 'lakeside', name: 'Lakeside', x: -1390, z: 500, r: 240, houses: 6, shops: ['cafe'] },
  { id: 'pinehollow', name: 'Pine Hollow', x: -1000, z: 620, r: 260, houses: 5, shops: ['woodworks'] },
  { id: 'canyonranch', name: 'Canyon Ranch', x: 980, z: -20, r: 260, houses: 4, shops: ['farm'] },
  { id: 'duneend', name: 'Dune End', x: 560, z: -780, r: 230, houses: 3, shops: ['icecream'] },
  { id: 'reedmarsh', name: 'Reed Marsh', x: -860, z: -640, r: 220, houses: 3, shops: ['honey'] },
  { id: 'northshore', name: 'Northshore', x: -150, z: 1440, r: 320, houses: 6, shops: ['grocer'] },
  { id: 'passfoot', name: 'Pass Foot', x: 230, z: 520, r: 230, houses: 4, shops: [] },
];

/** The village plaza: shops on a ring facing the centre, in the gaps between the roads (angles from +z). */
export const PLAZA_SHOPS: { angle: number; business: BusinessType }[] = [
  { angle: 40, business: 'post' }, { angle: 75, business: 'bakery' }, { angle: 110, business: 'cafe' },
  { angle: 145, business: 'grocer' }, { angle: 255, business: 'hardware' }, { angle: 285, business: 'florist' },
];

const BUSINESS_NAMES: Record<BusinessType, (town: string) => string> = {
  post: (t) => `${t} Post Office`, bakery: () => 'Crumb & Crust Bakery', cafe: (t) => (t === 'Hearthwick' ? 'The Kettle Café' : `${t} Café`),
  grocer: (t) => `${t} Stores`, hardware: () => 'Nuts & Bolts Hardware', florist: () => 'Petal & Stem Florist', fish: () => 'Harbour Fish',
  woodworks: () => 'Pine Hollow Woodworks', farm: () => 'Canyon Ranch Farm Shop', honey: () => 'Reed & Honey', icecream: () => 'Dune Scoops',
};
const COTTAGE = ['Bramble', 'Willow', 'Honeysuckle', 'Foxglove', 'Thistle', 'Rosehip', 'Juniper', 'Clover', 'Sorrel', 'Hazel', 'Ivy', 'Larkspur', 'Primrose', 'Bluebell', 'Heather', 'Elder', 'Rowan', 'Marigold', 'Fern', 'Damson', 'Quince', 'Medlar', 'Sloe', 'Teasel'];
const SUFFIX = ['Cottage', 'House', 'End', 'Corner', 'Lodge', 'Barn', 'Nook', 'Hollow', 'Rise', 'View'];
const FAMILY = ['Ashby', 'Pennywhistle', 'Fairweather', 'Lark', 'Merriweather', 'Thorne', 'Bramwell', 'Hollins', 'Kettle', 'Puddifoot', 'Applegate', 'Dimble', 'Quill', 'Tumble', 'Hartley', 'Mossop', 'Pickering', 'Sparrow', 'Whitlock', 'Bellamy', 'Fernsby', 'Goodbody', 'Honeywell', 'Inkpen'];

/** Who lives at a house (stable per lot id). */
export function residents(lot: Lot): string {
  if (lot.kind === 'shop') return lot.name;
  const h = [...lot.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return `the ${FAMILY[h % FAMILY.length]}s`;
}

export interface LotEnv { height(x: number, z: number): number; water(x: number, z: number): number }

/** Place every settlement's plots. Deterministic. */
export function placeLots(roads: RoadPath[], env: LotEnv, plaza: { x: number; z: number; r: number }): Lot[] {
  const lots: Lot[] = [], usedNames = new Set<string>();
  // Spatial hash of road samples with their half widths, to keep plots off every road.
  const CELL = 24, grid = new Map<string, [number, number, number][]>();
  const key = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  for (const r of roads) for (let i = 0; i < r.xs.length; i++) { const k = key(r.xs[i], r.zs[i]); (grid.get(k) ?? grid.set(k, []).get(k)!).push([r.xs[i], r.zs[i], r.def.width / 2]); }
  const clearOfRoads = (x: number, z: number, margin: number) => {
    for (let gx = -2; gx <= 2; gx++) for (let gz = -2; gz <= 2; gz++) for (const [rx, rz, hw] of grid.get(key(x + gx * CELL, z + gz * CELL)) ?? []) if (Math.hypot(rx - x, rz - z) < hw + margin) return false;
    return true;
  };
  /** Footprint corners and centre: all clear of roads, dry, near level, away from other plots and airports. */
  const fits = (x: number, z: number, yaw: number, w: number, d: number, roadGap: number): number | null => {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), sx = fz, sz = -fx, hs: number[] = [];
    for (const [a, b] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const px = x + sx * (a * w / 2) + fx * (b * d / 2), pz = z + sz * (a * w / 2) + fz * (b * d / 2);
      if (!clearOfRoads(px, pz, roadGap)) return null;
      const h = env.height(px, pz);
      if (h < env.water(px, pz) + 1.2) return null;
      hs.push(h);
      for (const ap of AIRPORTS) for (const r of [...ap.level, ...ap.paved]) if (inRect(r, px, pz, 12)) return null;
      if (ap_pad(px, pz)) return null;
    }
    if (Math.max(...hs) - Math.min(...hs) > 3.2) return null;
    if (Math.hypot(x - plaza.x, z - plaza.z) < plaza.r + 30) return null;
    for (const l of lots) if (Math.hypot(l.x - x, l.z - z) < (Math.max(l.w, l.d) + Math.max(w, d)) / 2 + 7) return null;
    return hs.reduce((s, h) => s + h, 0) / hs.length;
  };
  const ap_pad = (x: number, z: number) => AIRPORTS.some((a) => a.pad && Math.hypot(a.pad.x - x, a.pad.z - z) < a.pad.r + 14);

  const name = (rnd: () => number, town: string) => {
    for (let k = 0; k < 40; k++) {
      const n = `${COTTAGE[Math.floor(rnd() * COTTAGE.length)]} ${SUFFIX[Math.floor(rnd() * SUFFIX.length)]}`;
      if (!usedNames.has(n)) { usedNames.add(n); return n; }
    }
    return `${town} House ${lots.length}`;
  };

  // ---- Village plaza shops: on a ring, doors facing the plaza ----
  const shopModels = Object.keys(SHOP_MODELS);
  PLAZA_SHOPS.forEach((s, i) => {
    const a = (s.angle * Math.PI) / 180, r = plaza.r + 13;
    const model = shopModels[(i * 3 + 1) % shopModels.length], [hx, hz, hh] = SHOP_MODELS[model];
    const x = plaza.x + Math.sin(a) * (r + hz * BUILDING_SCALE), z = plaza.z + Math.cos(a) * (r + hz * BUILDING_SCALE);
    const yaw = a + Math.PI; // +z (front) faces the centre
    const fr: [number, number] = [plaza.x + Math.sin(a) * (r - 3), plaza.z + Math.cos(a) * (r - 3)];
    lots.push({ id: `shop-hearthwick-${s.business}`, kind: 'shop', x, y: env.height(plaza.x, plaza.z), z, yaw, w: hx * 2 * BUILDING_SCALE, d: hz * 2 * BUILDING_SCALE, h: hh * BUILDING_SCALE,
      model, variant: i % 2, name: BUSINESS_NAMES[s.business]('Hearthwick'), settlement: 'Hearthwick', business: s.business, front: fr, road: fr });
  });

  // ---- Every settlement: shops first (closest to the centre), then homes ----
  SETTLEMENTS.forEach((st, si) => {
    const rnd = mulberry32(1000 + si * 77);
    const cands: { r: RoadPath; i: number; d: number }[] = [];
    for (const r of roads) for (let i = 4; i < r.xs.length - 4; i += 3) {
      const d = Math.hypot(r.xs[i] - st.x, r.zs[i] - st.z);
      if (d < st.r) cands.push({ r, i, d });
    }
    // Shops want the nearest road spots; homes take a shuffled spread.
    cands.sort((a, b) => a.d - b.d);
    const shuffled = cands.slice();
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    const tryPlace = (list: typeof cands, kind: 'house' | 'shop', business?: BusinessType): boolean => {
      for (const c of list) for (const side of rnd() < 0.5 ? [1, -1] : [-1, 1]) {
        const { r, i } = c, tx = r.xs[i + 1] - r.xs[i - 1], tz = r.zs[i + 1] - r.zs[i - 1], tl = Math.hypot(tx, tz) || 1;
        const nx = (tz / tl) * side, nz = (-tx / tl) * side; // to this side of the road
        const models = kind === 'shop' ? SHOP_MODELS : HOUSE_MODELS, keys = Object.keys(models);
        const model = keys[Math.floor(rnd() * keys.length)], [hx, hz, hh] = models[model];
        const w = hx * 2 * BUILDING_SCALE, d = hz * 2 * BUILDING_SCALE, hw = r.def.width / 2, setback = kind === 'shop' ? 5 : r.def.kind === 'highway' ? 12 : 8;
        const off = hw + setback + d / 2, x = r.xs[i] + nx * off, z = r.zs[i] + nz * off;
        const yaw = Math.atan2(-nx, -nz); // front faces the road
        const y = fits(x, z, yaw, w + 2, d + 2, 1.5);
        if (y === null) continue;
        const front: [number, number] = [r.xs[i] + nx * (hw + 2.2), r.zs[i] + nz * (hw + 2.2)];
        const id = `${kind}-${st.id}-${lots.length}`;
        lots.push({ id, kind, x, y, z, yaw, w, d, h: hh * BUILDING_SCALE, model, variant: Math.floor(rnd() * 3),
          name: business ? BUSINESS_NAMES[business](st.name) : name(rnd, st.name), settlement: st.name, business, front, road: [r.xs[i], r.zs[i]] });
        return true;
      }
      return false;
    };
    for (const b of st.shops) tryPlace(cands, 'shop', b);
    let placed = 0;
    for (let k = 0; k < st.houses * 3 && placed < st.houses; k++) if (tryPlace(shuffled.slice(k * 7 % Math.max(1, shuffled.length)), 'house')) placed++;
  });
  return lots;
}
