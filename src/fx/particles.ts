import * as THREE from 'three';

/** Pooled, GPU-drawn soft particles for dust, gravel, mud, sand, snow and splashes. */
export class Particles {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array; private col: Float32Array; private alpha: Float32Array; private size: Float32Array;
  private vel: Float32Array; private life: Float32Array; private maxLife: Float32Array; private grow: Float32Array;
  private next = 0;

  constructor(max = 2000) {
    this.n = max;
    this.pos = new Float32Array(max * 3).fill(-9999);
    this.col = new Float32Array(max * 3); this.alpha = new Float32Array(max); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max).fill(1);
    this.grow = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, vertexColors: true,
      vertexShader: /* glsl */`
        attribute float alpha; attribute float size; varying float vA; varying vec3 vC;
        void main() { vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (420.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        varying float vA; varying vec3 vC;
        void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.15, d)); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, rgb: [number, number, number], life: number, size: number, grow = 1): void {
    const i = this.next; this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const c = new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grow[i] = grow;
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.pos[i * 3 + 1] = -9999; } continue; }
      this.life[i] -= dt;
      const t = this.life[i] / this.maxLife[i];
      this.vel[i * 3 + 1] -= 3.5 * dt;
      const drag = Math.exp(-2.2 * dt);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 1] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = Math.min(1, t * 2) * 0.75;
    }
    const g = this.points.geometry;
    for (const name of ['position', 'color', 'alpha', 'size']) g.getAttribute(name).needsUpdate = true;
  }
}
