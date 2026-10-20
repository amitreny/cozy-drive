import { describe, expect, it } from 'vitest';
import { boardJobs, CARGO, cargoText, payout, roadReward, unitsOf, type Board } from '../src/gameplay/jobs';
import { allPlaces } from '../src/world/airports';
import { generateWorld } from '../src/world/terrainGen';

const world = generateWorld(7);
const places = allPlaces({ x: 4, z: 956 });
const shops = world.lots.filter((l) => l.kind === 'shop');
const board = (id: string): Board => { const l = world.lots.find((x) => x.id === id)!; return { id: l.id, name: l.name, x: l.front[0], z: l.front[1], business: l.business }; };

describe('delivery jobs', () => {
  it('every business offers work from its trade, to real addresses', () => {
    expect(shops.length).toBeGreaterThan(10);
    for (const s of shops) {
      const jobs = boardJobs(board(s.id), world.lots, places, 0);
      expect(jobs.length, s.name).toBeGreaterThanOrEqual(3);
      for (const j of jobs) {
        expect(world.lots.some((l) => l.id === j.to.id), `${s.name} → ${j.to.name}`).toBe(true);
        expect(j.km).toBeGreaterThan(0.2);
        expect(j.reward).toBeGreaterThanOrEqual(10);
      }
    }
  });
  it('is deterministic per batch, and a new batch brings new work', () => {
    const b = board(shops[0].id);
    expect(boardJobs(b, world.lots, places, 3)).toEqual(boardJobs(b, world.lots, places, 3));
    expect(boardJobs(b, world.lots, places, 4).map((j) => j.to.id)).not.toEqual(boardJobs(b, world.lots, places, 3).map((j) => j.to.id));
  });
  it('the bakery sends bread and fragile cakes; the farm supplies other businesses', () => {
    const bakery = shops.find((s) => s.business === 'bakery')!, farm = shops.find((s) => s.business === 'farm')!;
    const cargo = new Set<string>(); for (let b = 0; b < 6; b++) for (const j of boardJobs(board(bakery.id), world.lots, places, b)) cargo.add(j.cargo);
    expect([...cargo].sort()).toEqual(['bread', 'cake']);
    let toShop = 0; for (let b = 0; b < 8; b++) for (const j of boardJobs(board(farm.id), world.lots, places, b)) if (j.to.id.startsWith('shop')) toShop++;
    expect(toShop).toBeGreaterThan(0);
  });
  it('air cargo goes between bases, helipads by helicopter and docks by seaplane', () => {
    const airfield = places.find((p) => p.id === 'airfield')!;
    const jobs = Array.from({ length: 6 }, (_, b) => boardJobs({ id: 'airfield', name: airfield.name, x: 0, z: 0, place: airfield }, world.lots, places, b)).flat();
    expect(jobs.every((j) => j.air && j.to.kind === 'place' && j.to.id !== 'airfield')).toBe(true);
    for (let b = 0; b < 6; b++) expect(jobs.slice(b * 4, b * 4 + 4).filter((j) => !j.only).length).toBeGreaterThanOrEqual(2); // every batch has aeroplane work
    for (const j of jobs) {
      const p = places.find((x) => x.id === j.to.id)!;
      expect(j.only).toBe(p.kind === 'helipad' ? 'heli' : p.kind === 'dock' ? 'seaplane' : undefined);
    }
  });
  it('pays more for distance and heavy loads, with care, time and helicopter bonuses', () => {
    expect(roadReward(2, 'parcel', 1)).toBeGreaterThan(roadReward(1, 'parcel', 1));
    expect(roadReward(1, 'timber', 1)).toBeGreaterThan(roadReward(1, 'parcel', 1));
    const cake = { ...boardJobs(board(shops.find((s) => s.business === 'bakery')!.id), world.lots, places, 0)[0], cargo: 'cake' as const, reward: 50, timeLimit: null };
    expect(payout(cake, { seconds: 999, care: 1 }).total).toBe(70);
    expect(payout(cake, { seconds: 999, care: 0.5 }).total).toBe(60);
    const fish = { ...cake, cargo: 'fish' as const, timeLimit: 100 };
    expect(payout(fish, { seconds: 90, care: 1 }).onTime).toBeGreaterThan(0);
    expect(payout(fish, { seconds: 120, care: 1 }).onTime).toBe(0);
    expect(payout(fish, { seconds: 120, care: 1, byHeli: true }).heli).toBeGreaterThan(0);
  });
  it('describes cargo nicely', () => {
    expect(cargoText('bread', 2)).toBe('🍞 2 loaves of bread');
    expect(cargoText('cake', 1)).toBe('🎂 a birthday cake');
    expect(cargoText('parcel', 3)).toBe('📦 3 parcels');
    expect(unitsOf({ cargo: 'furniture', count: 1 } as never)).toBe(CARGO.furniture.units);
  });
});
