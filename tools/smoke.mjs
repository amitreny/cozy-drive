// Smoke test: serves dist/, opens the game in installed Chrome, drives a bit, saves screenshots.
// Usage: node tools/smoke.mjs <outDir>
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const out = process.argv[2] ?? '.';
const server = await preview({ preview: { port: 4179, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: process.env.SMOKE_GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('X4122')) errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const t0 = Date.now();
await page.goto('http://localhost:4179/');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
console.log('boot ms', Date.now() - t0);
await page.waitForTimeout(2500);
const state = () => page.evaluate(() => { const v = window.__game.vehicle; const p = v.body.translation();
  return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1), kmh: Math.round(v.speed * 3.6), gear: v.gearLabel, surface: v.mainSurface, contacts: v.wheels.filter((w) => w.contact).length, hours: +window.__game.sky.hours.toFixed(2) }; });
console.log('settled', JSON.stringify(await state()));
await page.screenshot({ path: `${out}/1-spawn.png` });
await page.keyboard.down('KeyW'); await page.waitForTimeout(4000);
console.log('after 4s throttle', JSON.stringify(await state()));
await page.keyboard.down('KeyD'); await page.waitForTimeout(1200); await page.keyboard.up('KeyD');
await page.screenshot({ path: `${out}/2-driving.png` });
await page.keyboard.up('KeyW');
await page.keyboard.press('KeyG'); await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/3-garage.png` });
await page.click('button[data-k="carType"][data-v="badger"]'); await page.waitForTimeout(600);
await page.click('button[data-k="paint"][data-v="#6c9bc4"]'); await page.click('button[data-k="lift"][data-v="2"]'); await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/4-garage-badger.png` });
await page.click('button[data-close]'); await page.waitForTimeout(1500);
console.log('after garage', JSON.stringify(await state()));
await page.evaluate(() => { window.__game.sky.hours = 18.6; });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/5-golden-hour.png` });
const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
console.log('fps', fps, process.env.SMOKE_GPU ? '(GPU)' : '(software rendering, not representative)');
console.log('console errors/warnings:', errors.length ? errors.join('\n') : 'none');
// Offline: the service worker must let the game boot with the network cut.
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(1500);
await page.context().setOffline(true);
await page.reload();
const offline = await page.waitForFunction(() => window.__game, null, { timeout: 60000 }).then(() => true, () => false);
console.log('boots offline after first visit:', offline);
await browser.close(); await server.close();
if (errors.length || !offline) { console.error('SMOKE FAILED'); process.exit(1); }
console.log('SMOKE OK');
