import * as THREE from 'three';
import type { Place, Viewpoint } from './places';

/** Gnomes to collect and viewpoints to visit, with gentle idle animation. Pure presentation + proximity checks. */
export class Discoveries {
  readonly group = new THREE.Group();
  private gnomeParts: THREE.InstancedMesh[] = [];
  private rings = new Map<string, THREE.Mesh>();
  private t = 0;
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private p = new THREE.Vector3(); private s = new THREE.Vector3();

  constructor(private gnomes: Place[], private viewpoints: Viewpoint[], private found: ReadonlySet<string>) {
    const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true });
    const parts: [THREE.BufferGeometry, THREE.Material][] = [
      [new THREE.CylinderGeometry(0.16, 0.26, 0.45, 8).translate(0, 0.22, 0), mat(0x3d6fb6)],      // coat
      [new THREE.SphereGeometry(0.15, 10, 8).translate(0, 0.55, 0), mat(0xf2c6a0)],                // face
      [new THREE.ConeGeometry(0.15, 0.3, 8).translate(0, 0.42, 0.07), mat(0xf4f1ea)],              // beard
      [new THREE.ConeGeometry(0.17, 0.45, 10).translate(0, 0.86, 0), mat(0xd23a2a)],               // hat
    ];
    for (const [g, m] of parts) {
      const im = new THREE.InstancedMesh(g, m, gnomes.length);
      im.castShadow = true; im.frustumCulled = false;
      this.gnomeParts.push(im); this.group.add(im);
    }
    const wood = mat(0x8a5a3a), sign = mat(0xf2e3c6);
    for (const v of viewpoints) {
      const post = new THREE.Group();
      post.position.set(v.x, v.y, v.z); post.rotation.y = v.yaw;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.8, 8).translate(0, 0.9, 0), wood);
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.06).translate(0, 1.55, 0.06), sign);
      pole.castShadow = board.castShadow = true;
      post.add(pole, board);
      const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.6, 48).rotateX(-Math.PI / 2).translate(0, 0.15, 0),
        new THREE.MeshBasicMaterial({ color: 0xffd36e, transparent: true, opacity: 0.6, depthWrite: false }));
      post.add(ring);
      this.rings.set(v.id, ring);
      this.group.add(post);
    }
    this.update(0, new THREE.Vector3(1e9, 0, 1e9), 0, () => {}, () => {});
  }

  /** Animate, and report gnomes driven past and viewpoints stopped at. */
  update(dt: number, car: THREE.Vector3, speed: number, onGnome: (g: Place) => void, onView: (v: Viewpoint) => void): void {
    this.t += dt;
    this.gnomes.forEach((g, i) => {
      const got = this.found.has(g.id);
      if (!got && Math.hypot(car.x - g.x, car.z - g.z) < 4 && Math.abs(car.y - g.y) < 4) onGnome(g);
      const hop = got ? 0 : Math.max(0, Math.sin(this.t * 2.2 + i)) * 0.12;
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.t * 0.6 + i);
      this.m4.compose(this.p.set(g.x, g.y + hop, g.z), this.q, this.s.setScalar(got ? 0 : 1.6));
      for (const part of this.gnomeParts) part.setMatrixAt(i, this.m4);
    });
    for (const part of this.gnomeParts) part.instanceMatrix.needsUpdate = true;
    for (const v of this.viewpoints) {
      const ring = this.rings.get(v.id)!, got = this.found.has(v.id);
      ring.visible = !got;
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.25 * Math.sin(this.t * 2.5);
      if (!got && Math.hypot(car.x - v.x, car.z - v.z) < 9 && Math.abs(speed) < 3) onView(v);
    }
  }
}
