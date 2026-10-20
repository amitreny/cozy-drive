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

await car('badger', '#c96f8e', 'satin');
await go({ road: 8, i: 688, hours: 17.4, orbit: 2.3 });
await page.waitForTimeout(3500); await shot('summit-road');

await go({ x: 8, z: -345, yaw: 0.6, hours: 10.5 });
await page.evaluate(() => { document.getElementById('ui').style.visibility = 'visible'; });
await page.waitForTimeout(1500);
await page.keyboard.press('KeyG');
await page.click('button[data-k="carType"][data-v="bramble"]');
await page.click('button[data-k="paint"][data-v="#c96f8e"]');
await page.click('button[data-k="wheels"][data-v="truck"]');
await page.click('button[data-k="lift"][data-v="2"]');
await page.waitForTimeout(3500); await shot('garage', true);

await page.click('.garage button[data-close]');

// Deliveries: the bakery's job board, then the first job dropped off at a home.
await car('maple', '#e9b44c');
const bakery = await page.evaluate(() => { const l = window.__game.world.lots.find((x) => x.business === 'bakery'); return { x: l.front[0], z: l.front[1], yaw: l.yaw + Math.PI }; });
await go({ ...bakery, hours: 9.6, cam: 'far', orbit: 0.5 });
await page.waitForTimeout(2500);
await page.evaluate(() => { document.getElementById('ui').style.visibility = 'visible'; });
await page.keyboard.press('KeyE'); await page.waitForTimeout(1200); await shot('job-board', true);
// Take a job to someone's home (not a supply run to another shop).
const jobId = await page.evaluate(() => { const b = window.__game.jobBoard; return b.api.jobs(b.boardId).find((j) => !j.to.id.startsWith('shop')).id; });
await page.click(`.jobboard button[data-accept="${jobId}"]`); await page.click('.jobboard button[data-close]');
const home = await page.evaluate(() => { const to = window.__game.deliveries.active[0].job.to, l = window.__game.world.lots.find((x) => x.id === to.id); return { x: l.front[0], z: l.front[1], yaw: l.yaw + Math.PI / 2 }; });
await go({ ...home, hours: 10.2, cam: 'far', orbit: 2.2 });
await page.waitForTimeout(2500); await shot('delivery', true);

/** Take an aircraft from a base's hangar (a fresh page each time, so the last flight is over). */
async function fly(placeKind, placeName, craft) {
  await page.reload(); await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
  await page.keyboard.press('KeyH');
  const p = await page.evaluate(([k, n]) => { const p = window.__game.places.find((x) => x.kind === k && x.name.includes(n)); return { x: p.car.x, z: p.car.z, yaw: p.car.yaw }; }, [placeKind, placeName]);
  await go({ ...p, hours: 10 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { document.getElementById('ui').style.visibility = 'visible'; });
  await page.keyboard.press('KeyE'); await page.waitForTimeout(600);
  await page.click(`.hangar button[data-fly][data-id="${craft}"]`); await page.waitForTimeout(1500);
}
/** Put the aircraft in the air (alt metres above the ground) at speed, with the camera set. */
const air = (s) => page.evaluate((s) => {
  const g = window.__game, a = g.flight.aircraft, w = g.world, V = w.n + 1, half = w.size / 2;
  const fx = (s.x + half) / w.cell, fz = (s.z + half) / w.cell, ground = Math.max(0, w.heights[Math.floor(fz) * V + Math.floor(fx)]);
  g.sky.hours = s.hours; g.chase.mode = s.cam ?? 'far'; g.chase.orbit = s.orbit ?? 0; g.chase.holdOrbit = s.orbit !== undefined;
  g.terrainPhysics.update(s.x, s.z, 260, 999);
  a.reset({ x: s.x, y: ground + s.alt, z: s.z }, s.yaw);
  a.body.setLinvel({ x: Math.sin(s.yaw) * s.v, y: 0, z: Math.cos(s.yaw) * s.v }, true);
  if (s.throttle !== undefined) a.throttle = s.throttle;
  if (a.spec.kind === 'balloon') a.envelopeTemp = a.equilibriumTemp(ground + s.alt);
  g.chase.snap();
}, s);

// The Wren climbing out over Island Airfield.
await fly('airfield', 'Island', 'wren');
const rw = await page.evaluate(() => { const r = window.__game.places.find((p) => p.id === 'airfield').runway; return { x: r.cx + Math.sin(r.dir) * r.halfLen * 0.55, z: r.cz + Math.cos(r.dir) * r.halfLen * 0.55, yaw: r.dir }; });
await air({ ...rw, alt: 45, v: 42, throttle: 0.9, hours: 17.2, orbit: 2.6 });
await page.waitForTimeout(1800); await shot('airfield');

// The Hummingbird over Hearthwick.
await fly('helipad', 'Hearthwick', 'hummingbird');
await air({ x: 30, z: -300, yaw: 2.4, alt: 28, v: 0, hours: 11, orbit: 2.2 });
await page.waitForTimeout(2200); await shot('helicopter');

// The Dandelion drifting over the island at sunrise.
await fly('helipad', 'Hearthwick', 'dandelion');
const summit = await page.evaluate(() => { const v = window.__game.viewpoints.find((p) => p.id === 'vp-summit'); return { x: v.x, z: v.z }; });
await air({ x: summit.x - 700, z: summit.z - 500, yaw: Math.atan2(700, 500), alt: 140, v: 0, hours: 6.9, orbit: 0.35 });
await page.waitForTimeout(2500); await shot('balloon');

// The Puffin at Harbour Pier.
await fly('dock', 'Harbour', 'puffin');
await page.evaluate(() => { const g = window.__game; g.sky.hours = 8.4; g.chase.mode = 'far'; g.chase.orbit = 2.3; g.chase.holdOrbit = true; g.chase.snap(); });
await page.waitForTimeout(2500); await shot('seaplane');

console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'saved 13 screenshots to docs/screenshots');
await browser.close(); await server.close();
if (errors.length) process.exit(1);
