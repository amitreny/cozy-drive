/** Nature sounds from synthesis: birds by day, crickets at night, waves near the shore. */
export interface AmbienceMix { day: number; night: number; shore: number; nature: number }

export class Ambience {
  private waves: GainNode; private out: GainNode;
  private birdTimer = 1; private swell = 0;
  /** A few crickets, each with its own pitch, place in the stereo field and chirp rhythm. */
  private crickets = [0, 1, 2].map((i) => ({ hz: 4300 + i * 260 + Math.random() * 120, pan: -0.7 + i * 0.7 + Math.random() * 0.2, gap: 0.7 + Math.random() * 0.5, timer: Math.random() * 2, rest: 0 }));

  constructor(private ctx: AudioContext, dest: AudioNode) {
    this.out = ctx.createGain(); this.out.gain.value = 0.9; this.out.connect(dest);
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { b = b * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = b * 6; } // brown-ish noise
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    this.waves = ctx.createGain(); this.waves.gain.value = 0;
    src.connect(lp).connect(this.waves).connect(this.out); src.start();
  }

  update(dt: number, m: AmbienceMix): void {
    const t = this.ctx.currentTime;
    this.swell += dt;
    const swell = 0.55 + 0.45 * Math.sin(this.swell * 0.55) * Math.sin(this.swell * 0.23 + 1);
    this.waves.gain.setTargetAtTime(m.shore * 0.35 * swell, t, 0.3);
    const chirpLevel = m.night * m.nature;
    for (const c of this.crickets) {
      c.timer -= dt;
      if (c.timer > 0) continue;
      // Crickets sing in spells and pause now and then, so the night never becomes a constant buzz.
      if (c.rest > 0) { c.rest--; c.timer = c.gap; continue; }
      if (Math.random() < 0.06) c.rest = 3 + Math.floor(Math.random() * 6);
      c.timer = c.gap * (0.9 + Math.random() * 0.2);
      if (chirpLevel > 0.05) this.chirp(t + 0.05, c.hz, c.pan, chirpLevel);
    }
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 0.6 + Math.random() * 2.8;
      if (Math.random() < m.day * m.nature) this.bird(t);
    }
  }

  /** One chirp: three or four short, smoothly enveloped pulses of a pure tone (no hard edges, so no hiss). */
  private chirp(t: number, hz: number, panAt: number, level: number): void {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), pan = this.ctx.createStereoPanner();
    o.frequency.value = hz; pan.pan.value = panAt; g.gain.value = 0;
    const pulses = 3 + (Math.random() < 0.5 ? 1 : 0), peak = 0.0045 * level;
    for (let i = 0; i < pulses; i++) {
      const s = t + i * 0.042;
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(peak, s + 0.008); g.gain.linearRampToValueAtTime(peak * 0.7, s + 0.016); g.gain.linearRampToValueAtTime(0, s + 0.026);
    }
    o.connect(g).connect(pan).connect(this.out); o.start(t); o.stop(t + pulses * 0.042 + 0.05);
  }

  private bird(t: number): void {
    const notes = 2 + Math.floor(Math.random() * 4), base = 2200 + Math.random() * 1800;
    const pan = this.ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(this.out);
    for (let i = 0; i < notes; i++) {
      const s = t + i * (0.09 + Math.random() * 0.05), o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.setValueAtTime(base * (1 + Math.random() * 0.2), s);
      o.frequency.exponentialRampToValueAtTime(base * (0.75 + Math.random() * 0.6), s + 0.07);
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.025, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, s + 0.08);
      o.connect(g).connect(pan); o.start(s); o.stop(s + 0.1);
    }
  }
}
