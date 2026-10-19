import { describe, expect, it } from 'vitest';
import { FixedLoop } from '../src/core/loop';

function simulate(frameMs: number[]): { sim: number; real: number; alphas: number[] } {
  let sim = 0;
  const alphas: number[] = [];
  const loop = new FixedLoop({ fixedUpdate: (dt) => { sim += dt; }, update: (_dt, a) => { alphas.push(a); }, render: () => {} });
  let real = 0;
  for (const ms of frameMs) { real += ms / 1000; loop.frame(ms / 1000); }
  return { sim, real, alphas };
}

describe('fixed-step loop', () => {
  for (const [label, frames] of [
    ['60 fps', Array(600).fill(16.67)],
    ['144 fps', Array(1440).fill(6.94)],
    ['25 fps', Array(250).fill(40)],
    ['uneven 16–50 ms', Array.from({ length: 400 }, (_, i) => (i % 3 === 0 ? 50 : 17))],
  ] as const) {
    it(`keeps simulation time in step with real time at ${label}`, () => {
      const { sim, real, alphas } = simulate(frames as unknown as number[]);
      expect(Math.abs(sim - real)).toBeLessThan(1 / 120 + 1e-9);
      expect(alphas.every((a) => a >= 0 && a < 1)).toBe(true);
    });
  }
});
