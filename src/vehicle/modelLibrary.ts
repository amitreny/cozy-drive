import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { WheelStyle } from '../customization/build';

/** Which CC0 Kenney Car Kit model each car type uses (see CREDITS.md). Scale must match spec.ts `fit`. */
export const MODEL_DEFS: Record<string, { file: string; scale: number }> = {
  pip: { file: 'hatchback-sports', scale: 1.4 },
  badger: { file: 'suv', scale: 1.4 },
  biscuit: { file: 'van', scale: 1.35 },
  maple: { file: 'sedan', scale: 1.4 },
  bramble: { file: 'truck', scale: 1.4 },
  comet: { file: 'sedan-sports', scale: 1.45 },
};
const WHEEL_FILES: Record<WheelStyle, string> = { default: 'wheel-default', dark: 'wheel-dark', racing: 'wheel-racing', truck: 'wheel-truck' };
const BASE = `${import.meta.env.BASE_URL}models/kenney/`;

const scenes = new Map<string, THREE.Group>();
let palette: { data: Uint8ClampedArray; w: number; h: number } | null = null;

/** Load every car and wheel model plus the shared colour palette. Call once at boot. */
export async function loadCarModels(): Promise<void> {
  const loader = new GLTFLoader();
  const files = [...Object.values(MODEL_DEFS).map((d) => d.file), ...Object.values(WHEEL_FILES)];
  await Promise.all(files.map(async (f) => { scenes.set(f, (await loader.loadAsync(`${BASE}${f}.glb`)).scene); }));
  const img = await new THREE.ImageLoader().loadAsync(`${BASE}Textures/colormap.png`);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  palette = { data: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
}

export const hasModel = (carType: string): boolean => carType in MODEL_DEFS && scenes.has(MODEL_DEFS[carType].file);
export const carScene = (carType: string): THREE.Group => scenes.get(MODEL_DEFS[carType].file)!;
export const wheelScene = (style: WheelStyle): THREE.Group => scenes.get(WHEEL_FILES[style])!;

/** Palette colour (0..1 sRGB) at a glTF UV (origin top-left). */
export function samplePalette(u: number, v: number): [number, number, number] {
  if (!palette) return [1, 1, 1];
  const x = Math.min(palette.w - 1, Math.max(0, Math.floor(u * palette.w)));
  const y = Math.min(palette.h - 1, Math.max(0, Math.floor(v * palette.h)));
  const i = (y * palette.w + x) * 4;
  return [palette.data[i] / 255, palette.data[i + 1] / 255, palette.data[i + 2] / 255];
}
