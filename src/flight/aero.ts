/** Lift and drag of a finite wing (pure functions, unit-tested). Angles in radians. */

/** Lift-curve slope per radian of a finite wing (Helmholtz): 2π for an infinite one, less for stubby surfaces. */
export const liftSlope = (aspect: number): number => (2 * Math.PI * aspect) / (2 + Math.sqrt(aspect * aspect + 4));

const smooth = (a: number, b: number, v: number): number => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Angle of attack where the linear lift reaches clMax (the stall). */
export const stallAngle = (aspect: number, clMax: number): number => clMax / liftSlope(aspect);

/**
 * Lift coefficient: linear up to clMax, a rounded peak, then a gentle break towards flat-plate lift (1.1·sin 2α)
 * over ~14°, as on a real wing (most light aircraft keep 60–80 % of their lift just past the stall).
 */
export function liftCoef(alpha: number, aspect: number, clMax: number): number {
  const a = liftSlope(aspect), s = Math.sign(alpha) || 1, abs = Math.abs(alpha), as = clMax / a;
  let peak: number;
  if (abs < as * 0.85) peak = a * abs;
  else if (abs < as) { const u = (abs - as * 0.85) / (as * 0.15); peak = clMax * (0.85 + 0.15 * (u + u * u - u * u * u)); } // meets clMax with zero slope
  else peak = clMax;
  const flat = 1.1 * Math.sin(2 * Math.min(abs, Math.PI / 2));
  const t = smooth(as, as + 0.25, abs);
  return s * (peak * (1 - t) + flat * t);
}

/** Drag coefficient: profile + induced (reduced in ground effect) + the big flat-plate drag of a stalled wing. */
export function dragCoef(alpha: number, cl: number, aspect: number, cd0: number, e: number, clMax: number, groundFactor = 1): number {
  const as = stallAngle(aspect, clMax), abs = Math.abs(alpha);
  const induced = (cl * cl) / (Math.PI * aspect * e) * groundFactor;
  const stalled = 1.25 * Math.sin(Math.min(abs, Math.PI / 2)) ** 2 * smooth(as * 0.9, as + 0.2, abs);
  return cd0 + induced + stalled;
}

/** Ground effect within about a span of the ground: less induced drag, a little more lift (Wieselsberger/McCormick). */
export function groundEffect(heightOverSpan: number): { drag: number; lift: number } {
  const h = Math.max(0.02, heightOverSpan), r = (16 * h) ** 2;
  return { drag: r / (1 + r), lift: 1 + 0.25 * Math.exp(-4 * h) };
}
