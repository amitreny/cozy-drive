import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CarAudio, DEFAULT_MIX, VOICES, type AudioMix } from './audio/audio';
import { SettingsPanel } from './ui/settings';
import { Ambience } from './audio/ambience';
import { Radio } from './audio/music';
import { ChaseCamera } from './camera/chase';
import { Input } from './core/input';
import { FixedLoop } from './core/loop';
import { load, requestPersistence, save } from './core/storage';
import { defaultBuild, resolveSpec, sanitize, type Build } from './customization/build';
import { Particles } from './fx/particles';
import { Garage } from './ui/garage';
import { Hud } from './ui/hud';
import { CarVisual } from './vehicle/carVisual';
import { loadCarModels } from './vehicle/modelLibrary';
import { Vehicle, type AssistLevel, type DriveInput } from './vehicle/vehicle';
import { buildPropMeshes, NearShadowCasters, updatePropVisibility, wind } from './world/props';
import { PostFX } from './render/postfx';
import { Autopilot } from './gameplay/autopilot';
import { Discoveries } from './gameplay/discoveries';
import { REWARDS, unlocksUsed } from './gameplay/economy';
import { placeGnomes, placeViewpoints, type Viewpoint } from './gameplay/places';
import { Progress, type ProgressData } from './gameplay/progress';
import { MAP_FOG_VERSION, MapView } from './ui/map';
import { MiniMap } from './ui/minimap';
import { Grass } from './world/grass';
import { Water } from './world/water';
import { SkyEnvironment } from './world/environment';
import { Sky } from './world/sky';
import { S, SURFACES } from './world/surfaces';
import { buildRoads } from './world/terrain';
import { heightAt, isDry, surfaceAt, waterLevelAt, WORLD_VERSION } from './world/terrainGen';
import { TerrainPhysics } from './world/terrainPhysics';
import { TerrainRenderer } from './world/terrainRender';
import { loadWorld } from './world/worldLoader';
import { buildVillage } from './world/village';

interface SaveData { version: 1; worldVersion?: number; build: Build; assists: AssistLevel; pos: { x: number; z: number; yaw: number }; hours: number; progress?: ProgressData; fog?: string; mix?: AudioMix; station?: number; muted?: boolean; minimap?: boolean; minimapRotate?: boolean; fogVersion?: number }
const SAVE_KEY = 'save-v1';
const IDLE: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };

async function boot(): Promise<void> {
  const loading = document.getElementById('loading')!;
  await Promise.all([RAPIER.init(), loadCarModels().catch((e) => console.warn('Car models unavailable, using built-in shapes', e))]);
  const { world, scatter } = await loadWorld(7, (stage) => { loading.textContent = stage; });
  loading.textContent = 'Warming up the engine…';
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  physics.timestep = 1 / 120;
  const terrainPhysics = new TerrainPhysics(RAPIER, physics, world, scatter);

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 7000);
  const sky = new Sky(scene);
  const skyEnv = new SkyEnvironment(sky);
  const fog = scene.fog as THREE.Fog;
  fog.near = 500; fog.far = 3400;
  const terrain = new TerrainRenderer(world);
  const props = buildPropMeshes(scatter, world.size), casters = new NearShadowCasters(scatter);
  scene.add(casters.group);
  const water = new Water(world, terrain.heightTex), grass = new Grass(world, terrain.heightTex, terrain.surfTex);
  scene.add(terrain.group, buildRoads(world), water.group, grass.mesh, props, buildVillage(RAPIER, physics, world));
  const postfx = new PostFX(renderer, scene, camera);
  const particles = new Particles(2500);
  scene.add(particles.points);
  const headlight = new THREE.SpotLight(0xffe7b8, 0, 70, 0.55, 0.6, 1.2);
  scene.add(headlight, headlight.target);
  const saved = await load<SaveData>(SAVE_KEY);
  let build: Build = saved?.build ? sanitize(saved.build) : defaultBuild('pip');
  const progress = new Progress(saved?.progress);
  unlocksUsed(build).forEach((k) => progress.owned.add(k)); // older saves keep whatever their car already had
  const gnomes = placeGnomes(world), viewpoints = placeViewpoints(world);
  const discoveries = new Discoveries(gnomes, viewpoints, progress.found);
  scene.add(discoveries.group);
  let assists: AssistLevel = saved?.assists ?? 'relaxed';
  if (saved?.hours !== undefined) sky.hours = saved.hours;
  let safe = saved?.pos && saved.worldVersion === WORLD_VERSION ? saved.pos : { ...world.spawn };
  terrainPhysics.update(safe.x, safe.z, 260, 999);
  physics.step(); // build the query structures before the first raycasts
  let spec = resolveSpec(build);
  const dropY = (x: number, z: number) => heightAt(world, x, z) + spec.restLength + spec.wheelRadius + 0.4;
  const env = { surfaceAt: (x: number, z: number) => surfaceAt(world, x, z), waterLevelAt: (x: number, z: number) => waterLevelAt(world, x, z) };
  const vehicle = new Vehicle(RAPIER, physics, spec, { x: safe.x, y: dropY(safe.x, safe.z), z: safe.z }, safe.yaw, env);
  vehicle.assists = assists;
  const visual = new CarVisual(scene, spec, build);
  const chase = new ChaseCamera(camera, canvas, (x, z) => Math.max(heightAt(world, x, z), waterLevelAt(world, x, z)));
  const ui = document.getElementById('ui')!;
  const hud = new Hud(ui);
  const audio = new CarAudio();
  const input = new Input();
  let radio: Radio | null = null, ambience: Ambience | null = null;
  audio.setMix({ ...DEFAULT_MIX, ...saved?.mix });
  audio.muted = saved?.muted ?? false;
  audio.onReady = (ctx, music, amb) => {
    radio = new Radio(ctx, music);
    if (saved?.station !== undefined) radio.setStation(saved.station);
    radio.start();
    ambience = new Ambience(ctx, amb);
    if (radio.on) hud.toast(`♪ Now playing: <b>${radio.name}</b> · T to tune · Esc for sound settings`);
  };
  // Title screen: the camera circles the parked car until the first key or click.
  const title = document.createElement('div');
  title.className = 'title';
  title.innerHTML = `<h1>Cozy Drive</h1><p>a slow drive around a little island</p><div class="start">${saved ? 'Press any key to continue' : 'Press any key to start'}</div>`;
  document.body.appendChild(title); document.body.classList.add('titled');
  let titled = true;
  chase.turntable = true;
  if (saved) hud.toggleHelp(); // returning players already know the keys
  const closeTitle = () => {
    if (!titled) return;
    titled = false; title.classList.add('gone'); document.body.classList.remove('titled');
    chase.turntable = false; setTimeout(() => title.remove(), 1300);
  };
  title.addEventListener('pointerdown', closeTitle);
  input.onFirstGesture = () => { audio.start(); void requestPersistence(); closeTitle(); };
  const fade = document.createElement('div');
  fade.style.cssText = 'position:fixed;inset:0;background:#20262e;opacity:0;transition:opacity .5s;pointer-events:none';
  document.body.appendChild(fade);

  const persist = () => void save(SAVE_KEY, { version: 1, worldVersion: WORLD_VERSION, build, assists, pos: safe, hours: sky.hours, progress: progress.toJSON(), fog: mapView.fogData(), mix: audio.mix, station: radio?.current ?? saved?.station, muted: audio.muted, minimap: minimap.visible, minimapRotate: minimap.rotate, fogVersion: MAP_FOG_VERSION } satisfies SaveData);
  const applyBuild = (b: Build) => {
    const typeChanged = b.carType !== build.carType;
    build = b; spec = resolveSpec(b);
    vehicle.setSpec(spec);
    if (typeChanged) { const p = vehicle.body.translation(); vehicle.reset({ x: p.x, y: dropY(p.x, p.z), z: p.z }, vehicle.yaw); }
    visual.rebuild(spec, b);
    persist();
  };
  // Dynamic resolution: keep frames smooth on weaker GPUs by trading a little sharpness.
  const maxRatio = Math.min(devicePixelRatio, 1.5);
  let pixelRatio = maxRatio, frameAvg = 16.7, lastFrame = performance.now(), resCheck = 0;
  const setRatio = (r: number) => {
    pixelRatio = r; renderer.setPixelRatio(r); renderer.setSize(innerWidth, innerHeight);
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2()); postfx.setSize(sz.x, sz.y);
  };
  /** Quality tier: 2 = bloom + grass, 1 = grass only, 0 = neither. */
  let tier = 2, tierCooldown = 0;
  const setTier = (t: number) => { tier = t; postfx.quality = t >= 2 ? 'high' : 'medium'; grass.mesh.visible = t >= 1; };
  const render = () => {
    const now = performance.now();
    frameAvg += (now - lastFrame - frameAvg) * 0.05; lastFrame = now;
    if (++resCheck > 90) {
      resCheck = 0;
      // Slow: first lower resolution a little, then drop bloom, then grass. Fast: restore in reverse,
      // with a cool-down after any downgrade so quality never flickers.
      if (frameAvg > 21) {
        if (pixelRatio > 0.75) setRatio(Math.max(0.75, pixelRatio - 0.1));
        else if (tier > 0) { setTier(tier - 1); tierCooldown = now + 30000; }
        else if (pixelRatio > 0.6) setRatio(Math.max(0.6, pixelRatio - 0.05));
      } else if (frameAvg < 14.5) {
        if (pixelRatio < Math.min(maxRatio, 0.75) - 0.01 || (tier === 2 && pixelRatio < maxRatio)) setRatio(Math.min(maxRatio, pixelRatio + 0.1));
        else if (tier < 2 && now > tierCooldown) setTier(tier + 1);
        else if (pixelRatio < maxRatio) setRatio(Math.min(maxRatio, pixelRatio + 0.1));
      }
    }
    postfx.render(scene, camera);
    const pc = pendingPostcards.shift();
    if (pc) capturePostcard(pc);
  };
  // Postcards: a small JPEG of the frame just rendered, kept in the scrapbook.
  const pendingPostcards: Viewpoint[] = [];
  const postcardCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 7000);
  const capturePostcard = (v: Viewpoint) => {
    // Frame the vista itself from a little above the marker, then put the normal frame back next tick.
    const sx = Math.sin(v.yaw), sz = Math.cos(v.yaw);
    postcardCam.aspect = renderer.domElement.width / renderer.domElement.height; postcardCam.updateProjectionMatrix();
    postcardCam.position.set(v.x + sx * 4, v.y + 5, v.z + sz * 4); // just past the marker, so the car is behind us
    postcardCam.lookAt(v.x + sx * 300, v.y - 25, v.z + sz * 300);
    postfx.render(scene, postcardCam);
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;
    const src = renderer.domElement, ar = 16 / 9, sw = Math.min(src.width, src.height * ar), sh = sw / ar;
    c.getContext('2d')!.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, 320, 180);
    progress.postcards.push({ id: v.id, name: v.name, img: c.toDataURL('image/jpeg', 0.78) });
    postfx.render(scene, camera);
    flash.style.transition = 'none'; flash.style.opacity = '0.85';
    requestAnimationFrame(() => { flash.style.transition = 'opacity 0.7s'; flash.style.opacity = '0'; });
    persist();
  };
  const loop = new FixedLoop({ fixedUpdate, update, render });
  const shop = {
    acorns: () => progress.acorns, owned: () => progress.owned, creative: () => progress.creative,
    setCreative: (on: boolean) => { progress.creative = on; persist(); },
    buy: (keys: string[], cost: number) => { const ok = progress.buy(keys, cost); if (ok) persist(); return ok; },
  };
  const mapView = new MapView(ui, world, viewpoints, gnomes, progress, saved?.worldVersion === WORLD_VERSION ? saved?.fog : undefined, saved?.fogVersion !== MAP_FOG_VERSION);
  if (!saved?.fog || saved.worldVersion !== WORLD_VERSION) mapView.reveal(world.spawn.x, world.spawn.z, 420); // the village is home: start with it on the map
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none';
  document.body.appendChild(flash);
  const autopilot = new Autopilot();
  mapView.baseCanvas(); // paint now, behind the loading screen, so neither map ever hitches
  const minimap = new MiniMap(ui, mapView, world, viewpoints, progress);
  minimap.rotate = saved?.minimapRotate ?? true;
  minimap.setVisible(saved?.minimap ?? true);
  const settings = new SettingsPanel(ui, {
    mix: () => audio.mix, setMix: (m) => audio.setMix(m),
    stations: () => radio?.stations ?? ['Morning Meadow', 'Evening Drive', 'Night Sky'],
    station: () => radio?.current ?? saved?.station ?? 0, setStation: (i) => radio?.setStation(i),
    muted: () => audio.muted, setMuted: (m) => audio.setMuted(m),
    minimap: () => ({ visible: minimap.visible, rotate: minimap.rotate }),
    setMinimap: (v, r) => { minimap.setVisible(v); minimap.rotate = r; },
  }, () => { settings.toggle(); loop.timeScale = 1; persist(); });
  const garage = new Garage(ui, shop, applyBuild, (a) => { assists = a; vehicle.assists = a; persist(); }, () => toggleGarage(false));
  function toggleGarage(open: boolean): void {
    if (open) { garage.show(build, assists); loop.timeScale = 0; chase.turntable = true; }
    else { garage.hide(); loop.timeScale = 1; chase.turntable = false; (document.activeElement as HTMLElement | null)?.blur(); }
  }

  let rescuing = false;
  const rescue = () => {
    if (rescuing) return;
    rescuing = true; fade.style.opacity = '1';
    setTimeout(() => {
      terrainPhysics.update(safe.x, safe.z, 260, 999);
      physics.step();
      vehicle.reset({ x: safe.x, y: dropY(safe.x, safe.z), z: safe.z }, safe.yaw);
      chase.snap(); fade.style.opacity = '0'; rescuing = false;
    }, 600);
  };

  // Cruise control: holds the set speed; brake or handbrake cancels.
  const cruise = { on: false, target: 0, i: 0 };
  function fixedUpdate(dt: number): void {
    input.poll(dt);
    let ctl: DriveInput = input.controls;
    if (cruise.on) {
      if (ctl.brake > 0.1 || ctl.handbrake > 0.5 || vehicle.gear < 0) cruise.on = false;
      else {
        const err = cruise.target - vehicle.speed;
        cruise.i = Math.min(1, Math.max(0, cruise.i + err * dt * 0.15));
        ctl = { ...ctl, throttle: Math.max(ctl.throttle, Math.min(1, Math.max(0, err * 0.3 + cruise.i))) };
      }
    }
    if (autopilot.active) {
      const raw = input.controls;
      if (Math.abs(raw.steer) > 0.35 || raw.brake > 0.1 || raw.handbrake > 0.5) { autopilot.disengage(); hud.toast('Autopilot off: you have the wheel'); }
      else {
        const p = vehicle.body.translation();
        const ap = autopilot.control(p.x, p.z, vehicle.yaw, vehicle.speed, cruise.on ? cruise.target : undefined);
        if (ap) ctl = { ...ap, throttle: Math.max(ap.throttle, raw.throttle) }; else hud.toast('Autopilot: end of the road');
      }
    }
    vehicle.step(dt, garage.open || rescuing || titled ? IDLE : ctl);
    physics.step();
    vehicle.capture();
  }

  let safeTimer = 0, saveTimer = 0, mapTimer = 0, revealTimer = 0, ambTimer = 0;
  let amb = { day: 1, night: 0, shore: 0, nature: 1 };
  const emitAcc = new Float32Array(4);
  function update(dt: number, alpha: number): void {
    if (input.consume('garage') && !mapView.open) toggleGarage(!garage.open);
    if (input.consume('map') && !garage.open) { mapView.toggle(); loop.timeScale = mapView.open ? 0 : 1; mapTimer = 1; }
    if (mapView.open) { mapTimer += dt; if (mapTimer > 0.1) { mapTimer = 0; const p = vehicle.body.translation(); mapView.draw(p.x, p.z, vehicle.yaw); } }
    if (input.consume('autopilot')) {
      if (autopilot.active) { autopilot.disengage(); hud.toast('Autopilot off'); }
      else { const p = vehicle.body.translation(); hud.toast(autopilot.engage(world.roads, p.x, p.z, vehicle.yaw) ? `Autopilot on · <b>${autopilot.road!.def.name}</b> · sit back and enjoy` : 'Autopilot needs a road nearby'); }
    }
    revealTimer += dt;
    if (revealTimer > 0.5) { revealTimer = 0; const p = vehicle.body.translation(); mapView.reveal(p.x, p.z, 170); }
    discoveries.update(dt, visual.position, vehicle.speed, (g) => {
      progress.found.add(g.id); progress.earn(REWARDS.gnome); audio.chime();
      const n = gnomes.filter((x) => progress.found.has(x.id)).length;
      hud.toast(`Found a garden gnome! <b>${n} / ${gnomes.length}</b> · +${REWARDS.gnome} 🌰`); persist();
    }, (v) => {
      progress.found.add(v.id); progress.earn(REWARDS.viewpoint); audio.chime(true);
      mapView.reveal(v.x, v.z, 650); pendingPostcards.push(v);
      hud.toast(`★ <b>${v.name}</b> · postcard added to your map · +${REWARDS.viewpoint} 🌰`);
    });
    hud.setAcorns(progress.creative ? '∞' : String(progress.acorns));
    if (input.consume('cruise')) {
      if (cruise.on) cruise.on = false;
      else if (vehicle.speed > 5) { cruise.on = true; cruise.target = vehicle.speed; cruise.i = 0.35; }
    }
    const vp = vehicle.body.translation(), vv = vehicle.body.linvel();
    terrainPhysics.update(vp.x + vv.x * 1.5, vp.z + vv.z * 1.5);
    terrain.update(camera.position);
    updatePropVisibility(props, camera.position, world.size);
    casters.update(vp.x, vp.z);
    if (input.consume('help')) hud.toggleHelp();
    if (input.consume('mute')) { audio.setMuted(!audio.muted); hud.toast(audio.muted ? 'Sound off' : 'Sound on'); persist(); }
    if (input.consume('settings') && !garage.open && !mapView.open) { settings.toggle(); loop.timeScale = settings.open ? 0 : 1; if (!settings.open) persist(); }
    if (input.consume('minimap')) { minimap.setVisible(!minimap.visible); persist(); }
    { const p = vehicle.body.translation(); minimap.update(dt, p.x, p.z, vehicle.yaw); }
    if (input.consume('radio') && radio) hud.toast(`♪ <b>${radio.tune()}</b>`);
    if (ambience) {
      ambTimer += dt;
      if (ambTimer > 0.5) {
        ambTimer = 0;
        const p = vehicle.body.translation();
        let wet = 0; for (let a = 0; a < 8; a++) if (heightAt(world, p.x + Math.cos(a) * 70, p.z + Math.sin(a) * 70) < 0.3) wet++;
        const su = surfaceAt(world, p.x, p.z), green = su === S.Grass || su === S.Mud || su === S.Dirt || su === S.Gravel ? 1 : 0.3;
        const night = sky.hours < 5.5 || sky.hours > 20.5 ? 1 : 0;
        amb = { day: 1 - night, night, shore: wet / 8, nature: green };
      }
      ambience.update(dt, amb);
    }
    if (input.consume('camera')) chase.cycle();
    const slow = Math.abs(vehicle.speed) < 6;
    if (input.consume('flip') && slow && !garage.open) vehicle.flip();
    if (input.consume('pressureDown')) vehicle.pressure = Math.max(0.8, +(vehicle.pressure - 0.2).toFixed(1));
    if (input.consume('pressureUp')) vehicle.pressure = Math.min(2.6, +(vehicle.pressure + 0.2).toFixed(1));
    if (input.consume('driveMode') && spec.lowRange) vehicle.lowRange = !vehicle.lowRange;
    if (input.consume('diffLock') && spec.lockable) vehicle.lockersOn = !vehicle.lockersOn;

    visual.update(vehicle, alpha, garage.open ? 0 : dt);
    chase.update(dt, visual.position, visual.quaternion, vehicle.speed, spec.half[2]);
    sky.update(garage.open ? 0 : dt, visual.position);
    const envTex = skyEnv.update(renderer, dt);
    visual.setEnvironment(envTex);
    water.update(dt, envTex);
    grass.update(dt, camera.position, visual.position);
    wind.value += dt;
    postfx.setTimeOfDay(sky.hours);

    // Headlight at night, aimed down the road ahead.
    const night = sky.isNight || sky.hours > 19.6 || sky.hours < 6.4;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(visual.quaternion);
    headlight.intensity = night ? 60 : 0;
    headlight.position.copy(visual.position).addScaledVector(fwd, spec.half[2]).y += 0.3;
    headlight.target.position.copy(visual.position).addScaledVector(fwd, 25);
    visual.model.headlights.forEach((m) => (m.emissiveIntensity = night ? 3 : 0.4));

    // Surface particles from each wheel: dust, gravel, mud, sand, snow, splashes.
    if (!garage.open) vehicle.wheels.forEach((w, i) => {
      if (!w.contact) return;
      const surf = SURFACES[w.surface];
      const speed = Math.abs(vehicle.speed);
      const loose = surf.particle && w.surface !== S.Ice;
      let rate = loose ? speed * (surf.soft ? 1.1 : 0.5) + w.skid * 5 : w.skid > 4 ? (w.skid - 4) * 6 : 0;
      if (w.surface === S.Grass) rate *= 0.35;
      emitAcc[i] += rate * dt;
      const color: [number, number, number] = surf.particle ?? [0.85, 0.85, 0.85];
      const water = w.surface === S.Water, grass = w.surface === S.Grass;
      while (emitAcc[i] >= 1) {
        emitAcc[i] -= 1;
        const r = () => (Math.random() - 0.5);
        particles.emit(w.point.x + r() * 0.4, w.point.y + 0.1, w.point.z + r() * 0.4,
          -fwd.x * speed * 0.15 + r() * 1.5, (water ? 2.5 : 0.8) + Math.random() * (water ? 2 : 1), -fwd.z * speed * 0.15 + r() * 1.5,
          color, water ? 0.9 : grass ? 0.5 : 1.4 + Math.random(), water ? 0.35 : grass ? 0.18 : 0.5, water ? 0.4 : grass ? 0.05 : 1.2);
      }
    });
    particles.update(dt);
    audio.update(vehicle, garage.open ? 0 : vehicle.appliedThrottle, chase.mode === 'hood');
    hud.update(dt, vehicle, sky.hours, cruise.on ? cruise.target : null, autopilot.active ? autopilot.road!.def.name : null);

    let prompt: string | null = null;
    if (vehicle.canFlip) prompt = 'Press R to flip back onto your wheels';
    else if (vehicle.submergedTime > 0.2) prompt = 'Too deep! The engine sputters…';
    else if (vehicle.waterDepth > spec.wadingDepth * 0.75) prompt = 'Careful, the water is getting deep';
    else if (spec.lowRange && input.controls.throttle > 0.5 && vehicle.pitchDeg > 14 && Math.abs(vehicle.speed) < 1.5 && (!vehicle.lowRange || !vehicle.lockersOn))
      prompt = `Steep! Try ${vehicle.lowRange ? '' : 'low range (F)'}${!vehicle.lowRange && !vehicle.lockersOn ? ' and ' : ''}${vehicle.lockersOn ? '' : 'lockers (L)'}`;
    hud.showPrompt(garage.open ? null : prompt);
    if (vehicle.needsRescue) rescue();

    // Remember the last safe spot (all wheels down, dry, calm) for gentle recovery.
    safeTimer += dt;
    const p = vehicle.body.translation();
    if (safeTimer > 1 && vehicle.wheels.every((w) => w.contact && !w.inWater) && Math.abs(vehicle.speed) < 25 && isDry(world, p.x, p.z, 0.6)) {
      safeTimer = 0; safe = { x: p.x, z: p.z, yaw: vehicle.yaw };
    }
    if (p.y < -30) rescue();
    saveTimer += dt;
    if (saveTimer > 20) { saveTimer = 0; persist(); }
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    const s = renderer.getDrawingBufferSize(new THREE.Vector2()); postfx.setSize(s.x, s.y);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { persist(); audio.suspend(); loop.timeScale = 0; }
    else { loop.timeScale = garage.open ? 0 : 1; if (!input.onFirstGesture) audio.start(); }
  });

  loading.remove();
  loop.start();
  (window as unknown as { __game: unknown }).__game = { audio, vehicle, visual, sky, skyEnv, casters, particles, world, input, chase, terrainPhysics, cruise, voices: VOICES, scene, renderer, terrain, loop, postfx, grass, water, progress, gnomes, viewpoints, mapView, autopilot, minimap };
}

boot().catch((err) => {
  console.error(err);
  const l = document.getElementById('loading');
  if (l) l.textContent = `Something went wrong while loading: ${String(err)}`;
});
