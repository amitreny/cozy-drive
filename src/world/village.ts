import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { heightAt, PLAZA, type WorldData } from './terrainGen';

const WALLS = [0xf2e3c6, 0xe8c4a0, 0xcfe0d0, 0xf0d7a8, 0xd9c3e0, 0xf5e9da];
const ROOFS = [0xb5523b, 0x8a5a44, 0x4f6d7a, 0xa04848];

/** A ring of cozy houses around the plaza, plus the home garage. Collision boxes included. */
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
  const angles = [40, 75, 110, 145, 255, 285];
  angles.forEach((deg, i) => {
    const a = (deg * Math.PI) / 180, r = PLAZA.r + 9;
    const x = PLAZA.x + Math.sin(a) * r, z = PLAZA.z + Math.cos(a) * r;
    house(x, z, a + Math.PI, 6 + (i % 3), 6, 3.6 + (i % 2) * 0.8, WALLS[i % WALLS.length], ROOFS[i % ROOFS.length]);
  });
  // A well in the middle of the plaza.
  const wy = heightAt(w, PLAZA.x - 6, PLAZA.z + 4);
  const well = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 10), mat(0x9a8f84));
  well.position.set(PLAZA.x - 6, wy + 0.4, PLAZA.z + 4); well.castShadow = true;
  g.add(well);
  world.createCollider(R.ColliderDesc.cylinder(0.6, 1.2).setTranslation(PLAZA.x - 6, wy + 0.4, PLAZA.z + 4));
  return g;
}
