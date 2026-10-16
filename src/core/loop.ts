/** Fixed-timestep loop with render interpolation (see docs/06-technical-architecture.md). */
export interface LoopHandlers {
  fixedUpdate(dt: number): void;
  update(dt: number, alpha: number): void;
  render(): void;
}

export class FixedLoop {
  step = 1 / 120;
  maxSteps = 4;
  timeScale = 1;
  private acc = 0;
  private last = 0;
  private running = false;

  constructor(private h: LoopHandlers) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      const dt = Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      this.acc += dt * this.timeScale;
      let steps = 0;
      while (this.acc >= this.step && steps < this.maxSteps) {
        this.h.fixedUpdate(this.step);
        this.acc -= this.step;
        steps++;
      }
      if (steps === this.maxSteps) this.acc = 0; // drop backlog after a hitch
      this.h.update(dt, this.acc / this.step);
      this.h.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop(): void { this.running = false; }
}
