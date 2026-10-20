import type { AirPlace } from '../world/airports';
import { residents, type BusinessType, type Lot } from '../world/lots';
import { mulberry32 } from '../world/noise';

/**
 * Delivery jobs (pure, unit-tested). Every business has a job board with work that suits its trade; the airfield
 * and the grass strip have an air-cargo office. Jobs pay Acorns by distance and load, with bonuses for careful
 * handling (fragile goods) and for being on time (things that melt or spoil).
 */
export type Cargo = 'parcel' | 'bread' | 'cake' | 'flowers' | 'groceries' | 'tools' | 'timber' | 'fish' | 'eggs' | 'honey' | 'icecream' | 'furniture' | 'mail' | 'medicine' | 'lunch';
export interface CargoDef { name: string; icon: string; units: number; fragile?: boolean; perishable?: boolean; heavy?: boolean }
export const CARGO: Record<Cargo, CargoDef> = {
  parcel: { name: 'parcel', icon: '📦', units: 1 }, bread: { name: 'loaf of bread', icon: '🍞', units: 1 },
  cake: { name: 'birthday cake', icon: '🎂', units: 1, fragile: true }, flowers: { name: 'bouquet', icon: '💐', units: 1, fragile: true },
  groceries: { name: 'bag of groceries', icon: '🛒', units: 1 }, tools: { name: 'box of tools', icon: '🧰', units: 2, heavy: true },
  timber: { name: 'bundle of timber', icon: '🪵', units: 3, heavy: true }, fish: { name: 'crate of fresh fish', icon: '🐟', units: 1, perishable: true },
  eggs: { name: 'tray of eggs', icon: '🥚', units: 1, fragile: true }, honey: { name: 'jar of honey', icon: '🍯', units: 1, fragile: true },
  icecream: { name: 'tub of ice cream', icon: '🍦', units: 1, perishable: true }, furniture: { name: 'armchair', icon: '🪑', units: 4, heavy: true },
  mail: { name: 'sack of air mail', icon: '✉️', units: 1 }, medicine: { name: 'medicine box', icon: '💊', units: 1, perishable: true },
  lunch: { name: 'packed lunch', icon: '🥪', units: 1, perishable: true },
};
const plural = (c: Cargo, n: number): string => {
  const name = CARGO[c].name;
  if (n === 1) return `a ${name}`;
  const [first, ...rest] = name.split(' ');
  const p = first === 'loaf' ? 'loaves' : first === 'box' ? 'boxes' : first === 'bunch' ? 'bunches' : first.endsWith('y') && !/[aeiou]y$/.test(first) ? first.slice(0, -1) + 'ies' : `${first}s`;
  return `${n} ${[p, ...rest].join(' ')}`;
};
export const cargoText = (c: Cargo, n: number): string => `${CARGO[c].icon} ${plural(c, n)}`;

/** How many cargo units each vehicle can carry. */
export const CAR_CAPACITY: Record<string, number> = { pip: 2, maple: 3, comet: 1, badger: 3, biscuit: 6, bramble: 8, skipper: 1 };

export interface Stop { id: string; name: string; who: string; town: string; x: number; z: number; kind: 'lot' | 'place' }
export interface Job {
  id: string; board: string; from: Stop; to: Stop; cargo: Cargo; count: number;
  /** Flown between bases: needs an aircraft (and `only` narrows which). */
  air: boolean; only?: 'heli' | 'seaplane';
  km: number; reward: number;
  /** Seconds to earn the on-time bonus (perishables only). */
  timeLimit: number | null;
}
export interface Board { id: string; name: string; x: number; z: number; business?: BusinessType; place?: AirPlace }

const WHAT: Record<BusinessType, Cargo[]> = {
  post: ['parcel', 'parcel', 'parcel'], bakery: ['bread', 'bread', 'cake'], cafe: ['lunch'], grocer: ['groceries'], hardware: ['tools', 'timber'],
  florist: ['flowers'], fish: ['fish'], woodworks: ['furniture'], farm: ['eggs'], honey: ['honey'], icecream: ['icecream'],
};
/** Some trades supply other businesses (farm eggs to the bakery, fish to the cafés...). */
const SUPPLIES: Partial<Record<BusinessType, BusinessType[]>> = { farm: ['bakery', 'cafe', 'grocer'], honey: ['grocer', 'cafe', 'bakery'], fish: ['cafe', 'grocer'], bakery: ['cafe'], woodworks: ['hardware'] };

export const lotStop = (l: Lot): Stop => ({ id: l.id, name: l.name, who: residents(l), town: l.settlement, x: l.front[0], z: l.front[1], kind: 'lot' });
export const placeStop = (p: AirPlace): Stop => ({ id: p.id, name: p.name, who: p.name, town: p.name, x: p.spawn.x, z: p.spawn.z, kind: 'place' });
const round5 = (v: number) => Math.max(10, Math.round(v / 5) * 5);

/** Pay for a road job (Acorns) from distance and load. */
export function roadReward(km: number, cargo: Cargo, count: number): number {
  const d = CARGO[cargo];
  return round5((12 + 20 * km + count * 4) * (d.heavy ? 1.25 : 1));
}
/** Pay for an air-cargo job. */
export const airReward = (km: number, only?: 'heli' | 'seaplane'): number => round5((30 + 34 * km) * (only ? 1.25 : 1));

/** The jobs a board offers for its `batch` (the batch moves on as jobs are taken). Deterministic. */
export function boardJobs(board: Board, lots: Lot[], places: AirPlace[], batch: number): Job[] {
  const seed = [...board.id].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381) + batch * 7919;
  const rnd = mulberry32(seed), jobs: Job[] = [];
  const from: Stop = board.place ? placeStop(board.place) : { id: board.id, name: board.name, who: board.name, town: '', x: board.x, z: board.z, kind: 'lot' };
  const dist = (s: Stop) => Math.hypot(s.x - from.x, s.z - from.z) / 1000;
  if (board.place) {
    const dests = places.filter((p) => p.id !== board.place!.id && Math.hypot(p.spawn.x - from.x, p.spawn.z - from.z) > 500);
    // At least two runway-to-runway runs (any aeroplane can fly those), then helipads and docks for the specialists.
    const runways = dests.filter((p) => p.kind === 'airfield' || p.kind === 'strip');
    for (let k = 0; k < 4 && dests.length; k++) {
      const pool = k < 2 && runways.length ? runways : dests;
      const p = pool[Math.floor(rnd() * pool.length)], to = placeStop(p), km = dist(to);
      const only = p.kind === 'helipad' ? 'heli' as const : p.kind === 'dock' ? 'seaplane' as const : undefined;
      const cargo: Cargo = only === 'heli' ? (rnd() < 0.5 ? 'medicine' : 'mail') : rnd() < 0.6 ? 'mail' : 'parcel';
      const count = 1 + Math.floor(rnd() * 2);
      jobs.push({ id: `${board.id}-${batch}-${k}`, board: board.id, from, to, cargo, count, air: true, only, km, reward: airReward(km, only) + count * 5,
        timeLimit: CARGO[cargo].perishable ? Math.round(km * 1000 / 30 * 1.8 + 180) : null });
    }
    return jobs;
  }
  const kinds = WHAT[board.business!], homes = lots.filter((l) => l.kind === 'house' && l.id !== board.id);
  const partners = lots.filter((l) => l.kind === 'shop' && l.business && (SUPPLIES[board.business!] ?? []).includes(l.business));
  for (let k = 0; k < 4; k++) {
    const cargo = kinds[Math.floor(rnd() * kinds.length)];
    // Mostly nearby (0.3–2.5 km), sometimes across the island; a third of supply runs go to a partner business.
    let target: Lot | undefined;
    if (partners.length && rnd() < 0.35) target = partners[Math.floor(rnd() * partners.length)];
    for (let tries = 0; !target && tries < 30; tries++) {
      const h = homes[Math.floor(rnd() * homes.length)], d = Math.hypot(h.front[0] - from.x, h.front[1] - from.z);
      if (d > 250 && (d < 2500 || rnd() < 0.25)) target = h;
    }
    if (!target) continue;
    const to = lotStop(target), km = dist(to), units = CARGO[cargo].units;
    const count = units > 1 ? 1 : 1 + Math.floor(rnd() * (cargo === 'parcel' ? 3 : 2));
    // Perishables get a generous road time (≈ 45 km/h door to door, plus a minute to get going).
    const timeLimit = CARGO[cargo].perishable ? Math.round((km * 1000 * 1.3) / 12.5 + 60) : null;
    jobs.push({ id: `${board.id}-${batch}-${k}`, board: board.id, from, to, cargo, count, air: false, km, reward: roadReward(km, cargo, count), timeLimit });
  }
  return jobs;
}

/** Units a job takes up. */
export const unitsOf = (j: Job): number => CARGO[j.cargo].units * j.count;

/** What a finished job pays: base, a careful-handling bonus for fragile goods, an on-time bonus, a doorstep-by-helicopter bonus. */
export function payout(j: Job, opts: { seconds: number; care: number; byHeli?: boolean }): { base: number; care: number; onTime: number; heli: number; total: number } {
  const base = j.reward;
  const care = CARGO[j.cargo].fragile ? Math.round(base * 0.4 * Math.max(0, Math.min(1, opts.care))) : 0;
  const onTime = j.timeLimit !== null && opts.seconds <= j.timeLimit ? Math.round(base * 0.35) : 0;
  const heli = opts.byHeli && !j.air ? Math.round(base * 0.2) : 0;
  return { base, care, onTime, heli, total: base + care + onTime + heli };
}
