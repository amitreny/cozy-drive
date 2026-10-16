// Frame-rate probe: toggles scene layers and measures fps. Usage: node tools/perf.mjs
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const server = await preview({ preview: { port: 4181, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:4181/');
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.waitForTimeout(3000);
const fps = () => page.evaluate(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
const info = () => page.evaluate(() => { const r = window.__game.renderer.info.render; return `calls ${r.calls} tris ${(r.triangles / 1e6).toFixed(2)}M`; });
console.log('baseline', await fps(), await info());
const toggle = (expr) => page.evaluate(expr);
await toggle(() => { window.__game.scene.traverse((o) => { if (o.isInstancedMesh && o.parent?.name !== 'terrain') o.castShadow = false; }); });
console.log('trees cast no shadows', await fps(), await info());
await toggle(() => { window.__game.scene.children.forEach((c) => { if (c.children.length > 50 && c.name !== 'terrain') c.visible = false; }); });
console.log('no props', await fps(), await info());
await toggle(() => { window.__game.terrain.group.visible = false; });
console.log('no props, no terrain', await fps(), await info());
await toggle(() => { window.__game.terrain.group.visible = true; window.__game.renderer.shadowMap.enabled = false; window.__game.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); }); });
await page.waitForTimeout(500);
console.log('terrain only, no shadows', await fps(), await info());
await browser.close(); await server.close();
