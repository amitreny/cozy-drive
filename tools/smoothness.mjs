// Measures driving smoothness: per-frame jitter of the rendered car, camera and body pitch while accelerating.
// Usage: npm run build && node tools/smoothness.mjs   (THROTTLE=4 emulates a 4x slower CPU)
import { chromium } from 'playwright-core';
import { preview } from 'vite';
const server = await preview({ preview: { port: 4185, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
if (process.env.THROTTLE) { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) }); }
await page.goto('http://localhost:4185/');
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.evaluate(() => { const g = window.__game, r = g.world.roads[1], i = 300; const x = r.xs[i], z = r.zs[i];
  g.terrainPhysics.update(x, z, 260, 999); g.vehicle.reset({ x, y: r.hs[i] + 1.5, z }, Math.atan2(r.xs[i + 1] - x, r.zs[i + 1] - z)); g.chase.snap(); });
await page.waitForTimeout(1500);
await page.keyboard.down('KeyW');
await page.waitForTimeout(1500);
const rec = await page.evaluate(() => new Promise((res) => {
  const g = window.__game, out = []; let last = performance.now(); const t0 = last;
  const f = (now) => { const p = g.visual.position, c = g.chase.cam.position, b = g.vehicle.body.translation();
    out.push({ dt: now - last, vx: p.x, vz: p.z, cx: c.x, cz: c.z, bx: b.x, bz: b.z, pitch: g.visual.model.body.rotation.x }); last = now;
    if (now - t0 < 3000) requestAnimationFrame(f); else res(out); };
  requestAnimationFrame(f); }));
await page.keyboard.up('KeyW');
const speeds = (k1, k2) => rec.slice(1).map((r, i) => Math.hypot(r[k1] - rec[i][k1], r[k2] - rec[i][k2]) / (r.dt / 1000));
const stats = (arr, name) => { const d = arr.slice(1).map((v, i) => v - arr[i]); const flips = d.slice(1).filter((v, i) => v * d[i] < 0 && Math.abs(v) > 0.3).length;
  const rms = Math.sqrt(d.reduce((a, v) => a + v * v, 0) / d.length); console.log(`${name}: frame-to-frame speed change rms ${rms.toFixed(2)} m/s, sign flips ${flips}/${d.length}, sample ${arr.slice(20, 32).map((v) => v.toFixed(1)).join(' ')}`); };
const rel = rec.map((r) => Math.hypot(r.vx - r.cx, r.vz - r.cz));
const rd = rel.slice(1).map((v, i) => (v - rel[i]) * 100);
console.log('car-camera gap change per frame (cm):', rd.slice(30, 70).map((v) => v.toFixed(1)).join(' '));
console.log('gap change rms cm', Math.sqrt(rd.reduce((a, v) => a + v * v, 0) / rd.length).toFixed(2), 'frames with dt>20ms', rec.filter((r) => r.dt > 20).length);
const dts = rec.map((r) => r.dt);
console.log('frames', rec.length, 'dt ms min/avg/max', Math.min(...dts.slice(1)).toFixed(1), (dts.reduce((a, b) => a + b) / dts.length).toFixed(1), Math.max(...dts.slice(1)).toFixed(1));
stats(speeds('vx', 'vz'), 'rendered car');
stats(speeds('bx', 'bz'), 'physics body (raw)');
stats(speeds('cx', 'cz'), 'camera');
const pd = rec.slice(1).map((r, i) => r.pitch - rec[i].pitch); const pdm = pd.map((v) => v * 1000); console.log('body pitch change per frame rms (mrad)', Math.sqrt(pdm.reduce((a, v) => a + v * v, 0) / pdm.length).toFixed(2), 'sample', rec.slice(20, 36).map((r) => (r.pitch * 1000).toFixed(1)).join(' '));
await browser.close(); await server.close();
