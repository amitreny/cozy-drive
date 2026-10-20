import { SURFACES } from '../world/surfaces';
import type { Vehicle } from '../vehicle/vehicle';
import engineWorkletUrl from './engineWorklet.ts?worker&url';

/** Volume per channel, 0..1. Saved with the player's settings. */
export interface AudioMix { master: number; engine: number; music: number; ambience: number; effects: number }
/** For tools/engine-check.mjs: lets a test page load the same worklet. */
(globalThis as { __engineWorkletUrl?: string }).__engineWorkletUrl = engineWorkletUrl;
export const DEFAULT_MIX: AudioMix = { master: 0.8, engine: 0.8, music: 0.6, ambience: 0.8, effects: 0.8 };

/** Each car's engine character for the synthesizer (see engineWorklet.ts). */
interface EngineVoice { cylinders: number; exhaustHz: number; brightness: number; pattern: number[]; rough: number; level: number }
export const VOICES: Record<string, EngineVoice> = {
  pip: { cylinders: 4, exhaustHz: 150, brightness: 1.0, pattern: [1, 0.95, 1, 0.97], rough: 0.06, level: 0.9 },
  maple: { cylinders: 4, exhaustHz: 125, brightness: 0.8, pattern: [1, 0.97, 1, 0.96], rough: 0.05, level: 0.8 },
  badger: { cylinders: 6, exhaustHz: 105, brightness: 0.8, pattern: [1, 0.95, 1, 0.97, 1, 0.96], rough: 0.05, level: 1.0 },
  bramble: { cylinders: 8, exhaustHz: 80, brightness: 0.75, pattern: [1, 0.7, 1.1, 0.8, 0.95, 0.75, 1.1, 0.85], rough: 0.12, level: 1.1 },
  comet: { cylinders: 8, exhaustHz: 170, brightness: 1.3, pattern: [1, 0.92, 1, 0.95, 1, 0.9, 1, 0.95], rough: 0.06, level: 1.05 },
  biscuit: { cylinders: 4, exhaustHz: 95, brightness: 0.7, pattern: [1, 0.75, 1.05, 0.8], rough: 0.15, level: 0.85 },
  skipper: { cylinders: 2, exhaustHz: 85, brightness: 0.9, pattern: [1, 0.85], rough: 0.18, level: 1.0 },
};

/** Car sounds: synthesized engine (AudioWorklet, oscillator fallback), intake, tyres, skids, wind; plus the mix buses. */
export class CarAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<'engine' | 'music' | 'ambience' | 'effects', GainNode>;
  private engine: AudioWorkletNode | null = null; private voiceId = '';
  private fallback: { a: OscillatorNode; b: OscillatorNode; f: BiquadFilterNode } | null = null;
  private engG!: GainNode; private engLp!: BiquadFilterNode; private intakeF!: BiquadFilterNode; private intakeG!: GainNode;
  private surfF!: BiquadFilterNode; private surfG!: GainNode;
  private skidF!: BiquadFilterNode; private skidG!: GainNode;
  private windG!: GainNode; private surfMod!: GainNode; private surfLp!: BiquadFilterNode; private flutter = 1;
  private load = 0;
  mix: AudioMix = { ...DEFAULT_MIX };
  muted = false;
  /** Called once the AudioContext exists (after the first user gesture), with the music and ambience buses. */
  onReady: ((ctx: AudioContext, music: AudioNode, ambience: AudioNode) => void) | null = null;

  /** Must be called from a user gesture (browser autoplay policy). */
  start(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    const bus = () => { const g = ctx.createGain(); g.connect(this.master); return g; };
    this.buses = { engine: bus(), music: bus(), ambience: bus(), effects: bus() };
    this.applyMix();
    queueMicrotask(() => this.onReady?.(ctx, this.buses.music, this.buses.ambience));

    // Engine chain: source → cabin low-pass → level → engine bus.
    this.engLp = ctx.createBiquadFilter(); this.engLp.type = 'lowpass'; this.engLp.frequency.value = 3000; this.engLp.Q.value = 0.5;
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    this.engLp.connect(this.engG).connect(this.buses.engine);
    ctx.audioWorklet.addModule(engineWorkletUrl).then(() => {
      this.engine = new AudioWorkletNode(ctx, 'engine', { numberOfInputs: 0, outputChannelCount: [1], processorOptions: VOICES.pip });
      this.engine.connect(this.engLp);
    }).catch(() => this.startFallback(ctx));

    // White noise for skids; pink noise (natural, softer highs) for rolling surfaces, intake and wind.
    const white = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), pink = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const wd = white.getChannelData(0), pd = pink.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
    for (let i = 0; i < pd.length; i++) { // Paul Kellet's pink-noise filter
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      pd[i] = (b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362) * 0.11;
    }
    const src = (buf = pink) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(Math.random() * 0.5); return s; };
    // Intake: a breathy rush that rises with throttle and revs.
    this.intakeF = ctx.createBiquadFilter(); this.intakeF.type = 'bandpass'; this.intakeF.frequency.value = 400; this.intakeF.Q.value = 0.7;
    this.intakeG = ctx.createGain(); this.intakeG.gain.value = 0;
    src().connect(this.intakeF).connect(this.intakeG).connect(this.buses.engine);
    this.surfF = ctx.createBiquadFilter(); this.surfF.type = 'bandpass';
    const surfLp = (this.surfLp = ctx.createBiquadFilter()); surfLp.type = 'lowpass'; surfLp.frequency.value = 1800; surfLp.Q.value = 0.5;
    this.surfMod = ctx.createGain(); this.surfMod.gain.value = 1;
    this.surfG = ctx.createGain(); this.surfG.gain.value = 0;
    src().connect(this.surfF).connect(surfLp).connect(this.surfMod).connect(this.surfG).connect(this.buses.effects);
    this.skidF = ctx.createBiquadFilter(); this.skidF.type = 'bandpass'; this.skidF.frequency.value = 1800; this.skidF.Q.value = 6;
    this.skidG = ctx.createGain(); this.skidG.gain.value = 0;
    src(white).connect(this.skidF).connect(this.skidG).connect(this.buses.effects);
    const windF = ctx.createBiquadFilter(); windF.type = 'lowpass'; windF.frequency.value = 500;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    src().connect(windF).connect(this.windG).connect(this.buses.effects);
  }

  /** Older browsers without AudioWorklet: the original two-oscillator engine. */
  private startFallback(ctx: AudioContext): void {
    const a = ctx.createOscillator(), b = ctx.createOscillator(), f = ctx.createBiquadFilter(), bg = ctx.createGain();
    a.type = 'sawtooth'; b.type = 'square'; f.type = 'lowpass'; f.Q.value = 2; bg.gain.value = 0.5;
    a.connect(f); b.connect(bg).connect(f); f.connect(this.engLp);
    a.start(); b.start();
    this.fallback = { a, b, f };
  }

  /** Apply channel volumes (0..1). Squared for a natural-feeling slider. */
  setMix(mix: AudioMix): void { this.mix = { ...mix }; this.applyMix(); }
  private applyMix(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, m = this.mix, v = (x: number) => x * x;
    this.master.gain.setTargetAtTime(this.muted ? 0 : v(m.master) * 0.9, t, 0.05);
    this.buses.engine.gain.setTargetAtTime(v(m.engine) * 1.2, t, 0.05);
    this.buses.music.gain.setTargetAtTime(v(m.music) * 1.6, t, 0.05);
    this.buses.ambience.gain.setTargetAtTime(v(m.ambience) * 1.4, t, 0.05);
    this.buses.effects.gain.setTargetAtTime(v(m.effects) * 1.3, t, 0.05);
  }

  setMuted(m: boolean): void { this.muted = m; this.applyMix(); }

  suspend(): void { void this.ctx?.suspend(); }

  /** A soft two-note bell for discoveries. */
  chime(high = false): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    [high ? 784 : 659, high ? 1175 : 988].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.12); g.gain.linearRampToValueAtTime(0.18, t + i * 0.12 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 1.4);
      o.connect(g).connect(this.buses.effects); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 1.5);
    });
  }

  /** `inside`: camera in the cabin (hood view) muffles the engine a little. */
  update(v: Vehicle, throttle: number, inside = false): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime, s = v.spec, voice = VOICES[s.id] ?? VOICES.pip;
    const revs = v.rpm / s.maxRpm;
    // Load follows throttle, eased, and drops while the wheels are in the air or the clutch slips at idle.
    this.load += ((v.airborne ? throttle * 0.5 : throttle) - this.load) * 0.15;
    if (this.engine) {
      if (this.voiceId !== s.id) { this.voiceId = s.id; this.engine.port.postMessage(voice); }
      this.engine.parameters.get('rpm')!.setValueAtTime(v.rpm, t);
      this.engine.parameters.get('load')!.setTargetAtTime(this.load, t, 0.04);
    } else if (this.fallback) {
      const fire = (v.rpm / 60) * (voice.cylinders / 2);
      this.fallback.a.frequency.setTargetAtTime(fire, t, 0.03);
      this.fallback.b.frequency.setTargetAtTime(fire * 0.5, t, 0.03);
      this.fallback.f.frequency.setTargetAtTime(250 + throttle * 1400 + revs * 900, t, 0.05);
    }
    this.engG.gain.setTargetAtTime(voice.level * (0.5 + 0.15 * this.load + 0.1 * revs), t, 0.05);
    this.engLp.frequency.setTargetAtTime(inside ? 900 : 3000, t, 0.2);
    this.intakeF.frequency.setTargetAtTime(300 + revs * 500, t, 0.1);
    this.intakeG.gain.setTargetAtTime(this.load * revs * 0.035, t, 0.08);

    const speed = Math.abs(v.speed);
    const surf = SURFACES[v.mainSurface];
    const [freq, q, gain] = surf.noise;
    this.surfF.frequency.setTargetAtTime(freq, t, 0.1);
    this.surfF.Q.value = q;
    this.surfLp.frequency.setTargetAtTime(Math.min(1800, freq * 2.4), t, 0.1); // each surface keeps a soft top
    this.surfG.gain.setTargetAtTime(v.airborne ? 0 : Math.min(1, speed / 18) * gain * 0.32, t, 0.08);
    // Organic flutter: rolling sounds breathe a little instead of being a steady hiss.
    this.flutter += (0.75 + Math.random() * 0.5 - this.flutter) * 0.2;
    this.surfMod.gain.setTargetAtTime(this.flutter, t, 0.06);

    let skid = 0;
    for (const w of v.wheels) if (w.contact) skid = Math.max(skid, w.skid);
    const hard = surf.particle === null || surf.name === 'Ice';
    this.skidG.gain.setTargetAtTime(hard ? Math.min(1, Math.max(0, skid - 2) / 6) * 0.12 : 0, t, 0.05);
    this.windG.gain.setTargetAtTime(Math.min(1, (speed / 45) ** 2) * (inside ? 0.12 : 0.3), t, 0.2);
  }
}
