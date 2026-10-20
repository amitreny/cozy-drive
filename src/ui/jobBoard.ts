import { CARGO, cargoText, unitsOf, type Job } from '../gameplay/jobs';
import type { ActiveJob } from '../gameplay/deliveries';

const flags = (j: Job): string => {
  const c = CARGO[j.cargo], out: string[] = [];
  if (j.air) out.push(j.only === 'heli' ? '🚁 helicopter only' : j.only === 'seaplane' ? '🛶 seaplane only' : '✈ by air');
  if (c.fragile) out.push('fragile: care bonus');
  if (c.perishable && j.timeLimit) out.push(`on time (${Math.ceil(j.timeLimit / 60)} min): bonus`);
  if (c.heavy) out.push('heavy');
  return out.join(' · ');
};

/** A list of jobs with Accept buttons (`data-accept` = job id). Shared by the job board and the hangar's air-cargo office. */
export function jobListHtml(jobs: Job[], refusal: (j: Job) => string | null): string {
  if (!jobs.length) return '<p class="hint">No work right now. Check back soon.</p>';
  return jobs.map((j) => {
    const why = refusal(j);
    return `<div class="job"><div><b>${cargoText(j.cargo, j.count)}</b> → ${j.to.name}${j.to.kind === 'lot' && j.to.who !== j.to.name ? ` <span class="hint">(${j.to.who}, ${j.to.town})</span>` : ''}</div>
      <div class="hint">${j.km.toFixed(1)} km · ${unitsOf(j)} space${unitsOf(j) > 1 ? 's' : ''}${flags(j) ? ` · ${flags(j)}` : ''}</div>
      <button data-accept="${j.id}" ${why ? 'disabled' : 'class="on"'}>${why ?? `Take it · 🌰 ${j.reward}`}</button></div>`;
  }).join('');
}

/** A shop's job board: deliveries from this business to homes and other businesses around the island. */
export class JobBoard {
  open = false;
  private panel: HTMLElement;
  private boardId = '';

  constructor(root: HTMLElement, private api: { name(id: string): string; jobs(id: string): Job[]; refusal(j: Job): string | null; accept(j: Job): void; active(): ActiveJob[]; drop(id: string): void; carrier(): { name: string; capacity: number; load: number } }, private onClose: () => void) {
    this.panel = document.createElement('div');
    this.panel.className = 'panel garage jobboard';
    root.appendChild(this.panel);
    this.panel.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn || btn.disabled) return;
      if (btn.dataset.close) { this.onClose(); return; }
      if (btn.dataset.accept) { const j = this.api.jobs(this.boardId).find((x) => x.id === btn.dataset.accept); if (j) this.api.accept(j); this.render(); }
      if (btn.dataset.drop) { this.api.drop(btn.dataset.drop); this.render(); }
    });
  }

  show(boardId: string): void { this.boardId = boardId; this.open = true; this.panel.style.display = 'block'; this.render(); }
  hide(): void { this.open = false; this.panel.style.display = 'none'; }

  private render(): void {
    const c = this.api.carrier(), act = this.api.active();
    this.panel.innerHTML = `<div class="garage-head"><h2>${this.api.name(this.boardId)}</h2></div>
      <p class="hint">${c.name} · cargo ${c.load} / ${c.capacity}. Stop at the letterbox to deliver. Bigger vehicles carry more.</p>
      ${jobListHtml(this.api.jobs(this.boardId), (j) => this.api.refusal(j))}
      ${act.length ? `<h3>Aboard</h3>${act.map((a) => `<div class="job"><b>${cargoText(a.job.cargo, a.job.count)}</b> → ${a.job.to.name} <button data-drop="${a.job.id}">Hand back</button></div>`).join('')}` : ''}
      <div class="row"><button data-close="1">Done</button></div>`;
  }
}

/** On-screen list of deliveries in progress: where to, how far, which way, and the clock or care meter. */
export class Tracker {
  private el: HTMLElement;
  private acc = 0;
  constructor(root: HTMLElement) { this.el = document.createElement('div'); this.el.className = 'panel tracker'; root.appendChild(this.el); }

  update(dt: number, active: ActiveJob[], elapsed: (a: ActiveJob) => number, x: number, z: number, heading: number): void {
    this.acc += dt;
    if (this.acc < 0.2) return;
    this.acc = 0;
    this.el.style.display = active.length ? 'block' : 'none';
    if (!active.length) return;
    this.el.innerHTML = active.map((a) => {
      const j = a.job, dx = j.to.x - x, dz = j.to.z - z, d = Math.hypot(dx, dz);
      // Arrow relative to where you're facing (our +x is to the left when facing +z).
      const rel = Math.atan2(dx, dz) - heading, deg = (-rel * 180) / Math.PI;
      const c = CARGO[j.cargo];
      let extra = '';
      if (c.perishable && j.timeLimit) { const left = j.timeLimit - elapsed(a); extra = left > 0 ? ` · ⏱ ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : ' · late'; }
      if (c.fragile) extra += ` · care ${Math.round(a.care * 100)}%`;
      return `<div class="trk"><span class="arrow" style="transform:rotate(${(deg - 90).toFixed(0)}deg)">➤</span> ${c.icon} → <b>${j.to.name}</b> · ${d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`}${extra}</div>`;
    }).join('');
  }
}
