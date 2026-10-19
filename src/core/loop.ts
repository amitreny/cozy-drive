/** Fixed-timestep loop with render interpolation (see docs/06-technical-architecture.md). */
export interface LoopHandlers {
  fixedUpdate(dt: number): void;
  update(dt: number, alpha: number): void;
  render(): void;
}

export class FixedLoop {
  step = 1 / 120;
  /** Enough to catch up a 100 ms frame. Dropping simulation time on slow frames makes the car lurch. */
  maxSteps = 12;
  timeScale = 1;
  private acc = 0;
  private last = 0;
  private running = false;

  constructor(private h: LoopHandlers) {}

  /** Advance by one rendered frame of `dt` seconds. Returns the number of fixed steps taken. Pure logic, testable. */
  frame(dt: number): number {
    this.acc += Math.min(dt, 0.25) * this.timeScale;
    let steps = 0;
    while (this.acc >= this.step && steps < this.maxSteps) {
      this.h.fixedUpdate(this.step);
      this.acc -= this.step;
      steps++;
    }
    // Only after a real stall (> maxSteps worth) drop the backlog, keeping the fraction for smooth interpolation.
    if (this.acc >= this.step) this.acc %= this.step;
    this.h.update(dt, this.acc / this.step);
    this.h.render();
    return steps;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      const dt = Math.min((now - this.last) / 1000, 0.25);
      this.last = now;
      this.frame(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop(): void { this.running = false; }
}
