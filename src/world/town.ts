import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { BUILDING_SCALE, type BusinessType, type Lot } from './lots';
import { heightAt, type WorldData } from './terrainGen';
import { kitVariation, modelParts } from './townModels';

/** Shop sign colours per business (background, text). */
const SIGN: Record<BusinessType, [string, string]> = {
  post: ['#c8432f', '#fff4e0'], bakery: ['#f3c98b', '#6b3f22'], cafe: ['#5b7f5a', '#fff8e8'], grocer: ['#3d6e8f', '#fff8e8'], hardware: ['#4a4a52', '#ffd34d'],
  florist: ['#e9a6c0', '#5a2440'], fish: ['#2f6f8f', '#e8fbff'], woodworks: ['#8a5a36', '#fff1d6'], farm: ['#b5523b', '#fff4e0'], honey: ['#e8b23a', '#4a2e10'], icecream: ['#f6b8c8', '#5a2b3a'],
};
const AWNING: Record<BusinessType, number> = {
  post: 0xc8432f, bakery: 0xe39b4f, cafe: 0x5b7f5a, grocer: 0x3d6e8f, hardware: 0x4a4a52, florist: 0xd879a0, fish: 0x2f6f8f, woodworks: 0x8a5a36, farm: 0xb5523b, honey: 0xe8b23a, icecream: 0xf08aa8,
};

function signTexture(text: string, [bg, fg]: [string, string]): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, 512, 96);
  g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(8, 8, 496, 80);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 46; g.font = `700 ${size}px Georgia, serif`;
  while (g.measureText(text).width > 460 && size > 20) { size -= 2; g.font = `700 ${size}px Georgia, serif`; }
  g.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** Mailbox number plate, shared material per house number. */
function plateTexture(n: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d')!; g.fillStyle = '#f4efe6'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#2c2622';
  g.font = '700 40px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 35);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export interface Town { group: THREE.Group; setNight(amount: number): void }

/** Every home and business: Kenney buildings (instanced by model and colour), gardens, driveways, letterboxes and signs. */
export function buildTown(R: typeof RAPIER, physics: RAPIER.World, w: WorldData): Town {
  const group = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  const place = (x: number, y: number, z: number, yaw: number, sx: number, sy = sx, sz = sx) => m4.compose(p.set(x, y, z), q.setFromAxisAngle(up, yaw), s.set(sx, sy, sz)).clone();
  /** Instances of one model part list, with an optional texture override. */
  const instanced = (key: string, mats: THREE.Matrix4[], tex: THREE.Texture | null, shadow = true, tint?: number) => {
    for (const part of modelParts(key)) {
      const mat = part.material.clone();
      if (tex) mat.map = tex;
      if (tint !== undefined) mat.color.setHex(tint, THREE.SRGBColorSpace);
      const mesh = new THREE.InstancedMesh(part.geometry, mat, mats.length);
      mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.computeBoundingSphere();
      group.add(mesh);
    }
  };
  const lit = (x: number, z: number, at: number) => Math.max(at, heightAt(w, x, z));

  // ---- Buildings, by model and colour variation ----
  const byModel = new Map<string, THREE.Matrix4[]>();
  for (const l of w.lots) {
    const folder = l.kind === 'house' ? 'kenney-suburban' : 'kenney-commercial';
    const k = `${folder}/${l.model}|${l.variant}`;
    (byModel.get(k) ?? byModel.set(k, []).get(k)!).push(place(l.x, l.y - 0.05, l.z, l.yaw, BUILDING_SCALE));
    // Solid walls (a little inside the footprint so wide eaves don't snag the car).
    const qq = new THREE.Quaternion().setFromAxisAngle(up, l.yaw);
    physics.createCollider(R.ColliderDesc.cuboid(l.w / 2 - 0.4, l.h / 2, l.d / 2 - 0.4).setTranslation(l.x, l.y + l.h / 2, l.z).setRotation({ x: qq.x, y: qq.y, z: qq.z, w: qq.w }).setFriction(0.5));
  }
  for (const [k, mats] of byModel) {
    const [key, v] = k.split('|');
    instanced(key, mats, kitVariation(key.split('/')[0], +v));
  }

  // ---- Gardens: fences round the back and sides, planters by the door, a driveway to the road ----
  const fences: THREE.Matrix4[] = [], planters: THREE.Matrix4[] = [], drive: number[] = [], posts: THREE.Matrix4[] = [], boxes: THREE.Matrix4[] = [];
  const FENCE = 0.48 * 5; // fence piece length at scale 5
  let houseNo = 0;
  const plates: { lot: Lot; n: number }[] = [];
  for (const l of w.lots) {
    const fx = Math.sin(l.yaw), fz = Math.cos(l.yaw), sx = fz, sz = -fx;
    const at = (a: number, b: number) => [l.x + sx * a + fx * b, l.z + sz * a + fz * b] as const;
    if (l.kind === 'house') {
      // Back fence and two sides, from the front of the house to a garden 9 m deep behind it.
      const gw = l.w / 2 + 3, back = -(l.d / 2 + 9), front = l.d / 2 - 1;
      for (let a = -gw + FENCE / 2; a <= gw - FENCE / 2 + 0.01; a += FENCE) { const [x, z] = at(a, back); fences.push(place(x, lit(x, z, l.y - 0.2), z, l.yaw, 5)); }
      for (const side of [-1, 1]) for (let b = back + FENCE / 2; b <= front - FENCE / 2 + 0.01; b += FENCE) { const [x, z] = at(side * gw, b); fences.push(place(x, lit(x, z, l.y - 0.2), z, l.yaw + Math.PI / 2, 5)); }
      for (const side of [-1, 1]) { const [x, z] = at(side * 1.6, l.d / 2 + 0.9); planters.push(place(x, l.y, z, l.yaw, 4)); }
      // Driveway: from beside the house to the road edge, as a strip that follows the ground.
      const [dx, dz] = at(l.w / 2 - 2.2 > 0 ? (l.w / 2 - 2.2) : 0, l.d / 2);
      const rx = l.road[0] + sx * (l.w / 2 - 2.2), rz = l.road[1] + sz * (l.w / 2 - 2.2);
      drive.push(dx, dz, rx, rz);
      // Letterbox on a post at the front, by the road.
      houseNo++;
      const [mx, mz] = l.front, my = heightAt(w, mx, mz);
      posts.push(place(mx, my + 0.55, mz, l.yaw, 1));
      boxes.push(place(mx, my + 1.15, mz, l.yaw, 1));
      plates.push({ lot: l, n: houseNo });
    }
  }
  instanced('kenney-suburban/fence', fences, null, false);
  instanced('kenney-suburban/planter', planters, null, false);
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), new THREE.MeshStandardMaterial({ color: 0x6b4a35, roughness: 0.8 }), posts.length);
  posts.forEach((m, i) => postMesh.setMatrixAt(i, m));
  const boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.3, 0.5), new THREE.MeshStandardMaterial({ color: 0xc8432f, roughness: 0.6 }), boxes.length);
  boxes.forEach((m, i) => boxMesh.setMatrixAt(i, m));
  postMesh.castShadow = boxMesh.castShadow = true;
  group.add(postMesh, boxMesh);
  // House numbers on the letterboxes (facing the road).
  const plateGeo = new THREE.PlaneGeometry(0.26, 0.26);
  for (const { lot, n } of plates) {
    const mesh = new THREE.Mesh(plateGeo, new THREE.MeshStandardMaterial({ map: plateTexture(n), roughness: 0.7 }));
    const [mx, mz] = lot.front, fx = -Math.sin(lot.yaw), fz = -Math.cos(lot.yaw); // the road side of the box
    mesh.position.set(mx + fx * 0.26, heightAt(w, mx, mz) + 1.15, mz + fz * 0.26); mesh.rotation.y = lot.yaw + Math.PI;
    group.add(mesh);
  }
  // Driveways as one ground-hugging mesh.
  const dv: number[] = [], di: number[] = [];
  for (let k = 0; k < drive.length; k += 4) {
    const [ax, az, bx, bz] = drive.slice(k, k + 4), len = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(len / 2));
    const ux = (bx - ax) / (len || 1), uz = (bz - az) / (len || 1), hw = 1.5, base = dv.length / 3;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const sgn of [-1, 1]) { const px = x + uz * hw * sgn, pz = z - ux * hw * sgn; dv.push(px, heightAt(w, px, pz) + 0.05, pz); }
      if (i < steps) { const a = base + i * 2; di.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
  }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dv, 3)); dg.setIndex(di); dg.computeVertexNormals();
  const driveMesh = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ color: 0x8d8579, roughness: 0.95 }));
  driveMesh.receiveShadow = true; group.add(driveMesh);

  // ---- Shops: name board over the door, a coloured awning, parasols for cafés ----
  const shopWindows: THREE.MeshStandardMaterial[] = [];
  for (const l of w.lots) {
    if (l.kind !== 'shop' || !l.business) continue;
    const fx = Math.sin(l.yaw), fz = Math.cos(l.yaw), sx = fz, sz = -fx;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(l.w - 1, 7), 1.25), new THREE.MeshStandardMaterial({ map: signTexture(l.name, SIGN[l.business]), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.05 }));
    board.material.emissiveMap = board.material.map; shopWindows.push(board.material);
    board.position.set(l.x + fx * (l.d / 2 + 0.12), l.y + 3.6, l.z + fz * (l.d / 2 + 0.12)); board.rotation.y = l.yaw;
    group.add(board);
    const awn = modelParts('kenney-commercial/detail-awning-wide');
    for (const part of awn) {
      const mat = part.material.clone(); mat.color.setHex(AWNING[l.business], THREE.SRGBColorSpace);
      const mesh = new THREE.Mesh(part.geometry, mat);
      mesh.position.set(l.x + fx * (l.d / 2 - 0.6), l.y + 2.0, l.z + fz * (l.d / 2 - 0.6)); mesh.rotation.y = l.yaw; mesh.scale.setScalar(Math.min(1.3, l.w / 6) * BUILDING_SCALE * 0.8);
      mesh.castShadow = true; group.add(mesh);
    }
    if (l.business === 'cafe' || l.business === 'icecream' || l.business === 'bakery') {
      for (const side of [-1, 1]) {
        const x = l.x + fx * (l.d / 2 + 3.5) + sx * side * 2.6, z = l.z + fz * (l.d / 2 + 3.5) + sz * side * 2.6;
        for (const part of modelParts(side < 0 ? 'kenney-commercial/detail-parasol-a' : 'kenney-commercial/detail-parasol-b')) {
          const mesh = new THREE.Mesh(part.geometry, part.material); mesh.position.set(x, heightAt(w, x, z), z); mesh.scale.setScalar(5.5); mesh.castShadow = true; group.add(mesh);
        }
      }
    }
  }
  return { group, setNight: (a) => { for (const m of shopWindows) m.emissiveIntensity = 0.05 + a * 0.6; } };
}
