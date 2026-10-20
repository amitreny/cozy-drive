import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Kenney City Kit buildings and details, aircraft and cargo models (see CREDITS.md). Loaded once at boot. */
const BASE = `${import.meta.env.BASE_URL}models/`;
export interface ModelPart { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }
const parts = new Map<string, ModelPart[]>();
const scenes = new Map<string, THREE.Group>();
const variations = new Map<string, THREE.Texture[]>();

/** Merge a glTF scene's meshes (with their node transforms baked in) into parts grouped by material. */
function flatten(scene: THREE.Group): ModelPart[] {
  scene.updateMatrixWorld(true);
  const out: ModelPart[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld);
    out.push({ geometry: g, material: (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial });
  });
  return out;
}

async function loadKit(loader: GLTFLoader, folder: string, files: string[], variants: string[]): Promise<void> {
  await Promise.all(files.map(async (f) => {
    const g = (await loader.loadAsync(`${BASE}${folder}/${f}.glb`)).scene;
    parts.set(`${folder}/${f}`, flatten(g));
  }));
  const tl = new THREE.TextureLoader();
  const base = (parts.get(`${folder}/${files[0]}`)![0].material.map) as THREE.Texture | null;
  const list: THREE.Texture[] = base ? [base] : [];
  for (const v of variants) {
    const t = await tl.loadAsync(`${BASE}${folder}/Textures/${v}.png`);
    t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    list.push(t);
  }
  variations.set(folder, list);
}

export async function loadTownModels(): Promise<void> {
  const loader = new GLTFLoader();
  const sub = 'abcdefghijklmnopqrstu'.split('').map((c) => `building-type-${c}`);
  const com = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-h', 'building-k'];
  await Promise.all([
    loadKit(loader, 'kenney-suburban', [...sub, 'fence', 'fence-low', 'planter', 'driveway-long', 'path-stones-short'], ['variation-a', 'variation-b', 'variation-c']),
    loadKit(loader, 'kenney-commercial', [...com, 'detail-awning-wide', 'detail-awning', 'detail-parasol-a', 'detail-parasol-b'], ['variation-a', 'variation-b']),
    ...['trainer', 'seaplane', 'biplane', 'sport', 'helicopter', 'balloon'].map(async (f) => { scenes.set(`aircraft/${f}`, (await loader.loadAsync(`${BASE}aircraft/${f}.glb`)).scene); }),
    ...['package', 'pallet'].map(async (f) => { const s = (await loader.loadAsync(`${BASE}cargo/${f}.glb`)).scene; scenes.set(`cargo/${f}`, s); parts.set(`cargo/${f}`, flatten(s)); }),
  ]);
}

export const modelParts = (key: string): ModelPart[] => parts.get(key) ?? [];
export const modelScene = (key: string): THREE.Group | undefined => scenes.get(key);
/** Colour variation textures for a kit (index 0 is the default colormap). */
export const kitVariation = (folder: string, i: number): THREE.Texture | null => { const l = variations.get(folder) ?? []; return l.length ? l[i % l.length] : null; };
export const hasTownModels = (): boolean => parts.size > 0;
