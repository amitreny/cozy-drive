import { SURFACES, TYRE_NAMES } from '../world/surfaces';
import type { Vehicle } from '../vehicle/vehicle';
import type { Aircraft } from '../flight/aircraft';
import { approachSpeed, GLIDE, interceptHeading, type Approach } from '../flight/approach';

const el = (tag: string, cls: string, parent: HTMLElement, html = '') => {
  const e = document.createElement(tag); e.className = cls; e.innerHTML = html; parent.appendChild(e); return e;
};

/** Minimal in-drive HUD (docs/02): speed, gear, surface, tyres, drive mode, clock, prompts, help. */
export class Hud {
  private speed: HTMLElement; private sub: HTMLElement; private rpm: HTMLElement;
  private info: HTMLElement; private prompt: HTMLElement; private help: HTMLElement;
  private acc = 0;
  private acornsEl: HTMLElement; private toasts: HTMLElement;
  private approach: HTMLElement; private apText: HTMLElement; private apCues: HTMLElement; private locDot: HTMLElement; private gsDot: HTMLElement;

  constructor(root: HTMLElement) {
    const sp = el('div', 'panel hud-speed', root);
    this.speed = el('div', 'big', sp, '0');
    this.sub = el('div', 'small', sp, 'km/h');
    this.rpm = el('div', '', el('div', 'rpm', sp));
    this.info = el('div', 'panel hud-info', root);
    this.prompt = el('div', 'panel prompt', root);
    this.acornsEl = el('div', 'panel hud-acorns', root, '🌰 0');
    this.toasts = el('div', 'toasts', root);
    this.approach = el('div', 'panel hud-approach', root);
    this.apText = el('div', 'ap-text', this.approach);
    const ils = el('div', 'ap-ils', this.approach);
    const loc = el('div', 'ap-loc', ils, '<i></i><i></i><i></i><i></i><i></i>'), gs = el('div', 'ap-gs', ils, '<i></i><i></i><i></i><i></i><i></i>');
    this.locDot = el('b', 'ap-dot', loc); this.gsDot = el('b', 'ap-dot', gs);
    el('span', 'ap-plane', ils, '✈');
    this.apCues = el('div', 'ap-cues', this.approach);
    this.approach.style.display = 'none';
    this.help = el('div', 'panel help', root, `
      <b>Cozy Drive</b> · prototype<br>
      <kbd>W</kbd><kbd>S</kbd> drive / brake / reverse · <kbd>A</kbd><kbd>D</kbd> steer<br>
      <kbd>Space</kbd> handbrake · <kbd>R</kbd> flip back · <kbd>C</kbd> camera<br>
      <kbd>G</kbd> garage · <kbd>[</kbd><kbd>]</kbd> tyre pressure<br>
      <kbd>F</kbd> low range (4×4) · <kbd>L</kbd> diff lockers<br>
      <kbd>K</kbd> cruise control · <kbd>P</kbd> autopilot (steer/brake cancels)<br>
      <kbd>M</kbd> map · <kbd>Tab</kbd> mini map · <kbd>T</kbd> radio · <kbd>N</kbd> mute · <kbd>Esc</kbd> sound settings<br>
      <kbd>E</kbd> at an airport, helipad or dock: hangar · deliveries at shops<br>
      <b>Flying:</b> <kbd>W</kbd><kbd>S</kbd> pitch · <kbd>A</kbd><kbd>D</kbd> roll (steer on the ground) · <kbd>Z</kbd><kbd>X</kbd> rudder<br>
      <kbd>R</kbd><kbd>F</kbd> throttle / collective / burner &amp; vent · <kbd>V</kbd> flaps · <kbd>Space</kbd> brakes · <kbd>E</kbd> park<br>
      <kbd>L</kbd> landing guide (approach instrument, gates, map centrelines)<br>
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

  /**
   * The approach instrument (an ILS-style display), shown while you're lined up for a runway: a needle for the
   * centreline and one for the glide path, each a diamond that shows where the path is (fly towards it), and a few
   * plain cues: the heading to steer, too high or low, the speed to fly, and when to set flap.
   */
  updateApproach(ap: Approach | null, a: Aircraft | null): void {
    this.approach.style.display = ap ? 'block' : 'none';
    if (!ap || !a || this.acc !== 0) return; // refresh with the rest of the instruments
    const deg = 180 / Math.PI, compass = (r: number) => String(Math.round(((360 - r * deg) % 360 + 360) % 360)).padStart(3, '0');
    const s = a.spec, vref = approachSpeed(s) * 3.6, kmh = a.airspeed * 3.6, flapsMax = s.engine?.maxFlaps ?? 0;
    // Full scale: 2.5° either side of the centreline, 0.7° above or below the glide path, as on a real ILS.
    const locX = Math.max(-1, Math.min(1, ap.loc / (2.5 / deg))), gsY = Math.max(-1, Math.min(1, ap.gs / (0.7 / deg)));
    this.locDot.style.left = `${50 + locX * 46}%`; this.gsDot.style.top = `${50 + gsY * 44}%`;
    const height = a.altitude - ap.elevation, cues: string[] = [];
    if (ap.dist < 300 && height < 18) cues.push('Over the runway: throttle to idle (F), ease back (S) to flare');
    else {
      const off = ap.loc * deg;
      cues.push(Math.abs(off) < 0.5 ? '✓ Lined up with the centreline'
        : `${off > 0 ? '›' : '‹'} Steer ${off > 0 ? 'right' : 'left'}${Math.abs(off) < 1.5 ? ' a touch' : ''}: heading <b>${compass(interceptHeading(ap))}°</b>`);
      const sink = (a.groundSpeed * Math.tan(GLIDE)).toFixed(1), band = Math.max(12, ap.pathHeight * 0.12);
      cues.push(ap.above > band ? `↓ High by ${Math.round(ap.above)} m: descend faster than ${sink} m/s`
        : ap.above < -band ? `↑ Low by ${Math.round(-ap.above)} m: level off, add power`
        : `✓ On the glide path: descend at about ${sink} m/s`);
    }
    cues.push(kmh > vref + 25 ? `Slow down to <b>${Math.round(vref)} km/h</b>` : kmh < vref - 12 ? `Too slow: power up to <b>${Math.round(vref)} km/h</b>` : `✓ Speed good · ${Math.round(vref)} km/h`);
    if (flapsMax) {
      // A notch by 7 km, the second by 3.5 km, full by 1.5 km: each press of V is one notch.
      const notch = ap.dist < 1500 ? 1 : ap.dist < 3500 ? 2 / 3 : ap.dist < 7000 ? 1 / 3 : 0;
      const next = Math.min(1, Math.round(a.flapsTarget * 3 + 1) / 3);
      if (a.flapsTarget < notch - 0.01) cues.push(`Flaps: press <kbd>V</kbd> for ${Math.round(next * flapsMax * deg)}°`);
    }
    this.apText.innerHTML = `<b>Runway ${ap.runway}</b> · ${ap.place.name}<br>${ap.dist > 0 ? `${(ap.dist / 1000).toFixed(1)} km to go` : 'over the runway'} · ${Math.round(Math.max(0, height))} m up`;
    this.apCues.innerHTML = cues.map((c) => `<div>${c}</div>`).join('');
  }

  showPrompt(text: string | null): void {
    this.prompt.style.display = text ? 'block' : 'none';
    if (text) this.prompt.textContent = text;
  }

  private clock(hours: number): string { const hh = Math.floor(hours), mm = Math.floor((hours - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }

  /** Flight instruments: airspeed, altitude, vertical speed, power, heading, and the balloon's envelope and wind. */
  updateFlight(dt: number, a: Aircraft, hours: number, wind: { x: number; z: number }): void {
    this.acc += dt;
    if (this.acc < 0.08) return;
    this.acc = 0;
    const s = a.spec, kmh = Math.round(a.airspeed * 3.6), hdg = Math.round(((360 - (a.heading * 180) / Math.PI) % 360 + 360) % 360);
    const vs = a.vs >= 0 ? `↑ ${a.vs.toFixed(1)}` : `↓ ${(-a.vs).toFixed(1)}`;
    this.speed.textContent = String(s.kind === 'balloon' ? Math.round(a.groundSpeed * 3.6) : kmh);
    this.sub.textContent = `${s.kind === 'balloon' ? 'km/h over ground' : 'km/h airspeed'} · ${Math.round(a.agl)} m above ground · ${vs} m/s`;
    const lever = s.kind === 'plane' ? a.throttle : s.kind === 'heli' ? a.collective : (a.envelopeTemp - 288) / 110;
    this.rpm.style.width = `${Math.min(100, Math.max(0, lever * 100))}%`;
    let line2: string;
    if (s.kind === 'plane') line2 = `Throttle <b>${Math.round(a.throttle * 100)}%</b>${s.engine?.turbine ? ` · torque <b>${Math.round(a.power * 100)}%</b>` : ''}${s.engine?.maxFlaps ? ` · flaps <b>${Math.round(a.flaps * (s.engine.maxFlaps * 180 / Math.PI))}°</b>` : ''}`;
    else if (s.kind === 'heli') line2 = `Collective <b>${Math.round(a.collective * 100)}%</b>`;
    else line2 = `Envelope <b>${Math.round(a.envelopeTemp - 273)} °C</b>${a.burner ? ' · 🔥 burner' : a.vent ? ' · venting' : ''}`;
    const wdir = Math.round(((360 - (Math.atan2(-wind.x, -wind.z) * 180) / Math.PI) % 360 + 360) % 360), wspd = Math.round(Math.hypot(wind.x, wind.z) * 3.6);
    this.info.innerHTML = `<b>${s.name}</b> · ${s.realType.split(' (')[0]}<br>${line2}<br>Heading <b>${String(hdg).padStart(3, '0')}°</b> · altitude ${Math.round(a.altitude)} m<br>Wind from ${String(wdir).padStart(3, '0')}° at ${wspd} km/h<br>Time ${this.clock(hours)}`;
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
