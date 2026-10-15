/**
 * Frame pipeline for WebGLRenderer (DR-014 decision path B; see the module record I-R1 for the
 * measurement that chose it):
 *
 *   TAARenderPass  ->  OutputPass (Neutral tone mapping, fixed exposure, sRGB)  ->  SMAAPass
 *
 *  - In motion: TAARenderPass.accumulate = false, sampleLevel 0 renders one plain sample per
 *    frame; SMAA anti-aliases it.
 *  - At rest: accumulate = true. three 0.186.1 TAARenderPass "accumulates jittered camera
 *    samples across frames" only when there is no motion; 32 jitter offsets
 *    (`_JitterVectors[5]`) at 2^restSampleLevel samples per frame. Once all 32 are accumulated
 *    the pass outputs the stored result unchanged, so a static view is pixel-stable (C1) and
 *    rendering stops (render on demand).
 *
 * No other post-processing exists (no bloom, grain, vignette or SSAO: §1, C7).
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { TAARenderPass } from "three/examples/jsm/postprocessing/TAARenderPass.js";

/** Number of jitter offsets TAARenderPass accumulates (three 0.186.1 `_JitterVectors[5]`). */
export const TAA_SAMPLES = 32;

export interface FrameResult {
  /** True while more frames are needed to converge (keep invalidating). */
  converging: boolean;
}

export class WebGLPipeline {
  readonly composer: EffectComposer;
  readonly taa: TAARenderPass;
  readonly output: OutputPass;
  readonly smaa: SMAAPass;
  private moving = true;
  /** `accumulateIndex` exists at run time (three 0.186.1 TAARenderPass) but not in @types/three. */
  private get taaState(): { accumulateIndex: number } {
    return this.taa as unknown as { accumulateIndex: number };
  }

  constructor(
    readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    private readonly restSampleLevel: number,
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false });
    target.texture.name = "composer.rt";
    this.composer = new EffectComposer(renderer, target);
    this.taa = new TAARenderPass(scene, camera, 0x000000, 1);
    this.taa.unbiased = true;
    this.taa.sampleLevel = 0;
    this.taa.accumulate = false;
    this.output = new OutputPass();
    this.smaa = new SMAAPass();
    this.composer.addPass(this.taa);
    this.composer.addPass(this.output);
    this.composer.addPass(this.smaa);
  }

  /** Names of the active passes (C7 configuration assertion). */
  passNames(): string[] {
    return this.composer.passes.filter((p) => p.enabled).map((p) => (p === this.taa ? "taa-accumulate" : p === this.output ? "output" : p === this.smaa ? "smaa" : p.constructor.name));
  }

  setSize(width: number, height: number, dpr: number) {
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    this.restart();
  }

  /** Something changed in a still view (lettering loaded, highlight): re-accumulate from scratch. */
  restart() {
    this.taa.accumulate = false;
    this.taaState.accumulateIndex = -1;
  }

  render(moving: boolean, delta: number): FrameResult {
    if (moving !== this.moving) {
      this.moving = moving;
      this.taa.accumulate = !moving;
      this.taa.sampleLevel = moving ? 0 : this.restSampleLevel;
      this.taaState.accumulateIndex = -1;
    }
    if (!moving && !this.taa.accumulate) {
      this.taa.accumulate = true;
      this.taa.sampleLevel = this.restSampleLevel;
    }
    this.composer.render(delta);
    const converging = !moving && this.taaState.accumulateIndex < TAA_SAMPLES;
    return { converging };
  }

  dispose() {
    this.taa.dispose();
    this.output.dispose();
    this.smaa.dispose();
    this.composer.dispose();
  }
}
