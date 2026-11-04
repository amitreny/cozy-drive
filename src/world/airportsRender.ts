import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { aimDistance } from '../flight/approach';
import { along, CODES, inRect, local, type AirPlace, type Building, type Prop } from './airports';
import { S } from './surfaces';
import { heightAt, waterLevelAt, type WorldData } from './terrainGen';
import { placeModel } from './worldModels';

const deg = Math.PI / 180;

function textTexture(text: string, w: number, h: number, fg: string, bg: string | null, font: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export interface AirportsView {
  group: THREE.Group;
  /** `viewer`: where the pilot's eye is, for the PAPI lights (they show red or white by the angle you see them at). */
  update(dt: number, wind: { x: number; z: number }, night: number, viewer: { x: number; y: number; z: number }): void;
}

/** A soft round glow, for lights that must read from kilometres away. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.9)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
/** PAPI units, nearest the runway first: each shows white above its angle and red below it. */
const PAPI_ANGLES = [3.5, 3.17, 2.83, 2.5].map((d) => (d * Math.PI) / 180);

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
  // Landing-aid lights keep the same size on screen however far away they are (they must read from kilometres
  // out). Each kind is one point cloud, coloured light by light, so dozens of them cost two draw calls.
  const papis: { at: THREE.Vector3; angle: number }[] = [];
  const approachLights: { at: THREE.Vector3; order: number; reach: number }[] = [];
  /** Lighthouse lanterns: a slow flash every few seconds at night, seen from far out at sea. */
  const beacons: THREE.Vector3[] = [];
  const socks: { pivot: THREE.Group; sock: THREE.Group }[] = [];
  /** Per-place model groups, culled by distance. */
  const sites: { group: THREE.Group; x: number; z: number; r: number }[] = [];
  let site = group;

  for (const ap of places) {
    const rw = ap.runway;
    if (rw) {
      const L = rw.halfLen, W = rw.halfWid, big = W / 15, airliner = L >= 1200;
      if (rw.surface === S.Asphalt) {
        for (let a = -L + 60; a < L - 60; a += 50) stripe(rw, a, a + 30, 0, 0.9, paint);                 // centreline
        for (const sgn of [-1, 1]) stripe(rw, -L + 3, L - 3, sgn * (W - 1.2), 0.9, paint);                  // edges
        // Piano keys across the threshold: as many 1.8 m bars as the runway's width takes.
        const keys = Math.floor((W - 3) / 3.2);
        for (const end of [-1, 1]) for (let k = -keys; k <= keys; k++) if (k !== 0) stripe(rw, end * (L - 6), end * (L - 36), k * 3.2, 1.8, paint);
        if (airliner) for (const end of [-1, 1]) {
          // An airliner runway's touchdown zone: the big aiming-point blocks at the aim point, and pairs of bars
          // every 150 m either side of the centreline for the first 900 m.
          const aim = aimDistance(L);
          for (const sgn of [-1, 1]) stripe(rw, end * (L - aim + 30), end * (L - aim - 30), sgn * W * 0.42, 8, paint);
          for (const d of [150, 450, 600, 750, 900]) for (const sgn of [-1, 1]) for (const k of [0, 1, 2].slice(0, d < 500 ? 3 : d < 700 ? 2 : 1)) {
            stripe(rw, end * (L - d + 11), end * (L - d - 11), sgn * (W * 0.42 + (k - 1) * 3), 1.8, paint);
          }
        }
      } else {
        // Grass strip: white edge boards every 50 m and at the corners.
        for (let a = -L; a <= L; a += 50) for (const sgn of [-1, 1]) { const [x, z] = along(rw, a, sgn * (W + 1)); box(x, z, rw.dir, 1.6, 0.35, 0.25, 0xf4efe6, undefined, false); }
      }
      // Runway numbers near each threshold, read from the approach.
      rw.designators.forEach((num, i) => {
        const end = i === 0 ? -1 : 1, [x, z] = along(rw, end * (L - (rw.surface === S.Asphalt ? 52 : 25)), 0);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(9 * Math.max(1, big), 14 * Math.max(1, big)), new THREE.MeshStandardMaterial({ map: textTexture(num, 128, 192, '#f2f0e8', null, '700 150px Trebuchet MS, sans-serif'), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 }));
        mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = rw.dir + (end < 0 ? Math.PI : 0); // upright for a pilot landing over this threshold
        mesh.position.set(x, heightAt(w, x, z) + 0.07, z); group.add(mesh);
      });
      // Taxiway centrelines in yellow, curving through the turns, and edge lights along the runway (they glow at night).
      for (const pts of ap.taxiLines) path(pts, 0.35, yellow, 0.06);
      const side = Math.sign(local(rw, ap.spawn.x, ap.spawn.z)[1] || 1);
      for (const tx of ap.taxiways) {
        if (Math.abs(Math.sin(tx.dir - rw.dir)) < 0.5) continue; // the parallel taxiway never meets the runway
        // Hold-short line where each taxiway meets the runway, across its width: dashed bars on the runway side,
        // solid on the side where you hold.
        const [ta] = local(rw, tx.cx, tx.cz), hw = tx.halfWid, hold = CODES[ap.code].hold;
        for (const [k0, dashed] of [[0, true], [0.6, true], [1.4, false], [2, false]] as const) {
          const k = hold + k0;
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
      // Landing aids at each end. PAPI: four lights beside the aim point, on the side away from the taxiway; from
      // the 3° glide path you see two white and two red, all white when high, all red when low.
      const papiSide = -Math.sign(local(rw, ap.spawn.x, ap.spawn.z)[1] || 1), aimD = aimDistance(L);
      for (const end of [1, -1]) {
        PAPI_ANGLES.forEach((angle, i) => {
          const [x, z] = along(rw, -end * (L - aimD), papiSide * (W + 12 + i * 9)), y = heightAt(w, x, z);
          box(x, z, rw.dir, 1.6, 0.45, 0.6, 0x3a3f44, y, false);
          papis.push({ at: new THREE.Vector3(x, y + 0.6, z), angle });
        });
        // Approach lights (asphalt runways): a line along the extended centreline with a crossbar 150 m out; an
        // airliner runway's run out 900 m (a full CAT I system) with a second crossbar at 300 m. Out over the sea
        // they stand on the water, as on piles.
        if (rw.surface !== S.Asphalt) continue;
        const reach = airliner ? 900 : 300, bar = airliner ? 22 : 15;
        const lightAt = (x: number, z: number) => new THREE.Vector3(x, Math.max(heightAt(w, x, z), waterLevelAt(w, x, z)) + 0.8, z);
        for (let d = 30; d <= reach; d += 30) { const [x, z] = along(rw, -end * (L + d), 0); approachLights.push({ at: lightAt(x, z), order: d, reach }); }
        for (const d of airliner ? [150, 300] : [150]) for (let c = -bar; c <= bar; c += 5) {
          if (Math.abs(c) < 3) continue;
          const [x, z] = along(rw, -end * (L + d), c);
          approachLights.push({ at: lightAt(x, z), order: -1, reach });
        }
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
    // Buildings and scenery: published models fitted to their footprints (worldModels.ts).
    // Each place's models go in their own group, hidden beyond the fog (update) so far airports cost nothing.
    site = new THREE.Group(); group.add(site);
    let reach = 0;
    for (const o of [...ap.buildings.map((b) => ({ x: b.cx, z: b.cz })), ...ap.props]) reach = Math.max(reach, Math.hypot(o.x - ap.spawn.x, o.z - ap.spawn.z));
    sites.push({ group: site, x: ap.spawn.x, z: ap.spawn.z, r: reach + 120 });
    for (const b of ap.buildings) building(ap, b);
    for (const p of ap.props) prop(p);
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

  /** A solid box (an oriented cuboid collider) where a model stands, so cars and aircraft can't pass through it. */
  function solid(x: number, z: number, y: number, yaw: number, size: THREE.Vector3): void {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    physics.createCollider(R.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setTranslation(x, y + size.y / 2, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
  }
  /** A painted sign board on a building's front wall (`a` metres out from its centre), `up` metres high. */
  function sign(text: string, b: { cx: number; cz: number; dir: number }, a: number, up: number, width: number): void {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 6), new THREE.MeshStandardMaterial({ map: textTexture(text, 768, 128, '#fff4e0', '#3d6e8f', '700 52px Georgia, serif') }));
    const [x, z] = along(b, a + 0.08, 0);
    m.position.set(x, up, z); m.rotation.y = b.dir; site.add(m);
  }

  function building(ap: AirPlace, b: Building): void {
    const y = heightAt(w, b.cx, b.cz), at = { x: b.cx, y, z: b.cz };
    if (b.type === 'terminal') {
      // A row of office blocks along the frontage, fronts on the apron line: the terminal building.
      const probe = placeModel('terminal', at, b.dir, { height: b.height });
      if (!probe) return;
      const unit = probe.size.x, n = Math.max(1, Math.floor((b.halfWid * 2) / unit)), front = b.halfLen - probe.size.z / 2;
      for (let i = 0; i < n; i++) {
        const [x, z] = along(b, front, (i - (n - 1) / 2) * unit), m = placeModel('terminal', { x, y: heightAt(w, x, z), z }, b.dir, { height: b.height })!;
        site.add(m.object);
      }
      const [cx, cz] = along(b, front, 0);
      solid(cx, cz, y, b.dir, new THREE.Vector3(n * unit, probe.size.y, probe.size.z));
      sign(`${ap.name}`, b, front + probe.size.z / 2, y + probe.size.y * 0.62, Math.min(24, probe.size.y * 2.2)); // a name board across the upper floors
      return;
    }
    const m = placeModel(b.type, at, b.dir, { width: b.halfWid * 2, height: b.height, length: b.halfLen * 2 });
    if (!m) return;
    site.add(m.object);
    solid(b.cx, b.cz, y, b.dir, m.size);
    if (b.type === 'office') sign(`${ap.name} · Air Cargo & Café`, b, m.size.z / 2, y + m.size.y * 0.3, Math.min(9, m.size.x * 0.9));
    if (b.type === 'lighthouse') beacons.push(new THREE.Vector3(b.cx, y + m.size.y * 0.86, b.cz));
  }

  function prop(p: Prop): void {
    const water = p.model === 'sailboat', y = water ? waterLevelAt(w, p.x, p.z) - 0.15 : heightAt(w, p.x, p.z);
    const m = placeModel(p.model, { x: p.x, y, z: p.z }, p.yaw, { length: p.length, height: p.length }); // a palm fits by height
    if (!m) return;
    site.add(m.object);
    if (p.model === 'container') solid(p.x, p.z, y, p.yaw, m.size);
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

  const glow = glowTexture();
  const cloud = (pts: THREE.Vector3[], px: number, additive = false) => {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pts.length * 3).fill(1), 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ size: px, sizeAttenuation: false, map: glow, vertexColors: true, transparent: true, depthWrite: false, fog: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    m.frustumCulled = false; m.renderOrder = 2; group.add(m);
    return g.attributes.color as THREE.BufferAttribute;
  };
  const papiColor = cloud(papis.map((p) => p.at), 10), approachColor = cloud(approachLights.map((l) => l.at), 7);
  const beaconColor = beacons.length ? cloud(beacons, 26, true) : null; // additive: a dark lantern adds nothing

  let t = 0;
  return {
    group,
    update(dt, wind, night, viewer) {
      t += dt;
      // Draw a place's buildings only within the fog, which opens out with height (as in main.ts).
      const seeTo = 7000 + Math.max(0, viewer.y) * 6;
      for (const st of sites) st.group.visible = Math.hypot(st.x - viewer.x, st.z - viewer.z) - st.r < seeTo;
      const sp = Math.hypot(wind.x, wind.z), dir = Math.atan2(wind.x, wind.z);
      for (const s of socks) {
        // The sock streams downwind, drooping when the breeze is light, with a little flutter.
        s.pivot.rotation.y = dir + Math.sin(t * 2.3) * 0.08;
        s.sock.rotation.x = Math.max(0, (1 - Math.min(1, sp / 7.7)) * 70 * deg) + Math.sin(t * 3.1) * 0.05;
      }
      lightMat.emissiveIntensity = night * 3.5;
      papis.forEach((p, i) => {
        const seen = Math.atan2(viewer.y - p.at.y, Math.hypot(viewer.x - p.at.x, viewer.z - p.at.z));
        if (seen > p.angle) papiColor.setXYZ(i, 1, 1, 1); else papiColor.setXYZ(i, 1, 0.2, 0.13);
      });
      papiColor.needsUpdate = true;
      // Approach lights: soft by day, bright at night with a flash running in towards the runway twice a second.
      const phase = (t * 2) % 1, base = 0.55 + 0.45 * night;
      approachLights.forEach((l, i) => {
        const flash = night > 0 && l.order > 0 && Math.abs(l.order - (1 - phase) * l.reach) < 15;
        if (flash) approachColor.setXYZ(i, 1, 1, 1); else approachColor.setXYZ(i, base, base * 0.95, base * 0.8);
      });
      approachColor.needsUpdate = true;
      taxiMat.emissiveIntensity = night * 4.5;
      // The lighthouse: dark by day; at dusk and night a warm flash every five seconds, fading in and out.
      if (beaconColor) {
        const pulse = Math.max(0, Math.cos(((t % 5) / 5) * Math.PI * 2)) ** 6, k = Math.min(1, night * 1.5) * (0.15 + 0.85 * pulse);
        beacons.forEach((_, i) => beaconColor.setXYZ(i, k, k * 0.92, k * 0.7));
        beaconColor.needsUpdate = true;
      }
    },
  };
}
