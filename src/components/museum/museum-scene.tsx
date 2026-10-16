"use client";

/**
 * The 3D museum inside the R3F <Canvas>: builds the world from the scene model, walks the
 * visitor, streams room lettering, and renders on demand through the WebGL pipeline.
 *
 * Render on demand (immersive-rendering-quality.md §2b): the canvas runs with
 * frameloop="demand"; a frame is requested only while the visitor moves, anti-aliasing is still
 * accumulating, lettering is loading, or the view changed (hover, route). A still museum renders
 * nothing. Hidden tabs and pauses stop the loop entirely (frameloop "never").
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { CollisionWorld, VISITOR, compassPoint, createRouter, facingExhibit, moveInputFromKeys, stepVisitor, yawFromDeg, type MoveInput, type VisitorState } from "@/features/immersive/navigation";
import { doorSigns, type SceneDoorSign } from "@/features/immersive/placement";
import { TIERS, type QualityTier } from "@/features/immersive/quality";
import { enterCuesOnCrossing, residentRooms, roomAt, type SceneModel, type SceneRoom } from "@/features/immersive/scene-model";
import { plaqueText } from "@/features/immersive/plaque-text";
import { directoryReadingPoint, doorwayAtWallHit, doorwayToRoomSeen, doorwayWalkTarget, entranceDirectory, farSide } from "@/features/immersive/wayfinding";

import type { InputMethod, MuseumBridge } from "./bridge";
import { isTypingTarget } from "./keys";
import { installProbe, type ProbeHost } from "./probe";
import { ensureLabelFonts } from "./three/labels";
import { WebGLPipeline } from "./three/pipeline";
import { STUDY_RENDER_CONFIG, createLighting, createMaterials, disposeKtx2Loader, loadArchitectureTextures, type LoadedTextures, type Materials } from "./three/resources";
import { MuseumWorld } from "./three/world";

/** Radians per pixel of mouse travel in right-button mouse look (one fixed value for every participant). */
const MOUSE_LOOK_SENSITIVITY = 0.0025;
const MOVE_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"]);
const DRAG_THRESHOLD_PX = 5;
/** Milliseconds of lettering drawing per frame while rooms stream in (a third of a 60 Hz frame). */
const LETTERING_SLICE_MS = 5;


export interface MuseumSceneProps {
  model: SceneModel;
  tier: QualityTier;
  bridge: MuseumBridge;
  describeDoor: (s: SceneDoorSign) => { kicker: string | null; title: string };
  probe: boolean;
  gpuRenderer: string | null;
  /**
   * Height in CSS px of the opaque chrome above the canvas. The canvas starts below the chrome, and
   * the camera renders the lower part of a virtual frame that is this much taller (see
   * `installFrameCrop`), so on-screen sizes are those of a canvas reaching up under the chrome.
   */
  cropTop: number;
  /**
   * Where the scene left free by the overlays starts, in CSS px below the canvas top (under the
   * learning-task prompts, `[data-slot=museum-hud-left]`). Read when the docked panel's inset is set: the exhibit is then framed
   * at the centre of the free area left of the panel and below that row.
   */
  frameTop: () => number;
}

/**
 * The visible window of the virtual frame: the canvas shows rows `top`..`fullHeight` (CSS px) of a
 * frame `fullHeight` tall whose top `top` px sit behind the chrome.
 */
interface FrameCrop {
  top: number;
  fullHeight: number;
  /** Width / fullHeight: the virtual frame's aspect (0 until the canvas is measured). */
  aspect: number;
  /**
   * Lens shift in CSS px: where the optical axis meets the canvas, relative to its unshifted place
   * (+x right, +y down). It frames the exhibit beside the docked panel (`setPanelInset`).
   */
  shiftX: number;
  shiftY: number;
}

/**
 * Makes the camera project only the visible window of the virtual full-height frame. The vertical
 * field of view and aspect describe the virtual frame (canvas height plus the chrome above it), so
 * lettering, exhibits and the horizon sit exactly where they would on a canvas that ran up under
 * the chrome, but no pixel is rendered behind the chrome.
 *
 * Why not a canvas under the chrome: an opaque layer over the top of the WebGL canvas made
 * Chromium leave the canvas's bottom rows uncomposited (they showed the page ground, a band as
 * tall as the chrome, while readPixels returned the floor). A shorter canvas with the same field
 * of view would shrink everything on screen. Cropping the projection avoids both.
 *
 * `setViewOffset` cannot carry the crop: TAARenderPass jitters with `setViewOffset` and ends with
 * `clearViewOffset`, and `setViewOffset` also overwrites `camera.aspect` with the drawing buffer's
 * own aspect. So the crop and the virtual aspect live in `crop`, and the projection is composed
 * from them, with the jitter view (in drawing-buffer pixels of the canvas) applied inside the
 * cropped window exactly as three 0.186.1 `PerspectiveCamera.updateProjectionMatrix` applies a view.
 */
function installFrameCrop(camera: THREE.PerspectiveCamera, crop: { current: FrameCrop }): () => void {
  const own = Object.prototype.hasOwnProperty.call(camera, "updateProjectionMatrix") ? camera.updateProjectionMatrix : null;
  camera.updateProjectionMatrix = function (this: THREE.PerspectiveCamera) {
    const near = this.near;
    let top = (near * Math.tan(THREE.MathUtils.DEG2RAD * 0.5 * this.fov)) / this.zoom;
    let height = 2 * top;
    const c = crop.current;
    let width = (c.aspect > 0 ? c.aspect : this.aspect) * height;
    let left = -0.5 * width;
    if (c.top > 0 && c.fullHeight > c.top) {
      top -= (c.top * height) / c.fullHeight;
      height *= (c.fullHeight - c.top) / c.fullHeight;
    }
    // Lens shift (an off-axis frustum): the image plane stays parallel to the view, so a framed
    // plate is seen square-on, not keystoned as a yawed camera would show it.
    if (c.fullHeight > c.top && c.aspect > 0) {
      left -= (c.shiftX / (c.aspect * c.fullHeight)) * width;
      top += (c.shiftY / (c.fullHeight - c.top)) * height;
    }
    const view = this.view;
    if (view !== null && view.enabled) {
      left += (view.offsetX * width) / view.fullWidth;
      top -= (view.offsetY * height) / view.fullHeight;
      width *= view.width / view.fullWidth;
      height *= view.height / view.fullHeight;
    }
    if (this.filmOffset !== 0) left += (near * this.filmOffset) / this.getFilmWidth();
    const reversed = (this as unknown as { reversedDepth?: boolean }).reversedDepth;
    (this.projectionMatrix.makePerspective as (...a: unknown[]) => THREE.Matrix4)(left, left + width, top, top - height, near, this.far, this.coordinateSystem, reversed);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  };
  return () => {
    if (own) camera.updateProjectionMatrix = own;
    else delete (camera as { updateProjectionMatrix?: unknown }).updateProjectionMatrix;
    camera.updateProjectionMatrix();
  };
}

export function MuseumScene({ model, tier, bridge, describeDoor, probe, gpuRenderer, cropTop, frameTop }: MuseumSceneProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const viewport = useThree((s) => s.viewport);
  const invalidate = useThree((s) => s.invalidate);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const getState = useThree((s) => s.get);
  const cfg = TIERS[tier];

  const collision = useMemo(() => new CollisionWorld(model.colliders), [model]);
  const router = useMemo(() => createRouter(model.rooms, model.colliders), [model]);
  const exhibitsById = useMemo(() => new Map(model.exhibits.map((e) => [e.id, e])), [model]);
  const roomsById = useMemo(() => new Map(model.rooms.map((r) => [r.id, r])), [model]);
  /**
   * Signs that walk the visitor through a doorway when clicked (3D-B): each door sign leads to the
   * room it names, each directory row to the room its doorway opens into.
   */
  const directory = useMemo(() => entranceDirectory(model).directory, [model]);
  const signDoorways = useMemo(() => {
    const m = new Map<string, { portalId: string; toRoomId: string }>();
    for (const d of doorSigns(model)) m.set(d.id, { portalId: d.portalId, toRoomId: d.toRoomId });
    for (const r of entranceDirectory(model).directory?.rows ?? []) m.set(r.id, { portalId: r.portalId, toRoomId: r.toRoomId });
    return m;
  }, [model]);

  const runtime = useRef<{
    world: MuseumWorld | null;
    pipeline: WebGLPipeline | null;
    materials: Materials | null;
    textures: LoadedTextures | null;
    ready: boolean;
    paused: boolean;
    hidden: boolean;
    lost: boolean;
    visitor: VisitorState;
    look: { yaw: number; pitch: number };
    keys: Set<string>;
    roomId: string | null;
    /** Set by the pointer handlers: the doorway a sign or wall hit stands for. */
    doorwayOf?: (hit: { owner: { kind: string; id: string }; point: THREE.Vector3 }) => { portalId: string; toRoomId: string } | null;
    wantResident: Set<string>;
    lastPose: string;
    onArrive: (() => void) | null;
    panelInset: number;
    /** Fraction of the canvas width the PlaceRail covers at the left (setRailInset). */
    railInset: number;
    /** frameTop() when the inset was set: the framing does not follow later overlay changes. */
    panelFrameTop: number;
    panelInsetY: number;
    hoverQueued: { x: number; y: number } | null;
    cueArmed: Map<string, boolean>;
    cueTimer: number;
    cueAt: { x: number; z: number };
    framesRendered: number;
    probeHook: ((info: { moving: boolean; converging: boolean }) => void) | null;
    poseOverride: boolean;
    /** Free mouse look is on; `setFreeLook` is installed by the pointer handlers. */
    freeLook: boolean;
    setFreeLook: ((on: boolean) => void) | null;
    /** Right-button mouse look is held. */
    mouseLooking: boolean;
    /** The input method reported last (null at the start of a navigation interval). */
    lastMethod: InputMethod | null;
    /** The compass point last reported to the Plan (headingChanged). */
    headingDeg: number | null;
    /** Visited exhibits to apply once the world exists. */
    visited: string[];
  }>({
    world: null,
    pipeline: null,
    materials: null,
    textures: null,
    ready: false,
    paused: false,
    hidden: false,
    lost: false,
    visitor: { x: model.spawn.x, z: model.spawn.z, vx: 0, vz: 0, yaw: yawFromDeg(model.spawn.yawDeg), pitch: 0, route: [], routeYaw: null },
    look: { yaw: yawFromDeg(model.spawn.yawDeg), pitch: 0 },
    keys: new Set(),
    roomId: null,
    wantResident: new Set(),
    lastPose: "",
    onArrive: null,
    panelInset: 0,
    railInset: 0,
    panelFrameTop: 0,
    panelInsetY: 0,
    hoverQueued: null,
    cueArmed: new Map(),
    cueTimer: 0,
    cueAt: { x: Number.POSITIVE_INFINITY, z: 0 },
    freeLook: false,
    setFreeLook: null,
    mouseLooking: false,
    framesRendered: 0,
    probeHook: null,
    poseOverride: false,
    lastMethod: null,
    headingDeg: null,
    visited: [],
  });

  /**
   * Reports a switch of input method: the first move of a navigation interval, then every change
   * to another method (consecutive uses of one method are one report).
   */
  const noteMethod = useCallback(
    (m: InputMethod) => {
      const rt = runtime.current;
      if (rt.lastMethod === m) return;
      rt.lastMethod = m;
      bridge.events.inputMethodUsed?.(m);
    },
    [bridge],
  );

  // The projection is cropped to the part of the virtual frame below the chrome (installFrameCrop);
  // the camera is "manual", so R3F never resets its aspect to the canvas's own.
  const crop = useRef<FrameCrop>({ top: 0, fullHeight: 0, aspect: 0, shiftX: 0, shiftY: 0 });
  const frameTopRef = useRef(frameTop);
  useEffect(() => {
    frameTopRef.current = frameTop;
  }, [frameTop]);

  /**
   * The lens shift that frames the exhibit beside the docked panel: the optical axis at the centre
   * of the free area, between the PlaceRail (`railInset` of the width, when shown) and the panel
   * (`panelInset` of the width), and below the overlay row (`panelFrameTop`). The vertical shift is
   * capped at a quarter of the canvas height. With no panel docked the lens is never shifted.
   */
  const lensTarget = useCallback(() => {
    const rt = runtime.current;
    const c = crop.current;
    if (rt.panelInset <= 0 || c.aspect <= 0 || c.fullHeight <= c.top) return { x: 0, y: 0 };
    const visible = c.fullHeight - c.top;
    const x = ((rt.railInset - rt.panelInset) * c.aspect * c.fullHeight) / 2;
    // The unshifted axis meets the canvas at fullHeight / 2 - top (the virtual frame's centre).
    const y = Math.min(visible * 0.25, Math.max(0, (rt.panelFrameTop + visible) / 2 - (c.fullHeight / 2 - c.top)));
    return { x, y };
  }, []);
  /** Sets the lens shift; returns whether it changed. */
  const applyLens = useCallback(
    (x: number, y: number) => {
      const c = crop.current;
      if (Math.abs(c.shiftX - x) < 0.01 && Math.abs(c.shiftY - y) < 0.01) return false;
      crop.current = { ...c, shiftX: x, shiftY: y };
      camera.updateProjectionMatrix();
      runtime.current.pipeline?.restart();
      return true;
    },
    [camera],
  );
  useEffect(() => {
    (camera as THREE.PerspectiveCamera & { manual?: boolean }).manual = true;
    return installFrameCrop(camera, crop);
  }, [camera]);

  // Camera: vertical FOV within 60-70 degrees over the virtual frame (canvas plus the chrome above
  // it), tight depth range (near 0.05 m, far 150 m).
  useEffect(() => {
    const fullHeight = size.height + Math.max(0, cropTop);
    const aspect = size.width / Math.max(1, fullHeight);
    crop.current = { ...crop.current, top: Math.max(0, cropTop), fullHeight, aspect };
    const minH = (62 * Math.PI) / 180;
    const vFromH = (2 * Math.atan(Math.tan(minH / 2) / aspect) * 180) / Math.PI;
    camera.aspect = aspect;
    camera.fov = Math.min(70, Math.max(VISITOR.fov, vFromH));
    camera.near = STUDY_RENDER_CONFIG.cameraNear;
    camera.far = STUDY_RENDER_CONFIG.cameraFar;
    camera.updateProjectionMatrix();
    const rt = runtime.current;
    rt.pipeline?.setSize(size.width, size.height, viewport.dpr);
    invalidate();
  }, [camera, size, cropTop, viewport.dpr, invalidate]);

  // Build everything once: textures (progress), materials, world, lighting, shaders.
  useEffect(() => {
    let cancelled = false;
    const rt = runtime.current;
    const renderer = gl as THREE.WebGLRenderer;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = STUDY_RENDER_CONFIG.exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    renderer.info.autoReset = false;
    let disposeLights: (() => void) | null = null;
    (async () => {
      try {
        bridge.events.progress("Loading surfaces", 1, 0, 0);
        const textures = await loadArchitectureTextures(renderer, (loaded, total) => bridge.events.progress("Loading surfaces", 1, loaded, total));
        if (cancelled) return;
        rt.textures = textures;
        bridge.events.progress("Setting the lettering", 2, textures.bytes, textures.bytes);
        await ensureLabelFonts();
        if (cancelled) return;
        const materials = createMaterials(textures, model.rooms[0]?.height ?? 3.2);
        rt.materials = materials;
        const anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
        const world = new MuseumWorld(model, materials, anisotropy, describeDoor);
        world.setVisited(rt.visited);
        rt.world = world;
        scene.add(world.root);
        disposeLights = createLighting(renderer, scene);
        const pipeline = new WebGLPipeline(renderer, scene, camera, cfg.restSampleLevel);
        rt.pipeline = pipeline;
        // The size now, not when the build started: the canvas may have resized during the awaits.
        const now = getState();
        pipeline.setSize(now.size.width, now.size.height, now.viewport.dpr);

        bridge.events.progress("Building the rooms", 3, textures.bytes, textures.bytes);
        const start = roomAt(model.rooms, rt.visitor) ?? model.rooms[0] ?? null;
        rt.roomId = start?.id ?? null;
        rt.wantResident = residentRooms(model, rt.roomId, cfg.residentDepth);
        world.setResident(rt.wantResident);
        // Upload every texture and compile every program before entry (no hitch after entry, C4).
        world.precompileHighlightAndRoute();
        bridge.events.progress("Preparing shaders", 4, textures.bytes, textures.bytes);
        await renderer.compileAsync(scene, camera);
        for (const t of [...materials.all.flatMap((m) => collectTextures(m))]) renderer.initTexture(t);
        if (cancelled) return;
        applyCamera();
        // One full accumulation pass behind the loading screen compiles the post-processing programs,
        // and the programs the scene really uses: compileAsync compiles for the canvas output, but the
        // pipeline draws into its own target with other output settings, so a tone-mapped material
        // (the highlight and the route) gets a second program on first real use. The helpers stay in
        // this pass for that reason and are cleared after it (C4: the hub tour showed the route's
        // program compiling in the first process room).
        pipeline.render(true, 0);
        pipeline.render(false, 0);
        world.clearPrecompileHelpers();
        renderer.info.reset();
        rt.ready = true;
        rt.lastMethod = null;
        if (rt.roomId) bridge.events.roomChanged(rt.roomId, null, null);
        rt.headingDeg = compassPoint(rt.visitor.yaw);
        bridge.events.headingChanged?.(rt.headingDeg);
        bridge.events.ready({ backend: "webgl2", tier, gpuRenderer, antialiasing: "TAARenderPass accumulation at rest + SMAA" });
        invalidate();
      } catch (e) {
        if (!cancelled) bridge.events.failed(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      rt.ready = false;
      disposeLights?.();
      if (rt.world) {
        scene.remove(rt.world.root);
        rt.world.dispose();
      }
      rt.pipeline?.dispose();
      for (const m of rt.materials?.all ?? []) m.dispose();
      rt.materials?.wallProfile.dispose();
      for (const set of rt.textures ? [rt.textures.wall, rt.textures.floor] : []) for (const t of Object.values(set)) t?.dispose();
      disposeKtx2Loader();
      rt.world = null;
      rt.pipeline = null;
      rt.materials = null;
      rt.textures = null;
    };
    // Built once per model/tier; size changes are handled by the camera effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, tier]);

  function applyCamera() {
    const v = runtime.current.visitor;
    camera.position.set(v.x, VISITOR.eyeHeight, v.z);
    camera.rotation.set(v.pitch, v.yaw, 0, "YXZ");
    camera.updateMatrixWorld();
  }

  // Controller used by the overlays.
  useEffect(() => {
    const rt = runtime.current;
    const startWalk = (points: { x: number; z: number }[], finalYaw: number | null, onArrive?: () => void) => {
      rt.visitor.route = points;
      rt.visitor.routeYaw = finalYaw;
      rt.onArrive = onArrive ?? null;
      rt.poseOverride = false;
      invalidate();
    };
    bridge.controller = {
      walkToExhibit(id, onArrive) {
        const e = exhibitsById.get(id);
        if (!e) return false;
        const facing = facingExhibit(e.approach, e.position);
        const d = Math.hypot(rt.visitor.x - e.approach.x, rt.visitor.z - e.approach.z);
        if (d < 0.6) {
          startWalk([{ x: e.approach.x, z: e.approach.z }], facing, onArrive);
          return true;
        }
        const route = router.route(rt.visitor, e.approach);
        if (!route) return false;
        startWalk([...route.slice(1), { x: e.approach.x, z: e.approach.z }], facing, onArrive);
        return true;
      },
      walkThroughDoorway(portalId, toRoomId) {
        const t = doorwayWalkTarget(model, portalId, toRoomId, (p) => router.isFree(p));
        if (!t) return false;
        const route = router.route(rt.visitor, t.point);
        if (!route) return false;
        startWalk(route.slice(1).length ? route.slice(1) : [t.point], t.yaw);
        return true;
      },
      walkToRoom(roomId) {
        const r = roomsById.get(roomId);
        if (!r) return false;
        const target = { x: (r.bounds.minX + r.bounds.maxX) / 2, z: (r.bounds.minZ + r.bounds.maxZ) / 2 };
        const route = router.route(rt.visitor, target);
        if (!route) return false;
        startWalk(route.slice(1), null);
        return true;
      },
      walkWaypoints(points, faceExhibitId, onArrive) {
        const e = faceExhibitId ? exhibitsById.get(faceExhibitId) : undefined;
        const pts = points.map((p) => ({ x: p.x, z: p.z }));
        const first = pts[0];
        const lead = first ? router.route(rt.visitor, first) : null;
        const all = [...(lead ? lead.slice(1) : []), ...pts];
        if (e) all.push({ x: e.approach.x, z: e.approach.z });
        if (all.length === 0) return false;
        startWalk(all, e ? facingExhibit(e.approach, e.position) : null, onArrive);
        return true;
      },
      setHighlight(id, strong) {
        rt.world?.setHighlight(id ? (exhibitsById.get(id) ?? null) : null, strong);
        rt.pipeline?.restart();
        invalidate();
      },
      setRoute(points) {
        rt.world?.setRoute(points);
        rt.pipeline?.restart();
        invalidate();
      },
      setPanelInset(fraction) {
        rt.panelInset = Math.max(0, Math.min(0.5, fraction));
        rt.panelFrameTop = rt.panelInset > 0 ? Math.max(0, frameTopRef.current()) : 0;
        // A walk eases the lens shift in on its way (the frame loop); a standing visitor is framed
        // at once, so the camera never moves once the panel is open.
        if (rt.visitor.route.length === 0 && rt.visitor.routeYaw === null) {
          const t = lensTarget();
          applyLens(t.x, t.y);
        }
        invalidate();
      },
      setRailInset(fraction) {
        const next = Math.max(0, Math.min(0.5, fraction));
        if (Math.abs(next - rt.railInset) < 1e-4) return;
        rt.railInset = next;
        // Only a docked panel's framing uses the rail inset; a walk eases it in on its way.
        if (rt.panelInset > 0 && rt.visitor.route.length === 0 && rt.visitor.routeYaw === null) {
          const t = lensTarget();
          applyLens(t.x, t.y);
        }
        invalidate();
      },
      setPanelInsetBottom(fraction) {
        const off = (f: number) => Math.atan(f * Math.tan(((camera.fov * Math.PI) / 180) / 2));
        const before = off(rt.panelInsetY);
        rt.panelInsetY = Math.max(0, Math.min(0.6, fraction));
        const delta = off(rt.panelInsetY) - before;
        // Narrow screens: tilt the view down so the exhibit sits above the bottom sheet.
        if (Math.abs(delta) > 1e-4) {
          rt.look.pitch = THREE.MathUtils.clamp(rt.look.pitch - delta, -VISITOR.pitchLimit, VISITOR.pitchLimit);
          invalidate();
        }
      },
      stop() {
        rt.visitor.route = [];
        rt.visitor.routeYaw = null;
        rt.onArrive = null;
      },
      setPaused(paused) {
        rt.paused = paused;
        rt.keys.clear();
        if (paused) rt.setFreeLook?.(false);
        setFrameloop(paused || rt.hidden || rt.lost ? "never" : "demand");
        if (!paused) invalidate();
      },
      visitorPosition() {
        return { x: rt.visitor.x, z: rt.visitor.z, yaw: rt.visitor.yaw };
      },
      setFreeLook(on) {
        rt.setFreeLook?.(on);
      },
      setVisited(exhibitIds) {
        rt.visited = [...exhibitIds];
        if (rt.world?.setVisited(rt.visited)) {
          rt.pipeline?.restart();
          invalidate();
        }
      },
      startNavigationInterval() {
        rt.lastMethod = null;
      },
      noteInputMethod(method) {
        noteMethod(method);
      },
    };
    return () => {
      bridge.controller = null;
    };
  }, [bridge, camera, exhibitsById, invalidate, roomsById, router, setFrameloop, lensTarget, applyLens, noteMethod, model]);

  // Keyboard, pointer, visibility and context-loss handling.
  useEffect(() => {
    const rt = runtime.current;
    const el = gl.domElement;
    const keyOf = (e: KeyboardEvent) => e.key.toLowerCase();
    const down = (e: KeyboardEvent) => {
      // While the cursor is captured for free look the user is not typing in an overlay, so keys
      // reach the walk even if focus stayed on the bar's "Mouse look" button.
      const captured = rt.freeLook && document.pointerLockElement === el;
      if (rt.paused || (!captured && isTypingTarget(e.target)) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = keyOf(e);
      if (k === "l" && !e.repeat) {
        rt.setFreeLook?.(!rt.freeLook);
        return;
      }
      if (!MOVE_KEYS.has(k)) return;
      if (k.startsWith("arrow")) e.preventDefault();
      if (!rt.keys.has(k) && k !== "shift") {
        bridge.events.manualMove();
        noteMethod("keys");
      }
      rt.keys.add(k);
      invalidate();
    };
    const up = (e: KeyboardEvent) => {
      rt.keys.delete(keyOf(e));
      invalidate();
    };
    const clear = () => {
      rt.keys.clear();
      endMouseLook();
    };

    let pointer: { id: number; x: number; y: number; dragged: boolean } | null = null;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pick = (clientX: number, clientY: number) => {
      const world = rt.world;
      if (!world) return null;
      const rect = el.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const pickables = world.allPickables();
      const hits = raycaster.intersectObjects(
        pickables.map((p) => p.mesh),
        false,
      );
      const hit = hits[0];
      if (!hit) return null;
      const owner = pickables.find((p) => p.mesh === hit.object)?.ownerOf(hit.faceIndex ?? -1) ?? null;
      return owner ? { owner, point: hit.point, distance: hit.distance } : null;
    };
    // Mouse look (right button held): the cursor is captured (pointer lock) and the mouse steers
    // the view as in a first-person game, while W/A/S/D walk. Release returns the cursor for
    // clicking. Left-button drag (grab the view) and click-to-walk stay as they are, so both
    // gamers and non-gamers have the controls they expect.
    let mouseLook: { id: number; x: number; y: number } | null = null;
    const endMouseLook = () => {
      if (!mouseLook) return;
      mouseLook = null;
      rt.mouseLooking = false;
      if (!rt.freeLook && document.pointerLockElement === el) document.exitPointerLock?.();
    };
    // Free mouse look (toggle: the "Mouse look" bar button or L): the cursor stays captured and any
    // mouse or touchpad movement turns the view, with no button held. A crosshair marks the centre;
    // a click acts on what is under it. Esc, L, an opened panel or a pause turn it off.
    const setFreeLook = (on: boolean) => {
      if (on === rt.freeLook) return;
      if (on && (rt.paused || !rt.ready)) return;
      rt.freeLook = on;
      if (on) {
        // Leave the bar button: keys and clicks now belong to the scene.
        (document.activeElement as HTMLElement | null)?.blur?.();
        try {
          const req = el.requestPointerLock?.() as Promise<void> | undefined;
          req?.catch?.(() => {
            rt.freeLook = false;
            bridge.events.freeLookChanged(false);
          });
        } catch {
          rt.freeLook = false;
        }
      } else if (document.pointerLockElement === el) {
        document.exitPointerLock?.();
      }
      bridge.events.freeLookChanged(rt.freeLook);
      invalidate();
    };
    rt.setFreeLook = setFreeLook;
    /** Client coordinates of the canvas centre (the crosshair). */
    const centre = () => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const onDown = (e: PointerEvent) => {
      if (rt.paused || !rt.ready) return;
      if (rt.freeLook && document.pointerLockElement === el) {
        // Captured: a left click acts on what is under the crosshair.
        if (e.button === 0) {
          const c = centre();
          activate(c.x, c.y);
        }
        return;
      }
      if (e.button === 2 && e.pointerType === "mouse") {
        e.preventDefault();
        mouseLook = { id: e.pointerId, x: e.clientX, y: e.clientY };
        rt.mouseLooking = true;
        bridge.events.manualMove();
        try {
          const req = el.requestPointerLock?.() as Promise<void> | undefined;
          req?.catch?.(() => {});
        } catch {
          // No pointer lock (old browser or denied): mouse look still works with pointer capture.
        }
        el.setPointerCapture?.(e.pointerId);
        return;
      }
      if (e.button !== 0) return;
      pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, dragged: false };
    };
    const onMove = (e: PointerEvent) => {
      if (rt.freeLook && document.pointerLockElement === el && !mouseLook) {
        if (e.movementX !== 0 || e.movementY !== 0) noteMethod("freelook");
        rt.look.yaw -= e.movementX * MOUSE_LOOK_SENSITIVITY;
        rt.look.pitch = THREE.MathUtils.clamp(rt.look.pitch - e.movementY * MOUSE_LOOK_SENSITIVITY, -VISITOR.pitchLimit, VISITOR.pitchLimit);
        rt.visitor.routeYaw = null;
        rt.hoverQueued = centre();
        invalidate();
        return;
      }
      if (mouseLook && e.pointerId === mouseLook.id) {
        const locked = document.pointerLockElement === el;
        const dx = locked ? e.movementX : e.clientX - mouseLook.x;
        const dy = locked ? e.movementY : e.clientY - mouseLook.y;
        mouseLook.x = e.clientX;
        mouseLook.y = e.clientY;
        if (dx !== 0 || dy !== 0) noteMethod("rmb");
        // First-person mapping: mouse right turns right, mouse up looks up.
        rt.look.yaw -= dx * MOUSE_LOOK_SENSITIVITY;
        rt.look.pitch = THREE.MathUtils.clamp(rt.look.pitch - dy * MOUSE_LOOK_SENSITIVITY, -VISITOR.pitchLimit, VISITOR.pitchLimit);
        rt.visitor.routeYaw = null;
        invalidate();
        return;
      }
      if (pointer && e.pointerId === pointer.id) {
        const dx = e.clientX - pointer.x;
        const dy = e.clientY - pointer.y;
        if (!pointer.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        if (!pointer.dragged) {
          pointer.dragged = true;
          bridge.events.manualMove();
          noteMethod("drag");
          el.setPointerCapture?.(e.pointerId);
        }
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        const s = 0.0032 * (e.pointerType === "touch" ? 1.5 : 1);
        rt.look.yaw += dx * s;
        rt.look.pitch = THREE.MathUtils.clamp(rt.look.pitch + dy * s, -VISITOR.pitchLimit, VISITOR.pitchLimit);
        rt.visitor.routeYaw = null;
        invalidate();
        return;
      }
      if (e.pointerType === "mouse" && rt.ready && !rt.paused) {
        rt.hoverQueued = { x: e.clientX, y: e.clientY };
        invalidate();
      }
    };
    const onUp = (e: PointerEvent) => {
      if (mouseLook && e.pointerId === mouseLook.id && (e.button === 2 || e.type === "pointercancel")) {
        endMouseLook();
        return;
      }
      if (!pointer || e.pointerId !== pointer.id) return;
      const wasDrag = pointer.dragged;
      pointer = null;
      if (wasDrag || rt.paused) return;
      activate(e.clientX, e.clientY);
    };
    /** The doorway a sign or a wall hit stands for (null when it is not one). */
    function doorwayOf(hit: { owner: { kind: string; id: string }; point: THREE.Vector3 }): { portalId: string; toRoomId: string } | null {
      if (hit.owner.kind === "sign") return signDoorways.get(hit.owner.id) ?? null;
      if (hit.owner.kind !== "wall") return null;
      const p = doorwayAtWallHit(model, hit.point);
      return p ? { portalId: p.id, toRoomId: farSide(model, p, rt.roomId, rt.visitor) } : null;
    }
    /** A wall or sign of the next room seen through a doorway: that doorway (walk through it). */
    function doorwayBeyond(hit: { owner: { kind: string; id: string }; point: THREE.Vector3 }): { portalId: string; toRoomId: string } | null {
      if (hit.owner.kind !== "wall" && hit.owner.kind !== "sign") return null;
      const d = doorwayToRoomSeen(model, rt.roomId, rt.visitor, { x: hit.point.x, z: hit.point.z });
      return d ? { portalId: d.portal.id, toRoomId: d.toRoomId } : null;
    }
    rt.doorwayOf = doorwayOf;
    /** A click at a point: open the exhibit under it, walk through the doorway it shows, or walk to the floor point. */
    function activate(clientX: number, clientY: number) {
      const hit = pick(clientX, clientY);
      if (!hit) return;
      if (hit.owner.kind === "exhibit") {
        noteMethod("click");
        bridge.events.pickExhibit(hit.owner.id);
      } else if (hit.owner.kind === "sign" && directory && hit.owner.id.startsWith("directory:") && rt.roomId !== directory.roomId) {
        // The directory seen from outside its room (the spawn view): walk up to read it.
        const hfov = 2 * Math.atan(Math.tan(((camera.fov * Math.PI) / 180) / 2) * camera.aspect);
        const at = directoryReadingPoint(directory, model, hfov);
        const route = at ? router.route(rt.visitor, at.point) : null;
        if (at && route) {
          bridge.events.manualMove();
          noteMethod("click");
          rt.visitor.route = route.slice(1).length ? route.slice(1) : [at.point];
          rt.visitor.routeYaw = at.yaw;
          rt.onArrive = null;
          invalidate();
        }
      } else if (hit.owner.kind === "sign" || hit.owner.kind === "wall") {
        // A door sign, a directory row or a doorway frame: walk through into the room beyond. A wall
        // or sign of the next room seen through a doorway walks through that doorway too.
        const door = doorwayOf(hit) ?? doorwayBeyond(hit);
        if (door && bridge.controller?.walkThroughDoorway(door.portalId, door.toRoomId)) {
          bridge.events.manualMove();
          noteMethod("click");
        }
      } else if (hit.owner.kind === "floor") {
        const target = { x: hit.point.x, z: hit.point.z };
        const route = router.route(rt.visitor, target);
        if (route) {
          bridge.events.manualMove();
          noteMethod("click");
          rt.visitor.route = route.slice(1);
          rt.visitor.routeYaw = null;
          rt.onArrive = null;
          invalidate();
        }
      }
    }
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onLockChange = () => {
      if (document.pointerLockElement === el) return;
      // Esc (or the browser) released the lock: stop right-button look and free look.
      mouseLook = null;
      rt.mouseLooking = false;
      if (rt.freeLook) {
        rt.freeLook = false;
        bridge.events.freeLookChanged(false);
      }
    };
    const onLeave = () => {
      if (rt.hoverQueued === null) bridge.events.hover(null);
    };
    const onVisibility = () => {
      rt.hidden = document.visibilityState === "hidden";
      rt.keys.clear();
      setFrameloop(rt.paused || rt.hidden || rt.lost ? "never" : "demand");
      if (!rt.hidden) invalidate();
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      rt.lost = true;
      rt.keys.clear();
      setFrameloop("never");
      bridge.events.contextLost();
    };
    const onRestored = () => {
      rt.lost = false;
      rt.pipeline?.restart();
      setFrameloop(rt.paused || rt.hidden ? "never" : "demand");
      bridge.events.contextRestored();
      invalidate();
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    el.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("pointerlockchange", onLockChange);
    el.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    el.addEventListener("webglcontextlost", onLost);
    el.addEventListener("webglcontextrestored", onRestored);
    (rt as unknown as { pick: typeof pick }).pick = pick;
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("pointerlockchange", onLockChange);
      endMouseLook();
      rt.setFreeLook = null;
      if (rt.freeLook) setFreeLook(false);
      el.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      el.removeEventListener("webglcontextlost", onLost);
      el.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [bridge, camera, gl, invalidate, router, setFrameloop, noteMethod, directory, model, signDoorways]);

  // Measurement probe (non-study modes only; read-only info always).
  useEffect(() => {
    const rt = runtime.current;
    const host: ProbeHost = {
      renderer: gl as THREE.WebGLRenderer,
      scene,
      camera,
      model,
      tier,
      get ready() {
        return rt.ready;
      },
      get world() {
        return rt.world;
      },
      get pipeline() {
        return rt.pipeline;
      },
      get textures() {
        return rt.textures;
      },
      get framesRendered() {
        return rt.framesRendered;
      },
      get roomId() {
        return rt.roomId;
      },
      get visitor() {
        const v = rt.visitor;
        return { x: v.x, z: v.z, yaw: v.yaw, pitch: v.pitch, route: v.route.length, routeYaw: v.routeYaw, look: { ...rt.look } };
      },
      setPose(x, z, yawRad, pitchRad) {
        rt.visitor.x = x;
        rt.visitor.z = z;
        rt.visitor.vx = 0;
        rt.visitor.vz = 0;
        rt.visitor.yaw = yawRad;
        rt.visitor.pitch = pitchRad;
        rt.visitor.route = [];
        rt.visitor.routeYaw = null;
        rt.look.yaw = yawRad;
        rt.look.pitch = pitchRad;
        rt.poseOverride = true;
        invalidate();
      },
      setFrameHook(fn) {
        rt.probeHook = fn;
      },
      invalidate,
    };
    const uninstall = installProbe(host, probe);
    const extra = installDoorSignProbe(model, camera, gl.domElement, (x, y) => (runtime.current as unknown as { pick?: (x: number, y: number) => { owner: { kind: string; id: string } } | null }).pick?.(x, y) ?? null);
    return () => {
      extra();
      uninstall();
    };
  }, [camera, gl, invalidate, model, probe, scene, tier]);

  /** Uploads one lettering page (spreads a room's pages over frames: C4). */
  const uploadTexture = useCallback((t: THREE.Texture) => (gl as THREE.WebGLRenderer).initTexture(t), [gl]);

  // Per frame: input -> visitor -> camera -> room tracking -> streaming -> cues.
  useFrame((_, delta) => {
    const rt = runtime.current;
    if (!rt.ready || rt.paused) return;
    const k = rt.keys;
    const input: MoveInput = moveInputFromKeys(k, rt.mouseLooking || rt.freeLook);
    const wasWalking = rt.visitor.route.length > 0 || rt.visitor.routeYaw !== null;
    const active = stepVisitor(rt.visitor, input, delta, collision, rt.look);
    if (wasWalking && rt.visitor.route.length === 0 && rt.visitor.routeYaw === null && rt.onArrive) {
      const cb = rt.onArrive;
      rt.onArrive = null;
      cb();
    }
    applyCamera();

    // Lens shift towards its target: eased while the visitor walks to the exhibit, exact once the
    // walk ends (the panel opens on arrival, after which nothing moves).
    const lens = lensTarget();
    const c = crop.current;
    if (c.shiftX !== lens.x || c.shiftY !== lens.y) {
      const walking = rt.visitor.route.length > 0 || rt.visitor.routeYaw !== null;
      const k = walking ? 1 - Math.exp(-delta * 3) : 1;
      const nx = c.shiftX + (lens.x - c.shiftX) * k;
      const ny = c.shiftY + (lens.y - c.shiftY) * k;
      const near = Math.abs(lens.x - nx) < 0.5 && Math.abs(lens.y - ny) < 0.5;
      applyLens(near ? lens.x : nx, near ? lens.y : ny);
      invalidate();
    }

    // Plan heading arrow: the facing quantised to the eight compass points (yaw 0 faces north, -z;
    // positive yaw turns west), reported only when the point changes.
    {
      const deg = compassPoint(rt.visitor.yaw);
      if (deg !== rt.headingDeg) {
        rt.headingDeg = deg;
        bridge.events.headingChanged?.(deg);
      }
    }
    // Room tracking with hysteresis: a new room counts once the visitor is past the wall face.
    const here = roomInside(model.rooms, rt.visitor, 0.12);
    if (here && here.id !== rt.roomId) {
      const prev = rt.roomId;
      rt.roomId = here.id;
      const portal = prev ? (model.portals.find((p) => p.connects.includes(prev) && p.connects.includes(here.id)) ?? null) : null;
      bridge.events.roomChanged(here.id, prev, portal?.id ?? null);
      rt.wantResident = residentRooms(model, here.id, cfg.residentDepth);
      // Enter cues fire only on crossing INTO their room (the wing, the dependent's room), never on
      // walking back out through the same doorway (SceneCue.enterRoomId).
      if (portal) for (const cue of enterCuesOnCrossing(model.cues, portal.id, here.id)) bridge.events.cueTriggered(cue);
    }
    // Stream lettering in time slices: at most LETTERING_SLICE_MS of drawing per frame; a room's
    // pages are uploaded when its last item is drawn (C4: no long frame when a room enters the
    // resident set).
    if (rt.world && rt.world.stepLettering(rt.wantResident, LETTERING_SLICE_MS, uploadTexture)) rt.pipeline?.restart();

    // Approach-triggered cues (4 Hz), re-armed after walking away.
    // Checked whenever the visitor has moved 0.1 m (and at 4 Hz), so a jump also re-arms cues.
    rt.cueTimer += delta;
    const movedSinceCheck = Math.hypot(rt.visitor.x - rt.cueAt.x, rt.visitor.z - rt.cueAt.z) > 0.1;
    if (rt.cueTimer > 0.25 || movedSinceCheck) {
      rt.cueTimer = 0;
      rt.cueAt = { x: rt.visitor.x, z: rt.visitor.z };
      for (const cue of model.cues) {
        if (cue.trigger.type !== "approach") continue;
        // Armed cues only fire in the visitor's room; fired ones are re-armed wherever the visitor is.
        if (cue.roomId !== rt.roomId && (rt.cueArmed.get(cue.id) ?? true)) continue;
        const target = exhibitsById.get(cue.trigger.elementId);
        const at = target ? target.approach : cue.position;
        const d = Math.hypot(rt.visitor.x - at.x, rt.visitor.z - at.z);
        const r = cue.trigger.radius ?? 1.5;
        const armed = rt.cueArmed.get(cue.id) ?? true;
        if (armed && d <= r) {
          rt.cueArmed.set(cue.id, false);
          bridge.events.cueTriggered(cue);
        } else if (!armed && d > r * 1.5) {
          rt.cueArmed.set(cue.id, true);
          bridge.events.cueLeft(cue.id);
        }
      }
    }

    // Hover (mouse only), resolved once per frame.
    if (rt.hoverQueued) {
      const q = rt.hoverQueued;
      rt.hoverQueued = null;
      const hit = (rt as unknown as { pick?: (x: number, y: number) => { owner: { kind: string; id: string } } | null }).pick?.(q.x, q.y);
      bridge.events.hover(hit && hit.owner.kind === "exhibit" ? hit.owner.id : null);
      const walkable = hit && (hit.owner.kind === "exhibit" || hit.owner.kind === "floor" || ((hit.owner.kind === "sign" || hit.owner.kind === "wall") && rt.doorwayOf?.(hit as never)));
      gl.domElement.style.cursor = walkable ? "pointer" : "default";
    }
    if (active || rt.world?.pending(rt.wantResident)) invalidate();
  }, 0);

  // Render (priority 1 takes over R3F's default render).
  useFrame((_, delta) => {
    const rt = runtime.current;
    if (!rt.pipeline || !rt.ready) return;
    const pose = `${camera.position.x.toFixed(5)},${camera.position.z.toFixed(5)},${camera.rotation.x.toFixed(6)},${camera.rotation.y.toFixed(6)},${crop.current.shiftX.toFixed(2)},${crop.current.shiftY.toFixed(2)}`;
    const moving = pose !== rt.lastPose;
    rt.lastPose = pose;
    gl.info.reset();
    const { converging } = rt.pipeline.render(moving, delta);
    rt.framesRendered++;
    rt.probeHook?.({ moving, converging });
    if (moving || converging) invalidate();
  }, 1);

  return null;
}

/**
 * Room-plaque measurement for the legibility check (immersive-rendering.spec.ts), added to
 * `window.__museumProbe` when the probe is installed (never in a study):
 *  - `doorSignViews(d)`: a pose `d` metres in front of every plaque, square-on, eye level, looking at
 *    its centre (placement.ts reads plaques from 2.5 m);
 *  - `spawnView()`: the session's first view;
 *  - `doorSignRects()`: every plaque facing the camera in the camera's room, as a page rectangle in
 *    CSS px, for reading its lettering out of a screenshot.
 */
function installDoorSignProbe(model: SceneModel, camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, pickAt: (x: number, y: number) => { owner: { kind: string; id: string } } | null): () => void {
  const w = window as unknown as { __museumProbe?: Record<string, unknown> };
  const probe = w.__museumProbe;
  if (!probe) return () => {};
  const signs = doorSigns(model);
  const normal = (f: string) => (f === "+x" ? { x: 1, z: 0 } : f === "-x" ? { x: -1, z: 0 } : f === "+z" ? { x: 0, z: 1 } : { x: 0, z: -1 });
  const centre = (s: SceneDoorSign) => ({ x: (s.sign.min[0] + s.sign.max[0]) / 2, y: (s.sign.min[1] + s.sign.max[1]) / 2, z: (s.sign.min[2] + s.sign.max[2]) / 2 });
  probe.doorSignViews = (distance = 2.5) =>
    signs.map((s) => {
      const c = centre(s);
      const n = normal(s.sign.facing);
      const x = c.x + n.x * distance;
      const z = c.z + n.z * distance;
      // The plaque's own size in metres (P26 compares it across traditions).
      const size = { w: Math.round(Math.max(s.sign.max[0] - s.sign.min[0], s.sign.max[2] - s.sign.min[2]) * 1000) / 1000, h: Math.round((s.sign.max[1] - s.sign.min[1]) * 1000) / 1000 };
      return { id: s.id, roomId: s.roomId, toRoomId: s.toRoomId, kind: "door-sign", x, z, yaw: Math.atan2(n.x, n.z), pitch: Math.atan2(c.y - VISITOR.eyeHeight, distance), size };
    });
  probe.spawnView = () => ({ id: "spawn", kind: "spawn", x: model.spawn.x, z: model.spawn.z, yaw: yawFromDeg(model.spawn.yawDeg), pitch: 0 });
  probe.doorSignRects = () => {
    const r = canvas.getBoundingClientRect();
    camera.updateMatrixWorld();
    const out: { id: string; toRoomId: string; left: number; top: number; width: number; height: number }[] = [];
    // Only plaques that can be seen: in the camera's room, facing the camera. (The plaque on the far
    // face of a lintel, or in a room behind a wall, projects to the same place but is hidden.)
    const here = roomAt(model.rooms, { x: camera.position.x, z: camera.position.z });
    for (const s of signs) {
      if (s.roomId !== here?.id) continue;
      const c = centre(s);
      const n = normal(s.sign.facing);
      if ((camera.position.x - c.x) * n.x + (camera.position.z - c.z) * n.z <= 0) continue;
      const { min, max } = s.sign;
      const corners = [
        [min[0], min[1], min[2]],
        [max[0], max[1], max[2]],
        [min[0], max[1], min[2]],
        [max[0], min[1], max[2]],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
      if (corners.some((v) => v.z > -camera.near)) continue;
      const ndc = corners.map((v) => v.applyMatrix4(camera.projectionMatrix));
      const xs = ndc.map((v) => r.left + ((v.x + 1) / 2) * r.width);
      const ys = ndc.map((v) => r.top + ((1 - v.y) / 2) * r.height);
      const left = Math.min(...xs);
      const top = Math.min(...ys);
      const right = Math.max(...xs);
      const bottom = Math.max(...ys);
      if (right < r.left || left > r.right || bottom < r.top || top > r.bottom) continue;
      out.push({ id: s.id, toRoomId: s.toRoomId, left, top, width: right - left, height: bottom - top });
    }
    return out;
  };
  /**
   * `textRects()` (3D-B novice walkthrough): every exhibit plate, door sign and directory row facing
   * the camera and in front of it, as a page rectangle in CSS px, with the words it carries and
   * whether its centre is unoccluded (what a click at its centre would hit). A scripted visitor reads
   * only these, the words a person sees on screen.
   */
  const directory = entranceDirectory(model).directory;
  const texts = [
    ...model.exhibits.map((e) => ({ id: e.id, pickId: e.id, kind: "exhibit", words: e.label, step: plaqueText(e, model).kicker, toRoomId: null as string | null, plane: e.panel })),
    ...signs.map((d) => ({ id: d.id, pickId: d.id, kind: "door-sign", words: d.toRoomId, step: null, toRoomId: d.toRoomId, plane: d.sign })),
    ...(directory?.rows ?? []).map((d) => ({ id: d.id, pickId: d.id, kind: "directory", words: `${d.title}: ${d.direction}`, step: null, toRoomId: d.toRoomId, plane: d.sign })),
  ];
  probe.textRects = () => {
    const r = canvas.getBoundingClientRect();
    camera.updateMatrixWorld();
    const out: { id: string; kind: string; words: string; step: string | null; toRoomId: string | null; left: number; top: number; width: number; height: number; distance: number; clear: boolean }[] = [];
    for (const t of texts) {
      const { min, max, facing } = t.plane;
      const c = { x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, z: (min[2] + max[2]) / 2 };
      const n = normal(facing);
      if ((camera.position.x - c.x) * n.x + (camera.position.z - c.z) * n.z <= 0) continue;
      const corners = [
        [min[0], min[1], min[2]],
        [max[0], max[1], max[2]],
        [min[0], max[1], min[2]],
        [max[0], min[1], max[2]],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
      if (corners.some((v) => v.z > -camera.near)) continue;
      const ndc = corners.map((v) => v.applyMatrix4(camera.projectionMatrix));
      const xs = ndc.map((v) => r.left + ((v.x + 1) / 2) * r.width);
      const ys = ndc.map((v) => r.top + ((1 - v.y) / 2) * r.height);
      const left = Math.min(...xs);
      const top = Math.min(...ys);
      const right = Math.max(...xs);
      const bottom = Math.max(...ys);
      if (right < r.left || left > r.right || bottom < r.top || top > r.bottom) continue;
      const cx = Math.min(Math.max((left + right) / 2, r.left + 1), r.right - 1);
      const cy = Math.min(Math.max((top + bottom) / 2, r.top + 1), r.bottom - 1);
      const hit = pickAt(cx, cy);
      const clear = !!hit && hit.owner.id === t.pickId;
      out.push({ id: t.id, kind: t.kind, words: t.words, step: t.step, toRoomId: t.toRoomId, left, top, width: right - left, height: bottom - top, distance: Math.hypot(camera.position.x - c.x, camera.position.z - c.z), clear });
    }
    return out;
  };
  return () => {
    delete probe.textRects;
    delete probe.doorSignViews;
    delete probe.spawnView;
    delete probe.doorSignRects;
  };
}

/** Room containing p, at least `inset` metres inside its rectangle (doorway hysteresis). */
function roomInside(rooms: readonly SceneRoom[], p: { x: number; z: number }, inset: number): SceneRoom | null {
  for (const r of rooms) {
    const b = r.bounds;
    if (p.x >= b.minX + inset && p.x <= b.maxX - inset && p.z >= b.minZ + inset && p.z <= b.maxZ - inset) return r;
  }
  return null;
}

function collectTextures(m: THREE.Material): THREE.Texture[] {
  const out: THREE.Texture[] = [];
  for (const v of Object.values(m)) if (v && (v as THREE.Texture).isTexture) out.push(v as THREE.Texture);
  return out;
}
