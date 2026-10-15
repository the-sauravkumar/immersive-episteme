/**
 * Frame pipeline for WebGLRenderer (DR-014 decision path B; see the module record I-R1 for the
 * measurement that chose it):
 *
 *   TAARenderPass  ->  OutputPass (Neutral tone mapping, fixed exposure, sRGB)  ->  SMAAPass
 *
 *  - In motion: TAARenderPass.accumulate = false, sampleLevel 0 renders one plain sample per
 *    frame; SMAA anti-aliases it. SMAA runs in motion only: on the GTX 1650 two renders of the same
 *    converged still view through SMAA differed along thin edges (up to 274 pixels, flipping between
 *    two states from frame to frame) even with its targets cleared, and without SMAA they were
 *    identical (C1). At rest the 32-sample accumulation is the anti-aliasing.
 *  - At rest: accumulate = true. three 0.186.1 TAARenderPass "accumulates jittered camera
 *    samples across frames" only when there is no motion; 32 jitter offsets
 *    (`_JitterVectors[5]`) at 2^restSampleLevel samples per frame. Once all 32 are accumulated
 *    the pass outputs the stored result unchanged, so a static view is pixel-stable (C1) and
 *    rendering stops (render on demand).
 *
 * No other post-processing exists (no bloom, grain, vignette or SSAO: §1, C7).
 *
 * Display-referred labels (DR-023 F2): the OutputPass tone maps every pixel except those whose
 * alpha is 0, which only the plate, plaque and sign materials write (resources.ts). Their paper and
 * ink reach the screen unmapped, as `toneMapped: false` would on a direct render: three applies
 * a material's toneMapped flag only when rendering to the canvas, and here the scene renders into
 * the composer's linear target. Every other material writes alpha 1; both anti-aliasing passes
 * average alpha with colour (premultiplied additive copies), so an edge pixel mixes the two
 * mappings by coverage. The same OutputPass instance, so the pass list is unchanged (C7).
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
  private readonly savedClear = new THREE.Color();
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
    // Clear alpha 0: the final accumulation copy adds onto a cleared target, and the label flag
    // (alpha 0) must survive it. The scene background still writes alpha 1.
    this.taa = new TAARenderPass(scene, camera, 0x000000, 0);
    this.taa.unbiased = true;
    this.taa.sampleLevel = 0;
    this.taa.accumulate = false;
    this.output = new OutputPass();
    patchDisplayReferred(this.output);
    this.smaa = new SMAAPass();
    this.composer.addPass(this.taa);
    this.composer.addPass(this.output);
    this.composer.addPass(this.smaa);
    // The last pass draws to the canvas; no swap after it, so every frame uses the composer's two
    // targets in the same roles (C1: with an odd number of swaps the roles alternated per frame).
    this.smaa.needsSwap = false;
    this.smaa.clear = true;
  }

  /** Names of the configured passes (C7 configuration assertion; SMAA is switched on in motion only). */
  passNames(): string[] {
    return this.composer.passes.map((p) => (p === this.taa ? "taa-accumulate" : p === this.output ? "output" : p === this.smaa ? "smaa" : p.constructor.name));
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
    // SMAA writes its edge and weight targets with discard, and three 0.186.1 SMAAPass clears them
    // only when `clear` is set: left uncleared, edges of earlier frames survive into the next one, so
    // two renders of the same still view differed along thin edges (C1). Clear them every frame, to
    // zero (the renderer's clear colour is restored after).
    this.smaa.enabled = moving;
    this.renderer.getClearColor(this.savedClear);
    const alpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 0);
    this.composer.render(delta);
    this.renderer.setClearColor(this.savedClear, alpha);
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

/** The OutputPass line that tone maps with the Neutral operator (three 0.186.1 OutputShader). */
const NEUTRAL_LINE = "gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );";

/** Tone map by alpha: alpha 1 = scene-referred (mapped), alpha 0 = display-referred (unmapped). */
export function patchDisplayReferred(output: OutputPass) {
  const mat = output.material as THREE.RawShaderMaterial;
  if (!mat.fragmentShader.includes(NEUTRAL_LINE)) throw new Error("OutputPass shader changed: display-referred labels need the Neutral tone-mapping line");
  mat.fragmentShader = mat.fragmentShader.replace(
    NEUTRAL_LINE,
    "gl_FragColor.rgb = mix( gl_FragColor.rgb, NeutralToneMapping( gl_FragColor.rgb ), clamp( gl_FragColor.a, 0.0, 1.0 ) ); gl_FragColor.a = 1.0;",
  );
  mat.needsUpdate = true;
}
