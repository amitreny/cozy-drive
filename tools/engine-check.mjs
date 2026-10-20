// Renders each car's synthesized engine offline and checks level, clipping and pitch; saves rev-sweep WAVs.
// Usage: npm run build && node tools/engine-check.mjs <outDir>
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const out = process.argv[2] ?? '.';
const server = await preview({ preview: { port: 4190, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:4190/');
await page.waitForFunction(() => window.__game && window.__engineWorkletUrl, null, { timeout: 90000 });
const result = await page.evaluate(async () => {
  const voices = window.__game.voices, rate = 48000, rows = [], wavs = {};
  const render = async (id, seconds, setup) => {
    const ctx = new OfflineAudioContext(1, rate * seconds, rate);
    await ctx.audioWorklet.addModule(window.__engineWorkletUrl);
    const node = new AudioWorkletNode(ctx, 'engine', { numberOfInputs: 0, outputChannelCount: [1], processorOptions: voices[id] });
    setup(node.parameters.get('rpm'), node.parameters.get('load'));
    node.connect(ctx.destination);
    return (await ctx.startRendering()).getChannelData(0);
  };
  const goertzel = (x, f) => { const w = (2 * Math.PI * f) / rate, c = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = 0; i < x.length; i++) { const s = x[i] + c * s1 - s2; s2 = s1; s1 = s; } return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2); };
  for (const id of Object.keys(voices)) for (const [rpm, load] of [[900, 0], [3000, 0.5], [5000, 1]]) {
    const x = (await render(id, 1.2, (r, l) => { r.value = rpm; l.value = load; })).subarray(rate * 0.2);
    let peak = 0, sum = 0; for (const v of x) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
    const fire = (rpm / 60) * (voices[id].cylinders / 2);
    let bestF = 0, bestM = 0;
    for (let f = 15; f <= 700; f += 1) { const m = goertzel(x.subarray(0, rate * 0.5), f); if (m > bestM) { bestM = m; bestF = f; } }
    let num = 0, den = 0; for (let f = 50; f <= 6000; f += 50) { const m = goertzel(x.subarray(0, rate * 0.25), f); num += f * m; den += m; }
    rows.push({ id, rpm, load, rms: Math.sqrt(sum / x.length), peak, fire, strongest: bestF, centroid: num / den });
  }
  for (const id of ['pip', 'badger', 'bramble', 'comet', 'biscuit', 'skipper']) {
    const x = await render(id, 5, (r, l) => { r.setValueAtTime(900, 0); r.setValueAtTime(900, 0.8); r.linearRampToValueAtTime(5200, 3.6); r.linearRampToValueAtTime(1500, 4.6);
      l.setValueAtTime(0, 0); l.setValueAtTime(1, 0.8); l.setValueAtTime(1, 3.6); l.setValueAtTime(0.1, 3.7); });
    const pcm = new Int16Array(x.length); for (let i = 0; i < x.length; i++) pcm[i] = Math.max(-1, Math.min(1, x[i] * 1.4)) * 32767;
    wavs[id] = Array.from(new Uint8Array(pcm.buffer));
  }
  return { rows, wavs };
});
for (const r of result.rows) console.log(`${r.id.padEnd(8)} ${String(r.rpm).padStart(4)} rpm load ${r.load}: rms ${r.rms.toFixed(3)} peak ${r.peak.toFixed(2)} firing ${r.fire.toFixed(0)} Hz, strongest ${r.strongest} Hz, brightness centroid ${r.centroid.toFixed(0)} Hz`);
for (const [id, bytes] of Object.entries(result.wavs)) {
  const data = Buffer.from(bytes), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(48000, 24); h.writeUInt32LE(96000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(`${out}/engine-${id}.wav`, Buffer.concat([h, data]));
}
const bad = result.rows.filter((r) => r.peak > 0.98 || r.rms < 0.01);
console.log(bad.length ? `ENGINE CHECK FAILED: ${bad.map((r) => `${r.id}@${r.rpm}`).join(', ')}` : 'ENGINE CHECK OK');
await browser.close(); await server.close();
if (bad.length) process.exitCode = 1;
