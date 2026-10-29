// Close-up shots of each plane's propeller, stopped / idle / full power. Usage: node tools/props-check.mjs [outDir]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const out = process.argv[2] ?? 'docs/props-check';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 4186, strictPort: true }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4186/');
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
await page.keyboard.press('KeyH');

for (const id of ['wren', 'puffin', 'poppy', 'kestrel']) {
  await page.evaluate(async (id) => {
    const { AIRCRAFT } = await import('/src/flight/specs.ts');
    const g = window.__game, spec = AIRCRAFT[id];
    const place = g.places.find((p) => (id === 'puffin' ? p.kind === 'dock' : p.kind === 'airfield'));
    g.flight.start(spec, place);
    g.sky.hours = 11;
    document.getElementById('ui').style.visibility = 'hidden';
    const a = g.flight.aircraft;
    a.body.lockTranslations(true, true); a.body.lockRotations(true, true);
    g.terrainPhysics.update(place.spawn.x, place.spawn.z, 260, 999);
    // Camera: ahead and to the left of the nose, looking back at the hub.
    g.chase.update = function () {
      const v = g.flight.visual, e = spec.engine.propPos, cam = this.cam;
      const at = { x: e[0], y: e[1], z: e[2] };
      const off = window.__camOff ?? [3.2, 0.9, 4.2];
      const p = v.root.localToWorld(cam.position.set(at.x + off[0], at.y + off[1], at.z + off[2]));
      cam.position.copy(p);
      cam.lookAt(v.root.localToWorld(v.root.position.clone().set(at.x, at.y, at.z)));
    };
  }, id);
  for (const [name, thr, wait] of [['crank', 0, 350], ['idle', 0, 2500], ['full', 1, 2000]]) {
    await page.evaluate((thr) => { window.__game.flight.aircraft.throttle = thr; }, thr);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `${out}/${id}-${name}.jpg`, type: 'jpeg', quality: 85 });
  }
  await page.evaluate(() => { window.__camOff = [0.01, 0.4, 6]; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${id}-front.jpg`, type: 'jpeg', quality: 85 });
  await page.evaluate(() => { window.__camOff = [-6.5, -0.2, -1.5]; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${id}-side.jpg`, type: 'jpeg', quality: 85 });
  await page.evaluate(() => { const s = window.__game.flight.aircraft.spec, e = s.engine.propPos; window.__camOff = [s.eye[0] - e[0], s.eye[1] - e[1], s.eye[2] - e[2]]; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${id}-cockpit.jpg`, type: 'jpeg', quality: 85 });
  await page.evaluate(() => { window.__camOff = undefined; });
}
console.log(errors.length ? `errors:\n${errors.join('\n')}` : `saved to ${out}`);
await browser.close(); await server.close();
