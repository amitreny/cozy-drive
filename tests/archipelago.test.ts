import { describe, expect, it } from 'vitest';
import { aimDistance } from '../src/flight/approach';
import { AIRCRAFT } from '../src/flight/specs';
import { boardJobs } from '../src/gameplay/jobs';
import { usableAt } from '../src/ui/hangar';
import { airportById, AIRPORTS, along, CODES, local, onAirfield } from '../src/world/airports';
import { ISLANDS, landmassAt } from '../src/world/islands';
import { scatter } from '../src/world/scatter';
import { S } from '../src/world/surfaces';
import { generateWorld, heightAt, isClear, isDry, surfaceAt, waterLevelAt, WORLD_SIZE } from '../src/world/terrainGen';

const world = generateWorld(7);
const longreach = airportById('longreach')!, lr = longreach.runway!;

describe('the archipelago (8 × 8 km)', () => {
  it('is an 8 km world with the main island and its outlying islands, sea between them', () => {
    expect(world.size).toBe(WORLD_SIZE);
    expect(heightAt(world, 0, 0)).toBeGreaterThan(2);
    for (const isl of ISLANDS) {
      expect(heightAt(world, isl.cx, isl.cz), isl.id).toBeGreaterThan(1.5);
      expect(landmassAt(isl.cx, isl.cz)).toBe(isl.landmass);
    }
    // Open water between the main island and each named island (the causeway aside).
    for (const id of ['gull', 'pine', 'lantern']) {
      const isl = ISLANDS.find((i) => i.id === id)!;
      const d = Math.hypot(isl.cx, isl.cz), ux = isl.cx / d, uz = isl.cz / d, m = 1750 + (d - 1750 - Math.min(isl.halfLen, isl.halfWid)) / 2;
      expect(heightAt(world, ux * m, uz * m), id).toBeLessThan(-3);
    }
    // The world's edges are open sea.
    for (const [x, z] of [[-4000, 0], [4000, 0], [0, 4000], [0, -4000]]) expect(heightAt(world, x, z)).toBeLessThan(-5);
  });

  it('joins Longreach to the main island by a causeway that stays above the sea', () => {
    const r = world.roads.find((x) => x.def.name === 'Longreach Causeway')!;
    let overSea = 0;
    for (let i = 0; i < r.xs.length; i++) {
      expect(r.hs[i]).toBeGreaterThan(3.4);
      expect(isDry(world, r.xs[i], r.zs[i], 2)).toBe(true);
      // Open sea 45 m to either side: the embankment is out in the strait here.
      const dx = r.xs[Math.min(i + 1, r.xs.length - 1)] - r.xs[Math.max(i - 1, 0)], dz = r.zs[Math.min(i + 1, r.xs.length - 1)] - r.zs[Math.max(i - 1, 0)], l = Math.hypot(dx, dz);
      if ([1, -1].every((s) => heightAt(world, r.xs[i] - (dz / l) * 45 * s, r.zs[i] + (dx / l) * 45 * s) < -1)) overSea++;
    }
    expect(overSea * 3).toBeGreaterThan(400); // it really crosses open water
    expect(landmassAt(r.xs[0], r.zs[0])).toBe('main');
    expect(landmassAt(r.xs[r.xs.length - 1], r.zs[r.zs.length - 1])).toBe('main'); // Longreach shares the main landmass
  });

  it('keeps every other road on dry land, and access roads on their own island', () => {
    for (const r of world.roads) {
      if (r.def.name === 'Longreach Causeway') continue;
      const home = landmassAt(r.xs[0], r.zs[0]);
      for (let i = 0; i < r.xs.length; i += 5) expect(landmassAt(r.xs[i], r.zs[i]), `${r.def.name} at ${i}`).toBe(home);
    }
    // No road on the islands that have none.
    for (const r of world.roads) for (const k of [0, r.xs.length - 1]) expect(['pine', 'lantern']).not.toContain(landmassAt(r.xs[k], r.zs[k]));
  });

  it('puts homes and a business on Longreach and Gull Isle', () => {
    const on = (land: string) => world.lots.filter((l) => landmassAt(l.x, l.z) === land && Math.abs(l.x) > 2000);
    expect(world.lots.filter((l) => l.settlement === 'Longreach').length).toBeGreaterThan(6);
    expect(on('gull').length).toBeGreaterThan(3);
    expect(world.lots.some((l) => l.name === 'Gull Haven Fish Shack')).toBe(true);
  });

  it('only sends road deliveries where a car can drive', () => {
    for (const board of world.lots.filter((l) => l.kind === 'shop' && l.business)) {
      const land = landmassAt(board.front[0], board.front[1]);
      const jobs = Array.from({ length: 3 }, (_, b) => boardJobs({ id: board.id, name: board.name, x: board.front[0], z: board.front[1], business: board.business }, world.lots, AIRPORTS, b)).flat();
      for (const j of jobs) expect(landmassAt(j.to.x, j.to.z), `${board.name} → ${j.to.name}`).toBe(land);
    }
  });

  it('gives every place dry ground to stand on, and every pier water deep enough to moor at', () => {
    for (const p of AIRPORTS) {
      if (p.pier) {
        const { x0, z0, x1, z1 } = p.pier;
        expect(isDry(world, x0, z0, 0.5), `${p.name} root`).toBe(true);
        expect(waterLevelAt(world, x1, z1) - heightAt(world, x1, z1), `${p.name} depth`).toBeGreaterThan(1.5);
      } else expect(isDry(world, p.spawn.x, p.spawn.z, 1.5), p.name).toBe(true);
    }
  });
});

describe('Longreach International: ready for a 787', () => {
  it('has a 3.2 km × 45 m asphalt runway (code E), long enough for a 787 at its heaviest', () => {
    expect(longreach.code).toBe('E');
    expect(lr.halfLen * 2).toBeGreaterThanOrEqual(3000);
    expect(lr.halfWid * 2).toBe(45);
    expect(lr.designators).toEqual(['36', '18']);
    for (let a = -lr.halfLen + 5; a < lr.halfLen; a += 100) for (const c of [-21, 0, 21]) { const [x, z] = along(lr, a, c); expect(surfaceAt(world, x, z)).toBe(S.Asphalt); }
  });

  it('is levelled: under 0.8 % along the runway, near flat across it and out to the parallel taxiway', () => {
    let worstAlong = 0, worstAcross = 0;
    for (let a = -lr.halfLen; a < lr.halfLen; a += 50) {
      const [x0, z0] = along(lr, a, 0), [x1, z1] = along(lr, a + 50, 0);
      worstAlong = Math.max(worstAlong, Math.abs(heightAt(world, x1, z1) - heightAt(world, x0, z0)) / 50);
      const [tx, tz] = along(lr, a, -(lr.halfWid + CODES.E.taxiOffset));
      worstAcross = Math.max(worstAcross, Math.abs(heightAt(world, tx, tz) - heightAt(world, x0, z0)));
    }
    expect(worstAlong).toBeLessThan(0.008);
    expect(worstAcross).toBeLessThan(0.6);
  });

  it('keeps a 60 m wingspan clear: the parallel taxiway is far enough from the runway, the apron from the taxiway', () => {
    const G = CODES.E, P = lr.halfWid + G.taxiOffset;
    expect(P).toBeGreaterThanOrEqual(90);                                  // runway centreline to taxiway centreline
    expect(P - 30).toBeGreaterThan(lr.halfWid + 20);                       // a taxiing 787's wingtip stays well off the runway
    expect(lr.halfWid + G.apronGap - (P + 30)).toBeGreaterThan(15);        // and off the apron
    expect(G.taxiHalf * 2).toBeGreaterThanOrEqual(23);
    const parallel = longreach.taxiways[0];
    expect(Math.abs(local(lr, parallel.cx, parallel.cz)[1])).toBeCloseTo(P, 3);
    expect(parallel.halfLen * 2).toBeGreaterThan(lr.halfLen * 2 - 60);    // taxi to either threshold
  });

  it('keeps trees off the runway, taxiways and apron', () => {
    const sc = scatter(world);
    for (let i = 0; i < sc.count; i++) for (const r of [lr, ...longreach.paved]) {
      const [a, c] = local(r, sc.x[i], sc.z[i]);
      if (Math.abs(a) < r.halfLen && Math.abs(c) < r.halfWid) throw new Error(`tree at ${sc.x[i]}, ${sc.z[i]}`);
    }
    expect(isClear(world, lr.cx, lr.cz)).toBe(true);
  }, 60000);

  it('has a terminal with airliners at its stands, hangars (barns) a wide-body fits in, and a fire station', () => {
    const types = longreach.buildings.map((b) => b.type);
    for (const t of ['terminal', 'barn', 'fire', 'cargo'] as const) expect(types).toContain(t);
    for (const h of longreach.buildings.filter((b) => b.type === 'barn')) {
      expect(h.halfWid * 2).toBeGreaterThan(65); // door wider than a 787's 60 m span
      expect(h.height).toBeGreaterThan(17);      // and taller than its tail
    }
    expect(longreach.props.filter((p) => p.model === 'widebody')).toHaveLength(1);
    // Nothing stands on the runway, the taxiways or the paved holding point.
    for (const b of longreach.buildings) for (const r of [lr, ...longreach.taxiways]) {
      const [a, c] = local(r, b.cx, b.cz);
      expect(Math.abs(a) < r.halfLen + b.halfLen && Math.abs(c) < r.halfWid + b.halfLen, b.type).toBe(false);
    }
  });

  it('aims long-runway approaches at the touchdown zone, 300 m in', () => {
    expect(aimDistance(lr.halfLen)).toBe(300);
    expect(aimDistance(airportById('airfield')!.runway!.halfLen)).toBe(150);
  });

  it('is the only airport an airliner needing 2.5 km can be flown from', () => {
    const dreamliner = { ...AIRCRAFT.heron, id: 'dreamliner', minRunway: 2500 };
    expect(AIRPORTS.filter((p) => usableAt(dreamliner, p)).map((p) => p.id)).toEqual(['longreach']);
  });
});

describe('the longer Island Airfield', () => {
  it('is 1.2 km long, keeps its old southern threshold, and the Heron and the jet can still use it', () => {
    const rw = airportById('airfield')!.runway!;
    expect(rw.halfLen * 2).toBe(1200);
    const [x, z] = along(rw, rw.halfLen, 0);
    expect(Math.hypot(x - -275, z - -190)).toBeLessThan(2);
    expect(usableAt(AIRCRAFT.heron, airportById('airfield')!)).toBe(true);
    expect(usableAt(AIRCRAFT.peregrine, airportById('airfield')!)).toBe(true);
  });
});

describe('parking at an airfield', () => {
  const fields = AIRPORTS.filter((p) => p.kind === 'airfield' || p.kind === 'strip');
  it('counts anywhere on the runway, even its far ends, as being at the airfield', () => {
    for (const p of fields) for (const end of [-1, 1]) {
      const [x, z] = along(p.runway!, end * (p.runway!.halfLen - 5), 0);
      expect(onAirfield(p, x, z), `${p.name} ${end}`).toBe(true);
    }
    const [fx, fz] = along(lr, lr.halfLen + 1500, 0);
    expect(onAirfield(longreach, fx, fz)).toBe(false); // out over the sea it isn't
  });

  it('puts your car on the apron facing the first hangar, not on a road', () => {
    for (const p of fields) {
      expect(isDry(world, p.car.x, p.car.z, 1)).toBe(true);
      const hangar = p.buildings.find((b) => b.type === 'barn')!;
      const [hx, hz] = along(hangar, hangar.halfLen, 0); // the middle of its doors
      expect(Math.hypot(hx - p.car.x, hz - p.car.z), p.name).toBeLessThan(15);
      expect(Math.cos(p.car.yaw - (hangar.dir + Math.PI))).toBeGreaterThan(0.99); // nose to the doors
      for (const r of world.roads) for (let i = 0; i < r.xs.length; i += 2) {
        expect(Math.hypot(r.xs[i] - p.car.x, r.zs[i] - p.car.z), `${p.name} vs ${r.def.name}`).toBeGreaterThan(r.def.width / 2 + 4);
      }
      expect(surfaceAt(world, p.car.x, p.car.z)).toBe(S.Asphalt);
    }
  });
});
