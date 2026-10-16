/**
 * Measurement probe for the rendering-quality checks (immersive-rendering-quality.md §3, C1-C12),
 * driven by tests/e2e/immersive-rendering.spec.ts.
 *
 * `window.__museumInfo` (read-only: tier, backend, render configuration, texture list) is always
 * present so a study session can be audited (C7). The controlling probe `window.__museumProbe`
 * (teleport, forced frames, pixel readback, scripted path, context loss) is installed only when
 * `enabled` (never in study mode: see the page).
 */
import * as THREE from "three";

import { createRouter } from "@/features/immersive/navigation";
import type { QualityTier } from "@/features/immersive/quality";
import type { SceneModel } from "@/features/immersive/scene-model";
import { buildTour, poseAt, roomOrder, segmentDuration, tourLength, viewpoints, type Pose } from "@/features/immersive/tour-path";

import type { WebGLPipeline } from "./three/pipeline";
import { STUDY_RENDER_CONFIG, type LoadedTextures } from "./three/resources";
import type { MuseumWorld } from "./three/world";

export interface ProbeHost {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  model: SceneModel;
  tier: QualityTier;
  readonly ready: boolean;
  readonly world: MuseumWorld | null;
  readonly pipeline: WebGLPipeline | null;
  readonly textures: LoadedTextures | null;
  readonly framesRendered: number;
  readonly roomId: string | null;
  readonly visitor: unknown;
  setPose(x: number, z: number, yaw: number, pitch: number): void;
  setFrameHook(fn: ((info: { moving: boolean; converging: boolean }) => void) | null): void;
  invalidate(): void;
}

interface FrameRecord {
  t: number;
  calls: number;
  triangles: number;
  programs: number;
  moving: boolean;
}

const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));

const TONE: Record<number, string> = { [THREE.NoToneMapping]: "none", [THREE.NeutralToneMapping]: "neutral", [THREE.ACESFilmicToneMapping]: "aces", [THREE.AgXToneMapping]: "agx" };

export function installProbe(host: ProbeHost, enabled: boolean): () => void {
  const w = window as unknown as Record<string, unknown>;
  const gpuName = () => {
    const gl = host.renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  };
  const info = () => {
    const r = host.renderer;
    const buf = r.getDrawingBufferSize(new THREE.Vector2());
    return {
      ready: host.ready,
      tier: host.tier,
      backend: "webgl2" as const,
      gpu: gpuName(),
      config: {
        toneMapping: TONE[r.toneMapping] ?? String(r.toneMapping),
        exposure: r.toneMappingExposure,
        outputColorSpace: r.outputColorSpace,
        passes: host.pipeline?.passNames() ?? [],
        shadows: r.shadowMap.enabled,
        near: host.camera.near,
        far: host.camera.far,
        fov: host.camera.fov,
        expected: STUDY_RENDER_CONFIG,
      },
      dpr: r.getPixelRatio(),
      devicePixelRatio: window.devicePixelRatio,
      drawingBuffer: { width: buf.x, height: buf.y },
      canvasCss: { width: r.domElement.clientWidth, height: r.domElement.clientHeight },
      textures: host.textures?.manifest ?? [],
      world: host.world?.stats ?? null,
      residentRooms: host.world?.residentRoomIds() ?? [],
      roomId: host.roomId,
      visitor: host.visitor,
      framesRendered: host.framesRendered,
    };
  };
  w.__museumInfo = info;
  if (!enabled) {
    return () => {
      delete w.__museumInfo;
    };
  }

  let trace: FrameRecord[] | null = null;
  let capture: ((pixels: Uint8Array) => void) | null = null;
  let lastConverging = true;
  let lastMoving = false;
  host.setFrameHook(({ moving, converging }) => {
    lastConverging = converging;
    lastMoving = moving;
    if (trace) {
      const i = host.renderer.info;
      trace.push({ t: performance.now(), calls: i.render.calls, triangles: i.render.triangles, programs: i.programs?.length ?? 0, moving });
    }
    if (capture) {
      const gl = host.renderer.getContext();
      const px = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const cb = capture;
      capture = null;
      cb(px);
    }
  });

  const router = createRouter(host.model.rooms, host.model.colliders);

  /** Wait until no frame has been rendered for `quiet` animation frames and AA has converged. */
  async function settle(quiet = 3, timeoutMs = 20000) {
    const start = performance.now();
    let last = host.framesRendered;
    let still = 0;
    while (performance.now() - start < timeoutMs) {
      await nextFrame();
      if (host.framesRendered === last && !lastConverging) still++;
      else still = 0;
      last = host.framesRendered;
      if (still >= quiet) return true;
    }
    return false;
  }

  /** Force one rendered frame and read it back. */
  function grab(): Promise<Uint8Array> {
    return new Promise((resolve) => {
      capture = resolve;
      host.invalidate();
    });
  }

  function luminance(px: Uint8Array) {
    const hist = new Array<number>(256).fill(0);
    let sum = 0;
    let paper = 0;
    let ink = 0;
    const n = px.length / 4;
    for (let i = 0; i < px.length; i += 4) {
      const y = Math.round(0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!);
      hist[y]!++;
      sum += y;
      // Plate paper is display-referred white (DR-023 F2), exactly 255 by design; a tone-mapped
      // surface never reaches it (Neutral maps scene value 1 to sRGB 240), so it is not a clipped highlight.
      if (px[i] === 255 && px[i + 1] === 255 && px[i + 2] === 255) paper++;
      // Plate ink is display-referred black, exactly 0 by design (full ink on the unlit plate); the
      // darkest tone-mapped surface (the shadow gap) renders at about sRGB 35, so exact black is
      // lettering, not a crushed shadow. Counted apart, as paper is (DR-045: at the approach point a
      // stand-mounted plate fills 2.6 times the area of a wall plate, so its ink alone passes 0.5%).
      else if (px[i] === 0 && px[i + 1] === 0 && px[i + 2] === 0) ink++;
    }
    const clipped = (hist.slice(254).reduce((a, b) => a + b, 0) - paper) / n;
    const crushed = (hist.slice(0, 3).reduce((a, b) => a + b, 0) - ink) / n;
    return { mean: sum / n, clippedFraction: clipped, crushedFraction: crushed, paperFraction: paper / n, inkFraction: ink / n, histogram: hist };
  }

  async function setPoseAndSettle(p: Pose) {
    host.setPose(p.x, p.z, p.yaw, p.pitch);
    await settle();
  }

  const probe = {
    info,
    viewpoints: () => viewpoints(host.model, router),
    roomOrder: () => roomOrder(host.model, host.roomId ?? host.model.rooms[0]!.id),
    settle,
    /** C4 diagnosis: the WebGL programs alive now (three.js name and cache key). */
    programNames() {
      return (host.renderer.info.programs ?? []).map((p) => `${p.name}|${String((p as unknown as { cacheKey?: string }).cacheKey ?? "")}`);
    },
    memory() {
      const m = host.renderer.info.memory;
      const perf = performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } };
      return { geometries: m.geometries, textures: m.textures, programs: host.renderer.info.programs?.length ?? 0, jsHeap: perf.memory?.usedJSHeapSize ?? null, letteringTexels: host.world?.stats.letteringTexels ?? 0, residentRooms: host.world?.residentRoomIds().length ?? 0 };
    },
    /** GPU texture memory estimate (bytes) of every live texture the renderer knows about. */
    textureBytes() {
      let bytes = 0;
      const seen = new Set<THREE.Texture>();
      const add = (t: THREE.Texture | null | undefined) => {
        if (!t || seen.has(t)) return;
        seen.add(t);
        const img = t.image as { width?: number; height?: number } | null;
        const ct = t as THREE.CompressedTexture;
        if (ct.isCompressedTexture && ct.mipmaps?.length) {
          for (const m of ct.mipmaps as unknown as { data: ArrayBufferView }[]) bytes += m.data.byteLength;
          return;
        }
        if (!img?.width || !img.height) return;
        const bpp = t.format === THREE.RedFormat ? 1 : t.type === THREE.HalfFloatType ? 8 : t.type === THREE.FloatType ? 16 : 4;
        bytes += img.width * img.height * bpp * (t.generateMipmaps ? 4 / 3 : 1);
      };
      host.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
        for (const mat of mats) for (const v of Object.values(mat)) if (v && (v as THREE.Texture).isTexture) add(v as THREE.Texture);
      });
      if (host.scene.environment) add(host.scene.environment);
      // Render targets (composer, TAA, SMAA) at the drawing-buffer size.
      const buf = host.renderer.getDrawingBufferSize(new THREE.Vector2());
      const rtBytes = buf.x * buf.y * (8 /* composer x2 half float */ * 2 + 8 /* TAA sample */ + 8 /* TAA hold */ + 4 * 2 /* SMAA edges + weights */ + 4 /* depth */);
      return { textures: bytes, renderTargets: rtBytes };
    },
    /** C1: hold the camera still, render `frames` frames, count changed pixels against the first. */
    async stability(pose: Pose, frames = 30) {
      await setPoseAndSettle(pose);
      const first = await grab();
      const changed: number[] = [];
      for (let i = 1; i < frames; i++) {
        const px = await grab();
        let c = 0;
        for (let j = 0; j < px.length; j += 4) if (px[j] !== first[j] || px[j + 1] !== first[j + 1] || px[j + 2] !== first[j + 2]) c++;
        changed.push(c);
      }
      const lum = luminance(first);
      return { pixels: first.length / 4, changed, luminance: { mean: lum.mean, clippedFraction: lum.clippedFraction, crushedFraction: lum.crushedFraction, inkFraction: lum.inkFraction } };
    },
    /** Marks exhibits visited, as controller.setVisited does (screenshots of the in-world mark). */
    setVisited(ids: string[]) {
      if (host.world?.setVisited(ids)) host.pipeline?.restart();
      host.invalidate();
    },
    /** C1 diagnosis: a sequence of still frames with idle gaps; changed pixels of each against the first. */
    async stabilityDetail(pose: Pose, gapsMs: number[] = [0, 0, 1500, 0, 1500, 0]) {
      await setPoseAndSettle(pose);
      const taa = () => (host.pipeline as unknown as { taa: { accumulateIndex: number; accumulate: boolean } } | null)?.taa;
      const first = await grab();
      const rows: { where: number[][]; gap: number; changed: number; changedVsPrevious: number; moving: boolean; framesBetween: number; taaIndex: number | null }[] = [];
      let prev = first;
      for (const gap of gapsMs) {
        if (gap) await new Promise((r) => setTimeout(r, gap));
        const f0 = host.framesRendered;
        const px = await grab();
        let c = 0;
        let cp = 0;
        for (let j = 0; j < px.length; j += 4) {
          if (px[j] !== first[j] || px[j + 1] !== first[j + 1] || px[j + 2] !== first[j + 2]) c++;
          if (px[j] !== prev[j] || px[j + 1] !== prev[j + 1] || px[j + 2] !== prev[j + 2]) cp++;
        }
        const w = host.renderer.getContext().drawingBufferWidth;
        const h = host.renderer.getContext().drawingBufferHeight;
        const where: number[][] = [];
        for (let j = 0; j < px.length && where.length < 400; j += 4) if (px[j] !== prev[j] || px[j + 1] !== prev[j + 1] || px[j + 2] !== prev[j + 2]) where.push([(j / 4) % w, h - 1 - Math.floor(j / 4 / w), prev[j]!, px[j]!]);
        prev = px;
        rows.push({ where, gap, changed: c, changedVsPrevious: cp, moving: lastMoving, framesBetween: host.framesRendered - f0, taaIndex: taa()?.accumulateIndex ?? null });
      }
      return rows;
    },
    /** C1b: slow yaw (stepDeg per frame); frame-to-frame changed-pixel fractions. */
    async slowYaw(pose: Pose, frames = 60, stepDeg = 0.1) {
      await setPoseAndSettle(pose);
      let prev = await grab();
      const diffs: number[] = [];
      for (let i = 1; i <= frames; i++) {
        host.setPose(pose.x, pose.z, pose.yaw + (i * stepDeg * Math.PI) / 180, pose.pitch);
        const px = await grab();
        let c = 0;
        let sum = 0;
        for (let j = 0; j < px.length; j += 4) {
          const d = Math.abs(px[j]! - prev[j]!) + Math.abs(px[j + 1]! - prev[j + 1]!) + Math.abs(px[j + 2]! - prev[j + 2]!);
          if (d > 0) c++;
          sum += d;
        }
        diffs.push(sum / (px.length / 4) / 3);
        prev = px;
        void c;
      }
      return { meanAbsDiffPerFrame: diffs };
    },
    /** C3/C4/C11: scripted path over the whole manifest at `speed` m/s; per-frame records. */
    async tour(speed = 3, turnRate = Math.PI / 2) {
      const startRoom = host.model.rooms.find((r) => r.id === host.roomId)?.id ?? host.model.rooms[0]!.id;
      const { segments, unreachable } = buildTour(host.model, router, startRoom);
      const total = segments.reduce((s, x) => s + segmentDuration(x, speed, turnRate), 0);
      const programsBefore = host.renderer.info.programs?.length ?? 0;
      trace = [];
      const rafDeltas: number[] = [];
      const t0 = performance.now();
      let prevT = t0;
      const roomsVisited = new Set<string>();
      for (;;) {
        const now = await nextFrame();
        rafDeltas.push(now - prevT);
        prevT = now;
        const p = poseAt(segments, (now - t0) / 1000, speed, turnRate);
        if (!p) break;
        host.setPose(p.x, p.z, p.yaw, p.pitch);
        if (host.roomId) roomsVisited.add(host.roomId);
      }
      await settle();
      const records = trace;
      trace = null;
      return {
        durationS: (performance.now() - t0) / 1000,
        plannedS: total,
        lengthM: tourLength(segments),
        unreachable,
        roomsVisited: [...roomsVisited].sort(),
        programsBefore,
        programsAfter: host.renderer.info.programs?.length ?? 0,
        frames: records,
        rafDeltas,
      };
    },
    /** C8: lose and restore the WebGL context. */
    async loseContext(restoreAfterMs = 600) {
      const ext = host.renderer.getContext().getExtension("WEBGL_lose_context");
      if (!ext) return { supported: false };
      ext.loseContext();
      await new Promise((r) => setTimeout(r, restoreAfterMs));
      ext.restoreContext();
      return { supported: true };
    },
    /** C6: textured meshes with non-uniform scale, and image planes drawn. */
    sceneAudit() {
      let meshes = 0;
      let nonUniform = 0;
      let transparent = 0;
      const s = new THREE.Vector3();
      host.scene.updateMatrixWorld(true);
      host.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        meshes++;
        mesh.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
        if (Math.abs(s.x - s.y) > 1e-6 || Math.abs(s.y - s.z) > 1e-6) nonUniform++;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (mats.some((m) => m.transparent)) transparent++;
      });
      const imagePlanesDeclared = host.model.exhibits.filter((e) => e.image).length;
      return { meshes, nonUniform, transparent, imagePlanesDeclared, imagePlanesDrawn: 0 };
    },
    /**
     * C12: render one loaded texture's level 0 at 1:1 into an 8-bit target and return the RGB
     * bytes (base64). sRGB textures are re-encoded to sRGB so they compare with the 8-bit source.
     */
    textureLevel0(name: string) {
      const tex = (host.textures ? [...Object.values(host.textures.wall), ...Object.values(host.textures.floor)] : []).find((t) => t.name === name);
      if (!tex) return null;
      const img = tex.image as { width: number; height: number };
      const rt = new THREE.WebGLRenderTarget(img.width, img.height, { type: THREE.UnsignedByteType, depthBuffer: false });
      const srgb = tex.colorSpace === THREE.SRGBColorSpace;
      const mat = new THREE.ShaderMaterial({
        uniforms: { t: { value: tex } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: `precision highp float; uniform sampler2D t; varying vec2 vUv;
          vec3 toSrgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), c)); }
          void main(){ vec4 c = textureLod(t, vUv, 0.0); gl_FragColor = vec4(${srgb ? "toSrgb(c.rgb)" : "c.rgb"}, 1.0); }`,
        depthTest: false,
        depthWrite: false,
      });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      const sc = new THREE.Scene();
      sc.add(quad);
      const r = host.renderer;
      const prevTarget = r.getRenderTarget();
      const prevTone = r.toneMapping;
      r.toneMapping = THREE.NoToneMapping;
      r.setRenderTarget(rt);
      r.render(sc, new THREE.Camera());
      const px = new Uint8Array(img.width * img.height * 4);
      r.readRenderTargetPixels(rt, 0, 0, img.width, img.height, px);
      r.setRenderTarget(prevTarget);
      r.toneMapping = prevTone;
      rt.dispose();
      mat.dispose();
      quad.geometry.dispose();
      // KTX2 rows are stored top-down with flipY = false, so texel row r (from the top of the
      // image) is sampled at v = (r + 0.5) / h, which the full-screen quad writes to render-target
      // row r: read-back row r is image row r. No flip.
      const rgb = new Uint8Array(img.width * img.height * 3);
      for (let i = 0, d = 0; i < px.length; i += 4, d += 3) {
        rgb[d] = px[i]!;
        rgb[d + 1] = px[i + 1]!;
        rgb[d + 2] = px[i + 2]!;
      }
      let bin = "";
      for (let i = 0; i < rgb.length; i += 0x8000) bin += String.fromCharCode(...rgb.subarray(i, i + 0x8000));
      return { width: img.width, height: img.height, flipY: tex.flipY, base64: btoa(bin) };
    },
    frameCount: () => host.framesRendered,
    /**
     * Contrast of an exhibit card's lettering under the scene lighting, from the rendered frame:
     * the card's screen rectangle is read back; paper = 90th, ink = 1st luminance percentile of
     * the title band, muted = 1st percentile of the kicker band. WCAG 2.2 contrast ratios.
     */
    async panelContrast(exhibitId: string) {
      const e = host.model.exhibits.find((x) => x.id === exhibitId);
      if (!e) return null;
      const px = await grab();
      const gl = host.renderer.getContext();
      const W = gl.drawingBufferWidth;
      const H = gl.drawingBufferHeight;
      const p = e.panel;
      const corners = [
        [p.min[0], p.min[1], p.min[2]],
        [p.max[0], p.max[1], p.max[2]],
        [p.min[0], p.max[1], p.min[2]],
        [p.max[0], p.min[1], p.max[2]],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z).project(host.camera));
      const sx = corners.map((v) => ((v.x + 1) / 2) * W);
      const sy = corners.map((v) => ((v.y + 1) / 2) * H); // bottom-up, like readPixels rows
      const x0 = Math.max(0, Math.floor(Math.min(...sx)));
      const x1 = Math.min(W - 1, Math.ceil(Math.max(...sx)));
      const yb = Math.max(0, Math.floor(Math.min(...sy)));
      const yt = Math.min(H - 1, Math.ceil(Math.max(...sy)));
      const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      const band = (f0: number, f1: number) => {
        // f measured from the top of the card.
        const out: number[] = [];
        const r0 = Math.round(yt - (yt - yb) * f1);
        const r1 = Math.round(yt - (yt - yb) * f0);
        const inset = Math.round((x1 - x0) * 0.04);
        for (let y = r0; y <= r1; y++) {
          for (let x = x0 + inset; x <= x1 - inset; x++) {
            const i = (y * W + x) * 4;
            out.push(0.2126 * lin(px[i]!) + 0.7152 * lin(px[i + 1]!) + 0.0722 * lin(px[i + 2]!));
          }
        }
        return out.sort((a, b) => a - b);
      };
      const q = (xs: number[], f: number) => xs[Math.min(xs.length - 1, Math.floor(f * xs.length))] ?? 0;
      // From 8%: the plate is 0.8 m tall (DR-043), so a one-line title ends above 20% of its height
      // and a band from 20% held paper only. The step line (stations) is full ink as well.
      const title = band(0.08, 0.6);
      const kicker = band(0.05, 0.16);
      const paper = q(title, 0.9);
      const ink = q(title, 0.01);
      const muted = q(kicker, 0.01);
      const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      return { screenRect: { x0, x1, yb, yt }, paperLuminance: paper, inkLuminance: ink, mutedLuminance: muted, titleContrast: ratio(paper, ink), kickerContrast: ratio(paper, muted) };
    },
  };
  w.__museumProbe = probe;
  return () => {
    host.setFrameHook(null);
    delete w.__museumProbe;
    delete w.__museumInfo;
  };
}
