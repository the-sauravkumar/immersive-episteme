"use client";

/**
 * The R3F canvas (loaded with next/dynamic, ssr: false, only on /learn/immersive, so the 2D
 * condition and public pages never download three.js).
 *
 * Adapted from virtual-walkthrough src/App.tsx Canvas setup (L115-153: NeutralToneMapping,
 * demand frameloop, context-loss handling): no antialias on the default framebuffer (the
 * pipeline anti-aliases), no shadows, device-pixel ratio capped by the tier, never lowered.
 */
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

import { VISITOR, yawFromDeg } from "@/features/immersive/navigation";
import type { SceneDoorSign } from "@/features/immersive/placement";
import { TIERS, type QualityTier } from "@/features/immersive/quality";
import type { SceneModel } from "@/features/immersive/scene-model";

import type { MuseumBridge } from "./bridge";
import { MuseumScene } from "./museum-scene";
import { STUDY_RENDER_CONFIG } from "./three/resources";

export interface MuseumCanvasProps {
  model: SceneModel;
  tier: QualityTier;
  bridge: MuseumBridge;
  describeDoor: (s: SceneDoorSign) => { kicker: string | null; title: string };
  probe: boolean;
  gpuRenderer: string | null;
  /** Height of the opaque chrome above the canvas, in CSS px (MuseumSceneProps.cropTop). */
  cropTop: number;
  /** Top of the scene left free by the overlays, in CSS px below the canvas top (MuseumSceneProps.frameTop). */
  frameTop: () => number;
}

export default function MuseumCanvas(props: MuseumCanvasProps) {
  const cfg = TIERS[props.tier];
  const dpr = typeof window === "undefined" ? 1 : Math.min(cfg.maxDpr, window.devicePixelRatio || 1);
  return (
    <Canvas
      frameloop="demand"
      dpr={dpr}
      shadows={false}
      flat={false}
      gl={{ antialias: false, alpha: false, stencil: false, depth: true, powerPreference: "high-performance", preserveDrawingBuffer: false }}
      camera={{
        fov: VISITOR.fov,
        near: STUDY_RENDER_CONFIG.cameraNear,
        far: STUDY_RENDER_CONFIG.cameraFar,
        position: [props.model.spawn.x, VISITOR.eyeHeight, props.model.spawn.z],
        rotation: [0, yawFromDeg(props.model.spawn.yawDeg), 0, "YXZ"],
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = STUDY_RENDER_CONFIG.exposure;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
      style={{ position: "absolute", inset: 0, touchAction: "none" }}
      aria-hidden="true"
      tabIndex={-1}
    >
      <MuseumScene {...props} />
    </Canvas>
  );
}
