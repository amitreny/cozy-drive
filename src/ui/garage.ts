import { allowed, COZY_SWATCHES, defaultBuild, FINISHES, resolveSpec, stats, WHEEL_NAMES, type Build } from '../customization/build';
import { CAR_TYPES } from '../vehicle/spec';
import type { AssistLevel } from '../vehicle/vehicle';
import { TYRE_NAMES } from '../world/surfaces';

const ASSIST_NAMES: Record<AssistLevel, string> = { relaxed: 'Relaxed', standard: 'Standard', simlite: 'Sim-lite' };
const DIFF_NAMES = { open: 'Open', lsd: 'Limited-slip', locker: 'Lockers' } as const;

/** Garage v1 (docs/04): instant preview of every change, stat bars, assists. */
export class Garage {
  open = false;
  private panel: HTMLElement;
  private build!: Build;
  private assists: AssistLevel = 'relaxed';

  constructor(root: HTMLElement, private onChange: (b: Build) => void, private onAssists: (a: AssistLevel) => void, private onClose: () => void) {
    this.panel = document.createElement('div');
    this.panel.className = 'panel garage';
    root.appendChild(this.panel);
    this.panel.addEventListener('click', (e) => this.click(e.target as HTMLElement));
    this.panel.addEventListener('change', (e) => {
      const inp = e.target as HTMLInputElement;
      if (inp.dataset.k === 'paint' || inp.dataset.k === 'accent') this.set(inp.dataset.k, inp.value);
    });
  }

  show(build: Build, assists: AssistLevel): void {
    this.build = { ...build }; this.assists = assists; this.open = true;
    this.panel.style.display = 'block';
    this.render();
  }

  hide(): void { this.open = false; this.panel.style.display = 'none'; }

  private click(t: HTMLElement): void {
    const btn = t.closest('button');
    if (!btn) return;
    if (btn.dataset.close) { this.onClose(); return; }
    if (btn.dataset.assist) { this.assists = btn.dataset.assist as AssistLevel; this.onAssists(this.assists); this.render(); return; }
    const k = btn.dataset.k as keyof Build | undefined, raw = btn.dataset.v;
    if (!k || raw === undefined) return;
    const v = k === 'lift' || k === 'engineStage' ? Number(raw) : k === 'snorkel' ? raw === 'true' : raw;
    this.set(k, v as never);
  }

  private set<K extends keyof Build>(k: K, v: Build[K]): void {
    this.build = { ...this.build, [k]: v };
    if (k === 'carType') {
      const ok = allowed(String(v));
      Object.assign(this.build, { tyre: CAR_TYPES[String(v)].tyre, lift: 0, snorkel: false, wheels: defaultBuild(String(v)).wheels, diff: ok.diffs.includes('locker') ? 'locker' : 'open' });
    }
    this.onChange(this.build);
    this.render();
  }

  private render(): void {
    const b = this.build, ok = allowed(b.carType), st = stats(resolveSpec(b));
    const row = <T extends string | number>(key: keyof Build, opts: readonly T[], label: (o: T) => string) =>
      `<div class="row">${opts.map((o) => `<button data-k="${key}" data-v="${o}" class="${String(b[key]) === String(o) ? 'on' : ''}">${label(o)}</button>`).join('')}</div>`;
    const bar = (name: string, v: number) => `<div class="bar"><span>${name}</span><i><b style="width:${Math.round(v * 100)}%"></b></i></div>`;
    const swatch = (c: string) => `<button data-k="paint" data-v="${c}" style="background:${c};width:24px;height:24px;padding:0;${b.paint === c ? 'outline:3px solid #3a3129' : ''}"></button>`;
    this.panel.innerHTML = `
      <h2>Garage</h2>
      <label>Car</label>${row('carType', Object.keys(CAR_TYPES), (k) => CAR_TYPES[k].name.split(' · ')[0])}
      <label>Tyres</label>${row('tyre', ok.tyres, (t) => TYRE_NAMES[t])}
      ${ok.wheels.length ? `<label>Wheels</label>${row('wheels', ok.wheels, (w) => WHEEL_NAMES[w])}` : ''}
      <label>Suspension</label>${row('lift', ok.lifts, (l) => (l === 0 ? 'Stock' : `Lift ${l}`))}
      <label>Engine</label>${row('engineStage', [0, 1, 2, 3], (s) => (s === 0 ? 'Stock' : `Stage ${s}`))}
      <label>Differential</label>${row('diff', ok.diffs, (d) => DIFF_NAMES[d])}
      ${ok.snorkel ? `<label>Snorkel</label>${row('snorkel', ['false', 'true'], (s) => (s === 'true' ? 'Fitted' : 'None'))}` : ''}
      <label>Paint</label><div class="row">${COZY_SWATCHES.map(swatch).join('')}</div>
      <div class="row" style="margin-top:6px">Body <input type="color" data-k="paint" value="${b.paint}"> Accent <input type="color" data-k="accent" value="${b.accent}"></div>
      <label>Finish</label>${row('finish', FINISHES, (f) => f[0].toUpperCase() + f.slice(1))}
      <label>Driving assists</label><div class="row">${(Object.keys(ASSIST_NAMES) as AssistLevel[]).map((a) => `<button data-assist="${a}" class="${a === this.assists ? 'on' : ''}">${ASSIST_NAMES[a]}</button>`).join('')}</div>
      <div class="stats">${bar('Power', st.power)}${bar('Accel', st.acceleration)}${bar('Off-road', st.offroad)}${bar('Clearance', st.clearance)}${bar('Comfort', st.comfort)}</div>
      <div class="row" style="margin-top:10px"><button data-close="1" class="on">Drive</button></div>`;
  }
}
