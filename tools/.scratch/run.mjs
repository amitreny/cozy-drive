import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 4198, strictPort: true }, logLevel: 'silent' }); await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 680 } });
page.on('pageerror', (e) => console.log('err', e.message)); page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await page.goto(`http://localhost:4198/tools/.scratch/${process.argv[2]}`);
await page.waitForFunction(() => window.__done, null, { timeout: 120000 });
const info = await page.evaluate(() => window.__info);
for (const [k, v] of Object.entries(info)) { console.log(k); for (const w of [].concat(v)) console.log('  ', JSON.stringify(w)); }
if (process.argv[3]) await page.screenshot({ path: process.argv[3] });
await browser.close(); await server.close();
