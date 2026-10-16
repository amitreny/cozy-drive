/** Deterministic seeded noise. Pure: identical results in the browser, workers and tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash → [0,1). Handy for per-cell deterministic decisions. */
export function hash2(x: number, z: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Perlin2 {
  private p = new Uint8Array(512);
  constructor(seed: number) {
    const rnd = mulberry32(seed);
    const base = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [base[i], base[j]] = [base[j], base[i]]; }
    for (let i = 0; i < 512; i++) this.p[i] = base[i & 255];
  }

  /** Classic gradient noise in roughly [-1, 1]. */
  noise(x: number, y: number): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const p = this.p;
    const g = (h: number, dx: number, dy: number) => {
      switch (h & 7) {
        case 0: return dx + dy; case 1: return -dx + dy; case 2: return dx - dy; case 3: return -dx - dy;
        case 4: return dx; case 5: return -dx; case 6: return dy; default: return -dy;
      }
    };
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const u = fade(xf), v = fade(yf);
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const x1 = g(aa, xf, yf) + u * (g(ba, xf - 1, yf) - g(aa, xf, yf));
    const x2 = g(ab, xf, yf - 1) + u * (g(bb, xf - 1, yf - 1) - g(ab, xf, yf - 1));
    return (x1 + v * (x2 - x1)) * 0.9;
  }

  fbm(x: number, y: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) { sum += amp * this.noise(x * freq, y * freq); norm += amp; amp *= gain; freq *= lacunarity; }
    return sum / norm;
  }

  /** Ridged multifractal in [0, 1]: sharp crests for mountains and dunes. */
  ridged(x: number, y: number, octaves = 5): number {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) { const n = 1 - Math.abs(this.noise(x * freq, y * freq)); sum += amp * n * n; norm += amp; amp *= 0.5; freq *= 2; }
    return sum / norm;
  }
}
