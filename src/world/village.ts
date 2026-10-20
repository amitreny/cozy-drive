import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { heightAt, PLAZA, type WorldData } from './terrainGen';


/** The home garage on the plaza and the well (the shops around the plaza come from lots.ts / town.ts). */
export function buildVillage(R: typeof RAPIER, world: RAPIER.World, w: WorldData): THREE.Group {
  const g = new THREE.Group();
  const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true });
  const house = (x: number, z: number, yaw: number, wd: number, dp: number, ht: number, wall: number, roof: number, garage = false) => {
    const y = heightAt(w, x, z);
    const hg = new THREE.Group();
    hg.position.set(x, y, z); hg.rotation.y = yaw;
    const body = new THREE.Mesh(new THREE.BoxGeometry(wd, ht, dp), mat(wall));
    body.position.y = ht / 2 - 0.3; body.castShadow = true; body.receiveShadow = true;
    const rf = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(wd, dp) / 2 + 0.4, ht * 0.65, 4), mat(roof));
    rf.rotation.y = Math.PI / 4; rf.scale.set(1, 1, dp / wd); rf.position.y = ht - 0.3 + ht * 0.32; rf.castShadow = true;
    const door = new THREE.Mesh(new THREE.BoxGeometry(garage ? wd * 0.6 : 1, garage ? ht * 0.7 : 2, 0.1), mat(garage ? 0xd9704f : 0x6b4a35));
    door.position.set(0, (garage ? ht * 0.35 : 1) - 0.3, dp / 2 + 0.05);
    hg.add(body, rf, door);
    for (const sx of [-1, 1]) if (!garage) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.1), new THREE.MeshStandardMaterial({ color: 0xffe6a8, emissive: 0xffc870, emissiveIntensity: 0.25 }));
      win.position.set(sx * wd * 0.3, ht * 0.55, dp / 2 + 0.05); hg.add(win);
    }
    g.add(hg);
    const q = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
    world.createCollider(R.ColliderDesc.cuboid(wd / 2, ht / 2 + 1, dp / 2).setTranslation(x, y + ht / 2 - 0.5, z).setRotation(q));
  };
  // Home garage on the north side, facing the plaza.
  // Home garage on the north-west side, facing the plaza; the village road runs north-south through the gaps.
  const ga = (-35 * Math.PI) / 180, gr = PLAZA.r + 9;
  house(PLAZA.x + Math.sin(ga) * gr, PLAZA.z + Math.cos(ga) * gr, ga + Math.PI, 10, 8, 4.5, 0xf2e3c6, 0x4f6d7a, true);
  // A well in the middle of the plaza.
  const wy = heightAt(w, PLAZA.x - 6, PLAZA.z + 4);
  const well = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 10), mat(0x9a8f84));
  well.position.set(PLAZA.x - 6, wy + 0.4, PLAZA.z + 4); well.castShadow = true;
  g.add(well);
  world.createCollider(R.ColliderDesc.cylinder(0.6, 1.2).setTranslation(PLAZA.x - 6, wy + 0.4, PLAZA.z + 4));
  return g;
}
