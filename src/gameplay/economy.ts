import { defaultBuild, type Build } from '../customization/build';

/** One soft currency (docs/02): earned by exploring, spent in the garage. Never a grind. */
export const START_ACORNS = 150;
export const REWARDS = { gnome: 20, viewpoint: 60 } as const;

/** Prices for unlockable options. Paint colours and each car's stock setup are always free. */
export const PRICES: Record<string, number> = {
  'car:maple': 300, 'car:biscuit': 450, 'car:badger': 600, 'car:skipper': 650, 'car:bramble': 800, 'car:comet': 1100,
  'tyre:road': 60, 'tyre:allTerrain': 120, 'tyre:mud': 160, 'tyre:snow': 140, 'tyre:sand': 140, 'tyre:rally': 160,
  'wheels:default': 40, 'wheels:dark': 60, 'wheels:racing': 90, 'wheels:truck': 90,
  'lift:1': 150, 'lift:2': 300, 'engine:1': 150, 'engine:2': 300, 'engine:3': 500,
  'diff:lsd': 150, 'diff:locker': 300, 'diff:open': 0, 'snorkel': 120,
  'finish:satin': 40, 'finish:matte': 40, 'finish:metallic': 80, 'finish:pearl': 140,
};

/** Unlock keys a build relies on, excluding what its car type comes with. */
export function unlocksUsed(b: Build): string[] {
  const stock = defaultBuild(b.carType), keys: string[] = [];
  if (b.carType !== 'pip') keys.push(`car:${b.carType}`);
  if (b.tyre !== stock.tyre) keys.push(`tyre:${b.tyre}`);
  if (b.wheels !== stock.wheels) keys.push(`wheels:${b.wheels}`);
  if (b.lift > 0) keys.push(`lift:${b.lift}`);
  if (b.engineStage > 0) keys.push(`engine:${b.engineStage}`);
  if (b.diff !== stock.diff) keys.push(`diff:${b.diff}`);
  if (b.snorkel) keys.push('snorkel');
  if (b.finish !== 'gloss') keys.push(`finish:${b.finish}`);
  return keys.filter((k) => (PRICES[k] ?? 0) > 0);
}

export const missing = (b: Build, owned: ReadonlySet<string>): string[] => unlocksUsed(b).filter((k) => !owned.has(k));
export const costOf = (keys: string[]): number => keys.reduce((sum, k) => sum + (PRICES[k] ?? 0), 0);
export const priceOf = (key: string, owned: ReadonlySet<string>, creative: boolean): number => (creative || owned.has(key) ? 0 : PRICES[key] ?? 0);
