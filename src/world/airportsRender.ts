import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { along, inRect, local, type AirPlace, type Rect } from './airports';
import { S } from './surfaces';
import { heightAt, waterLevelAt, type WorldData } from './terrainGen';

const deg = Math.PI / 180;

function textTexture(text: string, w: number, h: number, fg: string, bg: string | null, font: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export interface AirportsView { group: THREE.Group; update(dt: number, wind: { x: number; z: number }, night: number): void }

/** Runway paint, hangars, towers, windsocks, helipads and piers for every airfield, strip, pad and dock. */
export function buildAirports(R: typeof RAPIER, physics: RAPIER.World, w: WorldData, places: AirPlace[]): AirportsView {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf0c65a, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
  /** A flat strip of paint that follows the ground: from (a0, c) to (a1, c) in a rect's axes, `width` wide. */
  const stripe = (r: { cx: number; cz: number; dir: number }, a0: number, a1: number, c: number, width: number, mat: THREE.Material, lift = 0.05) => {
    const steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 6)), pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      for (const s of [-1, 1]) { const [x, z] = along(r, a, c + (s * width) / 2); pos.push(x, heightAt(w, x, z) + lift, z); }
      if (i < steps) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    // Make sure the face points up.
    const n = g.attributes.normal; if (n.getY(0) < 0) { g.setIndex(idx.map((v, i) => idx[i - (i % 3) + (2 - (i % 3))] ?? v)); g.computeVertexNormals(); }
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; group.add(m);
  };
  /** A line of paint `width` wide along a polyline of (x, z) points, following the ground. */
  const path = (pts: [number, number][], width: number, mat: THREE.Material, lift = 0.05) => {
    const dense: [number, number][] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 3));
      for (let k = 0; k < n; k++) dense.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
    }
    dense.push(pts[pts.length - 1]);
    const pos: number[] = [], idx: number[] = [];
    dense.forEach(([x, z], i) => {
      const [ax, az] = dense[Math.max(0, i - 1)], [bx, bz] = dense[Math.min(dense.length - 1, i + 1)], l = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (-(bz - az) / l) * (width / 2), nz = ((bx - ax) / l) * (width / 2);
      for (const sgn of [1, -1]) { const px = x + sgn * nx, pz = z + sgn * nz; pos.push(px, heightAt(w, px, pz) + lift, pz); }
      if (i < dense.length - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { g.setIndex(idx.map((v, i) => idx[i - (i % 3) + (2 - (i % 3))] ?? v)); g.computeVertexNormals(); }
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; group.add(m);
  };
  const box = (cx: number, cz: number, yaw: number, wx: number, hy: number, dz: number, color: number, y0?: number, collide = true) => {
    const y = y0 ?? heightAt(w, cx, cz);
    const m = new THREE.Mesh(new THREE.BoxGeometry(wx, hy, dz), new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }));
    m.position.set(cx, y + hy / 2, cz); m.rotation.y = yaw; m.castShadow = true; m.receiveShadow = true; group.add(m);
    if (collide) { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw); physics.createCollider(R.ColliderDesc.cuboid(wx / 2, hy / 2, dz / 2).setTranslation(cx, y + hy / 2, cz).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })); }
    return m;
  };
  const lights: THREE.Vector3[] = [], taxiLights: THREE.Vector3[] = [];
  const socks: { pivot: THREE.Group; sock: THREE.Group }[] = [];

  for (const ap of places) {
    const rw = ap.runway;
    if (rw) {
      const L = rw.halfLen, W = rw.halfWid;
      if (rw.surface === S.Asphalt) {
        for (let a = -L + 60; a < L - 60; a += 50) stripe(rw, a, a + 30, 0, 0.9, paint);                 // centreline
        for (const sgn of [-1, 1]) stripe(rw, -L + 3, L - 3, sgn * (W - 1.2), 0.9, paint);                  // edges
        for (const end of [-1, 1]) for (let k = -3; k <= 3; k++) if (k !== 0) stripe(rw, end * (L - 6), end * (L - 36), k * 3.2, 1.8, paint); // piano keys
      } else {
        // Grass strip: white edge boards every 50 m and at the corners.
        for (let a = -L; a <= L; a += 50) for (const sgn of [-1, 1]) { const [x, z] = along(rw, a, sgn * (W + 1)); box(x, z, rw.dir, 1.6, 0.35, 0.25, 0xf4efe6, undefined, false); }
      }
      // Runway numbers near each threshold, read from the approach.
      rw.designators.forEach((num, i) => {
        const end = i === 0 ? -1 : 1, [x, z] = along(rw, end * (L - (rw.surface === S.Asphalt ? 52 : 25)), 0);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(9, 14), new THREE.MeshStandardMaterial({ map: textTexture(num, 128, 192, '#f2f0e8', null, '700 150px Trebuchet MS, sans-serif'), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 }));
        mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = rw.dir + (end < 0 ? 0 : Math.PI);
        mesh.position.set(x, heightAt(w, x, z) + 0.07, z); group.add(mesh);
      });
      // Taxiway centrelines in yellow, curving through the turns, and edge lights along the runway (they glow at night).
      for (const pts of ap.taxiLines) path(pts, 0.35, yellow, 0.06);
      const side = Math.sign(local(rw, ap.spawn.x, ap.spawn.z)[1] || 1);
      for (const tx of ap.taxiways) {
        if (Math.abs(Math.sin(tx.dir - rw.dir)) < 0.5) continue; // the parallel taxiway never meets the runway
        // Hold-short line where each taxiway meets the runway, across its width: dashed bars on the runway side,
        // solid on the side where you hold.
        const [ta] = local(rw, tx.cx, tx.cz), hw = tx.halfWid;
        for (const [k, dashed] of [[4, true], [4.6, true], [5.4, false], [6, false]] as const) {
          if (!dashed) stripe(rw, ta - hw, ta + hw, side * (W + k), 0.25, yellow, 0.06);
          else for (let a = ta - hw; a < ta + hw - 0.5; a += 2) stripe(rw, a, Math.min(a + 1.2, ta + hw), side * (W + k), 0.25, yellow, 0.06);
        }
      }
      for (let a = -L; a <= L; a += 60) for (const sgn of [-1, 1]) { const [x, z] = along(rw, a, sgn * (W + 1.5)); lights.push(new THREE.Vector3(x, heightAt(w, x, z) + 0.35, z)); }
      // Blue edge lights along the taxiways, left out where another paved area joins.
      for (const tx of ap.taxiways) for (let a = -tx.halfLen; a <= tx.halfLen; a += 30) for (const sgn of [-1, 1]) {
        const [x, z] = along(tx, a, sgn * (tx.halfWid + 0.8));
        if (ap.paved.some((p) => p !== tx && inRect(p, x, z, 1)) || inRect(rw, x, z, 1)) continue;
        taxiLights.push(new THREE.Vector3(x, heightAt(w, x, z) + 0.3, z));
      }
      // Windsock beside the runway's middle.
      const [sx, sz] = along(rw, 40, -(W + 22) * Math.sign(local(rw, ap.spawn.x, ap.spawn.z)[1] || 1));
      const sy = heightAt(w, sx, sz), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 6, 6), new THREE.MeshStandardMaterial({ color: 0xdedad2 }));
      pole.position.set(sx, sy + 3, sz); pole.castShadow = true; group.add(pole);
      const pivot = new THREE.Group(); pivot.position.set(sx, sy + 5.8, sz); group.add(pivot);
      const sock = new THREE.Group(); pivot.add(sock);
      for (let k = 0; k < 5; k++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.42 - k * 0.05, 0.47 - k * 0.05, 0.7, 10, 1, true), new THREE.MeshStandardMaterial({ color: k % 2 ? 0xf4efe6 : 0xe8692c, side: THREE.DoubleSide, roughness: 0.7 }));
        seg.rotation.x = Math.PI / 2; seg.position.z = 0.35 + k * 0.7; sock.add(seg);
      }
      socks.push({ pivot, sock });
    }
    // Buildings.
    for (const b of ap.buildings) {
      const y = heightAt(w, b.cx, b.cz);
      if (b.type === 'hangar') hangar(b, y);
      else if (b.type === 'tower') {
        box(b.cx, b.cz, b.dir, 3.2, 9, 3.2, 0xe9e2d4, y);
        const cab = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.3, 2.4, 8), new THREE.MeshStandardMaterial({ color: 0x9cc6d8, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 }));
        cab.position.set(b.cx, y + 10.2, b.cz); group.add(cab);
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0xc8432f })); roof.position.set(b.cx, y + 11.6, b.cz); group.add(roof);
      } else {
        const m = box(b.cx, b.cz, b.dir, b.halfWid * 2, b.type === 'office' ? 4.2 : 3, b.halfLen * 2, b.type === 'office' ? 0xf2e3c6 : 0xb9a07e, y);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(b.halfWid, b.halfLen) + 0.6, 2.4, 4), new THREE.MeshStandardMaterial({ color: 0x4f6d7a, flatShading: true }));
        roof.rotation.y = b.dir + Math.PI / 4; roof.scale.set(1, 1, b.halfLen / b.halfWid); roof.position.set(b.cx, y + m.geometry.parameters.height + 1.2, b.cz); roof.castShadow = true; group.add(roof);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 1.1), new THREE.MeshStandardMaterial({ map: textTexture(b.type === 'office' ? `${ap.name} · Air Cargo & Café` : `${ap.name}`, 640, 108, '#fff4e0', '#3d6e8f', '700 46px Georgia, serif') }));
        const toward = local({ cx: b.cx, cz: b.cz, dir: b.dir }, ap.spawn.x, ap.spawn.z)[1] >= 0 ? 1 : -1;
        // On the long wall that faces the apron.
        const [ox, oz] = along({ cx: b.cx, cz: b.cz, dir: b.dir }, 0, toward * (b.halfWid + 0.06));
        sign.position.set(ox, y + 3.4, oz); sign.rotation.y = b.dir + (toward > 0 ? -Math.PI / 2 : Math.PI / 2);
        group.add(sign);
      }
    }
    // Helipad: a white ring and an H.
    if (ap.pad) {
      const { x, z, r } = ap.pad, y = heightAt(w, x, z) + 0.06;
      const mat = new THREE.MeshStandardMaterial({ map: textTexture('H', 256, 256, '#f2f0e8', null, '700 190px Trebuchet MS, sans-serif'), transparent: true, polygonOffset: true, polygonOffsetFactor: -3 });
      const h = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.1, r * 1.1), mat); h.rotation.x = -Math.PI / 2; h.position.set(x, y + 0.01, z); group.add(h);
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.78, r * 0.86, 48), paint); ring.rotation.x = -Math.PI / 2; ring.position.set(x, y, z); group.add(ring);
    }
    // Pier: planks on posts, solid so you can drive or taxi up to it.
    if (ap.pier) {
      const { x0, z0, x1, z1, width } = ap.pier, len = Math.hypot(x1 - x0, z1 - z0), dir = Math.atan2(x1 - x0, z1 - z0);
      const deckY = Math.max(heightAt(w, x0, z0), waterLevelAt(w, x1, z1) + 1.1) + 0.1;
      box((x0 + x1) / 2, (z0 + z1) / 2, dir, width, 0.25, len, 0x9b6b43, deckY - 0.25);
      for (let a = 0; a <= len; a += 4) for (const sgn of [-1, 1]) {
        const [px, pz] = along({ cx: x0, cz: z0, dir }, a, sgn * (width / 2 - 0.15));
        box(px, pz, dir, 0.25, deckY - waterLevelAt(w, x1, z1) + 1.5, 0.25, 0x6b4a35, waterLevelAt(w, x1, z1) - 1.5, false);
      }
    }
  }

  function hangar(b: Rect, y: number): void {
    const len = b.halfWid * 2, wid = b.halfLen * 2, h = 6;
    box(b.cx, b.cz, b.dir, wid, h, len, 0xd8d2c4, y);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a9aa3, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide, flatShading: true });
    const r2 = new THREE.Group(); r2.position.set(b.cx, y + h, b.cz); r2.rotation.y = b.dir;
    // Arched roof: a half cylinder along the hangar, squashed to a gentle curve.
    const arc = new THREE.Mesh(new THREE.CylinderGeometry(wid / 2, wid / 2, len, 16, 1, true, -Math.PI / 2, Math.PI), roofMat);
    arc.rotation.x = Math.PI / 2; arc.castShadow = true;
    const squash = new THREE.Group(); squash.scale.set(1, 0.45, 1); squash.add(arc); r2.add(squash);
    group.add(r2);
    // Big doors on the apron side.
    const door = new THREE.Mesh(new THREE.PlaneGeometry(wid * 0.82, h * 0.9), new THREE.MeshStandardMaterial({ color: 0x5f6f78, roughness: 0.7 }));
    const [dx, dz] = along({ cx: b.cx, cz: b.cz, dir: b.dir }, len / 2 + 0.05, 0);
    door.position.set(dx, y + h * 0.45, dz); door.rotation.y = b.dir; group.add(door);
  }

  // Runway lights: one instanced mesh; bright only at night.
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffd28a, emissiveIntensity: 0 });
  const lm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), lightMat, lights.length);
  const m4 = new THREE.Matrix4(); lights.forEach((p, i) => lm.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
  group.add(lm);
  const taxiMat = new THREE.MeshStandardMaterial({ color: 0x9fb8ff, emissive: 0x2f5bff, emissiveIntensity: 0 });
  const tm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), taxiMat, taxiLights.length);
  taxiLights.forEach((p, i) => tm.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
  group.add(tm);

  let t = 0;
  return {
    group,
    update(dt, wind, night) {
      t += dt;
      const sp = Math.hypot(wind.x, wind.z), dir = Math.atan2(wind.x, wind.z);
      for (const s of socks) {
        // The sock streams downwind, drooping when the breeze is light, with a little flutter.
        s.pivot.rotation.y = dir + Math.sin(t * 2.3) * 0.08;
        s.sock.rotation.x = Math.max(0, (1 - Math.min(1, sp / 7.7)) * 70 * deg) + Math.sin(t * 3.1) * 0.05;
      }
      lightMat.emissiveIntensity = night * 3.5;
      taxiMat.emissiveIntensity = night * 4.5;
    },
  };
}
