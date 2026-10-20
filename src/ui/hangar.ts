import { AIRCRAFT, AIRCRAFT_ORDER, type AircraftSpec } from '../flight/specs';
import type { AirPlace } from '../world/airports';
import type { Job } from '../gameplay/jobs';
import type { Shop } from './garage';
import { jobListHtml } from './jobBoard';

/** Which aircraft can use a place: helipads take the helicopter (and the balloon), docks the seaplane. */
export function usableAt(spec: AircraftSpec, place: AirPlace): boolean {
  if (place.kind === 'helipad') return spec.kind === 'heli' || spec.kind === 'balloon';
  if (place.kind === 'dock') return spec.id === 'puffin';
  return true;
}
export const aircraftKey = (id: string): string => `aircraft:${id}`;

const stat = (spec: AircraftSpec): string => {
  if (spec.kind === 'heli') return `Hover anywhere · carries ${spec.capacity}`;
  if (spec.kind === 'balloon') return `Drifts with the wind · carries ${spec.capacity}`;
  const area = spec.surfaces.filter((s) => s.orient === 'h' && !s.downwash).reduce((a, s) => a + s.area, 0);
  const vs = Math.sqrt((2 * spec.mass * 9.81) / (1.225 * area * 1.55)) * 3.6;
  return `Lifts off ~${Math.round(vs * 1.15 / 5) * 5} km/h · carries ${spec.capacity}`;
};

/** The hangar: choose, buy and fly an aircraft from an airfield, strip, helipad or dock. */
export class Hangar {
  open = false;
  private panel: HTMLElement;
  private place: AirPlace | null = null;

  constructor(root: HTMLElement, private shop: Shop, private onFly: (spec: AircraftSpec, place: AirPlace) => void, private onClose: () => void,
    private cargo?: { jobs(placeId: string): Job[]; refusal(j: Job): string | null; accept(j: Job): void }) {
    this.panel = document.createElement('div');
    this.panel.className = 'panel garage hangar';
    root.appendChild(this.panel);
    this.panel.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn || btn.disabled || !this.place) return;
      if (btn.dataset.close) { this.onClose(); return; }
      if (btn.dataset.accept && this.cargo) { const j = this.cargo.jobs(this.place.id).find((x) => x.id === btn.dataset.accept); if (j) this.cargo.accept(j); this.render(); return; }
      const spec = AIRCRAFT[btn.dataset.id ?? ''];
      if (!spec) return;
      if (btn.dataset.buy) { if (this.shop.buy([aircraftKey(spec.id)], spec.price)) this.render(); return; }
      if (btn.dataset.fly) this.onFly(spec, this.place);
    });
  }

  owns(id: string): boolean { return this.shop.creative() || AIRCRAFT[id].price === 0 || this.shop.owned().has(aircraftKey(id)); }

  show(place: AirPlace): void { this.place = place; this.open = true; this.panel.style.display = 'block'; this.render(); }
  hide(): void { this.open = false; this.panel.style.display = 'none'; }

  private render(): void {
    const p = this.place!, list = AIRCRAFT_ORDER.map((id) => AIRCRAFT[id]).filter((s) => usableAt(s, p));
    this.panel.innerHTML = `<div class="garage-head"><h2>${p.name}</h2><span>🌰 ${this.shop.creative() ? '∞' : this.shop.acorns()}</span></div>
      <p class="hint">${p.kind === 'dock' ? 'Seaplanes moor here.' : p.kind === 'helipad' ? 'A pad for the helicopter (and a fine balloon launch).' : 'Your car waits here while you fly. Land anywhere and press E to park: the ground crew brings your car.'}</p>
      ${list.map((s) => `<div class="aircraft-card">
        <b>${s.name}</b> <small>${s.realType}</small><br>
        <span class="hint">${s.blurb}</span><br><span class="hint">${stat(s)}</span><br>
        ${this.owns(s.id) ? `<button data-fly="1" data-id="${s.id}" class="on">Fly the ${s.name}</button>` : `<button data-buy="1" data-id="${s.id}" ${this.shop.acorns() < s.price ? 'disabled' : ''}>Buy · 🌰 ${s.price}</button>`}
        <div class="credit">Model: ${s.credit}</div></div>`).join('')}
      ${this.cargo && (p.kind === 'airfield' || p.kind === 'strip') ? `<h3>Air cargo office</h3><p class="hint">Fly it to the base on the label, land and stop: delivered.</p>${jobListHtml(this.cargo.jobs(p.id), (j) => this.cargo!.refusal(j))}` : ''}
      <div class="row"><button data-close="1">Back to the car</button></div>`;
  }
}
