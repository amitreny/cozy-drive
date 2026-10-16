// Screenshots every car type in the garage view. Usage: node tools/cars.mjs <outDir> [hours]
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const out = process.argv[2] ?? '.', hours = Number(process.argv[3] ?? 10.5);
const server = await preview({ preview: { port: 4180, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('X4122')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4180/');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.evaluate((h) => { window.__game.sky.hours = h; }, hours);
await page.keyboard.press('KeyH');
await page.waitForTimeout(2500);
await page.keyboard.press('KeyG');
for (const car of ['pip', 'badger', 'biscuit', 'maple', 'bramble', 'comet', 'skipper']) {
  await page.click(`button[data-k="carType"][data-v="${car}"]`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/car-${car}.png`, clip: { x: 0, y: 80, width: 950, height: 560 } });
}
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close(); await server.close();
