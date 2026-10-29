import * as THREE from 'three';
import type { PropVisual } from './specs';

/**
 * A propeller built to the real thing: tapered, twisted blades (blade angle = atan(pitch / 2πr)) with an airfoil
 * section, a spinner, and the paint real props wear (polished front, anti-glare black back, painted tips).
 * It turns clockwise as seen from the cockpit, like the American engines these aircraft carry.
 *
 * Seen at speed, a propeller is a faint disc: each radius is covered by the blades only a few percent of the time,
 * most at the wide mid-span, and the painted tips draw a ring. So the solid blades show while the engine cranks
 * and fade into that disc as it comes up to idle (a real-time frame rate can't show 40 turns a second anyway).
 */

/** Blade stations (fraction of the radius): chord (fraction of the max chord) and thickness/chord. */
const STATIONS: [number, number, number][] = [
  [0.1, 0.4, 0.55], [0.18, 0.52, 0.34], [0.3, 0.76, 0.2], [0.45, 0.93, 0.13], [0.6, 1, 0.1],
  [0.75, 0.96, 0.085], [0.87, 0.84, 0.075], [0.95, 0.64, 0.07], [0.99, 0.36, 0.065], [1, 0.12, 0.06],
];
/** Airfoil section (chord position from the leading edge, thickness above the chord line): flat face, cambered back. */
const SECTION: [number, number][] = [[0, 0], [0.07, 0.55], [0.28, 0.98], [0.62, 0.68], [1, 0.04], [0.7, -0.08], [0.3, -0.14], [0.06, -0.1]];
const TIP_BAND = 0.045; // width of each painted tip band, fraction of the radius

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function bladeGeometry(p: PropVisual, R: number): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [];
  const front = new THREE.Color(p.colors.front), rear = new THREE.Color(p.colors.rear), tips = p.colors.tips.map((c) => new THREE.Color(c));
  // Section rings along the blade (blade along +y, the disc in x-y, forward +z, turning towards -x at the top).
  const rings = STATIONS.map(([t, cf, th]) => {
    const r = Math.max(t * R, 0.02), c = cf * p.chord * R, beta = Math.atan2(p.pitch, 2 * Math.PI * r);
    const dx = Math.cos(beta), dz = -Math.sin(beta), nx = Math.sin(beta), nz = Math.cos(beta); // chord (LE→TE), back normal
    return SECTION.map(([u, v]) => { const a = (u - 0.35) * c, b = v * th * c; return new THREE.Vector3(a * dx + b * nx, r, a * dz + b * nz); });
  });
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    // Paint: the tip bands on both sides, otherwise the forward-facing back is polished and the face is black.
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const band = Math.floor((1 - (a.y + b.y + c.y) / 3 / R) / TIP_BAND);
    const k = band < tips.length ? tips[band] : n.z >= 0 ? front : rear;
    for (let i = 0; i < 3; i++) col.push(k.r, k.g, k.b);
  };
  const n = SECTION.length;
  for (let s = 0; s < rings.length - 1; s++) for (let i = 0; i < n; i++) {
    const a = rings[s][i], b = rings[s][(i + 1) % n], c = rings[s + 1][(i + 1) % n], d = rings[s + 1][i];
    tri(a, b, c); tri(a, c, d);
  }
  // Caps: the root faces inboard, the tip outboard.
  const root = rings[0], tip = rings[rings.length - 1];
  for (let i = 1; i < n - 1; i++) { tri(root[0], root[i + 1], root[i]); tri(tip[0], tip[i], tip[i + 1]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** The time-averaged look of the spinning blades, one side of the disc: blade colour at the share of each ring they cover. */
function discTexture(p: PropVisual, R: number, side: number, inner: number): THREE.CanvasTexture {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!, hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  for (let px = Math.floor((inner / R) * S / 2); px < S / 2; px++) {
    const t = (px + 0.5) / (S / 2), r = t * R;
    // Chord at this radius, seen edge-on in the disc plane (twisted by the blade angle).
    let cf = 0; for (let i = 0; i < STATIONS.length - 1; i++) { const [t0, c0] = STATIONS[i], [t1, c1] = STATIONS[i + 1]; if (t >= t0 && t <= t1) cf = c0 + ((c1 - c0) * (t - t0)) / (t1 - t0); }
    const cover = (p.blades * cf * p.chord * R * Math.cos(Math.atan2(p.pitch, 2 * Math.PI * r))) / (2 * Math.PI * r);
    const band = Math.floor((1 - t) / TIP_BAND), tip = band < p.colors.tips.length;
    g.strokeStyle = hex(tip ? p.colors.tips[band] : side);
    g.globalAlpha = Math.min(0.55, tip ? Math.max(0.3, cover * 3) : cover * 2.4);
    g.lineWidth = 1.6; g.beginPath(); g.arc(S / 2, S / 2, px, 0, Math.PI * 2); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Propeller {
  /** Sits at the hub, in the aircraft's body frame. */
  readonly group = new THREE.Group();
  private rotor = new THREE.Group();
  private bladeMat: THREE.MeshStandardMaterial;
  private blades: THREE.Mesh;
  private discs: THREE.Mesh[] = [];
  private angle = 0;

  constructor(readonly spec: PropVisual, readonly radius: number) {
    this.group.position.set(...spec.hub);
    this.group.add(this.rotor);
    this.bladeMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, metalness: 0.3, roughness: 0.45, transparent: true });
    const one = bladeGeometry(spec, radius), all: THREE.BufferGeometry[] = [];
    for (let i = 0; i < spec.blades; i++) all.push(one.clone().rotateZ((i * Math.PI * 2) / spec.blades));
    this.blades = new THREE.Mesh(mergeGeometries(all), this.bladeMat);
    this.blades.castShadow = true;
    this.rotor.add(this.blades);
    let inner = 0.05;
    if (spec.spinner) {
      const { base, length, radius: rs, color } = spec.spinner, pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
      for (let i = 0; i <= 14; i++) { const s = i / 14; pts.push(new THREE.Vector2(rs * Math.pow(1 - s * s, 0.55), s * length)); }
      const geo = new THREE.LatheGeometry(pts, 24).rotateX(Math.PI / 2).translate(0, 0, base - spec.hub[2]);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.3 }));
      m.castShadow = true; this.rotor.add(m);
      inner = rs * 0.8;
    }
    // Disc: the polished side faces forward, the black side faces the pilot.
    for (const [side, color] of [[THREE.FrontSide, spec.colors.front], [THREE.BackSide, spec.colors.rear]] as const) {
      const mat = new THREE.MeshLambertMaterial({ map: discTexture(spec, radius, color, inner), transparent: true, depthWrite: false, side, opacity: 0 });
      const d = new THREE.Mesh(new THREE.RingGeometry(inner, radius, 48, 1), mat);
      d.renderOrder = 1; this.group.add(d); this.discs.push(d);
    }
  }

  update(rpm: number, dt: number): void {
    this.angle = (this.angle + (rpm / 60) * Math.PI * 2 * dt) % (Math.PI * 2);
    this.rotor.rotation.z = this.angle;
    const solid = 1 - smooth(240, 520, rpm), blur = smooth(160, 600, rpm);
    this.bladeMat.opacity = solid; this.blades.visible = solid > 0.02;
    this.blades.castShadow = solid > 0.5;
    for (const d of this.discs) { (d.material as THREE.MeshLambertMaterial).opacity = blur; d.visible = blur > 0.02; }
  }
}

/** Join non-indexed geometries with the same attributes. */
function mergeGeometries(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const parts = gs.map((g) => g.getAttribute(name).array as Float32Array), n = parts.reduce((a, p) => a + p.length, 0), arr = new Float32Array(n);
    let o = 0; for (const p of parts) { arr.set(p, o); o += p.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}
