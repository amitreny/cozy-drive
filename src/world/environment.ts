import * as THREE from 'three';
import type { Sky } from './sky';

/** Reflection map rendered from the current sky (gradient, earthy ground, sun), refreshed every few seconds. */
export class SkyEnvironment {
  texture: THREE.Texture | null = null;
  private scene = new THREE.Scene();
  private sun: THREE.Mesh;
  private sunMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private pmrem: THREE.PMREMGenerator | null = null;
  private rt: THREE.WebGLRenderTarget | null = null;
  private timer = Infinity;

  constructor(private sky: Sky) {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: sky.uTop, horizon: sky.uHorizon, ground: { value: new THREE.Color(0x5d5a3c) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying vec3 vP;
        void main(){ float h = vP.y;
          vec3 skyc = mix(horizon, top, pow(clamp(h * 1.6, 0.0, 1.0), 0.7));
          vec3 g = mix(horizon * 0.6, ground * (0.4 + 0.6 * length(horizon)), clamp(-h * 4.0, 0.0, 1.0));
          gl_FragColor = vec4(h >= 0.0 ? skyc : g, 1.0); }`,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat));
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(28, 16, 8), this.sunMat);
    this.scene.add(this.sun);
  }

  update(renderer: THREE.WebGLRenderer, dt: number): THREE.Texture | null {
    this.timer += dt;
    if (this.timer < 2) return this.texture;
    this.timer = 0;
    const dir = this.sky.sun.position.clone().sub(this.sky.sun.target.position).normalize();
    this.sun.position.copy(dir).multiplyScalar(400);
    this.sun.visible = dir.y > -0.05;
    this.sunMat.color.copy(this.sky.sun.color).multiplyScalar(2 + this.sky.sun.intensity * 4);
    this.pmrem ??= new THREE.PMREMGenerator(renderer);
    const old = this.rt;
    this.rt = this.pmrem.fromScene(this.scene, 0, 1, 1000);
    old?.dispose();
    this.texture = this.rt.texture;
    return this.texture;
  }
}
