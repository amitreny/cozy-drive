/// <reference lib="webworker" />
import { scatter } from './scatter';
import { generateWorld } from './terrainGen';

/** Builds the island off the main thread (docs/06: heavy work in workers). */
self.onmessage = (e: MessageEvent<{ seed: number }>) => {
  const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);
  const world = generateWorld(e.data.seed, 4096, 2, (stage) => post({ type: 'progress', stage }));
  post({ type: 'progress', stage: 'Planting trees' });
  const sc = scatter(world);
  post({ type: 'done', world, scatter: sc }, [world.heights.buffer, world.surface.buffer, sc.kind.buffer, sc.x.buffer, sc.y.buffer, sc.z.buffer, sc.s.buffer, sc.rot.buffer, sc.tint.buffer]);
};
