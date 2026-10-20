import { SURFACES, TYRE_NAMES } from '../world/surfaces';
import type { Vehicle } from '../vehicle/vehicle';

const el = (tag: string, cls: string, parent: HTMLElement, html = '') => {
  const e = document.createElement(tag); e.className = cls; e.innerHTML = html; parent.appendChild(e); return e;
};

/** Minimal in-drive HUD (docs/02): speed, gear, surface, tyres, drive mode, clock, prompts, help. */
export class Hud {
  private speed: HTMLElement; private sub: HTMLElement; private rpm: HTMLElement;
  private info: HTMLElement; private prompt: HTMLElement; private help: HTMLElement;
  private acc = 0;
  private acornsEl: HTMLElement; private toasts: HTMLElement;

  constructor(root: HTMLElement) {
    const sp = el('div', 'panel hud-speed', root);
    this.speed = el('div', 'big', sp, '0');
    this.sub = el('div', 'small', sp, 'km/h');
    this.rpm = el('div', '', el('div', 'rpm', sp));
    this.info = el('div', 'panel hud-info', root);
    this.prompt = el('div', 'panel prompt', root);
    this.acornsEl = el('div', 'panel hud-acorns', root, '🌰 0');
    this.toasts = el('div', 'toasts', root);
    this.help = el('div', 'panel help', root, `
      <b>Cozy Drive</b> · prototype<br>
      <kbd>W</kbd><kbd>S</kbd> drive / brake / reverse · <kbd>A</kbd><kbd>D</kbd> steer<br>
      <kbd>Space</kbd> handbrake · <kbd>R</kbd> flip back · <kbd>C</kbd> camera<br>
      <kbd>G</kbd> garage · <kbd>[</kbd><kbd>]</kbd> tyre pressure<br>
      <kbd>F</kbd> low range (4×4) · <kbd>L</kbd> diff lockers<br>
      <kbd>K</kbd> cruise control · <kbd>P</kbd> autopilot (steer/brake cancels)<br>
      <kbd>M</kbd> map · <kbd>Tab</kbd> mini map · <kbd>T</kbd> radio · <kbd>N</kbd> mute · <kbd>Esc</kbd> sound settings<br>
      Drag the mouse to look around · <kbd>H</kbd> hide this<br>
      Gamepad: triggers, left stick, Y flip, B camera, Start garage`);
  }

  setAcorns(text: string): void { this.acornsEl.textContent = `🌰 ${text}`; }

  /** A friendly note that fades away by itself. */
  toast(html: string): void {
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = html;
    this.toasts.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  toggleHelp(): void { this.help.style.display = this.help.style.display === 'none' ? '' : 'none'; }

  showPrompt(text: string | null): void {
    this.prompt.style.display = text ? 'block' : 'none';
    if (text) this.prompt.textContent = text;
  }

  update(dt: number, v: Vehicle, hours: number, cruise: number | null = null, autopilot: string | null = null): void {
    this.acc += dt;
    if (this.acc < 0.08) return;
    this.acc = 0;
    this.speed.textContent = String(Math.round(Math.abs(v.speed) * 3.6));
    this.sub.textContent = `km/h · gear ${v.gearLabel}${cruise !== null ? ` · cruise ${Math.round(cruise * 3.6)}` : ''}${autopilot ? ` · autopilot` : ''}`;
    this.rpm.style.width = `${Math.min(100, (v.rpm / v.spec.maxRpm) * 100)}%`;
    const s = v.spec;
    const mode = s.layout === 'AWD' ? (v.lowRange ? '4L' : s.lowRange ? '4H' : 'AWD') : s.layout;
    const hh = Math.floor(hours), mm = Math.floor((hours - hh) * 60);
    const water = v.waterDepth > 0.05 ? ` · wading <b>${v.waterDepth.toFixed(2)} / ${s.wadingDepth.toFixed(2)} m</b>` : '';
    this.info.innerHTML =
      `<b>${s.name}</b><br>` +
      `Surface: <b>${SURFACES[v.mainSurface].name}</b>${water}<br>` +
      `Tyres: ${TYRE_NAMES[s.tyre]} · ${v.pressure.toFixed(1)} bar<br>` +
      `Drive: ${mode}${s.lockable ? ` · lockers <b>${v.lockersOn ? 'ON' : 'off'}</b>` : ''}<br>` +
      `Time ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
}
