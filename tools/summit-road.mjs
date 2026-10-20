// Lays out the Summit Road over the generated terrain and prints SUMMIT_ROAD for src/world/roads.ts.
// Two hairpin stacks: legs follow the contours at the design grade (each leg slides up or down the slope until the
// ground matches), semicircular hairpins at the corridor edges, a minimum gap between legs. Then a loop to the summit.
// It also reports how the real road pipeline will carve it (cut/fill depths, tightest bend, closest approach).
// Usage: node tools/summit-road.mjs   (rerun and paste the output if the mountain's shape changes)
import { createServer } from 'vite';
const vite = await createServer({ root: process.cwd(), server: { middlewareMode: true }, logLevel: 'silent' });
const roads = await vite.ssrLoadModule('/src/world/roads.ts');
const { makeBaseHeight } = await vite.ssrLoadModule('/src/world/terrainGen.ts');
const { Perlin2 } = await vite.ssrLoadModule('/src/world/noise.ts');
const base = makeBaseHeight(new Perlin2(7));
const HB = 12, H = (x, z) => { let s = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) s += base(x + a * HB, z + b * HB); return s / 9; };
function design(c) {
  const g = c.g, out = [], push = (p) => out.push([Math.round(p[0]), Math.round(p[1])]);
  let cur = c.start, h = H(cur[0], cur[1]); push(cur);
  for (const q of c.lead) { h += g * Math.hypot(q[0] - cur[0], q[1] - cur[1]); push(q); cur = q; }
  let dirSide = -1;
  for (const st of c.stacks) {
    const a = (st.heading * Math.PI) / 180, V = [Math.sin(a), Math.cos(a)], U = [Math.cos(a), -Math.sin(a)], R = st.R, W = st.W, DU = 14, clr = 2 * R + 6;
    // Origin placed so the current point sits at (u0, v0) in the frame.
    const O = st.origin ?? [cur[0] - U[0] * st.u0 - V[0] * st.v0, cur[1] - U[1] * st.u0 - V[1] * st.v0];
    const at = (u, v) => [O[0] + U[0] * u + V[0] * v, O[1] + U[1] * u + V[1] * v];
    const dx = cur[0] - O[0], dz = cur[1] - O[1]; let u = dx * U[0] + dz * U[1], v = dx * V[0] + dz * V[1];
    let side = st.firstSide ?? dirSide, prevLeg = null;
    const prevV = (uu) => { if (!prevLeg) return -1e9; let b = -1e9; for (const [pu, pv] of prevLeg) if (Math.abs(pu - uu) <= DU / 2 + 0.01) b = Math.max(b, pv); return b; };
    for (let k = 0; k < st.n; k++) {
      const leg = [[u, v]];
      while (side * u < W - 1e-6) {
        const un = side * Math.min(W, side * u + DU), step = Math.abs(un - u);
        let vn = Math.max(v - 0.5 * step, prevV(un) + clr); const hT = h + g * step * 1.03;
        while (vn < v + 0.5 * step && H(...at(un, vn)) < hT) vn += 0.5;
        h += g * Math.hypot(step, vn - v); u = un; v = vn; leg.push([u, v]); push(at(u, v));
      }
      dirSide = side;
      if (k === st.n - 1 || (st.untilH && h >= st.untilH)) break;
      for (const ph of [-45, 0, 45]) { const r = (ph * Math.PI) / 180; push(at(side * W + side * R * Math.cos(r), v + R + R * Math.sin(r))); }
      h += g * Math.PI * R; v += 2 * R; push(at(u, v)); prevLeg = leg; side = -side; dirSide = side;
    }
    cur = at(u, v);
  }
  for (const q of c.tail ?? []) { h += g * Math.hypot(q[0] - cur[0], q[1] - cur[1]); push(q); cur = q; }
  return { out, h };
}
function evaluate(points, maxg = 0.12, sm = 8) {
  const { xs, zs } = roads.sampleRoad({ name: 'x', kind: 'road', width: 6.5, points });
  const raw = new Float32Array(xs.length); for (let i = 0; i < xs.length; i++) raw[i] = base(xs[i], zs[i]);
  let prof = roads.smoothProfile(raw, sm, false); prof[0] = raw[0]; prof[prof.length - 1] = raw[raw.length - 1] - 4;
  prof = roads.limitGrade(prof, xs, zs, maxg, false, [0, prof.length - 1]);
  let L = 0, maxCut = 0, maxFill = 0, minR = 1e9; const c = [];
  for (let i = 1; i < xs.length; i++) L += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  for (let i = 0; i < xs.length; i++) { const d = raw[i] - prof[i]; maxCut = Math.max(maxCut, d); maxFill = Math.max(maxFill, -d); c.push(Math.abs(d)); }
  for (let i = 3; i < xs.length - 3; i++) { const ax = xs[i] - xs[i - 3], az = zs[i] - zs[i - 3], bx = xs[i + 3] - xs[i], bz = zs[i + 3] - zs[i]; const ang = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz)); if (ang > 1e-3) minR = Math.min(minR, ((Math.hypot(ax, az) + Math.hypot(bx, bz)) / 2) / ang); }
  let clear = 1e9; for (let i = 0; i < xs.length; i += 2) for (let j = i + 30; j < xs.length; j += 2) clear = Math.min(clear, Math.hypot(xs[i] - xs[j], zs[i] - zs[j]));
  c.sort((a, b) => a - b);
  return { L, maxCut, maxFill, p50: c[c.length >> 1], p90: c[Math.floor(c.length * 0.9)], minR, clear };
}
const c = { g: 0.095, start: [190, 387], lead: [[110, 425], [20, 455], [-60, 480]],
  stacks: [{ origin: [-120, 520], heading: 40, W: 105, R: 12, n: 14, firstSide: -1, untilH: 140 }, { heading: 45, W: 60, R: 11, n: 5, u0: 26, v0: 8 }],
  tail: [[-58, 912], [-72, 940], [-68, 975], [-42, 1002], [0, 1012], [40, 1000], [62, 968], [56, 932], [30, 912], [8, 922], [0, 940], [4, 956]] };
const d = design(c), m = evaluate(d.out);
console.error(`length ${m.L.toFixed(0)} m, cut up to ${m.maxCut.toFixed(0)} m, fill up to ${m.maxFill.toFixed(0)} m, median ${m.p50.toFixed(1)} m, p90 ${m.p90.toFixed(0)} m, tightest bend ${m.minR.toFixed(1)} m, legs at least ${m.clear.toFixed(0)} m apart`);
const rows = []; for (let i = 0; i < d.out.length; i += 10) rows.push('  ' + d.out.slice(i, i + 10).map((q) => `[${q[0]}, ${q[1]}]`).join(', ') + ',');
console.log(['const SUMMIT_ROAD: [number, number][] = [', ...rows, '];'].join(String.fromCharCode(10)));
await vite.close();
