import { load, save } from '../core/storage';
import { scatter as makeScatter, type Scatter } from './scatter';
import { generateWorld, WORLD_VERSION, type WorldData } from './terrainGen';

export interface LoadedWorld { world: WorldData; scatter: Scatter }

/** Cached in IndexedDB after the first build, so later launches skip generation. */
export async function loadWorld(seed: number, onStage: (s: string) => void): Promise<LoadedWorld> {
  const key = `world-v${WORLD_VERSION}-s${seed}`;
  const cached = await load<LoadedWorld>(key);
  if (cached?.world?.heights instanceof Float32Array && cached.scatter?.count) return cached;
  onStage('Building the island (first launch only)…');
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
    const world = generateWorld(seed, 4096, 2, onStage);
    result = { world, scatter: makeScatter(world) };
  }
  void save(key, result);
  return result;
}
