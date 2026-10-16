import * as THREE from 'three';
import type { Finish } from '../customization/build';

/** Car paint: physical material with clearcoat; finishes from docs/04. */
export function paintMaterial(color: string, finish: Finish): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color) });
  const p: Record<Finish, Partial<THREE.MeshPhysicalMaterialParameters>> = {
    gloss: { roughness: 0.5, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 },
    satin: { roughness: 0.5, metalness: 0.05, clearcoat: 0.35, clearcoatRoughness: 0.35 },
    matte: { roughness: 0.82, metalness: 0, clearcoat: 0 },
    metallic: { roughness: 0.42, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.05 },
    pearl: { roughness: 0.45, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.9, iridescenceIOR: 1.5, iridescenceThicknessRange: [250, 600] },
  };
  m.setValues(p[finish]);
  m.userData.envIntensity = finish === 'metallic' ? 0.7 : 0.45;
  return m;
}
