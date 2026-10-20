import { describe, expect, it } from 'vitest';
import { defaultBuild } from '../src/customization/build';
import { costOf, missing, START_ACORNS, unlocksUsed } from '../src/gameplay/economy';

describe('economy', () => {
  it('stock cars only cost the car itself; the starter hatchback is free', () => {
    expect(unlocksUsed(defaultBuild('pip'))).toEqual([]);
    expect(unlocksUsed(defaultBuild('badger'))).toEqual(['car:badger']);
  });
  it('paint colours are free, upgrades are not', () => {
    const b = { ...defaultBuild('pip'), paint: '#123456', lift: 1 as const, tyre: 'mud' as const };
    expect(unlocksUsed(b).sort()).toEqual(['lift:1', 'tyre:mud']);
    expect(costOf(missing(b, new Set(['tyre:mud'])))).toBe(150);
  });
  it('a first purchase is affordable from the start', () => expect(START_ACORNS).toBeGreaterThanOrEqual(120));
});
