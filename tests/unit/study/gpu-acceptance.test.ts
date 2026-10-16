/** The shared "can the museum render here" rule (study-01): WebGL 2 on a hardware renderer. */
import { describe, expect, it } from "vitest";

import { isSoftwareRenderer, museumCanRender } from "@/features/study/gpu-acceptance";

describe("museum GPU acceptance", () => {
  it("recognises software rasterisers by renderer string", () => {
    for (const r of ["Google SwiftShader", "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)", "llvmpipe (LLVM 15.0.7, 256 bits)", "Microsoft Basic Render Driver"]) {
      expect(isSoftwareRenderer(r)).toBe(true);
    }
    for (const r of ["ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)", "Apple GPU", null]) expect(isSoftwareRenderer(r)).toBe(false);
  });

  it("accepts only WebGL 2 without a software renderer", () => {
    expect(museumCanRender({ webglVersion: 2, softwareRenderer: false })).toBe(true);
    expect(museumCanRender({ webglVersion: 2 })).toBe(true);
    expect(museumCanRender({ webglVersion: 2, softwareRenderer: true })).toBe(false);
    expect(museumCanRender({ webglVersion: 1, softwareRenderer: false })).toBe(false);
    expect(museumCanRender({ webglVersion: null })).toBe(false);
  });
});
