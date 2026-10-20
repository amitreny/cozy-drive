import type { Progress } from '../gameplay/progress';
import type { Place, Viewpoint } from '../gameplay/places';
import { SURFACES } from '../world/surfaces';
import { heightAt, PLAZA, surfaceAt, waterLevelAt, type WorldData } from '../world/terrainGen';

const FOG = 256;
/** Top-down, north up: +z is up and +x is to the LEFT (three.js is right-handed, so east of a north-facing driver is -x). */
export const MAP_FOG_VERSION = 2;

/** Painted island map with fog of war that clears as you explore. Toggle with M. */
export class MapView {
  open = false;
  private el: HTMLElement; private canvas: HTMLCanvasElement; private side: HTMLElement;
  private base: HTMLCanvasElement | null = null;
  readonly fog = document.createElement('canvas');
  private fogCtx: CanvasRenderingContext2D;

  constructor(root: HTMLElement, private w: WorldData, private vps: Viewpoint[], private gnomes: Place[], private progress: Progress, fogData?: string, fogMirrored = false) {
    this.el = document.createElement('div'); this.el.className = 'mapview';
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = 900;
    this.side = document.createElement('div'); this.side.className = 'panel mapside';
    this.el.append(this.canvas, this.side); root.appendChild(this.el);
    this.fog.width = this.fog.height = FOG;
    this.fogCtx = this.fog.getContext('2d', { willReadFrequently: true })!;
    this.fogCtx.fillStyle = '#e9dcc0'; this.fogCtx.fillRect(0, 0, FOG, FOG);
    if (fogData) { const img = new Image(); img.onload = () => { this.fogCtx.clearRect(0, 0, FOG, FOG); if (fogMirrored) { this.fogCtx.save(); this.fogCtx.translate(FOG, 0); this.fogCtx.scale(-1, 1); } this.fogCtx.drawImage(img, 0, 0); if (fogMirrored) this.fogCtx.restore(); }; img.src = fogData; }
  }

  private toFog(x: number, z: number): [number, number] { return [((this.w.size / 2 - x) / this.w.size) * FOG, ((this.w.size / 2 - z) / this.w.size) * FOG]; }

  /** Clear the fog in a soft circle of radius r metres around (x, z). */
  reveal(x: number, z: number, r: number): void {
    const [fx, fz] = this.toFog(x, z), fr = (r / this.w.size) * FOG, g = this.fogCtx;
    const grad = g.createRadialGradient(fx, fz, fr * 0.55, fx, fz, fr);
    grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = grad;
    g.beginPath(); g.arc(fx, fz, fr, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
  }

  fogData(): string { return this.fog.toDataURL('image/png'); }

  isRevealed(x: number, z: number): boolean {
    const [fx, fz] = this.toFog(x, z);
    return this.fogCtx.getImageData(Math.max(0, Math.min(FOG - 1, fx | 0)), Math.max(0, Math.min(FOG - 1, fz | 0)), 1, 1).data[3] < 100;
  }

  /** The painted base map (1024², north up), painted on first use. */
  baseCanvas(): HTMLCanvasElement { return (this.base ??= this.paint()); }

  /** Paint the base map once: relief shading, surface colours, water, contours, roads. */
  private paint(): HTMLCanvasElement {
    const N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d')!, img = g.createImageData(N, N), half = this.w.size / 2, cell = this.w.size / N;
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const x = half - px * cell, z = half - py * cell, h = heightAt(this.w, x, z), lvl = waterLevelAt(this.w, x, z), i = (py * N + px) * 4;
      let r: number, gr: number, b: number;
      if (h < lvl) { const d = Math.min(1, (lvl - h) / 8); r = 120 - 70 * d; gr = 185 - 60 * d; b = 200 - 30 * d; }
      else {
        const col = SURFACES[surfaceAt(this.w, x, z)].color;
        const nx = heightAt(this.w, x + cell, z) - heightAt(this.w, x - cell, z), nz = heightAt(this.w, x, z + cell) - heightAt(this.w, x, z - cell);
        const shade = Math.max(0.55, Math.min(1.25, 1 + (nx * 0.6 + nz * 0.8) / (cell * 2.5)));
        const contour = Math.abs(((h % 25) + 25) % 25) < 0.9 ? 0.86 : 1;
        r = col[0] * 255 * shade * contour; gr = col[1] * 255 * shade * contour; b = col[2] * 255 * shade * contour;
      }
      img.data[i] = r * 0.9 + 25; img.data[i + 1] = gr * 0.9 + 20; img.data[i + 2] = b * 0.85 + 15; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const toPx = (x: number, z: number): [number, number] => [(half - x) / cell, (half - z) / cell];
    for (const r of this.w.roads) {
      const k = r.def.kind;
      g.strokeStyle = k === 'highway' ? '#f4eee2' : k === 'road' ? '#f2d38a' : k === 'boardwalk' ? '#8a5a3a' : '#8b6a4a';
      g.lineWidth = k === 'highway' ? 4.5 : k === 'road' ? 3 : 2;
      g.setLineDash(k === 'track' ? [6, 4] : []);
      g.beginPath();
      for (let i = 0; i < r.xs.length; i += 2) { const [px, py] = toPx(r.xs[i], r.zs[i]); if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); }
      g.stroke();
    }
    g.setLineDash([]);
    const [vx, vy] = toPx(PLAZA.x, PLAZA.z);
    g.fillStyle = '#c0543a'; g.beginPath(); g.arc(vx, vy, 7, 0, Math.PI * 2); g.fill();
    return c;
  }

  toggle(): void { this.open = !this.open; this.el.style.display = this.open ? 'flex' : 'none'; }

  draw(carX: number, carZ: number, yaw: number): void {
    if (!this.open) return;
    this.base ??= this.paint();
    const g = this.canvas.getContext('2d')!, S = this.canvas.width, half = this.w.size / 2;
    const toPx = (x: number, z: number): [number, number] => [((half - x) / this.w.size) * S, ((half - z) / this.w.size) * S];
    g.drawImage(this.base, 0, 0, S, S);
    g.drawImage(this.fog, 0, 0, S, S);
    g.font = '600 15px Trebuchet MS, sans-serif'; g.textAlign = 'center';
    for (const v of this.vps) {
      const [px, py] = toPx(v.x, v.z), got = this.progress.found.has(v.id);
      if (!got && !this.isRevealed(v.x, v.z)) continue;
      g.fillStyle = got ? '#d9704f' : '#7a6a58'; g.beginPath(); g.arc(px, py, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.fillText(got ? '★' : '?', px, py + 5);
      if (got) { g.fillStyle = '#3a3129'; g.fillText(v.name, px, py - 14); }
    }
    const [cx, cy] = toPx(carX, carZ);
    g.save(); g.translate(cx, cy); g.rotate(Math.PI - yaw);
    g.fillStyle = '#d9704f'; g.strokeStyle = '#fff'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, 13); g.lineTo(9, -9); g.lineTo(0, -4); g.lineTo(-9, -9); g.closePath(); g.fill(); g.stroke();
    g.restore();
    const found = this.gnomes.filter((x) => this.progress.found.has(x.id)).length;
    const views = this.vps.filter((v) => this.progress.found.has(v.id)).length;
    this.side.innerHTML = `<h2>Island map</h2>
      <p>Garden gnomes: <b>${found} / ${this.gnomes.length}</b><br>Viewpoints: <b>${views} / ${this.vps.length}</b><br>Acorns: <b>🌰 ${this.progress.creative ? '∞' : this.progress.acorns}</b></p>
      <p class="hint">Drive to clear the fog. Stop inside a glowing ring to collect a postcard.</p>
      <div class="postcards">${this.progress.postcards.map((p) => `<figure><img src="${p.img}" alt=""><figcaption>${p.name}</figcaption></figure>`).join('') || '<i>No postcards yet</i>'}</div>
      <p class="hint">Press M to close</p>`;
  }
}
