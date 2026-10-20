import type { AudioMix } from '../audio/audio';

const CHANNELS: [keyof AudioMix, string, string][] = [
  ['master', 'Master', 'Everything'],
  ['engine', 'Engine', 'Engine and intake'],
  ['music', 'Radio', 'Music stations'],
  ['ambience', 'Nature', 'Birds, crickets, waves'],
  ['effects', 'Effects', 'Tyres, wind, skids, chimes'],
];

export interface SettingsHooks {
  mix(): AudioMix;
  setMix(m: AudioMix): void;
  stations(): string[];
  station(): number; // -1 = off
  setStation(i: number): void;
  muted(): boolean;
  setMuted(m: boolean): void;
  minimap(): { visible: boolean; rotate: boolean };
  setMinimap(visible: boolean, rotate: boolean): void;
}

/** Settings (Esc): per-channel volume, radio station, mute, mini map. */
export class SettingsPanel {
  open = false;
  private el: HTMLElement;

  constructor(root: HTMLElement, private hooks: SettingsHooks, private onClose: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'panel settings';
    root.appendChild(this.el);
    this.el.addEventListener('input', (e) => {
      const inp = e.target as HTMLInputElement;
      if (!inp.dataset.ch) return;
      const m = { ...this.hooks.mix(), [inp.dataset.ch]: Number(inp.value) / 100 };
      this.hooks.setMix(m);
      (inp.nextElementSibling as HTMLElement).textContent = inp.value;
    });
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.station !== undefined) { this.hooks.setStation(Number(b.dataset.station)); this.render(); }
      if (b.dataset.mute) { this.hooks.setMuted(!this.hooks.muted()); this.render(); }
      if (b.dataset.mm) { const mm = this.hooks.minimap(); if (b.dataset.mm === 'show') this.hooks.setMinimap(!mm.visible, mm.rotate); else this.hooks.setMinimap(mm.visible, b.dataset.mm === 'rotate'); this.render(); }
      if (b.dataset.close) this.onClose();
    });
  }

  toggle(): void { this.open = !this.open; this.el.style.display = this.open ? 'block' : 'none'; if (this.open) this.render(); }

  private render(): void {
    const m = this.hooks.mix(), cur = this.hooks.station();
    const stations = [...this.hooks.stations().map((n, i) => [i, n] as const), [-1, 'Off'] as const];
    const mm = this.hooks.minimap();
    this.el.innerHTML = `<h2>Settings</h2><h3>Sound</h3>
      ${CHANNELS.map(([k, label, hint]) => `<label title="${hint}">${label}<small> · ${hint}</small></label>
        <div class="slider"><input type="range" min="0" max="100" value="${Math.round(m[k] * 100)}" data-ch="${k}"><span>${Math.round(m[k] * 100)}</span></div>`).join('')}
      <label>Radio station</label>
      <div class="row">${stations.map(([i, n]) => `<button data-station="${i}" class="${i === cur ? 'on' : ''}">${n}</button>`).join('')}</div>
      <h3>Display</h3>
      <label>Mini map <small>· Tab toggles it while driving</small></label>
      <div class="row"><button data-mm="show" class="${mm.visible ? 'on' : ''}">${mm.visible ? 'Shown' : 'Hidden'}</button>
        <button data-mm="rotate" class="${mm.rotate ? 'on' : ''}">Turns with car</button><button data-mm="north" class="${mm.rotate ? '' : 'on'}">North up</button></div>
      <div class="row" style="margin-top:12px"><button data-mute="1" class="${this.hooks.muted() ? 'on' : ''}">${this.hooks.muted() ? 'Unmute all' : 'Mute all'}</button><button data-close="1" class="on">Done</button></div>
      <p class="hint">Esc to close · settings are saved with your game</p>`;
  }
}
