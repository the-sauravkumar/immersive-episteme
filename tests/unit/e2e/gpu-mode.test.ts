import { describe, expect, it } from "vitest";

import { classifyRenderer, hardwareGpu, rendererMismatch } from "../../e2e/gpu-mode";

// Renderer strings as this laptop's browsers report them (vendor | renderer, ANGLE on D3D11).
const NVIDIA = "Google Inc. (NVIDIA) | ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 (0x00001F99) Direct3D11 vs_5_0 ps_5_0, D3D11)";
const INTEL = "Google Inc. (Intel) | ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)";
const SWIFTSHADER = "Google Inc. (Google) | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)";

describe("hardwareGpu", () => {
  it("is on locally, off on CI and with PW_GPU=0", () => {
    expect(hardwareGpu({})).toBe(true);
    expect(hardwareGpu({ PW_GPU: "1" })).toBe(true);
    expect(hardwareGpu({ CI: "true" })).toBe(false);
    expect(hardwareGpu({ PW_GPU: "0" })).toBe(false);
  });
});

describe("classifyRenderer", () => {
  it("names each GPU, software and unknown renderers", () => {
    expect(classifyRenderer(NVIDIA)).toBe("nvidia");
    expect(classifyRenderer(INTEL)).toBe("intel");
    expect(classifyRenderer(SWIFTSHADER)).toBe("software");
    expect(classifyRenderer("Microsoft Basic Render Driver")).toBe("software");
    expect(classifyRenderer("ANGLE (AMD, Radeon RX 580)")).toBe("other");
    expect(classifyRenderer(null)).toBe("unknown");
    expect(classifyRenderer("  ")).toBe("unknown");
  });
});

describe("rendererMismatch", () => {
  it("passes the expected GPU", () => {
    expect(rendererMismatch("chromium", "nvidia", NVIDIA)).toBeNull();
    expect(rendererMismatch("low-spec", "intel", INTEL)).toBeNull();
  });

  it("fails the other GPU and names the per-app GPU preference to fix", () => {
    const m = rendererMismatch("low-spec", "intel", NVIDIA);
    expect(m).toMatch(/project "low-spec": expected Intel/);
    expect(m).toContain("chrome-headless-shell.exe");
    expect(m).toContain("GpuPreference=1;");
    expect(rendererMismatch("chromium", "nvidia", INTEL)).toContain("GpuPreference=2;");
  });

  it("fails SwiftShader as software rendering", () => {
    expect(rendererMismatch("chromium", "nvidia", SWIFTSHADER)).toMatch(/software rendering \(SwiftShader/);
    expect(rendererMismatch("low-spec", "intel", SWIFTSHADER)).toMatch(/software rendering/);
  });

  it("fails when the renderer cannot be read", () => {
    expect(rendererMismatch("chromium", "nvidia", null)).toMatch(/no renderer.*unavailable/);
  });
});
