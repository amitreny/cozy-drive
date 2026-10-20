import type { Progress } from '../gameplay/progress';
import type { Viewpoint } from '../gameplay/places';
import type { MapView } from './map';
import type { WorldData } from '../world/terrainGen';

const SIZE = 180;   // CSS pixels
const RANGE = 320;  // metres from centre to rim

/**
 * Where a world offset (dX, dZ) from the car lands on the mini-map, in pixels from the centre (+x right, +y down).
 * North (+z) is up and world +x is to the LEFT on a top-down map (three.js is right-handed). Heading-up mode then
 * rotates by the car's yaw so the car's forward points up. The map image is drawn with the same transform.
 */
export function projectToMini(dX: number, dZ: number, yaw: number, headingUp: boolean, pxPerM = 1): [number, number] {
  const a = -dX * pxPerM, b = -dZ * pxPerM, t = headingUp ? yaw : 0;
  return [a * Math.cos(t) - b * Math.sin(t), a * Math.sin(t) + b * Math.cos(t)];
}

/** Round mini-map in the top-left: heading-up (or north-up), fog of war, viewpoints, compass. Toggle with Tab. */
export class MiniMap {
  visible = true;
  rotate = true;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private acc = 1;

  constructor(root: HTMLElement, private map: MapView, private w: WorldData, private vps: Viewpoint[], private progress: Progress) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = this.canvas.height = Math.round(SIZE * dpr);
    this.canvas.className = 'minimap';
    root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.canvas.style.display = v ? 'block' : 'none';
    document.body.classList.toggle('has-minimap', v);
  }

  /** Redraw at ~15 Hz. */
  update(dt: number, x: number, z: number, yaw: number): void {
    if (!this.visible) return;
    this.acc += dt;
    if (this.acc < 1 / 15) return;
    this.acc = 0;
    const g = this.ctx, c = SIZE / 2, base = this.map.baseCanvas(), half = this.w.size / 2;
    const pxPerM = SIZE / 2 / RANGE;                          // minimap pixels per metre
    const bScale = base.width / this.w.size;                  // base-map pixels per metre
    const fScale = this.map.fog.width / this.w.size;
    const rot = this.rotate ? yaw : 0;
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, SIZE, SIZE);
    g.translate(c, c); g.rotate(rot);
    // World → canvas: north (+z) up, +x to the left (see MAP_FOG_VERSION in map.ts).
    const span = RANGE * 1.5;                                 // draw a bit beyond the rim so rotation never shows edges
    const draw = (img: HTMLCanvasElement, s: number) => g.drawImage(img, (half - x - span) * s, (half - z - span) * s, span * 2 * s, span * 2 * s, -span * pxPerM, -span * pxPerM, span * 2 * pxPerM, span * 2 * pxPerM);
    g.imageSmoothingEnabled = true;
    draw(base, bScale);
    draw(this.map.fog, fScale);
    g.restore();
    g.save();
    g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.clip();
    for (const v of this.vps) {
      const [dx, dy] = projectToMini(v.x - x, v.z - z, yaw, this.rotate, pxPerM);
      if (Math.hypot(dx, dy) > c - 8) continue;
      const got = this.progress.found.has(v.id);
      if (!got && !this.map.isRevealed(v.x, v.z)) continue;
      g.save(); g.translate(c + dx, c + dy);
      g.fillStyle = got ? '#d9704f' : '#7a6a58'; g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = '700 9px Trebuchet MS, sans-serif'; g.textAlign = 'center'; g.fillText(got ? '★' : '?', 0, 3.5);
      g.restore();
    }
    g.restore();
    // Car arrow in the centre: points up in heading-up mode, along the heading in north-up mode.
    g.save(); g.translate(c, c); g.rotate(this.rotate ? 0 : -yaw);
    g.fillStyle = '#d9704f'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(7, 7); g.lineTo(0, 3); g.lineTo(-7, 7); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // Rim and compass "N".
    g.strokeStyle = 'rgba(251,243,228,0.95)'; g.lineWidth = 4; g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.stroke();
    const na = -Math.PI / 2 + rot, nx = c + Math.cos(na) * (c - 11), ny = c + Math.sin(na) * (c - 11);
    g.fillStyle = '#3a3129'; g.beginPath(); g.arc(nx, ny, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fbf3e4'; g.font = '700 10px Trebuchet MS, sans-serif'; g.textAlign = 'center'; g.fillText('N', nx, ny + 3.5);
  }
}
