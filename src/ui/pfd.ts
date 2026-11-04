import type { Aircraft } from '../flight/aircraft';
import { approachSpeed } from '../flight/approach';

/** ILS needles for the attitude display: each -1..1 of full scale, the runway's course (as Aircraft.heading) and a label. */
export interface PfdIls { loc: number; gs: number; course: number; label: string }

const DEG = 180 / Math.PI;
const W = 460, H = 300;
// Layout (CSS px): speed tape | attitude | altitude tape | vertical speed, with the heading tape under the attitude.
const SPD = { x: 8, y: 24, w: 64, h: 216 };
const ADI = { x: 82, y: 24, w: 252, h: 216 };
const ALT = { x: 344, y: 24, w: 72, h: 216 };
const VSI = { x: 422, y: 44, w: 30, h: 176 };
const HDG = { x: 82, y: 250, w: 252, h: 42 };
const C = {
  white: '#eef3f6', dim: '#8a98a6', green: '#3ef07a', cyan: '#3fd8f2', magenta: '#ff5ce8', amber: '#ffb52e', red: '#ff4a4a',
  yellow: '#ffd23f', tape: 'rgba(48, 55, 64, 0.9)', skyTop: '#1d5aa6', sky: '#3b8ad8', ground: '#86562f', groundLow: '#5a381c',
};
const CARDINAL: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };

const font = (px: number, bold = false) => `${bold ? '700 ' : ''}${px}px ui-monospace, 'Cascadia Mono', Consolas, 'DejaVu Sans Mono', monospace`;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** A compass heading (degrees, clockwise from north) from an angle in Aircraft.heading's convention. */
const compass = (rad: number) => ((-rad * DEG) % 360 + 360) % 360;
const wrap180 = (d: number) => ((d % 360) + 540) % 360 - 180;
const pad3 = (d: number) => String(Math.round(d) % 360).padStart(3, '0');

function line(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
}
function rounded(g: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, radius: number): void {
  g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, radius);
}
function diamond(g: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 6, y); g.lineTo(x, y + 7); g.lineTo(x - 6, y); g.closePath();
  g.fillStyle = color; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
}
/** The boxed current value on a tape, with a notch pointing at the attitude display. */
function readout(g: CanvasRenderingContext2D, x: number, cy: number, w: number, text: string, notch: 'left' | 'right', color = C.white): void {
  const h = 26, n = 7, x0 = notch === 'right' ? x : x + w, x1 = notch === 'right' ? x + w : x, s = notch === 'right' ? 1 : -1;
  g.beginPath();
  g.moveTo(x0, cy - h / 2); g.lineTo(x1, cy - h / 2); g.lineTo(x1, cy - 5); g.lineTo(x1 + s * n, cy);
  g.lineTo(x1, cy + 5); g.lineTo(x1, cy + h / 2); g.lineTo(x0, cy + h / 2); g.closePath();
  g.fillStyle = '#05080b'; g.fill(); g.strokeStyle = C.white; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = color; g.font = font(18, true); g.textAlign = 'center'; g.fillText(text, x + w / 2, cy + 1);
}

/**
 * A glass-cockpit primary flight display, drawn every frame: the attitude (horizon, pitch ladder, bank scale and
 * slip, flight path marker, ILS needles, radio altitude), speed and altitude tapes, vertical speed, heading and wind.
 */
export class Pfd {
  readonly el: HTMLCanvasElement;
  ils: PfdIls | null = null;
  private g: CanvasRenderingContext2D;
  private dpr = 0;
  private lastSpeed = NaN; private accel = 0; private blink = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('canvas');
    this.el.style.width = `${W}px`; this.el.style.height = `${H}px`;
    parent.appendChild(this.el);
    this.g = this.el.getContext('2d')!;
  }

  draw(dt: number, a: Aircraft, wind: { x: number; z: number }): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (dpr !== this.dpr) { this.dpr = dpr; this.el.width = W * dpr; this.el.height = H * dpr; }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.textBaseline = 'middle';
    const speed = (a.spec.kind === 'balloon' ? a.groundSpeed : a.airspeed) * 3.6;
    if (dt > 0) {
      // Speed trend: the acceleration, smoothed (a jump means a new aircraft, not a real change).
      const d = speed - this.lastSpeed;
      if (Math.abs(d) < 30) this.accel += (d / dt - this.accel) * Math.min(1, dt * 2); else this.accel = 0;
      this.lastSpeed = speed; this.blink += dt;
    }
    const v = a.body.linvel(), hdg = compass(a.heading);
    const track = Math.hypot(v.x, v.z) > 8 ? compass(Math.atan2(v.x, v.z)) : hdg;
    this.attitude(a, v, hdg, track);
    this.speedTape(a, speed);
    this.altTape(a);
    this.vsi(a);
    this.headingTape(hdg, track);
    this.labels(a, wind, hdg);
  }

  private attitude(a: Aircraft, v: { x: number; y: number; z: number }, hdg: number, track: number): void {
    const g = this.g, cx = ADI.x + ADI.w / 2, cy = ADI.y + ADI.h / 2, ppd = 4.4; // px per degree of pitch
    const pitch = a.pitchAngle * DEG;
    g.save();
    rounded(g, ADI, 6); g.clip();
    // The world (sky, ground, pitch ladder), rolled and pitched about the fixed aircraft symbol.
    g.save();
    g.translate(cx, cy); g.rotate(-a.bank); g.translate(0, pitch * ppd);
    const sky = g.createLinearGradient(0, -30 * ppd, 0, 0); sky.addColorStop(0, C.skyTop); sky.addColorStop(1, C.sky);
    g.fillStyle = sky; g.fillRect(-400, -1000, 800, 1000);
    const earth = g.createLinearGradient(0, 0, 0, 30 * ppd); earth.addColorStop(0, C.ground); earth.addColorStop(1, C.groundLow);
    g.fillStyle = earth; g.fillRect(-400, 0, 800, 1000);
    g.strokeStyle = C.white; g.lineWidth = 2; line(g, -400, 0, 400, 0);
    g.lineWidth = 1.5; g.fillStyle = C.white; g.font = font(11); g.textAlign = 'center';
    for (let p = -90; p <= 90; p += 2.5) {
      if (p === 0 || Math.abs(p - pitch) > 24) continue;
      const y = -p * ppd, major = p % 10 === 0, half = major ? 34 : p % 5 === 0 ? 18 : 7;
      line(g, -half, y, half, y);
      if (major) { g.fillText(String(Math.abs(p)), -half - 13, y); g.fillText(String(Math.abs(p)), half + 13, y); }
    }
    g.restore();

    // Bank scale: fixed marks at 10, 20, 30, 45 and 60°, and the sky pointer (with the slip bar under it) rolling with the world.
    const r = 96;
    g.strokeStyle = C.white; g.lineWidth = 1.5;
    for (const t of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
      const len = Math.abs(t) % 30 === 0 ? 10 : 6, s = Math.sin(t / DEG), c = Math.cos(t / DEG);
      line(g, cx + r * s, cy - r * c, cx + (r + len) * s, cy - (r + len) * c);
    }
    g.fillStyle = C.white;
    g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx - 6, cy - r - 9); g.lineTo(cx + 6, cy - r - 9); g.closePath(); g.fill();
    g.save();
    g.translate(cx, cy); g.rotate(-a.bank);
    g.fillStyle = Math.abs(a.bank * DEG) > 35 ? C.amber : C.white;
    g.beginPath(); g.moveTo(0, -r + 1); g.lineTo(-7, -r + 11); g.lineTo(7, -r + 11); g.closePath(); g.fill();
    g.fillRect(clamp(-a.beta * DEG * 2.5, -14, 14) - 8, -r + 13, 16, 4);
    g.restore();

    // Flight path marker: where the aircraft is actually going (climb angle and drift), not where the nose points.
    const gs = Math.hypot(v.x, v.z);
    if (a.spec.kind !== 'balloon' && gs > 15) {
      const gamma = Math.atan2(v.y, gs) * DEG;
      const x = clamp(wrap180(track - hdg) * ppd, -100, 100), y = clamp((pitch - gamma) * ppd, -90, 90);
      g.save();
      g.translate(cx, cy); g.rotate(-a.bank);
      g.strokeStyle = C.green; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.stroke();
      line(g, x - 17, y, x - 6, y); line(g, x + 6, y, x + 17, y); line(g, x, y - 6, x, y - 12);
      g.restore();
    }

    // ILS: localizer along the bottom, glide slope down the right; each diamond shows where the path is.
    if (this.ils) {
      const ly = ADI.y + ADI.h - 12, gx = ADI.x + ADI.w - 12;
      g.strokeStyle = C.white; g.lineWidth = 1.5;
      for (const k of [-2, -1, 1, 2]) {
        g.beginPath(); g.arc(cx + k * 26, ly, 3, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.arc(gx, cy + k * 24, 3, 0, Math.PI * 2); g.stroke();
      }
      line(g, cx, ly - 7, cx, ly + 7); line(g, gx - 7, cy, gx + 7, cy);
      diamond(g, cx + this.ils.loc * 52, ly, C.magenta); diamond(g, gx, cy + this.ils.gs * 48, C.magenta);
    }

    // Radio altitude, close to the ground.
    if (a.agl < 760 && !a.onGround) {
      const ty = ADI.y + ADI.h - (this.ils ? 32 : 16);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.roundRect(cx - 26, ty - 10, 52, 20, 3); g.fill();
      g.font = font(16, true); g.textAlign = 'center'; g.fillStyle = a.agl < 30 ? C.amber : C.green;
      g.fillText(String(Math.round(a.agl)), cx, ty + 1);
    }

    if (a.stall > 0.25 && this.blink % 0.6 < 0.4) {
      g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(cx - 38, cy - 62, 76, 22);
      g.strokeStyle = C.red; g.lineWidth = 2; g.strokeRect(cx - 38, cy - 62, 76, 22);
      g.fillStyle = C.red; g.font = font(15, true); g.textAlign = 'center'; g.fillText('STALL', cx, cy - 51);
    }

    // The aircraft symbol: two wing bars and a centre square, outlined in black.
    for (const [lw, col] of [[6, '#000'], [3, C.yellow]] as const) {
      g.strokeStyle = col; g.lineWidth = lw;
      g.beginPath(); g.moveTo(cx - 74, cy); g.lineTo(cx - 28, cy); g.lineTo(cx - 28, cy + 11); g.stroke();
      g.beginPath(); g.moveTo(cx + 74, cy); g.lineTo(cx + 28, cy); g.lineTo(cx + 28, cy + 11); g.stroke();
    }
    g.fillStyle = '#000'; g.fillRect(cx - 4, cy - 4, 8, 8);
    g.fillStyle = C.yellow; g.fillRect(cx - 2.5, cy - 2.5, 5, 5);
    g.restore();
  }

  /** Airspeed (km/h): the stall band, the approach speed bug and the speed in 10 s at this acceleration. */
  private speedTape(a: Aircraft, speed: number): void {
    const g = this.g, { x, y, w, h } = SPD, cy = y + h / 2, ppk = 1.7; // px per km/h
    const ys = (k: number) => cy - (k - speed) * ppk;
    g.save();
    rounded(g, SPD, 4); g.fillStyle = C.tape; g.fill(); g.clip();
    if (a.spec.kind === 'plane') {
      const vref = approachSpeed(a.spec) * 3.6, top = ys(vref / 1.3), yr = ys(vref);
      g.fillStyle = C.red; g.fillRect(x + w - 5, top, 5, y + h - top);
      g.fillStyle = C.cyan; g.beginPath(); g.moveTo(x + w - 9, yr); g.lineTo(x + w, yr - 6); g.lineTo(x + w, yr + 6); g.fill();
    }
    g.strokeStyle = C.white; g.fillStyle = C.white; g.lineWidth = 1.5; g.font = font(13); g.textAlign = 'right';
    for (let k = Math.max(0, Math.floor((speed - h / 2 / ppk) / 10) * 10); k <= speed + h / 2 / ppk + 10; k += 10) {
      const ty = ys(k);
      line(g, x + w - 8, ty, x + w, ty);
      if (k % 20 === 0) g.fillText(String(k), x + w - 12, ty);
    }
    const trend = clamp(this.accel * 10 * ppk, -h / 2 + 6, h / 2 - 6);
    if (Math.abs(trend) > 5) {
      const tx = x + w - 2, ty = cy - trend, s = Math.sign(trend);
      g.strokeStyle = C.green; g.lineWidth = 2; line(g, tx, cy, tx, ty);
      g.beginPath(); g.moveTo(tx - 4, ty + s * 6); g.lineTo(tx, ty); g.lineTo(tx + 4, ty + s * 6); g.stroke();
    }
    g.restore();
    readout(g, x + 2, cy, w - 14, String(Math.round(speed)), 'right');
  }

  /** Altitude (m above sea level), with the ground under you shaded amber. */
  private altTape(a: Aircraft): void {
    const g = this.g, { x, y, w, h } = ALT, cy = y + h / 2, ppm = 0.4, alt = a.altitude; // px per metre
    const ya = (m: number) => cy - (m - alt) * ppm;
    g.save();
    rounded(g, ALT, 4); g.fillStyle = C.tape; g.fill(); g.clip();
    const gy = ya(alt - a.agl);
    if (gy < y + h) {
      g.fillStyle = 'rgba(255, 181, 46, 0.22)'; g.fillRect(x, gy, w, y + h - gy);
      g.strokeStyle = C.amber; g.lineWidth = 2; line(g, x, gy, x + w, gy);
    }
    g.strokeStyle = C.white; g.fillStyle = C.white; g.lineWidth = 1.5; g.font = font(13); g.textAlign = 'left';
    for (let m = Math.floor((alt - h / 2 / ppm) / 20) * 20; m <= alt + h / 2 / ppm + 20; m += 20) {
      const ty = ya(m);
      line(g, x, ty, x + (m % 100 === 0 ? 9 : 5), ty);
      if (m % 100 === 0) g.fillText(String(m), x + 13, ty);
    }
    g.restore();
    readout(g, x + 10, cy, w - 12, String(Math.round(alt)), 'left');
  }

  /** Vertical speed (m/s) on a squeezed scale: fine near zero, out to 30 m/s. */
  private vsi(a: Aircraft): void {
    const g = this.g, { x, y, w, h } = VSI, cy = y + h / 2, half = h / 2 - 4;
    const f = (vs: number) => Math.sign(vs) * Math.min(1, Math.log1p(Math.abs(vs) / 2) / Math.log1p(15));
    rounded(g, VSI, 4); g.fillStyle = C.tape; g.fill();
    g.strokeStyle = C.white; g.fillStyle = C.dim; g.lineWidth = 1; g.font = font(9); g.textAlign = 'left';
    for (const m of [2, 5, 10, 20]) for (const s of [1, -1]) {
      const ty = cy - s * f(m) * half;
      line(g, x, ty, x + 5, ty); g.fillText(String(m), x + 7, ty);
    }
    g.lineWidth = 1.5; line(g, x, cy, x + 10, cy);
    const sink = a.vs < -5 && a.agl < 150 && !a.onGround, col = sink ? C.amber : C.green;
    g.strokeStyle = col; g.lineWidth = 2.5; line(g, x + w + 6, cy, x + 2, cy - f(a.vs) * half);
    if (Math.abs(a.vs) >= 0.5) {
      g.fillStyle = col; g.font = font(11, true); g.textAlign = 'center';
      g.fillText(`${a.vs > 0 ? '+' : ''}${a.vs.toFixed(1)}`, x + w / 2, a.vs > 0 ? y - 9 : y + h + 9);
    }
  }

  /** Heading tape: the runway course in magenta on an approach, the ground track as a green diamond. */
  private headingTape(hdg: number, track: number): void {
    const g = this.g, { x, y, w } = HDG, cx = x + w / 2, ppd = 2.8; // px per degree
    const xh = (d: number) => cx + wrap180(d - hdg) * ppd;
    g.save();
    rounded(g, HDG, 4); g.fillStyle = C.tape; g.fill(); g.clip();
    g.strokeStyle = C.white; g.fillStyle = C.white; g.lineWidth = 1.5; g.font = font(12); g.textAlign = 'center';
    for (let d = Math.floor((hdg - w / 2 / ppd) / 5) * 5; d <= hdg + w / 2 / ppd + 5; d += 5) {
      const tx = cx + (d - hdg) * ppd, n = ((d % 360) + 360) % 360, major = n % 10 === 0;
      line(g, tx, y, tx, y + (major ? 9 : 5));
      if (major) g.fillText(CARDINAL[n] ?? String(n / 10).padStart(2, '0'), tx, y + 17);
    }
    if (this.ils) { g.strokeStyle = C.magenta; g.lineWidth = 3; const tx = xh(compass(this.ils.course)); line(g, tx, y, tx, y + 14); }
    const tk = xh(track);
    g.strokeStyle = C.green; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(tk, y + 1); g.lineTo(tk + 4, y + 6); g.lineTo(tk, y + 11); g.lineTo(tk - 4, y + 6); g.closePath(); g.stroke();
    g.strokeStyle = C.yellow; g.lineWidth = 2; line(g, cx, y, cx, y + 24);
    g.fillStyle = '#05080b'; g.fillRect(cx - 22, y + 24, 44, 17);
    g.strokeStyle = C.white; g.lineWidth = 1.5; g.strokeRect(cx - 22, y + 24, 44, 17);
    g.fillStyle = C.white; g.font = font(14, true); g.fillText(pad3(hdg), cx, y + 33);
    g.restore();
  }

  /** Captions, ground speed / Mach under the speed tape, and the wind (an arrow relative to the nose) bottom right. */
  private labels(a: Aircraft, wind: { x: number; z: number }, hdg: number): void {
    const g = this.g, balloon = a.spec.kind === 'balloon';
    g.font = font(10); g.textAlign = 'center'; g.fillStyle = C.cyan;
    g.fillText(balloon ? 'GS KM/H' : 'KM/H', SPD.x + SPD.w / 2, 12);
    g.fillText('ALT M', ALT.x + ALT.w / 2, 12);
    g.fillText('V/S', VSI.x + VSI.w / 2, 12);
    if (this.ils) { g.fillStyle = C.magenta; g.font = font(12, true); g.fillText(this.ils.label, ADI.x + ADI.w / 2, 12); }

    g.textAlign = 'left';
    const rows: [string, string][] = [];
    if (!balloon) rows.push(['GS', String(Math.round(a.groundSpeed * 3.6))]);
    if (a.spec.engine?.jet) rows.push(['M', a.mach.toFixed(2).replace(/^0/, '')]);
    rows.forEach(([k, v], i) => {
      const ty = 260 + i * 20;
      g.fillStyle = C.cyan; g.font = font(10); g.fillText(k, SPD.x + 2, ty);
      g.fillStyle = C.green; g.font = font(14, true); g.fillText(v, SPD.x + 20, ty);
    });

    const ws = Math.hypot(wind.x, wind.z) * 3.6, ax = ALT.x + 10, ay = 271;
    g.fillStyle = C.dim; g.font = font(10); g.fillText('WIND', ALT.x + 24, 260);
    g.fillStyle = C.cyan; g.font = font(12, true);
    g.fillText(ws < 1 ? 'CALM' : `${pad3(compass(Math.atan2(-wind.x, -wind.z)))}/${Math.round(ws)}`, ALT.x + 24, 278);
    if (ws >= 1) {
      g.save();
      g.translate(ax, ay); g.rotate((compass(Math.atan2(wind.x, wind.z)) - hdg) / DEG);
      g.strokeStyle = C.cyan; g.lineWidth = 2; line(g, 0, 10, 0, -10);
      g.beginPath(); g.moveTo(-4, -5); g.lineTo(0, -10); g.lineTo(4, -5); g.stroke();
      g.restore();
    }
  }
}
