import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/** Warm grade, gentle saturation and a soft vignette, applied in linear HDR before tone mapping. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTint: { value: new THREE.Color(1, 0.97, 0.92) },
    uSaturation: { value: 1.08 },
    uVignette: { value: 0.28 },
    uLift: { value: 0.012 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec3 uTint; uniform float uSaturation; uniform float uVignette; uniform float uLift;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 col = mix(vec3(l), c.rgb, uSaturation) * uTint + uLift * vec3(1.0, 0.92, 0.85);
      vec2 d = vUv - 0.5; d.x *= 1.15;
      col *= 1.0 - uVignette * smoothstep(0.25, 0.85, length(d) * 1.25);
      gl_FragColor = vec4(col, c.a);
    }`,
};

export type PostQuality = 'off' | 'medium' | 'high';

/** Post-processing chain: scene → bloom → grade → tone mapping/sRGB. */
export class PostFX {
  quality: PostQuality = 'high';
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private scenePass: RenderPass;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.scenePass = new RenderPass(scene, camera);
    this.composer.addPass(this.scenePass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 4, size.y / 4), 0.32, 0.55, 0.9); // quarter res: bloom is blurry anyway
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number): void { this.composer.setSize(w, h); this.bloom.setSize(w / 4, h / 4); }

  /** Follow the time of day: warmer and bloomier at golden hour, cooler and softer at night. */
  setTimeOfDay(hours: number): void {
    const golden = Math.max(0, 1 - Math.min(Math.abs(hours - 18.3), Math.abs(hours - 6.6)) / 1.6);
    const night = hours < 5.5 || hours > 20.5 ? 1 : 0;
    const u = this.grade.uniforms;
    (u.uTint.value as THREE.Color).setRGB(1 + 0.05 * golden - 0.05 * night, 0.97 - 0.01 * golden, 0.92 - 0.08 * golden + 0.1 * night);
    u.uSaturation.value = 1.08 + 0.08 * golden - 0.15 * night;
    this.bloom.strength = 0.3 + 0.25 * golden + 0.35 * night;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.quality === 'off') { this.renderer.render(scene, camera); return; }
    this.bloom.enabled = this.quality === 'high';
    this.scenePass.camera = camera; // e.g. the postcard camera for one frame
    this.composer.render();
  }
}
