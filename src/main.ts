import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CarAudio } from './audio/audio';
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
import { buildPropMeshes, NearShadowCasters, updatePropVisibility } from './world/props';
import { SkyEnvironment } from './world/environment';
import { Sky } from './world/sky';
import { S, SURFACES } from './world/surfaces';
import { buildRoads, buildWater } from './world/terrain';
import { heightAt, isDry, surfaceAt, waterLevelAt, WORLD_VERSION } from './world/terrainGen';
import { TerrainPhysics } from './world/terrainPhysics';
import { TerrainRenderer } from './world/terrainRender';
import { loadWorld } from './world/worldLoader';
import { buildVillage } from './world/village';

interface SaveData { version: 1; worldVersion?: number; build: Build; assists: AssistLevel; pos: { x: number; z: number; yaw: number }; hours: number }
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
  scene.add(terrain.group, buildRoads(world), buildWater(world), props, buildVillage(RAPIER, physics, world));
  const particles = new Particles(2500);
  scene.add(particles.points);
  const headlight = new THREE.SpotLight(0xffe7b8, 0, 70, 0.55, 0.6, 1.2);
  scene.add(headlight, headlight.target);
  const saved = await load<SaveData>(SAVE_KEY);
  let build: Build = saved?.build ? sanitize(saved.build) : defaultBuild('pip');
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
  input.onFirstGesture = () => { audio.start(); void requestPersistence(); };
  const fade = document.createElement('div');
  fade.style.cssText = 'position:fixed;inset:0;background:#20262e;opacity:0;transition:opacity .5s;pointer-events:none';
  document.body.appendChild(fade);

  const persist = () => void save(SAVE_KEY, { version: 1, worldVersion: WORLD_VERSION, build, assists, pos: safe, hours: sky.hours } satisfies SaveData);
  const applyBuild = (b: Build) => {
    const typeChanged = b.carType !== build.carType;
    build = b; spec = resolveSpec(b);
    vehicle.setSpec(spec);
    if (typeChanged) { const p = vehicle.body.translation(); vehicle.reset({ x: p.x, y: dropY(p.x, p.z), z: p.z }, vehicle.yaw); }
    visual.rebuild(spec, b);
    persist();
  };
  const loop = new FixedLoop({ fixedUpdate, update, render: () => renderer.render(scene, camera) });
  const garage = new Garage(ui, applyBuild, (a) => { assists = a; vehicle.assists = a; persist(); }, () => toggleGarage(false));
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
    vehicle.step(dt, garage.open || rescuing ? IDLE : ctl);
    physics.step();
    vehicle.capture();
  }

  let safeTimer = 0, saveTimer = 0;
  const emitAcc = new Float32Array(4);
  function update(dt: number, alpha: number): void {
    if (input.consume('garage')) toggleGarage(!garage.open);
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
    if (input.consume('mute')) audio.setMuted(!audio.muted);
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
    visual.setEnvironment(skyEnv.update(renderer, dt));

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
    audio.update(vehicle, garage.open ? 0 : input.controls.throttle);
    hud.update(dt, vehicle, sky.hours, cruise.on ? cruise.target : null);

    let prompt: string | null = null;
    if (vehicle.canFlip) prompt = 'Press R to flip back onto your wheels';
    else if (vehicle.submergedTime > 0.2) prompt = 'Too deep! The engine sputters…';
    else if (vehicle.waterDepth > spec.wadingDepth * 0.75) prompt = 'Careful, the water is getting deep';
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
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { persist(); audio.suspend(); loop.timeScale = 0; }
    else { loop.timeScale = garage.open ? 0 : 1; if (!input.onFirstGesture) audio.start(); }
  });

  loading.remove();
  loop.start();
  (window as unknown as { __game: unknown }).__game = { vehicle, sky, world, input, chase, terrainPhysics, cruise, scene, renderer, terrain };
}

boot().catch((err) => {
  console.error(err);
  const l = document.getElementById('loading');
  if (l) l.textContent = `Something went wrong while loading: ${String(err)}`;
});
