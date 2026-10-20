// Regenerates the README screenshots in docs/screenshots/. Usage: npm run build && node tools/screenshots.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const out = 'docs/screenshots';
mkdirSync(out, { recursive: true });
const server = await preview({ preview: { port: 4184, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4184/');
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.keyboard.press('KeyH');
// Creative mode so every car and part can be shown.
await page.keyboard.press('KeyG'); await page.click('button[data-creative]'); await page.click('button[data-close]');

/** Pick a car type and paint through the real garage UI. */
async function car(type, paint, finish = 'gloss') {
  await page.evaluate(() => { document.getElementById('ui').style.visibility = 'visible'; });
  await page.keyboard.press('KeyG');
  await page.click(`button[data-k="carType"][data-v="${type}"]`);
  await page.click(`button[data-k="paint"][data-v="${paint}"]`);
  await page.click(`button[data-k="finish"][data-v="${finish}"]`);
  await page.click('button[data-close]');
}

/** Teleport to a spot (or a road sample), set the clock and camera. */
const go = (s) => page.evaluate((s) => {
  const g = window.__game, w = g.world, V = w.n + 1, half = w.size / 2;
  const h = (x, z) => { const fx = (x + half) / w.cell, fz = (z + half) / w.cell, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, i = iz * V + ix;
    return (w.heights[i] * (1 - tx) + w.heights[i + 1] * tx) * (1 - tz) + (w.heights[i + V] * (1 - tx) + w.heights[i + V + 1] * tx) * tz; };
  let { x, z, yaw } = s;
  if (s.road !== undefined) { const r = w.roads[s.road], i = s.i; x = r.xs[i]; z = r.zs[i]; yaw = Math.atan2(r.xs[i + 1] - r.xs[i], r.zs[i + 1] - r.zs[i]); }
  g.sky.hours = s.hours;
  g.chase.mode = s.cam ?? 'chase';
  g.chase.orbit = s.orbit ?? 0;
  g.chase.holdOrbit = s.orbit !== undefined;
  g.terrainPhysics.update(x, z, 260, 999);
  g.vehicle.reset({ x, y: h(x, z) + 1.6, z }, yaw);
  g.chase.snap();
}, s);

const shot = async (name, ui = false) => {
  await page.evaluate((show) => { document.getElementById('ui').style.visibility = show ? 'visible' : 'hidden'; }, ui);
  await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 82 });
};

await car('comet', '#e07a5f');
await go({ road: 0, i: 1900, hours: 17.9, cam: 'far', orbit: 2.55 });
await page.waitForTimeout(3000); await shot('coastal-highway-sunset');

await car('pip', '#6c9bc4');
await go({ x: 6, z: -340, yaw: 2.3, hours: 9.2, cam: 'far', orbit: -0.5 });
await page.waitForTimeout(3000); await shot('village');

await car('badger', '#7fa37a', 'satin');
await go({ road: 4, i: 240, hours: 15.2, cam: 'far', orbit: 0.9 });
await page.waitForTimeout(3000); await shot('canyon-track');

await car('skipper', '#e9b44c');
await go({ road: 5, i: 180, hours: 12, cam: 'far', orbit: -0.85 });
await page.waitForTimeout(3000); await shot('dunes');

await car('biscuit', '#6c9bc4');
await go({ road: 1, i: 420, hours: 11, cam: 'chase' });
await page.waitForTimeout(3000); await shot('cross-island-highway');

await go({ x: 8, z: -345, yaw: 0.6, hours: 10.5 });
await page.evaluate(() => { document.getElementById('ui').style.visibility = 'visible'; });
await page.waitForTimeout(1500);
await page.keyboard.press('KeyG');
await page.click('button[data-k="carType"][data-v="bramble"]');
await page.click('button[data-k="paint"][data-v="#c96f8e"]');
await page.click('button[data-k="wheels"][data-v="truck"]');
await page.click('button[data-k="lift"][data-v="2"]');
await page.waitForTimeout(3500); await shot('garage', true);

console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'saved 6 screenshots to docs/screenshots');
await browser.close(); await server.close();
if (errors.length) process.exit(1);
