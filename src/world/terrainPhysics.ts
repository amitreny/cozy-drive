import type RAPIER from '@dimforge/rapier3d-compat';
import { propCollider, propsByChunk, type Scatter } from './scatter';
import type { WorldData } from './terrainGen';

const CHUNK = 128;

/** Streams terrain heightfields and prop colliders in 128 m chunks around a point (docs/05 streaming). */
export class TerrainPhysics {
  readonly active = new Map<number, RAPIER.Collider[]>();
  private props: Map<number, number[]>;
  private per: number; private cells: number; private half: number;

  constructor(private R: typeof RAPIER, private world: RAPIER.World, private w: WorldData, private sc: Scatter) {
    this.props = propsByChunk(sc, w.size, CHUNK);
    this.per = w.size / CHUNK; this.cells = CHUNK / w.cell; this.half = w.size / 2;
  }

  private build(cx: number, cz: number): RAPIER.Collider[] {
    const n = this.cells, V = this.w.n + 1, x0 = cx * n, z0 = cz * n;
    const h = new Float32Array((n + 1) * (n + 1));
    // Column-major: columns follow x, rows follow z (verified in the M0 probe).
    for (let c = 0; c <= n; c++) for (let r = 0; r <= n; r++) h[c * (n + 1) + r] = this.w.heights[(z0 + r) * V + (x0 + c)];
    const desc = this.R.ColliderDesc.heightfield(n, n, h, { x: CHUNK, y: 1, z: CHUNK })
      .setTranslation(cx * CHUNK - this.half + CHUNK / 2, 0, cz * CHUNK - this.half + CHUNK / 2).setFriction(0.8);
    const out = [this.world.createCollider(desc)];
    for (const i of this.props.get(cz * this.per + cx) ?? []) out.push(this.world.createCollider(propCollider(this.R, this.sc, i)));
    return out;
  }

  /** Load chunks near (x, z). The chunk under the point and its neighbours load at once; the rest within `budget`. */
  update(x: number, z: number, radius = 260, budget = 2): void {
    const pcx = Math.floor((x + this.half) / CHUNK), pcz = Math.floor((z + this.half) / CHUNK);
    const reach = Math.ceil(radius / CHUNK) + 1;
    const wanted: [number, number, number][] = [];
    for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
      const cx = pcx + dx, cz = pcz + dz;
      if (cx < 0 || cz < 0 || cx >= this.per || cz >= this.per) continue;
      const d = Math.hypot(cx * CHUNK - this.half + CHUNK / 2 - x, cz * CHUNK - this.half + CHUNK / 2 - z);
      if (d < radius + 91) wanted.push([cz * this.per + cx, d, Math.max(Math.abs(dx), Math.abs(dz))]);
    }
    wanted.sort((a, b) => a[1] - b[1]);
    let built = 0;
    for (const [key, , ring] of wanted) {
      if (this.active.has(key)) continue;
      if (ring > 1 && built >= budget) continue;
      this.active.set(key, this.build(key % this.per, Math.floor(key / this.per)));
      built++;
    }
    for (const [key, cols] of this.active) {
      const cx = key % this.per, cz = Math.floor(key / this.per);
      if (Math.hypot(cx * CHUNK - this.half + CHUNK / 2 - x, cz * CHUNK - this.half + CHUNK / 2 - z) > radius + 220) {
        for (const c of cols) this.world.removeCollider(c, false);
        this.active.delete(key);
      }
    }
  }
}
