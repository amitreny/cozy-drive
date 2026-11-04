import { load, save } from '../core/storage';
import { scatter as makeScatter, type Scatter } from './scatter';
import { generateWorld, WORLD_SIZE, WORLD_VERSION, type WorldData } from './terrainGen';

export interface LoadedWorld { world: WorldData; scatter: Scatter }

/** Cached in IndexedDB after the first build, so later launches skip generation. */
export async function loadWorld(seed: number, onStage: (s: string) => void): Promise<LoadedWorld> {
  const key = `world-v${WORLD_VERSION}-s${seed}`;
  const cached = await load<LoadedWorld>(key);
  // A cache from another size of world (e.g. built mid-change by a hot reload) is rebuilt, not trusted.
  if (cached?.world?.heights instanceof Float32Array && cached.scatter?.count && cached.world.size === WORLD_SIZE && cached.world.heights.length === (cached.world.n + 1) ** 2) return cached;
  onStage('Building the islands (first launch only)…');
  let result: LoadedWorld;
  try {
    result = await new Promise<LoadedWorld>((resolve, reject) => {
      const worker = new Worker(new URL('./worldWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        if (e.data.type === 'progress') onStage(`${e.data.stage}…`);
        else { resolve({ world: e.data.world, scatter: e.data.scatter }); worker.terminate(); }
      };
      worker.onerror = (err) => { worker.terminate(); reject(err); };
      worker.postMessage({ seed });
    });
  } catch {
    const world = generateWorld(seed, WORLD_SIZE, 2, onStage);
    result = { world, scatter: makeScatter(world) };
  }
  void save(key, result);
  return result;
}
