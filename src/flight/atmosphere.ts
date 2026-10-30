/** Air and wind. The wind veers and strengthens with height (as in a real boundary layer), so balloons steer by altitude. */
export const RHO0 = 1.225;
export const T0 = 288.15;
export const G = 9.81;

/** ISA density at altitude h (m). */
export const density = (h: number): number => RHO0 * Math.pow(Math.max(0.2, 1 - 2.2558e-5 * h), 4.2559);

/**
 * The island's prevailing surface wind blows towards 320° (a sea breeze from the south-east), which is why its
 * runways were laid out on 140–150°/320–330°: most days you take off into wind, with a little crosswind at most.
 */
const PREVAILING = -40 * (Math.PI / 180);

export class Wind {
  /** Direction the surface wind blows towards, radians from +z (north). Drifts slowly (up to ~30°) through the day. */
  heading = PREVAILING;
  /** Surface wind speed, m/s. */
  speed = 3;
  private t = 0;

  update(dt: number): void {
    this.t += dt;
    this.heading = PREVAILING + 0.35 * Math.sin(this.t * 0.0021) + 0.15 * Math.sin(this.t * 0.0007 + 1);
    this.speed = 3 + 1.5 * Math.sin(this.t * 0.0013 + 2);
  }

  /** Wind velocity at height h above ground (m) and absolute height y: veers ~70° and doubles by 600 m, with gentle gusts. */
  at(x: number, z: number, hAgl: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const h = Math.max(0, hAgl);
    const profile = Math.min(1, Math.log(1 + h / 0.3) / Math.log(1 + 10 / 0.3)); // log law near the ground
    const s = this.speed * (profile * (1 + Math.min(1.6, h / 380))) * (1 + 0.15 * Math.sin(this.t * 0.9 + x * 0.013) * Math.sin(this.t * 0.37 + z * 0.011));
    const dir = this.heading + Math.min(1.25, h / 480);
    out.x = Math.sin(dir) * s; out.y = 0; out.z = Math.cos(dir) * s;
    return out;
  }
}
