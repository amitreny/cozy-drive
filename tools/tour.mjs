// Visual tour: teleports the car around the island and saves screenshots. Usage: node tools/tour.mjs <outDir>
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const out = process.argv[2] ?? '.';
const server = await preview({ preview: { port: 4182, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:4182/');
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.keyboard.press('KeyH');
const go = (spot) => page.evaluate((s) => {
  const g = window.__game, w = g.world, V = w.n + 1, half = w.size / 2;
  const h = (x, z) => { const fx = (x + half) / w.cell, fz = (z + half) / w.cell, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, i = iz * V + ix;
    return (w.heights[i] * (1 - tx) + w.heights[i + 1] * tx) * (1 - tz) + (w.heights[i + V] * (1 - tx) + w.heights[i + V + 1] * tx) * tz; };
  let { x, z, yaw } = s;
  if (s.road !== undefined) { const r = w.roads[s.road], i = s.i; x = r.xs[i]; z = r.zs[i]; yaw = Math.atan2(r.xs[i + 1] - r.xs[i], r.zs[i + 1] - r.zs[i]); }
  g.sky.hours = s.hours;
  g.terrainPhysics.update(x, z, 260, 999);
  g.vehicle.reset({ x, y: h(x, z) + 1.6, z }, yaw);
  g.chase.snap();
}, spot);
const spots = [
  { name: 'village', x: 4, z: -362, yaw: Math.PI, hours: 9 },
  { name: 'coastal-highway-east', road: 0, i: 1260, hours: 11 },
  { name: 'coastal-highway-north', road: 0, i: 1900, hours: 17.8 },
  { name: 'cross-highway', road: 1, i: 300, hours: 13 },
  { name: 'mountain-pass', road: 3, i: 250, hours: 10 },
  { name: 'canyon', road: 4, i: 200, hours: 16 },
  { name: 'dunes', road: 5, i: 200, hours: 12 },
  { name: 'lake', road: 8, i: 120, hours: 15 },
  { name: 'coast-sea', road: 0, i: 330, hours: 10.5 },
  { name: 'night-highway', road: 0, i: 1500, hours: 22 },
];
for (const s of spots) {
  await go(s);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${out}/tour-${s.name}.png` });
}
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close(); await server.close();
