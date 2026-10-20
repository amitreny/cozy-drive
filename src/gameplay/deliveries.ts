import type { AirPlace } from '../world/airports';
import type { Lot } from '../world/lots';
import { boardJobs, CARGO, payout, unitsOf, type Board, type Job } from './jobs';

/** What you are driving or flying, for capacity and for how close you must stop to deliver. */
export type Carrier = 'car' | 'plane' | 'seaplane' | 'heli' | 'balloon';
export interface ActiveJob { job: Job; started: number; care: number }
export interface DeliveriesData { active: { job: Job; elapsed: number; care: number }[]; batches: Record<string, number>; taken: string[]; delivered: number }
export interface Delivered { job: Job; pay: ReturnType<typeof payout> }

/** Accepted jobs, board batches, and the rules for picking up and dropping off. */
export class Deliveries {
  readonly boards: Board[];
  active: ActiveJob[] = [];
  delivered = 0;
  private batches: Record<string, number> = {};
  private taken = new Set<string>();
  private clock = 0;

  constructor(private lots: Lot[], private places: AirPlace[], data?: DeliveriesData) {
    this.boards = [
      ...lots.filter((l) => l.kind === 'shop').map((l) => ({ id: l.id, name: l.name, x: l.front[0], z: l.front[1], business: l.business })),
      ...places.filter((p) => p.kind === 'airfield' || p.kind === 'strip').map((p) => ({ id: p.id, name: `${p.name} air cargo`, x: p.car.x, z: p.car.z, place: p })),
    ];
    if (data) {
      this.batches = { ...data.batches }; this.taken = new Set(data.taken); this.delivered = data.delivered ?? 0;
      this.active = data.active.map((a) => ({ job: a.job, started: -a.elapsed, care: a.care }));
    }
  }

  /** Jobs still on a board (a fresh batch arrives when it runs low). */
  jobsAt(boardId: string): Job[] {
    const b = this.boards.find((x) => x.id === boardId);
    if (!b) return [];
    let list = boardJobs(b, this.lots, this.places, this.batches[boardId] ?? 0).filter((j) => !this.taken.has(j.id));
    if (list.length < 2) {
      this.batches[boardId] = (this.batches[boardId] ?? 0) + 1;
      list = boardJobs(b, this.lots, this.places, this.batches[boardId]).filter((j) => !this.taken.has(j.id));
    }
    return list;
  }

  load(): number { return this.active.reduce((s, a) => s + unitsOf(a.job), 0); }

  /** Why a job can't be taken right now (or null if it can). */
  refusal(job: Job, capacity: number): string | null {
    if (this.active.some((a) => a.job.id === job.id)) return 'Already aboard';
    if (this.load() + unitsOf(job) > capacity) return capacity < unitsOf(job) ? 'Needs a bigger vehicle' : 'No room left';
    return null;
  }

  accept(job: Job, capacity: number): boolean {
    if (this.refusal(job, capacity)) return false;
    this.taken.add(job.id);
    this.active.push({ job, started: this.clock, care: 1 });
    return true;
  }

  /** Hand a job back (nothing lost; it returns to its board's pool next batch). */
  drop(jobId: string): void { this.active = this.active.filter((a) => a.job.id !== jobId); }

  elapsed(a: ActiveJob): number { return this.clock - a.started; }

  /**
   * Advance time and handling. `jolt` is how hard the vehicle was shaken this frame (m/s² of acceleration);
   * fragile cargo loses care above a gentle threshold. Returns the jobs delivered at (x, z), if any.
   */
  update(dt: number, at: { x: number; z: number; carrier: Carrier; stopped: boolean; jolt: number }): Delivered[] {
    this.clock += dt;
    const shake = Math.max(0, at.jolt - 4.5);
    for (const a of this.active) if (CARGO[a.job.cargo].fragile) a.care = Math.max(0, a.care - shake * 0.012 * dt - (at.jolt > 30 ? 0.35 : 0));
    if (!at.stopped) return [];
    const done: Delivered[] = [];
    for (const a of this.active.slice()) {
      const j = a.job, d = Math.hypot(j.to.x - at.x, j.to.z - at.z);
      if (!this.reaches(j, at.carrier, d)) continue;
      this.active.splice(this.active.indexOf(a), 1);
      this.delivered++;
      done.push({ job: j, pay: payout(j, { seconds: this.elapsed(a), care: a.care, byHeli: at.carrier === 'heli' }) });
    }
    return done;
  }

  /** How close each carrier must stop: at the letterbox by car, by the house in a helicopter, at the base in a plane. */
  reaches(j: Job, carrier: Carrier, d: number): boolean {
    if (j.air) {
      if (carrier === 'car') return false;
      if (j.only === 'heli' && carrier !== 'heli') return false;
      if (j.only === 'seaplane' && carrier !== 'seaplane') return false;
      return d < (carrier === 'balloon' ? 120 : 70);
    }
    if (carrier === 'car') return d < 9;
    if (carrier === 'heli') return d < 30;
    if (carrier === 'balloon') return d < 120;
    return d < 60; // planes: land in a field next door
  }

  toJSON(): DeliveriesData {
    return { active: this.active.map((a) => ({ job: a.job, elapsed: this.elapsed(a), care: a.care })), batches: this.batches, taken: [...this.taken].slice(-300), delivered: this.delivered };
  }
}
