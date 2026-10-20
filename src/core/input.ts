import { clamp } from './math';

/** Continuous driving controls, already smoothed so digital keys feel analog. */
export interface DriveControls { throttle: number; brake: number; steer: number; handbrake: number }

export type ButtonAction = 'flip' | 'garage' | 'camera' | 'help' | 'mute' | 'pressureDown' | 'pressureUp' | 'driveMode' | 'diffLock' | 'cruise' | 'map' | 'autopilot' | 'radio' | 'settings' | 'minimap' | 'interact' | 'flaps';
/** Flight axes, -1..1: pitch + = nose up (S / stick back), roll + = right, yaw + = right (X), lift + = more power (R). */
export interface FlightControls { pitch: number; roll: number; yaw: number; lift: number; brake: number }

const KEYMAP: Record<string, ButtonAction> = {
  KeyR: 'flip', KeyG: 'garage', KeyC: 'camera', KeyH: 'help', KeyN: 'mute', KeyM: 'map', KeyP: 'autopilot', KeyT: 'radio', Escape: 'settings', Tab: 'minimap', KeyE: 'interact', Enter: 'interact', KeyV: 'flaps',
  BracketLeft: 'pressureDown', BracketRight: 'pressureUp', KeyF: 'driveMode', KeyL: 'diffLock', KeyK: 'cruise',
};
// Standard gamepad mapping: 3=Y, 2=X, 1=B, 9=start, 8=back, 4/5 bumpers, 0=A.
const PADMAP: Record<number, ButtonAction> = { 3: 'flip', 9: 'garage', 1: 'camera', 8: 'help', 4: 'pressureDown', 5: 'pressureUp', 2: 'driveMode', 12: 'cruise', 13: 'map', 14: 'autopilot', 15: 'radio', 10: 'interact', 11: 'flaps' };

export class Input {
  readonly controls: DriveControls = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
  readonly flight: FlightControls = { pitch: 0, roll: 0, yaw: 0, lift: 0, brake: 0 };
  lastDevice: 'keyboard' | 'gamepad' = 'keyboard';
  private keys = new Set<string>();
  private pressed = new Set<ButtonAction>();
  private padPrev: boolean[] = [];
  /** Called once on the first user gesture (needed to unlock audio). */
  onFirstGesture: (() => void) | null = null;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      this.gesture();
      this.lastDevice = 'keyboard';
      if (!e.repeat && KEYMAP[e.code]) this.pressed.add(KEYMAP[e.code]);
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
    target.addEventListener('pointerdown', () => this.gesture());
  }

  private gesture(): void {
    if (this.onFirstGesture) { const f = this.onFirstGesture; this.onFirstGesture = null; f(); }
  }

  /** True once per press. Call from the variable-rate update. */
  consume(a: ButtonAction): boolean { const had = this.pressed.has(a); this.pressed.delete(a); return had; }

  isDown(code: string): boolean { return this.keys.has(code); }

  /** Forget queued presses (when switching between car and aircraft, so a key meant for one doesn't act on the other). */
  clearPresses(): void { this.pressed.clear(); }

  /** Poll devices and smooth the analog controls. dt in seconds. */
  poll(dt: number): void {
    const k = (...codes: string[]) => (codes.some((c) => this.keys.has(c)) ? 1 : 0);
    let throttle = k('KeyW', 'ArrowUp');
    let brake = k('KeyS', 'ArrowDown');
    let steerTarget = k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft');
    let handbrake = k('Space');
    let analogSteer = false;

    let fPitch = k('KeyS', 'ArrowDown') - k('KeyW', 'ArrowUp'), fRoll = k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft');
    let fYaw = k('KeyX') - k('KeyZ'), fLift = k('KeyR', 'PageUp') - k('KeyF', 'PageDown'), fAnalog = false;
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const deadzone = (v: number) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
      const sx = deadzone(pad.axes[0] ?? 0);
      const rt = pad.buttons[7]?.value ?? 0;
      const lt = pad.buttons[6]?.value ?? 0;
      if (Math.abs(sx) > 0 || rt > 0.05 || lt > 0.05) this.lastDevice = 'gamepad';
      if (Math.abs(sx) > 0) { steerTarget = Math.sign(sx) * sx * sx; analogSteer = true; }
      throttle = Math.max(throttle, rt);
      brake = Math.max(brake, lt);
      // Flight: left stick flies (back = nose up), right stick x is the rudder, triggers raise/lower the power.
      const sy = deadzone(pad.axes[1] ?? 0), rx = deadzone(pad.axes[2] ?? 0);
      if (Math.abs(sx) > 0 || Math.abs(sy) > 0) { fRoll = sx; fPitch = sy; fAnalog = true; }
      if (Math.abs(rx) > 0) fYaw = rx;
      if (rt > 0.05 || lt > 0.05) fLift = rt - lt;
      if (pad.buttons[0]?.pressed) handbrake = 1;
      pad.buttons.forEach((b, i) => {
        const was = this.padPrev[i] ?? false;
        if (b.pressed && !was && PADMAP[i]) { this.pressed.add(PADMAP[i]); this.gesture(); }
        this.padPrev[i] = b.pressed;
      });
    }

    const c = this.controls;
    if (analogSteer) c.steer = steerTarget;
    else {
      // Keys: steer in quickly, return to centre a bit faster, so taps feel gentle.
      const rate = steerTarget === 0 || Math.sign(steerTarget) !== Math.sign(c.steer) ? 6 : 3.2;
      const delta = steerTarget - c.steer;
      c.steer += clamp(delta, -rate * dt, rate * dt);
    }
    c.throttle += clamp(throttle - c.throttle, -8 * dt, 5 * dt);
    c.brake += clamp(brake - c.brake, -10 * dt, 8 * dt);
    c.handbrake = handbrake;
    // Keys ease the flight controls in and out (a real stick doesn't snap); analog sticks pass straight through.
    const f = this.flight, ease = (cur: number, want: number, r: number) => cur + clamp(want - cur, -r * dt, r * dt);
    f.pitch = fAnalog ? fPitch : ease(f.pitch, fPitch, 3.5);
    f.roll = fAnalog ? fRoll : ease(f.roll, fRoll, 4.5);
    f.yaw = ease(f.yaw, fYaw, 4);
    f.lift = fLift;
    f.brake = handbrake;
  }
}
