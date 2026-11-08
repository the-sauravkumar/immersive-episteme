import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildThrownVessel } from "@/features/walkthrough/infrastructure/built-vessels";
import type { MaterialLibrary } from "@/features/walkthrough/infrastructure/material-library";
import { WorkPacer } from "@/features/walkthrough/infrastructure/work-pacer";

const library = {
  pacer: new WorkPacer(),
  shared: <T extends object>(_key: string, build: () => Promise<T>) => build(),
  scan: async () => ({ colour: new THREE.Texture(), normal: new THREE.Texture(), roughness: new THREE.Texture(), tileMetres: 0.36 }),
} as unknown as MaterialLibrary;

describe.each(["clay-bowl", "clay-pot"] as const)("thrown %s shadow", (shape) => {
  it("draws both faces into the shadow map, so the base stops the sun on the ground beside its foot", async () => {
    const vessel = (await buildThrownVessel(library, shape)) as THREE.Mesh;
    const material = vessel.material as THREE.MeshStandardMaterial;
    expect(vessel.castShadow).toBe(true);
    expect(material.side).toBe(THREE.FrontSide);
    expect(material.shadowSide).toBe(THREE.DoubleSide);
  });
});
