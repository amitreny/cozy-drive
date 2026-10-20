import * as THREE from 'three';
import { heightAt, type WorldData } from '../world/terrainGen';
import type { ActiveJob } from './deliveries';
import type { Board } from './jobs';

function iconTexture(text: string, bg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
  g.lineWidth = 6; g.strokeStyle = '#fbf3e4'; g.stroke();
  g.font = '64px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** A soft column of light, brightest at the ground. */
function beaconMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
    vertexShader: 'varying float vH; void main() { vH = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uTime; varying float vH; void main() { float a = pow(1.0 - vH, 1.6) * (0.55 + 0.15 * sin(uTime * 2.0 - vH * 8.0)); gl_FragColor = vec4(uColor * a, a); }',
  });
}

/** Job-board signs at every business, and a beacon at each delivery in progress. */
export class DeliveryMarkers {
  readonly group = new THREE.Group();
  private boardSigns: { sprite: THREE.Sprite; ring: THREE.Mesh; x: number; z: number }[] = [];
  private beacons = new Map<string, THREE.Group>();
  private roadMat = beaconMaterial(0x58d6c0); private airMat = beaconMaterial(0x7fb8ff);
  private t = 0;

  constructor(private w: WorldData, boards: Board[]) {
    const tex = iconTexture('📋', '#d9704f'), airTex = iconTexture('✈', '#3d6e8f');
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf3c98b, transparent: true, opacity: 0.55, depthWrite: false });
    for (const b of boards) {
      const y = heightAt(w, b.x, b.z);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: b.place ? airTex : tex, depthWrite: false }));
      sprite.scale.set(1.15, 1.15, 1); sprite.position.set(b.x, y + 4.6, b.z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.8, 32), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(b.x, y + 0.08, b.z);
      this.group.add(sprite, ring);
      this.boardSigns.push({ sprite, ring, x: b.x, z: b.z });
    }
  }

  update(dt: number, active: ActiveJob[], camX: number, camZ: number): void {
    this.t += dt;
    this.roadMat.uniforms.uTime.value = this.airMat.uniforms.uTime.value = this.t;
    for (const s of this.boardSigns) {
      const near = Math.hypot(s.x - camX, s.z - camZ) < 320;
      s.sprite.visible = s.ring.visible = near;
      s.sprite.position.y += Math.sin(this.t * 2 + s.x) * 0.002;
    }
    const want = new Set(active.map((a) => a.job.to.id + (a.job.air ? ':air' : '')));
    for (const [k, g] of this.beacons) if (!want.has(k)) { this.group.remove(g); this.beacons.delete(k); }
    for (const a of active) {
      const k = a.job.to.id + (a.job.air ? ':air' : '');
      if (this.beacons.has(k)) continue;
      const g = new THREE.Group(), y = heightAt(this.w, a.job.to.x, a.job.to.z);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 90, 20, 1, true), a.job.air ? this.airMat : this.roadMat);
      col.position.y = 45; g.add(col);
      const ring = new THREE.Mesh(new THREE.RingGeometry(a.job.air ? 14 : 5, a.job.air ? 15 : 5.8, 40), new THREE.MeshBasicMaterial({ color: a.job.air ? 0x7fb8ff : 0x58d6c0, transparent: true, opacity: 0.7, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; g.add(ring);
      g.position.set(a.job.to.x, y, a.job.to.z);
      this.group.add(g); this.beacons.set(k, g);
    }
  }
}
