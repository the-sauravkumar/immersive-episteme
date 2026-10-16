/**
 * Measurement probe for the rendering-quality checks (immersive-rendering-quality.md §3, C1-C12),
 * driven by tests/e2e/immersive-rendering.spec.ts.
 *
 * `window.__museumInfo` (read-only: tier, backend, render configuration, texture list) is always
 * present so a study session can be audited (C7). The controlling probe `window.__museumProbe`
 * (teleport, forced frames, pixel readback, scripted path, context loss) is installed only when
 * `enabled` (never in study mode: see the page).
 *
 * C2c (DR-058 visual pass): `roomSurfaces`, `portalSurfaces`, `doorFrame` and
 * `directoryLegibility` read the finish off the rendered frame at world points chosen by the pure
 * probe-geometry.ts (projected with the camera that drew the frame, occlusion checked by a ray).
 */
import * as THREE from "three";

import { VISITOR, createRouter } from "@/features/immersive/navigation";
import { emAngle } from "@/features/immersive/placement";
import type { QualityTier } from "@/features/immersive/quality";
import type { SceneModel } from "@/features/immersive/scene-model";
import { buildTour, poseAt, roomOrder, segmentDuration, tourLength, viewpoints, type Pose } from "@/features/immersive/tour-path";
import { DIRECTORY, entranceDirectory } from "@/features/immersive/wayfinding";
import type { Vec3 } from "@/features/spatial/compiler/types";

import {
  C2C,
  ceilingGrid,
  columnPoints,
  doorEdgePoints,
  doorOfRoom,
  DOOR_EDGE_RESOLVED_PX,
  FLOOR_STRIP_RESOLVED_PX,
  facePoint,
  fitView,
  floorStripPx,
  labOfLinear,
  lumaLevels,
  mean,
  median,
  ndcRectToPixels,
  planWallColumns,
  relativeLuminance,
  revealPoints,
  signContrast,
  signInset,
  srgb8ToLinear,
  thresholdPoints,
  viewTarget,
  wallDistanceForStripPx,
} from "./probe-geometry";
import type { WebGLPipeline } from "./three/pipeline";
import { GALLERY_FINISH, STUDY_RENDER_CONFIG, type LoadedTextures } from "./three/resources";
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
/** A frame gap longer than this is a stall: the tour does not jump ahead over it (see `tour`). */
const TOUR_STALL_MS = 1000;

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

  // ---- C2c surface samplers (DR-058 visual pass): world points projected into the rendered frame.

  /** One rendered frame at a pose, with the camera that drew it (for projecting world points). */
  interface Frame {
    px: Uint8Array;
    w: number;
    h: number;
    camera: THREE.PerspectiveCamera;
    eye: THREE.Vector3;
    yaw: number;
    pitch: number;
  }
  interface Sample {
    key: string;
    inFrame: boolean;
    occluded: boolean;
    /** Drawing-buffer pixel (column, row from the bottom). */
    pixel: [number, number] | null;
    /** Median, min and max 8-bit sRGB luma of the patch. */
    luma: number | null;
    lumaMin: number | null;
    lumaMax: number | null;
    /** Mean display-linear RGB of the patch. */
    linear: Vec3 | null;
  }
  const raycaster = new THREE.Raycaster();

  /**
   * Frames from one viewpoint's position, one per direction (the baked surfaces render the same
   * whichever way the camera looks: unlit, no exposure adaptation).
   */
  function frameSource(base: Pose) {
    const frames = new Map<string, Frame>();
    return async (yaw: number, pitch: number): Promise<Frame> => {
      const k = `${yaw.toFixed(5)}|${pitch.toFixed(5)}`;
      const hit = frames.get(k);
      if (hit) return hit;
      await setPoseAndSettle({ ...base, yaw, pitch });
      const px = await grab();
      const gl = host.renderer.getContext();
      const camera = host.camera.clone();
      camera.updateMatrixWorld(true);
      const f: Frame = { px, w: gl.drawingBufferWidth, h: gl.drawingBufferHeight, camera, eye: camera.getWorldPosition(new THREE.Vector3()), yaw, pitch };
      frames.set(k, f);
      return f;
    };
  }

  /** Drawing-buffer position of a world point in a frame (null behind the camera). */
  function toPixel(f: Frame, p: Vec3): { x: number; y: number; inFrame: boolean } | null {
    const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(f.camera.matrixWorldInverse);
    if (v.z > -f.camera.near) return null;
    v.applyMatrix4(f.camera.projectionMatrix);
    const x = ((v.x + 1) / 2) * f.w;
    const y = ((v.y + 1) / 2) * f.h;
    return { x, y, inFrame: x >= 0 && x < f.w && y >= 0 && y < f.h };
  }

  /** Visible meshes, the occluders of a sample point. */
  function visibleMeshes(): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = [];
    host.scene.traverseVisible((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o);
    });
    return meshes;
  }

  /** Something drawn between the eye and the point (other than the surface the point lies on, 1 cm tolerance). */
  function occluded(f: Frame, p: Vec3, meshes: THREE.Object3D[]): boolean {
    const target = new THREE.Vector3(p[0], p[1], p[2]);
    const dir = target.clone().sub(f.eye);
    const dist = dir.length();
    raycaster.set(f.eye, dir.normalize());
    raycaster.near = 0;
    raycaster.far = Math.max(0, dist - 0.01);
    return raycaster.intersectObjects(meshes, false).length > 0;
  }

  function samplePoint(f: Frame, key: string, p: Vec3, patch: { rx: number; ry: number }, meshes: THREE.Object3D[]): Sample {
    const at = toPixel(f, p);
    if (!at || !at.inFrame) return { key, inFrame: false, occluded: false, pixel: null, luma: null, lumaMin: null, lumaMax: null, linear: null };
    const ix = Math.floor(at.x);
    const iy = Math.floor(at.y);
    const lumas: number[] = [];
    const lin: Vec3 = [0, 0, 0];
    for (let dy = -patch.ry; dy <= patch.ry; dy++) {
      for (let dx = -patch.rx; dx <= patch.rx; dx++) {
        const x = ix + dx;
        const y = iy + dy;
        if (x < 0 || y < 0 || x >= f.w || y >= f.h) continue;
        const i = (y * f.w + x) * 4;
        const r = f.px[i]!;
        const g = f.px[i + 1]!;
        const b = f.px[i + 2]!;
        lumas.push(lumaLevels(r, g, b));
        lin[0] += srgb8ToLinear(r);
        lin[1] += srgb8ToLinear(g);
        lin[2] += srgb8ToLinear(b);
      }
    }
    const n = lumas.length;
    return {
      key,
      inFrame: true,
      occluded: occluded(f, p, meshes),
      pixel: [ix, iy],
      luma: median(lumas),
      lumaMin: Math.min(...lumas),
      lumaMax: Math.max(...lumas),
      linear: [lin[0] / n, lin[1] / n, lin[2] / n],
    };
  }

  const good = (s: Sample) => s.inFrame && !s.occluded && s.luma !== null;
  const meanLinear = (ss: Sample[]): Vec3 => {
    const ok = ss.filter((s) => good(s) && s.linear);
    return [mean(ok.map((s) => s.linear![0])), mean(ok.map((s) => s.linear![1])), mean(ok.map((s) => s.linear![2]))];
  };
  const round = (v: number, d = 3) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : v);
  const roundLab = (l: { L: number; a: number; b: number; C: number }) => ({ L: round(l.L, 2), a: round(l.a, 2), b: round(l.b, 2), C: round(l.C, 2) });
  const lumaOf = (ss: Sample[], key: string) => ss.find((s) => s.key === key)?.luma ?? NaN;

  /** The direction that frames the points from the pose's position (probe-geometry.ts `fitView`). */
  const viewFor = (base: Pose, points: Vec3[]) => fitView(base, VISITOR.eyeHeight, points, host.camera.fov, host.camera.aspect, { limit: VISITOR.pitchLimit });
  const turnedDeg = (base: Pose, yaw: number) => round((Math.atan2(Math.sin(yaw - base.yaw), Math.cos(yaw - base.yaw)) * 180) / Math.PI, 1);

  /**
   * Reads `essential` points (every one must be in frame and unoccluded) and `extra` points (used
   * where visible) in one frame: at the pose's own direction, else tilted, else turned towards the
   * points (`fitView`); `pitch` and `turnedDeg` report which.
   */
  async function readGroup(frameAt: (yaw: number, pitch: number) => Promise<Frame>, base: Pose, essential: { key: string; p: Vec3 }[], extra: { key: string; p: Vec3 }[], patch: { rx: number; ry: number }) {
    const fitOn = essential.length ? essential : extra;
    const dir = viewFor(base, fitOn.map((e) => e.p));
    if (!dir) return { ok: false, reason: "the points do not fit one frame", pitch: null, turnedDeg: null, samples: [] as Sample[] };
    const f = await frameAt(dir.yaw, dir.pitch);
    const meshes = visibleMeshes();
    const samples = [...essential, ...extra].map((e) => samplePoint(f, e.key, e.p, patch, meshes));
    const bad = samples.slice(0, essential.length).filter((s) => !good(s));
    return { ok: bad.length === 0, reason: bad.length ? bad.map((b) => `${b.key} ${b.inFrame ? "occluded" : "out of frame"}`).join("; ") : null, pitch: round(dir.pitch, 4), turnedDeg: turnedDeg(base, dir.yaw), samples };
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
      // Tour time advances with the frames, but a gap over TOUR_STALL_MS (no frame at all for
      // that long) advances it by one ordinary frame only: the visitor then goes on from where the
      // frames stopped instead of jumping ahead and skipping rooms. The gap itself stays in
      // `rafDeltas` (C3/C4) and is listed in `stalls` (DR-062: the low-spec headless shell gave no
      // frame for 90 to 125 s, once or twice a tour, with the main thread idle).
      let tourT = 0;
      const stalls: { atS: number; gapS: number }[] = [];
      const roomsVisited = new Set<string>();
      for (;;) {
        const now = await nextFrame();
        const delta = now - prevT;
        rafDeltas.push(delta);
        prevT = now;
        if (delta > TOUR_STALL_MS) stalls.push({ atS: Math.round(tourT * 10) / 10, gapS: Math.round(delta / 100) / 10 });
        tourT += (delta > TOUR_STALL_MS ? 1000 / 60 : delta) / 1000;
        const p = poseAt(segments, tourT, speed, turnRate);
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
        stalls,
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
    /**
     * C2c on a `room:<id>#wall` view (DR-058 visual pass, spec §A1-A3): on the wall the view faces,
     * at the column nearest the view axis that is clear of plates, signs, doorways and anything on
     * the floor (probe-geometry.ts `planWallColumns`), reads
     *  - the wall at 0.3, 1.9 and 3.0 m (8-bit sRGB luma) and the CIELAB of the card band;
     *  - the floor 5 cm and 1.5 m from the wall and the CIELAB of the floor 0.6-1.6 m out;
     *  - the ceiling 0.25 m and 2 m from the wall, and the brightest pixel of the ceiling in view.
     * Each group is read in one frame from the viewpoint's position, at its own direction or tilted
     * or turned until the group's points fit (the baked surfaces do not change with the direction;
     * `pitch` and `turnedDeg` report it).
     */
    async roomSurfaces(view: Pose & { id?: string; roomId?: string }) {
      const roomId = view.roomId ?? viewTarget(view.id ?? "").target;
      const plan = planWallColumns(host.model, roomId, view);
      if ("reason" in plan) return { roomId, viewId: view.id ?? null, reason: plan.reason, wall: null, floor: null, ceiling: null };
      const { face, columns } = plan;
      const frameAt = frameSource(view);
      const column = (c: (typeof columns)[number]) => ({ lateral: c.lateral, offset: c.offset, tier: c.tier });
      /** The first column (of at most C2C.maxColumns that one direction can frame) whose group reads clear. */
      const firstClear = async (points: (c: (typeof columns)[number]) => { essential: { key: string; p: Vec3 }[]; extra: { key: string; p: Vec3 }[] }, patch: { rx: number; ry: number }) => {
        let reason = "no column that one direction can frame";
        let framed = 0;
        for (const c of columns) {
          if (framed >= C2C.maxColumns) break;
          const { essential, extra } = points(c);
          const r = await readGroup(frameAt, view, essential, extra, patch);
          if (r.pitch === null) continue;
          framed++;
          if (r.ok) return { c, r, reason: null };
          reason = r.reason ?? reason;
        }
        return { c: null, r: null, reason };
      };

      let wall: Record<string, unknown> | null = null;
      const w = await firstClear((c) => {
        const pts = columnPoints(face, c);
        return { essential: pts.wall, extra: pts.band };
      }, { rx: 3, ry: 1 });
      if (w.c && w.r) {
        const pts = columnPoints(face, w.c);
        const samples = w.r.samples;
        const [l03, l19, l30] = pts.wall.map((p) => lumaOf(samples, p.key)) as [number, number, number];
        const band = samples.filter((s) => s.key.startsWith("band:"));
        wall = {
          column: column(w.c),
          pitch: w.r.pitch,
          turnedDeg: w.r.turnedDeg,
          heights: C2C.wallHeights,
          levels: [round(l03, 2), round(l19, 2), round(l30, 2)],
          ratioLow: round(l03 / l19, 4),
          ratioHigh: round(l30 / l19, 4),
          lab: roundLab(labOfLinear(meanLinear(band))),
          bandSamples: band.filter(good).length,
        };
      }

      // One pixel row at the near point: 5 cm of floor is 2 to 4 px deep from the room centre.
      // `near` and `far` are means over the sampling column and the `floorAlong` columns (the grain
      // moves one read by several levels); the column's own reads are kept as `columnNear/Far`.
      let floor: Record<string, unknown> | null = null;
      const fl = await firstClear((c) => {
        const pts = columnPoints(face, c);
        return { essential: pts.floor, extra: [...pts.floorLine, ...pts.floorRegion] };
      }, { rx: 3, ry: 0 });
      // From the centre of a deep room the 5 cm strip is under a pixel tall, so the near read blends
      // the floor with the skirting and the wall (DR-062). Then the same column is read again from
      // straight in front of it, at the distance where the strip spans about 2.5 px.
      let floorCloser: { distance: number; stripPxAtView: number; stripPx: number } | null = null;
      if (fl.c && fl.r) {
        const gl = host.renderer.getContext();
        const focalPx = gl.drawingBufferHeight / 2 / Math.tan((host.camera.fov * Math.PI) / 360);
        const perpendicular = face.depth - face.cameraDepth;
        const atView = floorStripPx(focalPx, VISITOR.eyeHeight, perpendicular, C2C.floorNear);
        if (atView < FLOOR_STRIP_RESOLVED_PX) {
          const distance = wallDistanceForStripPx(focalPx, VISITOR.eyeHeight, C2C.floorNear, 2.5, perpendicular);
          const at = facePoint(face, fl.c.lateral, face.depth - distance, 0);
          const base: Pose = { ...view, x: at[0], z: at[2] };
          const pts = columnPoints(face, fl.c);
          const r = await readGroup(frameSource(base), base, pts.floor, [...pts.floorLine, ...pts.floorRegion], { rx: 3, ry: 0 });
          if (r.ok && r.pitch !== null && r.turnedDeg !== null) {
            fl.r = { ...r, pitch: r.pitch, turnedDeg: r.turnedDeg };
            floorCloser = { distance: round(distance, 2), stripPxAtView: round(atView, 2), stripPx: round(floorStripPx(focalPx, VISITOR.eyeHeight, distance, C2C.floorNear), 2) };
          }
        }
      }
      if (fl.c && fl.r) {
        const samples = fl.r.samples;
        const lineMean = (which: "near" | "far") => {
          const ss = samples.filter((s) => (s.key === `floor@${which}` || s.key.startsWith(`floor@${which}:`)) && good(s));
          return { mean: mean(ss.map((s) => s.luma!)), n: ss.length };
        };
        const near = lineMean("near");
        const far = lineMean("far");
        const columnNear = lumaOf(samples, "floor@near");
        const columnFar = lumaOf(samples, "floor@far");
        const region = samples.filter((s) => s.key.startsWith("floorRegion:"));
        floor = {
          column: column(fl.c),
          pitch: fl.r.pitch,
          turnedDeg: fl.r.turnedDeg,
          near: round(near.mean, 2),
          far: round(far.mean, 2),
          delta: round(far.mean - near.mean, 2),
          nearSamples: near.n,
          farSamples: far.n,
          columnNear: round(columnNear, 2),
          columnFar: round(columnFar, 2),
          columnDelta: round(columnFar - columnNear, 2),
          lab: roundLab(labOfLinear(meanLinear(region))),
          regionSamples: region.filter(good).length,
          closer: floorCloser,
        };
      }

      let ceiling: Record<string, unknown> | null = null;
      const cl =
        face.ceilingY === null
          ? { c: null, r: null, reason: "room has no ceiling" }
          : await firstClear((c) => ({ essential: columnPoints(face, c).ceiling, extra: ceilingGrid(face, c, { cove: GALLERY_FINISH.cove.width, maxOut: 3.5, halfWidth: 1, step: 0.25 }) }), { rx: 3, ry: 0 });
      if (cl.c && cl.r) {
        const near = lumaOf(cl.r.samples, "ceiling@near");
        const inner = lumaOf(cl.r.samples, "ceiling@in");
        const seen = cl.r.samples.filter(good);
        ceiling = { column: column(cl.c), pitch: cl.r.pitch, turnedDeg: cl.r.turnedDeg, near: round(near, 2), in: round(inner, 2), delta: round(near - inner, 2), max: Math.max(...seen.map((s) => s.lumaMax!)), gridSamples: seen.length - 2 };
      }
      return {
        roomId,
        viewId: view.id ?? null,
        facing: face.facing,
        normalAxis: face.normalAxis,
        wallDistance: round(face.depth - face.cameraDepth),
        columnsAvailable: columns.length,
        wall,
        floor,
        ceiling,
        reasons: { wall: w.reason, floor: fl.reason, ceiling: cl.reason },
      };
    },
    /**
     * C2c on a `<portal>#through` view (spec §A4): the mean 8-bit sRGB luma of each jamb's reveal
     * (the lining face along the opening, 0.8-1.9 m, 20-80% of the wall thickness) and of the
     * threshold sill (inset 20%), each from the points that are in view and unoccluded.
     */
    async portalSurfaces(view: Pose & { id?: string }) {
      const portalId = viewTarget(view.id ?? "").target;
      const portal = host.model.portals.find((p) => p.id === portalId);
      if (!portal) return { portalId, reason: "no such doorway", reveal: null, threshold: null };
      const frameAt = frameSource(view);
      const jambPoints = revealPoints(portal);
      const all = jambPoints.flatMap((j) => j.points.map((p, i) => ({ key: `reveal:${j.jamb}:${i}`, p })));
      const rv = await readGroup(frameAt, view, [], all, { rx: 1, ry: 1 });
      const jambs = jambPoints.map((j) => {
        const ss = rv.samples.filter((s) => s.key.startsWith(`reveal:${j.jamb}:`) && good(s));
        return { jamb: j.jamb, n: ss.length, of: j.points.length, mean: round(mean(ss.map((s) => s.luma!)), 2) };
      });
      const seen = rv.samples.filter(good);
      // The reveal faces' normal runs along the opening (world.ts tints the faces along `alongAxis`):
      // a face normal to x carries the fixed face shading `xFacing`, as the walls do.
      const normalAxis: "x" | "z" = portal.axis === "z" ? "z" : "x";
      const reveal = { pitch: rv.pitch, turnedDeg: rv.turnedDeg, normalAxis, jambs, n: seen.length, mean: round(mean(seen.map((s) => s.luma!)), 2), reason: rv.pitch === null ? rv.reason : null };
      const tp = thresholdPoints(portal.threshold).map((p, i) => ({ key: `threshold:${i}`, p }));
      let threshold: { pitch: number | null; turnedDeg: number | null; n: number; of: number; mean: number; reason: string | null } | null = null;
      if (tp.length) {
        const th = await readGroup(frameAt, view, [], tp, { rx: 1, ry: 1 });
        const ss = th.samples.filter(good);
        threshold = { pitch: th.pitch, turnedDeg: th.turnedDeg, n: ss.length, of: tp.length, mean: round(mean(ss.map((s) => s.luma!)), 2), reason: th.pitch === null ? th.reason : null };
      }
      return { portalId, reason: null, reveal, threshold };
    },
    /**
     * C2c on a `room:<id>#door` view (spec §A4): the door frame against the wall. For each jamb and
     * height, the darkest pixel across the jamb's 20 mm room-facing edge (the frame's darkest part,
     * the edge colour) against the wall 0.25 m beyond the opening on the same face (5 x 5 median);
     * WCAG ratio of the medians over the heights. A jamb whose edge spans fewer than
     * DOOR_EDGE_RESOLVED_PX on screen is reported and not measured; when no jamb is measurable from
     * the view, the edge is read again from nearer the doorway (see below).
     */
    async doorFrame(view: Pose & { id?: string; roomId?: string }) {
      const roomId = view.roomId ?? viewTarget(view.id ?? "").target;
      const portal = doorOfRoom(host.model, roomId);
      if (!portal) return { roomId, portalId: null, reason: "room has no doorway", jambs: [], ratio: null };
      /** Reads every jamb from `base`; a jamb is measured when its edge spans at least DOOR_EDGE_RESOLVED_PX. */
      const read = async (base: Pose) => {
        const edges = doorEdgePoints(portal, base);
        const pts = edges.flatMap((j) => j.rows.flatMap((r) => [r.edge[0], r.edge[1], r.wall]));
        const dir = viewFor(base, pts);
        if (!dir) return null;
        const f = await frameSource(base)(dir.yaw, dir.pitch);
        const meshes = visibleMeshes();
        const lumAt = (x: number, y: number) => {
          const i = (y * f.w + x) * 4;
          return relativeLuminance(f.px[i]!, f.px[i + 1]!, f.px[i + 2]!);
        };
        const jambs = edges.map((j) => {
          const rows: { y: number; widthPx: number; frame: number; wall: number }[] = [];
          for (const r of j.rows) {
            const a = toPixel(f, r.edge[0]);
            const b = toPixel(f, r.edge[1]);
            const mid: Vec3 = [(r.edge[0][0] + r.edge[1][0]) / 2, r.y, (r.edge[0][2] + r.edge[1][2]) / 2];
            const wp = toPixel(f, r.wall);
            if (!a?.inFrame || !b?.inFrame || !wp?.inFrame || occluded(f, mid, meshes) || occluded(f, r.wall, meshes)) continue;
            const row = Math.floor((a.y + b.y) / 2);
            let frame = Infinity;
            for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x)) - 1); x <= Math.min(f.w - 1, Math.ceil(Math.max(a.x, b.x)) + 1); x++) frame = Math.min(frame, lumAt(x, row));
            const wl: number[] = [];
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
              const x = Math.floor(wp.x) + dx;
              const y = Math.floor(wp.y) + dy;
              if (x >= 0 && y >= 0 && x < f.w && y < f.h) wl.push(lumAt(x, y));
            }
            rows.push({ y: r.y, widthPx: round(Math.abs(b.x - a.x), 2), frame, wall: median(wl) });
          }
          const widthPx = median(rows.map((r) => r.widthPx));
          const frameL = median(rows.map((r) => r.frame));
          const wallL = median(rows.map((r) => r.wall));
          const measured = rows.length >= 2 && widthPx >= DOOR_EDGE_RESOLVED_PX;
          const ratio = (Math.max(frameL, wallL) + 0.05) / (Math.min(frameL, wallL) + 0.05);
          const reason = measured ? null : rows.length < 2 ? "edge not in view" : `edge under ${DOOR_EDGE_RESOLVED_PX} px wide`;
          return { jamb: j.jamb, rows: rows.length, widthPx: round(widthPx, 2), frameLuminance: round(frameL, 4), wallLuminance: round(wallL, 4), ratio: round(ratio, 3), measured, reason };
        });
        const measured = jambs.filter((j) => j.measured);
        return { pitch: round(dir.pitch, 4), turnedDeg: turnedDeg(base, dir.yaw), jambs, ratio: measured.length ? Math.min(...measured.map((j) => j.ratio)) : null };
      };
      const atView = await read(view);
      if (!atView) return { roomId, portalId: portal.id, reason: "the door does not fit one frame", jambs: [], ratio: null };
      // From the room centre the 20 mm edge can be narrower than 2 px; no pixel is then wholly the
      // edge (anti-aliasing blends it with the reveal and the wall), so its colour cannot be read
      // there. The room-centre reading is kept (`viewRatio`, `viewJambs`), and the edge is read
      // again from a point on the line to the doorway where it spans about 2.5 px (DR-062).
      let closer: { distance: number; scale: number; pitch: number; turnedDeg: number; jambs: typeof atView.jambs; ratio: number | null } | null = null;
      if (atView.ratio === null) {
        const seen = atView.jambs.filter((j) => j.rows >= 2 && j.widthPx > 0);
        const door = doorEdgePoints(portal, view).flatMap((j) => j.rows.flatMap((r) => r.edge));
        const cx = mean(door.map((p) => p[0]));
        const cz = mean(door.map((p) => p[2]));
        const d = Math.hypot(view.x - cx, view.z - cz);
        if (seen.length && d > 0) {
          const distance = Math.max(1, (d * Math.max(...seen.map((j) => j.widthPx))) / 2.5);
          const base: Pose = { ...view, x: cx + ((view.x - cx) * distance) / d, z: cz + ((view.z - cz) * distance) / d };
          const r = await read(base);
          if (r) closer = { distance: round(distance, 2), scale: round(distance / d, 3), ...r };
        }
      }
      const used = closer && closer.ratio !== null ? closer : atView;
      return {
        roomId,
        portalId: portal.id,
        pitch: used.pitch,
        turnedDeg: used.turnedDeg,
        reason: used.ratio !== null ? null : "no jamb measurable",
        jambs: used.jambs,
        ratio: used.ratio,
        viewRatio: atView.ratio,
        viewJambs: atView.jambs,
        closer: closer ? { distance: closer.distance, scale: closer.scale } : null,
      };
    },
    /**
     * C2c directory at a pose (spec §A5; the spec runs it at `spawnView()`): for the heading and each
     * row, paper/ink contrast in its screen rectangle from the rendered frame (the plaque method), and
     * the angle its title em subtends from the eye (placement.ts `emAngle` at the eye-to-centre
     * distance, plus the angle actually subtended by a vertical em at the sign's centre).
     */
    async directoryLegibility(pose: Pose) {
      const dir = entranceDirectory(host.model).directory;
      if (!dir) return null;
      const f = await frameSource(pose)(pose.yaw, pose.pitch);
      const signs = [{ id: dir.heading.id, kind: "heading" as const, em: DIRECTORY.headingEm, plane: dir.heading.sign }, ...dir.rows.map((r) => ({ id: r.id, kind: "row" as const, em: DIRECTORY.titleEm, plane: r.sign }))];
      const rows = signs.map((s) => {
        const { min, max } = s.plane;
        const corners: Vec3[] = [
          [min[0], min[1], min[2]],
          [max[0], max[1], max[2]],
          [min[0], max[1], min[2]],
          [max[0], min[1], max[2]],
        ];
        const ndc = corners.map((c) => new THREE.Vector3(...c).project(f.camera));
        const behind = corners.some((c) => new THREE.Vector3(...c).applyMatrix4(f.camera.matrixWorldInverse).z > -f.camera.near);
        const rect = behind ? null : ndcRectToPixels(ndc, f.w, f.h);
        let contrast: ReturnType<typeof signContrast> = null;
        if (rect) {
          const r = signInset(rect);
          const ls: number[] = [];
          for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
            const i = (y * f.w + x) * 4;
            ls.push(relativeLuminance(f.px[i]!, f.px[i + 1]!, f.px[i + 2]!));
          }
          contrast = signContrast(ls);
        }
        const c = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
        const d = c.distanceTo(f.eye);
        const top = c.clone().add(new THREE.Vector3(0, s.em / 2, 0));
        const bottom = c.clone().add(new THREE.Vector3(0, -s.em / 2, 0));
        const subtended = top.clone().sub(f.eye).angleTo(bottom.clone().sub(f.eye));
        const pt = top.clone().project(f.camera);
        const pb = bottom.clone().project(f.camera);
        return {
          id: s.id,
          kind: s.kind,
          rect,
          contrast: contrast ? round(contrast.ratio, 2) : null,
          paper: contrast ? round(contrast.paper, 4) : null,
          ink: contrast ? round(contrast.ink, 4) : null,
          distance: round(d),
          em: s.em,
          emAngle: round(emAngle(s.em, d), 5),
          emSubtended: round(subtended, 5),
          emPx: round((Math.abs(pt.y - pb.y) / 2) * f.h, 2),
        };
      });
      const lettered = rows.filter((r) => r.kind === "row");
      return {
        roomId: dir.roomId,
        drawingBuffer: { width: f.w, height: f.h },
        rows,
        minContrast: Math.min(...rows.map((r) => r.contrast ?? 0)),
        minTitleEmAngle: Math.min(...lettered.map((r) => r.emAngle)),
        minTitleEmSubtended: Math.min(...lettered.map((r) => r.emSubtended)),
      };
    },
  };
  w.__museumProbe = probe;
  return () => {
    host.setFrameHook(null);
    delete w.__museumProbe;
    delete w.__museumInfo;
  };
}
