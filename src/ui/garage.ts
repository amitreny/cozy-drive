import { allowed, COZY_SWATCHES, defaultBuild, FINISHES, resolveSpec, stats, WHEEL_NAMES, type Build } from '../customization/build';
import { costOf, missing, PRICES } from '../gameplay/economy';
import { CAR_TYPES } from '../vehicle/spec';
import type { AssistLevel } from '../vehicle/vehicle';
import { TYRE_NAMES } from '../world/surfaces';

const ASSIST_NAMES: Record<AssistLevel, string> = { relaxed: 'Relaxed', standard: 'Standard', simlite: 'Sim-lite' };
const DIFF_NAMES = { open: 'Open', lsd: 'Limited-slip', locker: 'Lockers' } as const;
const KEY_PREFIX: Partial<Record<keyof Build, string>> = { carType: 'car', tyre: 'tyre', wheels: 'wheels', lift: 'lift', engineStage: 'engine', diff: 'diff', finish: 'finish' };

/** What the garage needs from the game's progress (acorns, owned unlocks, creative mode). */
export interface Shop {
  acorns(): number;
  owned(): ReadonlySet<string>;
  creative(): boolean;
  setCreative(on: boolean): void;
  buy(keys: string[], cost: number): boolean;
}

/** Garage (docs/04): instant preview, prices, try-before-you-buy, stat bars, assists. */
export class Garage {
  open = false;
  private panel: HTMLElement;
  private build!: Build;
  private paid!: Build;
  private assists: AssistLevel = 'relaxed';

  constructor(root: HTMLElement, private shop: Shop, private onChange: (b: Build) => void, private onAssists: (a: AssistLevel) => void, private onClose: () => void) {
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
    this.build = { ...build }; this.paid = { ...build }; this.assists = assists; this.open = true;
    this.panel.style.display = 'block';
    this.render();
  }

  /** Leaving without paying restores the last paid setup (nothing is ever lost). */
  hide(): void {
    if (this.open && this.unpaid().length) this.onChange(this.paid);
    this.open = false; this.panel.style.display = 'none';
  }

  private unpaid(): string[] { return this.shop.creative() ? [] : missing(this.build, this.shop.owned()); }

  private click(t: HTMLElement): void {
    const btn = t.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.dataset.close) { this.onClose(); return; }
    if (btn.dataset.buy) {
      const keys = this.unpaid();
      if (this.shop.buy(keys, costOf(keys))) this.paid = { ...this.build };
      this.render(); return;
    }
    if (btn.dataset.revert) { this.build = { ...this.paid }; this.onChange(this.build); this.render(); return; }
    if (btn.dataset.creative) { this.shop.setCreative(!this.shop.creative()); if (this.shop.creative()) this.paid = { ...this.build }; this.render(); return; }
    if (btn.dataset.assist) { this.assists = btn.dataset.assist as AssistLevel; this.onAssists(this.assists); this.render(); return; }
    const k = btn.dataset.k as keyof Build | undefined, raw = btn.dataset.v;
    if (!k || raw === undefined) return;
    const v = k === 'lift' || k === 'engineStage' ? Number(raw) : k === 'snorkel' ? raw === 'true' : raw;
    this.set(k, v as never);
  }

  private set<K extends keyof Build>(k: K, v: Build[K]): void {
    this.build = { ...this.build, [k]: v };
    if (k === 'carType') {
      const ok = allowed(String(v)), stock = defaultBuild(String(v));
      Object.assign(this.build, { tyre: stock.tyre, wheels: stock.wheels, lift: 0, engineStage: 0, snorkel: false, diff: ok.diffs.includes(stock.diff) ? stock.diff : 'open' });
    }
    this.onChange(this.build);
    this.render();
  }

  /** Price badge for choosing option `o` in row `k`, or '' when it is stock, owned or free. */
  private badge(k: keyof Build, o: string | number): string {
    if (this.shop.creative()) return '';
    const prefix = KEY_PREFIX[k];
    const key = k === 'snorkel' ? (o === 'true' ? 'snorkel' : '') : prefix ? `${prefix}:${o}` : '';
    if (!key || this.shop.owned().has(key)) return '';
    if (k !== 'carType' && k !== 'finish' && k !== 'lift' && k !== 'engineStage' && k !== 'snorkel' && String(defaultBuild(this.build.carType)[k]) === String(o)) return '';
    if (k === 'carType' && o === 'pip') return '';
    const p = PRICES[key] ?? 0;
    return p ? ` <small>🌰${p}</small>` : '';
  }

  private render(): void {
    const b = this.build, ok = allowed(b.carType), st = stats(resolveSpec(b));
    const row = <T extends string | number>(key: keyof Build, opts: readonly T[], label: (o: T) => string) =>
      `<div class="row">${opts.map((o) => `<button data-k="${key}" data-v="${o}" class="${String(b[key]) === String(o) ? 'on' : ''}">${label(o)}${this.badge(key, o)}</button>`).join('')}</div>`;
    const bar = (name: string, v: number) => `<div class="bar"><span>${name}</span><i><b style="width:${Math.round(v * 100)}%"></b></i></div>`;
    const swatch = (c: string) => `<button data-k="paint" data-v="${c}" style="background:${c};width:24px;height:24px;padding:0;${b.paint === c ? 'outline:3px solid #3a3129' : ''}"></button>`;
    const unpaid = this.unpaid(), cost = costOf(unpaid), acorns = this.shop.acorns();
    const footer = unpaid.length
      ? `<div class="shopbar">Trying on: <b>🌰 ${cost}</b> ${acorns < cost ? `<span class="short">(you have ${acorns})</span>` : ''}
           <div class="row"><button data-buy="1" class="on" ${acorns < cost ? 'disabled' : ''}>Buy</button><button data-revert="1">Revert</button></div></div>`
      : `<div class="row" style="margin-top:10px"><button data-close="1" class="on">Drive</button></div>`;
    this.panel.innerHTML = `
      <div class="garage-head"><h2>Garage</h2><span class="acorns">🌰 ${this.shop.creative() ? '∞' : acorns}</span></div>
      <label>Car</label>${row('carType', Object.keys(CAR_TYPES), (k) => CAR_TYPES[k].name.split(' · ')[0])}
      <label>Tyres</label>${row('tyre', ok.tyres, (t) => TYRE_NAMES[t])}
      ${ok.wheels.length ? `<label>Wheels</label>${row('wheels', ok.wheels, (w) => WHEEL_NAMES[w])}` : ''}
      <label>Suspension</label>${row('lift', ok.lifts, (l) => (l === 0 ? 'Stock' : `Lift ${l}`))}
      <label>Engine</label>${row('engineStage', [0, 1, 2, 3], (s) => (s === 0 ? 'Stock' : `Stage ${s}`))}
      <label>Differential</label>${row('diff', ok.diffs, (d) => DIFF_NAMES[d])}
      ${ok.snorkel ? `<label>Snorkel</label>${row('snorkel', ['false', 'true'], (s) => (s === 'true' ? 'Fitted' : 'None'))}` : ''}
      <label>Paint <small>(always free)</small></label><div class="row">${COZY_SWATCHES.map(swatch).join('')}</div>
      <div class="row" style="margin-top:6px">Body <input type="color" data-k="paint" value="${b.paint}"> Accent <input type="color" data-k="accent" value="${b.accent}"></div>
      <label>Finish</label>${row('finish', FINISHES, (f) => f[0].toUpperCase() + f.slice(1))}
      <label>Driving assists</label><div class="row">${(Object.keys(ASSIST_NAMES) as AssistLevel[]).map((a) => `<button data-assist="${a}" class="${a === this.assists ? 'on' : ''}">${ASSIST_NAMES[a]}</button>`).join('')}</div>
      <div class="stats">${bar('Power', st.power)}${bar('Accel', st.acceleration)}${bar('Off-road', st.offroad)}${bar('Clearance', st.clearance)}${bar('Comfort', st.comfort)}</div>
      ${footer}
      <div class="row" style="margin-top:8px"><button data-creative="1" class="${this.shop.creative() ? 'on' : ''}">Creative mode: ${this.shop.creative() ? 'on' : 'off'}</button></div>`;
  }
}
