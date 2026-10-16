import { SURFACES } from '../world/surfaces';
import type { Vehicle } from '../vehicle/vehicle';

/** Asset-free placeholder audio: synthesized engine, surface rolling noise, skids and wind. */
export class CarAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private oscA!: OscillatorNode; private oscB!: OscillatorNode; private engF!: BiquadFilterNode; private engG!: GainNode;
  private surfF!: BiquadFilterNode; private surfG!: GainNode;
  private skidF!: BiquadFilterNode; private skidG!: GainNode;
  private windG!: GainNode;
  muted = false;

  /** Must be called from a user gesture (browser autoplay policy). */
  start(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    this.oscA = ctx.createOscillator(); this.oscA.type = 'sawtooth';
    this.oscB = ctx.createOscillator(); this.oscB.type = 'square';
    this.engF = ctx.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.Q.value = 2;
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    const bG = ctx.createGain(); bG.gain.value = 0.5;
    this.oscA.connect(this.engF); this.oscB.connect(bG).connect(this.engF);
    this.engF.connect(this.engG).connect(this.master);
    this.oscA.start(); this.oscB.start();

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = () => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(); return s; };
    this.surfF = ctx.createBiquadFilter(); this.surfF.type = 'bandpass';
    this.surfG = ctx.createGain(); this.surfG.gain.value = 0;
    src().connect(this.surfF).connect(this.surfG).connect(this.master);
    this.skidF = ctx.createBiquadFilter(); this.skidF.type = 'bandpass'; this.skidF.frequency.value = 1800; this.skidF.Q.value = 6;
    this.skidG = ctx.createGain(); this.skidG.gain.value = 0;
    src().connect(this.skidF).connect(this.skidG).connect(this.master);
    const windF = ctx.createBiquadFilter(); windF.type = 'lowpass'; windF.frequency.value = 500;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    src().connect(windF).connect(this.windG).connect(this.master);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  suspend(): void { void this.ctx?.suspend(); }

  update(v: Vehicle, throttle: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime, s = v.spec;
    const fire = (v.rpm / 60) * (s.sound.cylinders / 2) * s.sound.tone;
    this.oscA.frequency.setTargetAtTime(fire, t, 0.03);
    this.oscB.frequency.setTargetAtTime(fire * 0.5, t, 0.03);
    this.engF.frequency.setTargetAtTime(250 + throttle * 1400 + (v.rpm / s.maxRpm) * 900, t, 0.05);
    this.engG.gain.setTargetAtTime(0.05 + throttle * 0.07, t, 0.05);

    const speed = Math.abs(v.speed);
    const surf = SURFACES[v.mainSurface];
    const [freq, q, gain] = surf.noise;
    this.surfF.frequency.setTargetAtTime(freq, t, 0.1);
    this.surfF.Q.value = q;
    this.surfG.gain.setTargetAtTime(v.airborne ? 0 : Math.min(1, speed / 18) * gain * 0.35, t, 0.08);

    let skid = 0;
    for (const w of v.wheels) if (w.contact) skid = Math.max(skid, w.skid);
    const hard = surf.particle === null || surf.name === 'Ice';
    this.skidG.gain.setTargetAtTime(hard ? Math.min(1, Math.max(0, skid - 2) / 6) * 0.12 : 0, t, 0.05);
    this.windG.gain.setTargetAtTime(Math.min(1, (speed / 45) ** 2) * 0.3, t, 0.2);
  }
}
