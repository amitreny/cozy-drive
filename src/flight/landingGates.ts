import * as THREE from 'three';
import { along } from '../world/airports';
import { aimDistance, GLIDE, type Approach } from './approach';

/** Gates every 600 m out along the glide path, from 600 m to 6 km before the threshold. */
const SPACING = 600, COUNT = 10;

/**
 * Approach gates: corner brackets in the sky along the 3° glide path to the runway you're lined up for, a
 * "highway in the sky" to fly down. Each frames the window you should pass through, wider further out. The next
 * one ahead turns green while you're inside its window.
 */
export class LandingGates {
  readonly group = new THREE.Group();
  private key = '';
  private gates: { mesh: THREE.LineSegments; mat: THREE.LineBasicMaterial; d: number; hw: number; hh: number }[] = [];

  update(ap: Approach | null): void {
    this.group.visible = !!ap;
    if (!ap) return;
    const key = `${ap.place.id}:${ap.runway}`;
    if (key !== this.key) this.build(ap, key);
    // Show the gates still ahead, brightest close in; the next one is green while you're inside its window.
    let next = true;
    for (const g of this.gates) {
      const ahead = g.d < ap.dist - 30;
      g.mesh.visible = ahead;
      if (!ahead) continue;
      const inside = Math.abs(ap.left) < g.hw && Math.abs(ap.above) < g.hh;
      g.mat.color.setHex(next && inside ? 0x3fae6a : 0xd9704f);
      g.mat.opacity = Math.max(0.25, 1 - (ap.dist - g.d) / 5000);
      next = false;
    }
  }

  private build(ap: Approach, key: string): void {
    this.key = key;
    for (const g of this.gates) { g.mesh.geometry.dispose(); g.mat.dispose(); this.group.remove(g.mesh); }
    this.gates = [];
    const rw = ap.place.runway!, aimD = aimDistance(rw.halfLen);
    for (let i = COUNT; i >= 1; i--) {
      const d = i * SPACING, hw = 20 + d * 0.012, hh = 8 + d * 0.006, arm = Math.min(hw, hh) * 0.6;
      const [cx, cz] = along(rw, -ap.end * (rw.halfLen + d), 0), [lx, lz] = along(rw, -ap.end * (rw.halfLen + d), ap.end);
      const left = new THREE.Vector3(lx - cx, 0, lz - cz).normalize(), up = new THREE.Vector3(0, 1, 0);
      const centre = new THREE.Vector3(cx, ap.elevation + (d + aimD) * Math.tan(GLIDE), cz);
      const pts: THREE.Vector3[] = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const corner = centre.clone().addScaledVector(left, sx * hw).addScaledVector(up, sy * hh);
        pts.push(corner, corner.clone().addScaledVector(left, -sx * arm), corner, corner.clone().addScaledVector(up, -sy * arm));
      }
      const mat = new THREE.LineBasicMaterial({ color: 0xd9704f, transparent: true, depthWrite: false, fog: false });
      const mesh = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat);
      mesh.frustumCulled = false;
      this.group.add(mesh); this.gates.push({ mesh, mat, d, hw, hh });
    }
  }
}
