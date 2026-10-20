/**
 * Engine sound synthesis on the audio thread (AudioWorklet).
 *
 * Each cylinder fires once every 720° of crank rotation. A firing is a *rounded pressure pulse*
 * (raised cosine lasting part of the firing interval), not a click: that keeps energy in the firing
 * fundamental and its low harmonics, which is what makes a real engine sound deep. The pulse train
 * is coloured by a broad exhaust resonance, given a low combustion rumble, and muffled by a
 * throttle-dependent low-pass (the exhaust and body absorb the highs). Uneven per-cylinder strength
 * gives V8 burble and flat-engine lumpiness.
 */
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor { readonly port: MessagePort; constructor(options?: unknown); }

interface EngineConfig { cylinders: number; exhaustHz: number; brightness: number; pattern: number[]; rough: number }

/** Two-pole band-pass resonator, normalised to roughly unity gain at its peak. */
class Resonator {
  private y1 = 0; private y2 = 0; private a1 = 0; private a2 = 0; private g = 0;
  set(freq: number, q: number): void {
    const r = Math.exp((-Math.PI * (freq / q)) / sampleRate), w = (2 * Math.PI * freq) / sampleRate;
    this.a1 = 2 * r * Math.cos(w); this.a2 = -r * r;
    // |1 - a1 e^{-jw} - a2 e^{-2jw}| at the peak = (1 - r) * sqrt(1 - 2r cos 2w + r²): divide it out for unity gain.
    this.g = (1 - r) * Math.sqrt(1 - 2 * r * Math.cos(2 * w) + r * r);
  }
  tick(x: number): number { const y = this.a1 * this.y1 + this.a2 * this.y2 + this.g * x; this.y2 = this.y1; this.y1 = y; return y; }
}

class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 850, minValue: 0, maxValue: 12000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  private cfg: EngineConfig = { cylinders: 4, exhaustHz: 130, brightness: 1, pattern: [1, 1, 1, 1], rough: 0.08 };
  private crank = 0; private seed = 12345; private smoothRpm = 850;
  private pulses: { t: number; len: number; amp: number }[] = [];
  private note = new Resonator(); private second = new Resonator();
  private rumble = 0; private noiseLp = 0; private noiseEnv = 0;
  private lp1 = 0; private lp2 = 0; private dcX = 0; private dcY = 0; private env = 0.05;

  constructor(options?: { processorOptions?: Partial<EngineConfig> }) {
    super(options);
    this.configure(options?.processorOptions ?? {});
    this.port.onmessage = (e: MessageEvent<Partial<EngineConfig>>) => this.configure(e.data);
  }

  private configure(c: Partial<EngineConfig>): void {
    this.cfg = { ...this.cfg, ...c };
    this.note.set(this.cfg.exhaustHz, 1.6);         // broad: colours the tone without ringing
    this.second.set(this.cfg.exhaustHz * 2.05, 2.2);
  }

  private rand(): number { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }

  process(_in: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean {
    const out = outputs[0][0];
    if (!out) return true;
    const targetRpm = params.rpm[0], load = params.load[0], cfg = this.cfg, cyl = cfg.cylinders;
    const spacing = 720 / cyl, bright = cfg.brightness;
    // Muffling: closed throttle is soft and round, open throttle opens up a little (still well below "tinny").
    const cutoff = (220 + (300 + 420 * load) * bright) * (0.85 + 0.3 * Math.min(1, this.smoothRpm / 6000));
    const k = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
    for (let i = 0; i < out.length; i++) {
      this.smoothRpm += (targetRpm - this.smoothRpm) * 0.0008;
      const prev = this.crank;
      this.crank += ((this.smoothRpm / 60) * 360) / sampleRate;
      if (Math.floor(prev / spacing) !== Math.floor(this.crank / spacing)) {
        const c = Math.floor(this.crank / spacing) % cyl;
        const amp = (0.45 + 0.55 * load) * (cfg.pattern[c % cfg.pattern.length] ?? 1) * (1 + (this.rand() - 0.5) * cfg.rough * 2);
        // Pulse lasts ~40 % of the firing interval (clamped), shaped as a raised cosine.
        const interval = (60 / Math.max(300, this.smoothRpm)) * (2 / cyl) * sampleRate;
        this.pulses.push({ t: 0, len: Math.max(48, Math.min(900, interval * 0.4)), amp });
        this.noiseEnv += amp * 0.5;
      }
      if (this.crank >= 720) this.crank -= 720;
      let p = 0;
      for (let j = this.pulses.length - 1; j >= 0; j--) {
        const q = this.pulses[j];
        p += q.amp * 0.5 * (1 - Math.cos((2 * Math.PI * q.t) / q.len));
        if (++q.t >= q.len) this.pulses.splice(j, 1);
      }
      // Low combustion rumble (not hiss): heavily low-passed noise, gated by the firings.
      this.noiseEnv *= 0.9985;
      this.noiseLp += ((this.rand() * 2 - 1) - this.noiseLp) * 0.05;
      this.rumble += (p - this.rumble) * 0.01;
      const y = p * 0.9 + this.note.tick(p) * 1.2 + this.second.tick(p) * 0.25 * bright + this.rumble * 0.6 + this.noiseLp * this.noiseEnv * (0.25 + 0.3 * load);
      // Two-pole low-pass (the muffler), then DC removal.
      this.lp1 += (y - this.lp1) * k; this.lp2 += (this.lp1 - this.lp2) * k;
      const dc = this.lp2 - this.dcX + 0.996 * this.dcY; this.dcX = this.lp2; this.dcY = dc;
      // Gentle level control keeps every engine in a comfortable range; throttle still adds presence.
      const a = Math.abs(dc);
      this.env += (a - this.env) * (a > this.env ? 0.003 : 0.00025);
      const agc = Math.min(8, Math.max(0.3, Math.pow((0.1 + 0.08 * load) / (this.env + 1e-4), 0.75)));
      out[i] = Math.tanh(dc * agc * (1 + 0.35 * load)) * 0.6;
    }
    for (let ch = 1; ch < outputs[0].length; ch++) outputs[0][ch].set(out);
    return true;
  }
}

registerProcessor('engine', EngineProcessor);
