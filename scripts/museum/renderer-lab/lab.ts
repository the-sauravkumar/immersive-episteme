/**
 * Renderer decision lab (DR-014): the SAME museum world (scene model from the stored manifest,
 * the shipped KTX2 textures, the same lighting and AO; unlettered cards so no custom shader is
 * involved) rendered by
 *   A  WebGLRenderer + TAARenderPass accumulation at rest + SMAA   (src/components/museum/three/pipeline.ts)
 *   B  WebGPURenderer + TRAA (three/addons/tsl/display/TRAANode.js), WebGPU backend
 *   C  the same as B with `forceWebGL: true` (WebGPURenderer's WebGL2 fallback backend)
 * so the C1 (static-frame stability), C1b (slow-yaw smoothness) and frame-time results decide.
 *
 * Bundled by scripts/museum/renderer-decision.mjs with esbuild; driven by Playwright through
 * `window.lab`. Measurement tooling only: never shipped to participants.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

import { createMaterials, type LoadedTextures } from "../../../src/components/museum/three/resources";
import { WebGLPipeline } from "../../../src/components/museum/three/pipeline";
import { MuseumWorld } from "../../../src/components/museum/three/world";
import { VISITOR } from "../../../src/features/immersive/navigation";
import type { SceneModel } from "../../../src/features/immersive/scene-model";

type Mode = "webgl-taa" | "webgpu-traa" | "webgpu-fallback-traa";

interface Lab {
  mode: Mode;
  /** C1: render `n` more frames at a still camera; changed pixels of each against the first. */
  stability(n: number): Promise<number[]>;
  /** C1b: `n` frames turning `stepRad` each; mean absolute RGB difference between consecutive frames. */
  slowYaw(n: number, stepRad: number): Promise<number[]>;
  backend: string;
  setPose(x: number, z: number, yaw: number): void;
  render(): Promise<void>;
  /** Render n frames while turning `yawStep` radians per frame; per-frame ms until the GPU finished. */
  frames(n: number, yawStep: number): Promise<number[]>;
}

declare global {
  interface Window {
    lab: Lab | null;
    labError: string | null;
    startLab(mode: Mode): Promise<void>;
  }
}

async function loadTextures(loader: KTX2Loader, anisotropy: number): Promise<LoadedTextures> {
  const index = await (await fetch("/museum/textures/index.json")).json();
  const sets: Record<string, Record<string, THREE.Texture>> = {};
  for (const set of ["wall", "floor"]) {
    sets[set] = {};
    for (const role of ["color", "normal", "orm"]) {
      const e = index.textures[set].maps[role];
      const t = await loader.loadAsync(e.url);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.setScalar(1 / index.textures[set].tileMetres);
      t.anisotropy = anisotropy;
      t.colorSpace = e.colorSpace === "srgb" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.needsUpdate = true;
      sets[set]![role] = t;
    }
  }
  return { wall: sets.wall as never, floor: sets.floor as never, manifest: [], bytes: 0 };
}

function lighting(scene: THREE.Scene, env: THREE.Texture) {
  scene.environment = env;
  scene.environmentIntensity = 0.8;
  scene.background = new THREE.Color("#d9d3c8");
  scene.add(new THREE.HemisphereLight("#e9eef2", "#d2b692", 1.0));
  const key = new THREE.DirectionalLight("#fff1e0", 1.2);
  key.position.set(-0.45, 1, 0.3);
  scene.add(key);
}

/**
 * Reads the frame just rendered: drawImage of the WebGL/WebGPU canvas in the same task as the
 * render returns that frame (the drawing buffer is not yet presented).
 */
function makeReader(canvas: HTMLCanvasElement) {
  const c2 = document.createElement("canvas");
  c2.width = canvas.width;
  c2.height = canvas.height;
  const ctx = c2.getContext("2d", { willReadFrequently: true })!;
  return () => {
    ctx.drawImage(canvas, 0, 0);
    return ctx.getImageData(0, 0, c2.width, c2.height).data;
  };
}

function measures(renderFrame: () => Promise<void> | void, read: () => Uint8ClampedArray, turn: (r: number) => void) {
  return {
    async stability(n: number) {
      await renderFrame();
      const first = read().slice();
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        await renderFrame();
        const px = read();
        let c = 0;
        for (let j = 0; j < px.length; j += 4) if (px[j] !== first[j] || px[j + 1] !== first[j + 1] || px[j + 2] !== first[j + 2]) c++;
        out.push(c);
      }
      return out;
    },
    async slowYaw(n: number, stepRad: number) {
      await renderFrame();
      let prev = read().slice();
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        turn(stepRad);
        await renderFrame();
        const px = read().slice();
        let s = 0;
        for (let j = 0; j < px.length; j += 4) s += Math.abs(px[j]! - prev[j]!) + Math.abs(px[j + 1]! - prev[j + 1]!) + Math.abs(px[j + 2]! - prev[j + 2]!);
        out.push(s / ((px.length / 4) * 3));
        prev = px;
      }
      return out;
    },
  };
}

window.lab = null;
window.labError = null;
window.startLab = async (mode: Mode) => {
  try {
    const model = (await (await fetch("/scene-model.json")).json()) as SceneModel;
    const canvas = document.getElementById("c") as HTMLCanvasElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(VISITOR.fov, w / h, 0.05, 150);
    camera.rotation.order = "YXZ";
    const setPose = (x: number, z: number, yaw: number) => {
      camera.position.set(x, VISITOR.eyeHeight, z);
      camera.rotation.set(0, yaw, 0, "YXZ");
      camera.updateMatrixWorld();
    };

    if (mode === "webgl-taa") {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const loader = new KTX2Loader().setTranscoderPath("/museum/basis/").detectSupport(renderer);
      const tex = await loadTextures(loader, Math.min(16, renderer.capabilities.getMaxAnisotropy()));
      const mats = createMaterials(tex, 3.2);
      scene.add(new MuseumWorld(model, mats, 16, () => ({ kicker: null, title: "" })).root);
      const pmrem = new THREE.PMREMGenerator(renderer);
      lighting(scene, pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
      const pipeline = new WebGLPipeline(renderer, scene, camera, 2);
      pipeline.setSize(w, h, 1);
      let lastPose = "";
      const renderOnce = () => {
        const pose = `${camera.position.x},${camera.position.z},${camera.rotation.y}`;
        const moving = pose !== lastPose;
        lastPose = pose;
        return pipeline.render(moving, 1 / 60);
      };
      await renderer.compileAsync(scene, camera);
      const readA = makeReader(canvas);
      window.lab = {
        ...measures(
          () => {
            renderOnce();
          },
          readA,
          (r) => {
            camera.rotation.y += r;
            camera.updateMatrixWorld();
          },
        ),
        mode,
        backend: "WebGLRenderer (WebGL2)",
        setPose,
        async render() {
          // At rest, render until the accumulation has converged (what render-on-demand does).
          let r = renderOnce();
          while (r.converging) r = renderOnce();
          await new Promise((res) => requestAnimationFrame(() => res(null)));
        },
        async frames(n, yawStep) {
          const out: number[] = [];
          for (let i = 0; i < n; i++) {
            camera.rotation.y += yawStep;
            camera.updateMatrixWorld();
            const t0 = performance.now();
            renderOnce();
            renderer.getContext().finish();
            out.push(performance.now() - t0);
          }
          return out;
        },
      };
      return;
    }

    const webgpu = await import("three/webgpu");
    const tsl = await import("three/tsl");
    const { traa } = await import("three/examples/jsm/tsl/display/TRAANode.js");
    const renderer = new webgpu.WebGPURenderer({ canvas, antialias: false, forceWebGL: mode === "webgpu-fallback-traa" });
    await renderer.init();
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const loader = new KTX2Loader().setTranscoderPath("/museum/basis/");
    loader.detectSupport(renderer as unknown as THREE.WebGLRenderer);
    const tex = await loadTextures(loader, 16);
    const mats = createMaterials(tex, 3.2);
    scene.add(new MuseumWorld(model, mats, 16, () => ({ kicker: null, title: "" })).root);
    const pmrem = new webgpu.PMREMGenerator(renderer);
    lighting(scene, pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
    const scenePass = tsl.pass(scene, camera);
    scenePass.setMRT(tsl.mrt({ output: tsl.output, velocity: tsl.velocity }));
    const t = traa(scenePass.getTextureNode("output"), scenePass.getTextureNode("depth"), scenePass.getTextureNode("velocity"), camera);
    const pipeline = new webgpu.RenderPipeline(renderer);
    pipeline.outputNode = t;
    const backend = (renderer as unknown as { backend: { isWebGPUBackend?: boolean } }).backend.isWebGPUBackend ? "WebGPU" : "WebGL2 (fallback)";
    const readB = makeReader(canvas);
    window.lab = {
      ...measures(
        async () => {
          pipeline.render();
          await (renderer as unknown as { waitForGPU?: () => Promise<void> }).waitForGPU?.();
        },
        readB,
        (r) => {
          camera.rotation.y += r;
          camera.updateMatrixWorld();
        },
      ),
      mode,
      backend: `WebGPURenderer (${backend})`,
      setPose,
      async render() {
        // TRAA has no "converged" state: render the 32-frame accumulation window used for A.
        for (let i = 0; i < 32; i++) pipeline.render();
        await new Promise((res) => requestAnimationFrame(() => res(null)));
      },
      async frames(n, yawStep) {
        const out: number[] = [];
        for (let i = 0; i < n; i++) {
          camera.rotation.y += yawStep;
          camera.updateMatrixWorld();
          const t0 = performance.now();
          pipeline.render();
          await (renderer as unknown as { waitForGPU?: () => Promise<void> }).waitForGPU?.();
          out.push(performance.now() - t0);
        }
        return out;
      },
    };
  } catch (e) {
    window.labError = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
  }
};
