import * as THREE from 'three';

interface Key { t: number; top: number; horizon: number; sun: number; sunI: number; amb: number; fog: number }
// Time of day 0..24 h. Golden hour and dusk get warm colours (docs/07 art direction).
const KEYS: Key[] = [
  { t: 0, top: 0x0b1530, horizon: 0x1c2a4a, sun: 0x8fa6ff, sunI: 0.25, amb: 0.35, fog: 0x1c2a4a },
  { t: 5.5, top: 0x23305a, horizon: 0xe59a7a, sun: 0xffb08a, sunI: 0.6, amb: 0.45, fog: 0xc99a8a },
  { t: 8, top: 0x6aa5d8, horizon: 0xf3dcb8, sun: 0xfff0d8, sunI: 2.2, amb: 0.85, fog: 0xe6dcc8 },
  { t: 13, top: 0x5c9ad6, horizon: 0xd8e8f0, sun: 0xffffff, sunI: 2.6, amb: 0.9, fog: 0xd6e2ea },
  { t: 17.5, top: 0x6a90c8, horizon: 0xf6c98e, sun: 0xffc77a, sunI: 2.1, amb: 0.8, fog: 0xf0d2a8 },
  { t: 19.5, top: 0x3a3f74, horizon: 0xf08a6a, sun: 0xff8a5a, sunI: 0.9, amb: 0.55, fog: 0xc98a7a },
  { t: 21.5, top: 0x101a38, horizon: 0x2a3050, sun: 0x8fa6ff, sunI: 0.3, amb: 0.38, fog: 0x232c48 },
  { t: 24, top: 0x0b1530, horizon: 0x1c2a4a, sun: 0x8fa6ff, sunI: 0.25, amb: 0.35, fog: 0x1c2a4a },
];

export class Sky {
  readonly dome: THREE.Mesh;
  readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  readonly hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6b5a40, 0.8);
  hours = 8.5;
  dayMinutes = 24;
  readonly uTop = { value: new THREE.Color() }; readonly uHorizon = { value: new THREE.Color() };

  constructor(private scene: THREE.Scene) {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: this.uTop, horizon: this.uHorizon },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.7)), 1.0); }',
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), mat);
    this.dome.frustumCulled = false;
    scene.add(this.dome, this.sun, this.sun.target, this.hemi);
    scene.fog = new THREE.Fog(0xe6dcc8, 250, 1500);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.12; // steep terrain needs a larger normal offset (no acne)
  }

  get isNight(): boolean { return this.hours < 6 || this.hours > 20.3; }

  update(dt: number, focus: THREE.Vector3): void {
    this.hours = (this.hours + (dt / (this.dayMinutes * 60)) * 24) % 24;
    let i = 0;
    while (i < KEYS.length - 2 && this.hours >= KEYS[i + 1].t) i++;
    const a = KEYS[i], b = KEYS[i + 1], t = (this.hours - a.t) / (b.t - a.t);
    const mix = (x: number, y: number) => new THREE.Color(x).lerp(new THREE.Color(y), t);
    this.uTop.value.copy(mix(a.top, b.top)); this.uHorizon.value.copy(mix(a.horizon, b.horizon));
    (this.scene.fog as THREE.Fog).color.copy(mix(a.fog, b.fog));
    this.sun.color.copy(mix(a.sun, b.sun));
    this.sun.intensity = a.sunI + (b.sunI - a.sunI) * t;
    this.hemi.intensity = a.amb + (b.amb - a.amb) * t;
    // Sun arc: rises in the east (+x... -x), slowed around golden hour by the key table above.
    const ang = ((this.hours - 6) / 12) * Math.PI;
    const night = this.hours < 6 || this.hours > 18;
    const elev = night ? 0.5 : Math.max(0.12, Math.sin(ang));
    const dir = new THREE.Vector3(-Math.cos(night ? 0.8 : ang), elev, 0.45).normalize();
    this.sun.position.copy(focus).addScaledVector(dir, 200);
    this.sun.target.position.copy(focus);
    this.dome.position.copy(focus);
  }
}
