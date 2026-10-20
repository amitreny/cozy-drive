/** Generative, endless, royalty-free radio. Slow chords, sparse melody, soft reverb. No audio files. */
interface Station { name: string; chords: number[][]; scale: number[]; bpm: number; beat: boolean; tone: OscillatorType; bright: number }
// Chords as semitone offsets from the root (C3 = 48). Scales for the melody (MIDI notes).
const STATIONS: Station[] = [
  { name: 'Morning Meadow', chords: [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]], scale: [72, 74, 76, 79, 81, 84, 86], bpm: 76, beat: false, tone: 'triangle', bright: 1800 },
  { name: 'Evening Drive', chords: [[2, 5, 9, 12], [7, 11, 14, 17], [0, 4, 7, 11], [9, 12, 16, 19]], scale: [69, 72, 74, 76, 79, 81], bpm: 82, beat: true, tone: 'sine', bright: 1200 },
  { name: 'Night Sky', chords: [[9, 12, 16, 19], [5, 9, 12, 16], [0, 4, 7, 12], [7, 10, 14, 17]], scale: [69, 72, 76, 79, 81, 84], bpm: 60, beat: false, tone: 'sine', bright: 900 },
];
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export class Radio {
  station = 0;
  on = true;
  private out: GainNode; private wet: ConvolverNode; private timer: number | undefined;
  private nextBeat = 0; private beat = 0; private chord = 0; private lastNote = 3;

  constructor(private ctx: AudioContext, dest: AudioNode) {
    this.out = ctx.createGain(); this.out.gain.value = 0.32;
    this.wet = ctx.createConvolver(); this.wet.buffer = this.impulse(3.2);
    const wetGain = ctx.createGain(); wetGain.gain.value = 0.55;
    this.out.connect(dest); this.wet.connect(wetGain).connect(dest);
  }

  get name(): string { return this.on ? STATIONS[this.station].name : 'Radio off'; }
  get stations(): string[] { return STATIONS.map((s) => s.name); }
  /** Current station index, or -1 when off. */
  get current(): number { return this.on ? this.station : -1; }
  setStation(i: number): void {
    this.on = i >= 0;
    if (this.on) this.station = Math.min(i, STATIONS.length - 1);
    this.out.gain.setTargetAtTime(this.on ? 0.32 : 0, this.ctx.currentTime, 0.4);
  }

  start(): void {
    this.nextBeat = this.ctx.currentTime + 0.2;
    this.timer = window.setInterval(() => this.schedule(), 100);
  }

  /** Next station, then off, then the first station again. */
  tune(): string {
    if (!this.on) { this.on = true; this.station = 0; }
    else if (this.station < STATIONS.length - 1) this.station++;
    else this.on = false;
    this.out.gain.setTargetAtTime(this.on ? 0.32 : 0, this.ctx.currentTime, 0.4);
    return this.name;
  }

  setVolume(v: number): void { this.out.gain.setTargetAtTime(this.on ? 0.32 * v : 0, this.ctx.currentTime, 0.3); }
  stop(): void { window.clearInterval(this.timer); }

  private impulse(seconds: number): AudioBuffer {
    const len = Math.floor(this.ctx.sampleRate * seconds), buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    return buf;
  }

  /** Look-ahead scheduler: queue the next half second of music. */
  private schedule(): void {
    if (!this.on) { this.nextBeat = this.ctx.currentTime + 0.2; return; }
    const st = STATIONS[this.station], spb = 60 / st.bpm;
    while (this.nextBeat < this.ctx.currentTime + 0.5) {
      const t = this.nextBeat;
      if (this.beat % 8 === 0) { this.pad(st, st.chords[this.chord % st.chords.length], t, spb * 8.4); this.chord++; }
      if (Math.random() < (this.beat % 2 === 0 ? 0.55 : 0.25)) this.pluck(st, t);
      if (st.beat) { if (this.beat % 4 === 0) this.kick(t); if (this.beat % 4 === 2) this.brush(t); if (this.beat % 2 === 1) this.hat(t); }
      this.beat++;
      this.nextBeat += spb;
    }
  }

  private pad(st: Station, chord: number[], t: number, dur: number): void {
    for (const n of chord) for (const det of [-4, 4]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = hz(48 + n); o.detune.value = det;
      f.type = 'lowpass'; f.frequency.value = st.bright * 0.5; f.Q.value = 0.3;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.022, t + 2.2); g.gain.setValueAtTime(0.022, t + dur - 2); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(f).connect(g); g.connect(this.out); g.connect(this.wet);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }

  private pluck(st: Station, t: number): void {
    // Gentle random walk over the scale.
    this.lastNote = Math.max(0, Math.min(st.scale.length - 1, this.lastNote + Math.round((Math.random() - 0.5) * 3)));
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o.type = st.tone; o.frequency.value = hz(st.scale[this.lastNote]);
    f.type = 'lowpass'; f.frequency.value = st.bright;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.8);
    o.connect(f).connect(g); g.connect(this.out); g.connect(this.wet);
    o.start(t); o.stop(t + 1.9);
  }

  private kick(t: number): void {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.4);
  }

  private noise(t: number, dur: number, freq: number, gain: number): void {
    const len = Math.floor(this.ctx.sampleRate * dur), buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.out); s.start(t);
  }
  private brush(t: number): void { this.noise(t, 0.22, 2200, 0.05); }
  private hat(t: number): void { this.noise(t, 0.05, 7000, 0.018); }
}
