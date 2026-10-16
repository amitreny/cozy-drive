/** Tiny allocation-friendly vector helpers used by the simulation (no three.js dependency). */
export interface V3 { x: number; y: number; z: number }
export interface Q4 { x: number; y: number; z: number; w: number }

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const set = (o: V3, x: number, y: number, z: number): V3 => { o.x = x; o.y = y; o.z = z; return o; };
export const copy = (o: V3, a: V3): V3 => set(o, a.x, a.y, a.z);
export const add = (o: V3, a: V3, b: V3): V3 => set(o, a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (o: V3, a: V3, b: V3): V3 => set(o, a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (o: V3, a: V3, s: number): V3 => set(o, a.x * s, a.y * s, a.z * s);
export const addScaled = (o: V3, a: V3, b: V3, s: number): V3 => set(o, a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);
export const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (o: V3, a: V3, b: V3): V3 => set(o, a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len = (a: V3): number => Math.hypot(a.x, a.y, a.z);
export const normalize = (o: V3, a: V3): V3 => { const l = len(a) || 1; return scale(o, a, 1 / l); };

/** Rotate vector v by unit quaternion q. */
export function rotate(o: V3, q: Q4, v: V3): V3 {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y;
  const iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x;
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return set(o,
    ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x);
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number): number => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Frame-rate independent exponential approach. */
export const damp = (cur: number, target: number, rate: number, dt: number): number => lerp(cur, target, 1 - Math.exp(-rate * dt));

/** Quaternion from yaw angle (rotation about +Y). */
export const yawQuat = (yaw: number): Q4 => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
