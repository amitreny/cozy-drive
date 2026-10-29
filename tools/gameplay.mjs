// End-to-end gameplay check: gnome pickup, viewpoint postcard, map, garage prices, autopilot. Fails loudly.
// Usage: npm run build && node tools/gameplay.mjs <screenshot-dir>
import { chromium } from 'playwright-core';
import { preview } from 'vite';
const out = process.argv[2];
const server = await preview({ preview: { port: 4189, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:4189/');
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.keyboard.press('KeyH');
const tp = (x, z, yaw = 0) => page.evaluate(([x, z, yaw]) => { const g = window.__game, w = g.world, V = w.n + 1, half = w.size / 2;
  const fx = (x + half) / w.cell, fz = (z + half) / w.cell, ix = Math.floor(fx), iz = Math.floor(fz), h = w.heights[iz * V + ix];
  g.terrainPhysics.update(x, z, 260, 999); g.vehicle.reset({ x, y: h + 1.6, z }, yaw); g.chase.snap(); }, [x, z, yaw]);
const state = () => page.evaluate(() => { const g = window.__game; return { acorns: g.progress.acorns, found: g.progress.found.size, postcards: g.progress.postcards.length, ap: g.autopilot.active, kmh: Math.round(g.vehicle.speed * 3.6) }; });
console.log('start', JSON.stringify(await state()));
const gn = await page.evaluate(() => window.__game.gnomes[3]);
await tp(gn.x + 1, gn.z + 1); await page.waitForTimeout(1500);
console.log('after gnome', JSON.stringify(await state()));
await page.screenshot({ path: `${out}/cozy-gnome.png` });
const vp = await page.evaluate(() => window.__game.viewpoints.find((v) => v.id === 'vp-summit'));
await page.evaluate(() => { window.__game.sky.hours = 17.6; });
await tp(vp.x, vp.z, vp.yaw); await page.waitForTimeout(2500);
console.log('after viewpoint', JSON.stringify(await state()));
await page.screenshot({ path: `${out}/cozy-viewpoint.png` });
await page.keyboard.press('KeyM'); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/cozy-map.png` });
await page.keyboard.press('KeyM'); await page.waitForTimeout(300);
await page.keyboard.press('KeyG'); await page.waitForTimeout(800);
await page.click('button[data-k="tyre"][data-v="mud"]'); await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/cozy-garage.png` });
await page.click('button[data-revert]'); await page.click('button[data-close]');
const r = await page.evaluate(() => { const r = window.__game.world.roads[0]; return [r.xs[600], r.zs[600], Math.atan2(r.xs[601] - r.xs[600], r.zs[601] - r.zs[600])]; });
await tp(r[0], r[1], r[2]); await page.waitForTimeout(1200);
await page.keyboard.press('KeyP'); await page.waitForTimeout(9000);
console.log('autopilot', JSON.stringify(await state()));
await page.screenshot({ path: `${out}/cozy-autopilot.png` });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
const fin = await state();
await page.keyboard.press('KeyP'); await page.waitForTimeout(300); // autopilot off

// Delivery: take the bakery's first job at its door, then stop at the address.
const bakery = await page.evaluate(() => { const l = window.__game.world.lots.find((x) => x.business === 'bakery'); return [l.front[0], l.front[1], l.yaw + Math.PI]; });
await tp(...bakery); await page.waitForTimeout(1500);
await page.keyboard.press('KeyE'); await page.waitForTimeout(500);
await page.click('.jobboard button[data-accept]'); await page.click('.jobboard button[data-close]'); await page.waitForTimeout(500);
const to = await page.evaluate(() => window.__game.deliveries.active[0]?.job.to);
await tp(to.x + 1.5, to.z + 1.5, 0); await page.waitForTimeout(2500);
const delivered = await page.evaluate(() => window.__game.deliveries.delivered);
console.log('delivered', delivered, 'to', to?.name);
await page.screenshot({ path: `${out}/cozy-delivery.png` });

// Flying: at the airfield, take an air-cargo job, board the Wren, line up and take off with the keyboard.
const pl = await page.evaluate(() => { const p = window.__game.places.find((x) => x.id === 'airfield'); return [p.car.x, p.car.z, p.car.yaw]; });
await tp(...pl); await page.waitForTimeout(1500);
await page.keyboard.press('KeyE'); await page.waitForTimeout(500);
await page.click('.hangar button[data-accept]'); await page.waitForTimeout(200);
await page.click('.hangar button[data-fly][data-id="wren"]'); await page.waitForTimeout(1200);
await page.evaluate(() => { const g = window.__game, a = g.flight.aircraft, rw = g.places.find((p) => p.id === 'airfield').runway;
  const x = rw.cx - Math.sin(rw.dir) * (rw.halfLen - 30), z = rw.cz - Math.cos(rw.dir) * (rw.halfLen - 30);
  g.terrainPhysics.update(x, z, 260, 999); a.reset(g.flight.pose(a.spec, { x, z, yaw: rw.dir }, false), rw.dir); g.chase.snap(); });
await page.waitForTimeout(1300); // the starter cranks the engine until it catches
await page.keyboard.down('KeyR'); await page.waitForTimeout(2000); await page.keyboard.up('KeyR');
await page.waitForTimeout(9500);
await page.keyboard.down('KeyS'); await page.waitForTimeout(1500); await page.keyboard.up('KeyS');
await page.waitForTimeout(5000);
const fl = await page.evaluate(() => { const a = window.__game.flight.aircraft; return a && { agl: Math.round(a.agl), kmh: Math.round(a.airspeed * 3.6), crashed: a.crashed, cargo: window.__game.deliveries.active.length }; });
console.log('flight', JSON.stringify(fl));
await page.screenshot({ path: `${out}/cozy-flight.png` });
const ok = fin.found >= 2 && fin.postcards >= 1 && fin.acorns >= 230 && fin.ap && fin.kmh > 50 && delivered >= 1 && fl && fl.agl > 3 && fl.kmh > 80 && !fl.crashed && fl.cargo >= 1 && !errors.length;
console.log(ok ? 'GAMEPLAY OK' : 'GAMEPLAY FAILED');
if (!ok) process.exitCode = 1;
await browser.close(); await server.close();
