import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Build } from "../customization/build";
import { paintMaterial } from "./paint";
export { paintMaterial };
import { BODIES } from './bodyDefs';
import { buildBody } from './carBody';
import { buildWheel, type RimStyle } from './carParts';
import { buildKenneyModel } from "./kenneyModel";
import { hasModel } from "./modelLibrary";
import { CAR_TYPES, restGroundY, type VehicleSpec } from './spec';

export interface CarModel {
  root: THREE.Group; body: THREE.Group; wheels: THREE.Group[]; headlights: THREE.MeshStandardMaterial[];
  reflective: THREE.MeshStandardMaterial[]; dispose(): void;
}

const RIMS: Record<string, RimStyle> = { pip: 'alloy5', badger: 'offroad6', biscuit: 'steel', skipper: 'beadlock' };

/** A car built from its body profile: shaped panels, glass, interior, lights, trim and real wheels. */
export function buildCarModel(spec: VehicleSpec, build: Build): CarModel {
  if (hasModel(spec.id)) return buildKenneyModel(spec, build);
  const def = BODIES[spec.id], stock = CAR_TYPES[spec.id] ?? spec;
  const root = new THREE.Group(), body = new THREE.Group(), shell = new THREE.Group();
  root.add(body); body.add(shell);
  shell.position.y = restGroundY(stock); // shell coordinates are ground-relative, like the body defs
  const W = def.width, hw = W / 2;

  const paint = paintMaterial(build.paint, build.finish);
  const accent = paintMaterial(build.accent, build.finish);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x14202a, roughness: 0.04, metalness: 0.1, clearcoat: 1, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false });
  glass.userData.envIntensity = 0.7;
  const trim = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.65 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.92 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.12, metalness: 1 });
  const interior = new THREE.MeshStandardMaterial({ color: 0x3b332c, roughness: 0.85 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.9 });
  const head = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe6b0, emissiveIntensity: 0.4, roughness: 0.1 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x8a1414, emissive: 0xff2a1a, emissiveIntensity: 0.35, roughness: 0.2 });
  const plate = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.5 });
  const reflective = [paint, accent, glass, chrome, head, tail];

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, parent: THREE.Object3D = shell) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  };
  const rbox = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, r = 0.03) =>
    add(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.01, h / 2.01, d / 2.01)), mat, x, y, z);
  const tube = (a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) => {
    const m = add(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 10), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  };

  // Body shell, windows, frames and door seams.
  const parts = buildBody(def, { front: { z: stock.front.z, r: stock.wheelRadius }, rear: { z: stock.rear.z, r: stock.wheelRadius } });
  add(parts.body, [paint, accent, glass]);
  if (parts.frames) add(parts.frames, trim);
  if (parts.glass) add(parts.glass, glass).castShadow = false;
  const sideX = (side: number, y: number, z: number, out = 0) => parts.deform(side * (hw + out), y, z);

  // Interior: seats, dashboard and a steering wheel on the left (driver) side.
  for (const s of def.seats) for (const side of [1, -1]) {
    rbox(0.46, 0.12, 0.48, seatMat, side * hw * 0.42, s.y, s.z, 0.04);
    rbox(0.46, 0.55, 0.12, seatMat, side * hw * 0.42, s.y + 0.3, s.z - 0.24, 0.05);
  }
  const dashZ = def.seats[0].z + 0.7;
  rbox(W * 0.82, 0.16, 0.35, interior, 0, def.belt - 0.06, dashZ, 0.04);
  const wheel = add(new THREE.TorusGeometry(0.17, 0.022, 8, 24), trim, hw * 0.42, def.belt + 0.05, dashZ - 0.25);
  wheel.rotation.x = -0.35;

  // Lights.
  const hl = def.headlights;
  for (const side of [1, -1]) {
    void (hl.round
      ? add(new THREE.CylinderGeometry(hl.size / 2, hl.size / 2, 0.06, 24).rotateX(Math.PI / 2), head, side * hl.x, hl.y, hl.z)
      : rbox(hl.size, hl.size * 0.42, 0.06, head, side * hl.x, hl.y, hl.z, 0.03));
    if (hl.round) add(new THREE.TorusGeometry(hl.size / 2, 0.018, 8, 24), chrome, side * hl.x, hl.y, hl.z + 0.03);
    const tl = def.taillights;
    rbox(tl.w, tl.h, 0.05, tail, side * tl.x, tl.y, tl.z, 0.02);
  }

  // Grille, bumpers, plates, mirrors, handles, exhaust.
  const gr = def.grille, bp = def.bumpers, endW = W * (1 - def.roundness * 0.85);
  rbox(gr.w, gr.h, 0.05, trim, 0, gr.y, gr.z, 0.02);
  for (let i = 1; i < 4; i++) rbox(gr.w * 0.94, 0.012, 0.02, chrome, 0, gr.y - gr.h / 2 + (gr.h * i) / 4, gr.z + 0.025, 0.005);
  rbox(endW, bp.h, 0.2, spec.id === 'badger' ? trim : paint, 0, bp.y, bp.front - 0.06, 0.06);
  rbox(endW, bp.h, 0.2, spec.id === 'badger' ? trim : paint, 0, bp.y, bp.rear + 0.06, 0.06);
  rbox(endW * 0.98, 0.035, 0.21, trim, 0, bp.y - bp.h * 0.15, bp.front - 0.055, 0.015);
  rbox(endW * 0.98, 0.035, 0.21, trim, 0, bp.y - bp.h * 0.15, bp.rear + 0.055, 0.015);
  rbox(0.38, 0.11, 0.015, plate, 0, bp.y + 0.01, bp.front + 0.045, 0.01);
  rbox(0.38, 0.11, 0.015, plate, 0, bp.y + 0.01, bp.rear - 0.045, 0.01);
  if (!def.open) for (const side of [1, -1]) {
    const m = def.mirrors, mx = sideX(side, m.y, m.z, 0.12);
    rbox(0.05, 0.05, 0.1, trim, sideX(side, m.y, m.z, 0.03), m.y, m.z, 0.015);
    rbox(0.06, 0.13, 0.18, paint, mx, m.y + 0.03, m.z, 0.03);
    for (const dz of def.doors) rbox(0.025, 0.035, 0.13, chrome, sideX(side, def.belt - 0.12, dz - 0.2, 0.015), def.belt - 0.12, dz - 0.2, 0.012);
  }
  const ex = def.exhaust;
  add(new THREE.CylinderGeometry(0.04, 0.045, 0.2, 14).rotateX(Math.PI / 2), chrome, ex.x, ex.y, ex.z);

  // Character pieces per car type.
  const roofY = def.roof, V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const archFlare = (z: number) => {
    for (const side of [1, -1]) {
      const f = add(new THREE.TorusGeometry(stock.wheelRadius + def.archClearance + 0.02, 0.055, 6, 18, Math.PI * 1.05), trim, side * (hw + 0.03), stock.wheelRadius, z);
      f.rotation.set(0, Math.PI / 2, -0.025);
    }
  };
  if (spec.id === 'badger') {
    archFlare(stock.front.z); archFlare(stock.rear.z);
    for (const side of [1, -1]) tube(V(side * hw * 0.8, roofY + 0.08, -1.9), V(side * hw * 0.8, roofY + 0.08, 0.4), 0.022, trim);
    for (const z of [-1.6, -0.9, -0.2]) tube(V(-hw * 0.8, roofY + 0.09, z), V(hw * 0.8, roofY + 0.09, z), 0.02, trim);
    for (const z of [-1.9, 0.4]) for (const side of [1, -1]) tube(V(side * hw * 0.8, roofY, z), V(side * hw * 0.8, roofY + 0.08, z), 0.022, trim);
    tube(V(-0.7, 0.62, 2.28), V(0.7, 0.62, 2.28), 0.04, trim);
    for (const side of [1, -1]) tube(V(side * 0.45, 0.6, 2.28), V(side * 0.4, 1.02, 2.22), 0.035, trim);
    tube(V(-0.42, 1.0, 2.23), V(0.42, 1.0, 2.23), 0.035, trim);
    const spare = buildWheel(stock.wheelRadius, 0.26, build.tyre, 'offroad6', { rubber, rim: chrome, disc: trim, caliper: trim }, 1);
    spare.rotation.y = Math.PI / 2; spare.position.set(0, 1.05, def.bumpers.rear - 0.12); shell.add(spare);
  } else if (spec.id === 'biscuit') {
    rbox(W * 0.78, 0.16, 2.6, accent, 0, roofY + 0.07, -0.25, 0.07);
    add(new THREE.TorusGeometry(0.16, 0.025, 6, 24), chrome, 0, 1.05, 2.335);
    for (const side of [1, -1]) rbox(0.03, 0.22, 0.6, trim, sideX(side, 1.0, -1.3, 0.01), 1.0, -1.3, 0.01); // engine vents
  } else if (spec.id === 'skipper') {
    const y0 = 0.9, y1 = 1.75;
    for (const side of [1, -1]) {
      tube(V(side * 0.62, y0, -0.9), V(side * 0.52, y1, -0.75), 0.04, accent);
      tube(V(side * 0.62, y0, 0.3), V(side * 0.52, y1, -0.05), 0.04, accent);
      tube(V(side * 0.52, y1, -0.75), V(side * 0.52, y1, -0.05), 0.04, accent);
      tube(V(side * 0.62, y0, -0.9), V(side * 0.5, 0.8, -1.5), 0.035, accent);
      tube(V(side * 0.7, 0.55, 0.3), V(side * 0.7, 0.55, -0.9), 0.03, trim); // nerf bars
    }
    tube(V(-0.52, y1, -0.75), V(0.52, y1, -0.75), 0.04, accent);
    tube(V(-0.52, y1, -0.05), V(0.52, y1, -0.05), 0.04, accent);
    tube(V(-0.62, y0 + 0.4, -0.9), V(0.62, y0 + 0.4, -0.9), 0.035, accent);
    rbox(0.6, 0.35, 0.5, trim, 0, 1.05, -1.2, 0.05); // exposed engine
    for (const z of [-1.05, -1.2, -1.35]) rbox(0.64, 0.02, 0.03, chrome, 0, 1.23, z, 0.008);
  }
  if (build.snorkel) {
    const sx = -(hw + 0.05), z = stock.front.z - 0.1;
    tube(V(sx, 0.95, z), V(sx, roofY - 0.05, z - 0.35), 0.055, trim);
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 12).rotateX(Math.PI / 2), trim, sx, roofY - 0.02, z - 0.32);
  }

  // Wheels (positions are driven by the physics each frame).
  const tyreW = spec.wheelWidth * (build.tyre === 'sand' ? 1.3 : 1);
  const rimMat = build.carType === 'skipper' || build.carType === 'biscuit' ? (build.carType === 'biscuit' ? plate : accent) : chrome;
  const wheelMats = { rubber, rim: rimMat, disc: new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.4, metalness: 0.8 }), caliper: new THREE.MeshStandardMaterial({ color: 0xb8362a, roughness: 0.4 }) };
  const wheels = [true, false, true, false].map((left) => {
    const g = buildWheel(spec.wheelRadius, tyreW, build.tyre, RIMS[spec.id] ?? 'alloy5', wheelMats, left ? 1 : -1);
    root.add(g); return g;
  });

  return {
    root, body, wheels, headlights: [head], reflective: [...reflective, rimMat as THREE.MeshStandardMaterial],
    dispose: () => root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: THREE.Material) => m.dispose());
    }),
  };
}
